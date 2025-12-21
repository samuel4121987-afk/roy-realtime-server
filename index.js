const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const ROY_PROMPT = `
You are Roy, the virtual receptionist for "24/7 AI".

Core rules:
- Always greet immediately at call start with EXACTLY: "24/7 AI, this is Roy. How can I help you?"
- Stay on-topic: only talk about 24/7 AI receptionist coverage, bookings, lead capture, onboarding, setup, pricing basics.
  If asked unrelated questions, redirect back to 24/7 AI.
- English by default. Switch to Spanish ONLY if caller explicitly asks for Spanish or speaks a clear Spanish sentence.
- Short, human answers: 1–2 sentences.
- If asked "what does OpenAI do?", answer briefly: 24/7 AI uses a virtual assistant to answer calls and capture leads.
`.trim();

const FILLER_WORDS = new Set([
  "uh","um","hmm","ah","er","like","you","know",
  "aha","yes","yeah","yep","okay","ok","sure","right","uh-huh","mm-hmm","mhm","mm",
  "si","sí","vale","bueno","claro","ya","a","ver","espera"
]);

function isOnlyFillerWords(text) {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  if (!t) return true;
  const words = t.split(/\s+/).map(w => w.replace(/[.,!?;:()"]/g, ""));
  if (words.length > 4) return false;
  return words.every(w => FILLER_WORDS.has(w));
}

function shouldSwitchToSpanish(transcript) {
  const t = (transcript || "").trim().toLowerCase();
  if (!t) return false;
  if (t.includes("español") || t.includes("en español") || t.includes("spanish")) return true;

  const words = t.split(/\s+/);
  if (words.length < 6) return false;

  const markers = ["hola","buenas","qué","que","cómo","como","cuánto","cuanto","precio","reservar","cita","empresa","negocio"];
  let hits = 0;
  for (const m of markers) if (t.includes(m)) hits++;
  return hits >= 2;
}

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("OK"));

function twimlResponse(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsProto = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsProto}://${host}/media-stream`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`;
}

app.all("/incoming-call", (req, res) => {
  res.status(200).type("text/xml").send(twimlResponse(req));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;

  // OpenAI state
  let openaiOpen = false;
  const openaiQueue = [];

  // Audio gate
  let audioReady = false;

  // Greeting flow
  let greeted = false;
  let greetRequested = false;

  // Speaking / response state
  let isAISpeaking = false;
  let responseInFlight = false;

  // Language state
  let currentLang = "en";

  // Track last response id
  let lastResponseId = null;

  // Turn trigger fallback (IMPORTANT): if transcription event never arrives,
  // we still respond after speech_stopped by issuing response.create.
  let pendingTurnTimer = null;

  function sendToOpenAI(obj) {
    const msg = JSON.stringify(obj);
    if (openaiOpen && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(msg);
    } else {
      openaiQueue.push(msg);
    }
  }

  function flushOpenAIQueue() {
    while (openaiQueue.length && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(openaiQueue.shift());
    }
  }

  function requestGreeting() {
    greetRequested = true;
    maybeDoGreeting();
  }

  function maybeDoGreeting() {
    if (!greetRequested) return;
    if (greeted) return;
    if (!streamSid) return;
    if (!openaiOpen) return;
    if (!audioReady) return;

    greeted = true;
    greetRequested = false;

    sendToOpenAI({
      type: "response.create",
      response: {
        instructions:
          "Start of call. Say EXACTLY this greeting and nothing else: '24/7 AI, this is Roy. How can I help you?'"
      }
    });
  }

  function scopeInstruction() {
    const scopeEn =
      "Answer ONLY about 24/7 AI receptionist service. If unrelated, redirect back to 24/7 AI.";
    const scopeEs =
      "Responde SOLO sobre el servicio de recepcionista virtual 24/7 AI. Si es ajeno, redirige a 24/7 AI.";

    return currentLang === "es"
      ? `${scopeEs} Responde en español en 1–2 frases. Si preguntan "qué hace OpenAI", di: "24/7 AI usa un asistente virtual para atender llamadas y captar leads" y luego pregunta qué tipo de negocio tienen.`
      : `${scopeEn} Respond in English in 1–2 sentences. If asked "what does OpenAI do?", say: "24/7 AI uses a virtual assistant to answer calls and capture leads," then ask what business they have.`;
  }

  function cancelAnyOngoingResponse() {
    try {
      if (lastResponseId) {
        sendToOpenAI({ type: "response.cancel", response_id: lastResponseId });
      } else {
        sendToOpenAI({ type: "response.cancel" });
      }
    } catch {}
    responseInFlight = false;
    isAISpeaking = false;
  }

  // This is the KEY: always trigger a reply turn based on conversation context.
  // Even if transcription events are flaky, the user's utterance still exists in the conversation after commit.
  function forceAssistantTurn() {
    if (!greeted) return;
    if (!openaiOpen) return;
    if (!audioReady) return;

    // If Roy is still speaking, barge-in cleanly.
    if (responseInFlight || isAISpeaking) cancelAnyOngoingResponse();

    sendToOpenAI({
      type: "response.create",
      response: {
        instructions: scopeInstruction()
      }
    });
  }

  // If we DO have the transcript, we can do filler + language switching more intelligently.
  function createRoyResponseFromTranscript(transcriptRaw) {
    const transcript = (transcriptRaw || "").trim();
    if (!transcript) {
      // No transcript? Still respond (don’t go silent).
      forceAssistantTurn();
      return;
    }

    if (currentLang === "en" && shouldSwitchToSpanish(transcript)) currentLang = "es";

    const filler = isOnlyFillerWords(transcript);

    if (filler) {
      cancelAnyOngoingResponse();
      sendToOpenAI({
        type: "response.create",
        response: {
          instructions:
            currentLang === "es"
              ? `Responde SOLO sobre 24/7 AI. El usuario dijo una muletilla. Responde muy breve: 'Vale' o 'Entendido' y espera.`
              : `Answer ONLY about 24/7 AI. Caller said a filler word. Reply very briefly: 'Okay' or 'Got it' and wait.`
        }
      });
      return;
    }

    // Normal: let the model respond to the last user turn; instructions enforce scope.
    forceAssistantTurn();
  }

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  openaiSocket.on("open", () => {
    openaiOpen = true;
    console.log("✅ OpenAI WS connected");

    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "echo",
        temperature: 0.4,
        instructions: ROY_PROMPT,
        turn_detection: {
          type: "server_vad",
          threshold: 0.7,
          prefix_padding_ms: 300,
          silence_duration_ms: 900
        },
        max_response_output_tokens: 180,
        input_audio_transcription: { model: "whisper-1" }
      }
    });

    // Fallback: avoid permanent silence if session events omit formats
    setTimeout(() => {
      if (!audioReady) {
        console.log("⚠️ audioReady fallback -> true (prevent silence)");
        audioReady = true;
        maybeDoGreeting();
      }
    }, 1200);

    flushOpenAIQueue();
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Session confirmation
    if (evt.type === "session.created" || evt.type === "session.updated") {
      const s = evt.session || {};
      const outFmt = s.output_audio_format;
      const inFmt = s.input_audio_format;

      console.log("🧾 session.* received:", {
        input_audio_format: inFmt,
        output_audio_format: outFmt,
        voice: s.voice
      });

      if (outFmt == null || outFmt === "g711_ulaw") {
        audioReady = true;
        maybeDoGreeting();
      } else {
        audioReady = false;
        sendToOpenAI({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: "echo",
            temperature: 0.4,
            instructions: ROY_PROMPT,
            turn_detection: {
              type: "server_vad",
              threshold: 0.7,
              prefix_padding_ms: 300,
              silence_duration_ms: 900
            },
            max_response_output_tokens: 180,
            input_audio_transcription: { model: "whisper-1" }
          }
        });
      }
    }

    // State flags (DO NOT DEADLOCK)
    if (evt.type === "response.created") {
      responseInFlight = true;
      if (evt.response && evt.response.id) lastResponseId = evt.response.id;
    }

    if (evt.type === "response.done") {
      responseInFlight = false;
      isAISpeaking = false; // critical: clear here too
      if (evt.response && evt.response.id) lastResponseId = evt.response.id;
    }

    if (evt.type === "response.audio.started") isAISpeaking = true;
    if (evt.type === "response.audio.done") isAISpeaking = false;

    // Send audio to Twilio
    if (evt.type === "response.audio.delta" && evt.delta) {
      if (!audioReady) return;
      if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
        twilioSocket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: evt.delta }
          })
        );
      }
    }

    // When the caller stops speaking: commit audio, then FORCE a response turn.
    // This is what fixes "Roy says greeting then never speaks again".
    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });

      // Debounce: wait a beat for transcription event; if it doesn't arrive, respond anyway.
      if (pendingTurnTimer) clearTimeout(pendingTurnTimer);
      pendingTurnTimer = setTimeout(() => {
        forceAssistantTurn();
      }, 250);
    }

    // If transcription DOES arrive, use it (better language switching / filler handling),
    // and cancel the fallback timer so we don’t double-respond.
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) return;

      console.log("📝 Caller said:", transcript);

      if (pendingTurnTimer) {
        clearTimeout(pendingTurnTimer);
        pendingTurnTimer = null;
      }

      // If Roy is mid-speech, barge-in instead of ignoring the user.
      if (responseInFlight || isAISpeaking) cancelAnyOngoingResponse();

      createRoyResponseFromTranscript(transcript);
    }
  });

  openaiSocket.on("close", (c, r) => {
    console.error("❌ OpenAI WS closed", c, r ? r.toString() : "");
  });

  openaiSocket.on("error", (e) => {
    console.error("❌ OpenAI WS error", e);
  });

  function isCallerAudio(track) {
    // Twilio may omit media.track; if missing, treat as inbound (caller).
    if (!track) return true;
    const t = String(track).toLowerCase();
    return t.includes("inbound");
  }

  let trackLogged = false;

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start && data.start.streamSid ? data.start.streamSid : null;
      console.log("🟢 Twilio start:", streamSid);
      requestGreeting();
      return;
    }

    if (data.event === "media") {
      const track = data.media && data.media.track;
      if (!trackLogged) {
        trackLogged = true;
        console.log("📞 Twilio media.track =", track || "(missing)");
      }

      if (!isCallerAudio(track)) return;

      const payload = data.media && data.media.payload;
      if (!payload) return;

      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
      return;
    }

    if (data.event === "stop") {
      console.log("🔴 Twilio stop");
      try {
        if (pendingTurnTimer) clearTimeout(pendingTurnTimer);
      } catch {}
      try {
        if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      } catch {}
      try {
        if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
      } catch {}
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔴 Twilio WS closed");
    try {
      if (pendingTurnTimer) clearTimeout(pendingTurnTimer);
    } catch {}
    try {
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    } catch {}
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    try {
      if (pendingTurnTimer) clearTimeout(pendingTurnTimer);
    } catch {}
    try {
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    } catch {}
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on", PORT));
