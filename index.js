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
You are Roy, the virtual receptionist for "24/7 AI" (a business that provides 24/7 AI receptionist coverage).
You are professional, natural, and helpful.

ABSOLUTE RULES:
1) STAY ON TOPIC: Only talk about 24/7 AI receptionist service, call handling, bookings, reservations, lead capture,
   pricing basics, setup, and business onboarding. If unrelated, redirect:
   "I can help with 24/7 AI receptionist coverage—what kind of business are you calling about?"
2) NO RANDOM FACTS: Do not answer general knowledge questions unless it directly connects to 24/7 AI service.
3) LANGUAGE: Default English. Switch to Spanish ONLY if the caller explicitly asks ("en español"/"español") or speaks
   a clear Spanish sentence. Never switch due to “accent”.
4) GREETING: At the start of every call, greet immediately with EXACTLY:
   "24/7 AI, this is Roy. How can I help you?"
5) CONCISE: 1–2 sentences per answer. Sound human.
6) BARGE-IN: If the caller speaks while you’re talking, stop quickly and listen.
7) TRANSPARENCY (ONLY IF ASKED): If asked what you are or what OpenAI does, you may say:
   "I’m a virtual assistant that helps 24/7 AI answer calls and capture leads."
   Keep it brief and tie back to the business.
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

  const markers = [
    "qué","que","cómo","como","cuánto","cuanto","dónde","donde","por","para","con","sin",
    "necesito","quiero","hola","buenas","gracias","precio","reservar","cita","empresa","negocio"
  ];
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
  let sessionConfigured = false; // IMPORTANT: gate speech until this is true
  const openaiQueue = [];

  // Flow state
  let greeted = false;
  let greetRequested = false;

  // Speaking / response state
  let isAISpeaking = false;
  let responseInFlight = false;

  // Echo/barge-in protection (light)
  let aiSpeechStartedAt = 0;
  const BARGE_IN_GRACE_MS = 650;
  let pendingBargeIn = false;
  let inboundDecodedBytesWhilePending = 0;
  const MIN_DECODED_BYTES_TO_CANCEL = 2600;
  let bargeTimer = null;
  const BARGE_IN_DEBOUNCE_MS = 140;

  // Language state
  let currentLang = "en";

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
    // We may be called from Twilio start or OpenAI open.
    greetRequested = true;
    maybeDoGreeting();
  }

  function maybeDoGreeting() {
    if (!greetRequested) return;
    if (greeted) return;
    if (!streamSid) return;
    if (!openaiOpen) return;
    if (!sessionConfigured) return; // CRITICAL: prevents “shshsh” static

    greeted = true;
    greetRequested = false;

    // Small safety delay ensures codec config is fully applied before audio begins
    setTimeout(() => {
      sendToOpenAI({
        type: "response.create",
        response: {
          instructions:
            "Start of call. Say EXACTLY this greeting and nothing else: '24/7 AI, this is Roy. How can I help you?'"
        }
      });
    }, 200);
  }

  function createRoyResponseFromTranscript(transcriptRaw) {
    const transcript = (transcriptRaw || "").trim();
    if (!transcript) return;

    if (currentLang === "en" && shouldSwitchToSpanish(transcript)) currentLang = "es";

    const baseScope =
      currentLang === "es"
        ? "Responde SOLO sobre el servicio de recepcionista virtual 24/7 AI. Si es ajeno, redirige."
        : "Answer ONLY about 24/7 AI receptionist service. If unrelated, redirect.";

    const filler = isOnlyFillerWords(transcript);

    if (filler) {
      sendToOpenAI({
        type: "response.create",
        response: {
          instructions:
            currentLang === "es"
              ? `${baseScope} El usuario solo dijo una muletilla. Responde muy breve: 'Vale' o 'Entendido' y espera.`
              : `${baseScope} Caller utterance was filler. Reply very briefly: 'Okay' or 'Got it' and wait.`
        }
      });
      return;
    }

    sendToOpenAI({
      type: "response.create",
      response: {
        instructions:
          currentLang === "es"
            ? `${baseScope} Responde en español en 1–2 frases. Si preguntan "qué hace OpenAI", contesta brevemente que 24/7 AI usa un asistente virtual para atender llamadas y capturar leads, y pregunta qué tipo de negocio tienen.`
            : `${baseScope} Respond in English in 1–2 sentences. If they ask "what does OpenAI do", say briefly that 24/7 AI uses a virtual assistant to answer calls and capture leads, then ask what business they have.`
      }
    });
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

    // Configure session (codec must match Twilio: g711_ulaw)
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "echo",
        temperature: 0.5,
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

    flushOpenAIQueue();
    // Do not greet here yet; wait for sessionConfigured ack.
    maybeDoGreeting();
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // IMPORTANT: Only start speaking AFTER session config is acknowledged
    if (evt.type === "session.created" || evt.type === "session.updated") {
      sessionConfigured = true;
      console.log("✅ OpenAI session configured (codec ready)");
      maybeDoGreeting();
    }

    if (evt.type === "response.created") responseInFlight = true;
    if (evt.type === "response.done") responseInFlight = false;

    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
      aiSpeechStartedAt = Date.now();
      pendingBargeIn = false;
      inboundDecodedBytesWhilePending = 0;
    }

    if (evt.type === "response.audio.done") {
      isAISpeaking = false;
    }

    // ONLY forward response.audio.delta (do NOT mix event types)
    if (evt.type === "response.audio.delta" && evt.delta) {
      if (!isAISpeaking) {
        isAISpeaking = true;
        aiSpeechStartedAt = Date.now();
      }

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

    // Barge-in detection (guarded)
    if (evt.type === "input_audio_buffer.speech_started") {
      if (!isAISpeaking && !responseInFlight) return;
      if (Date.now() - aiSpeechStartedAt < BARGE_IN_GRACE_MS) return;

      pendingBargeIn = true;
      inboundDecodedBytesWhilePending = 0;

      if (bargeTimer) clearTimeout(bargeTimer);
      bargeTimer = setTimeout(() => {
        if (!pendingBargeIn) return;
        if (inboundDecodedBytesWhilePending >= MIN_DECODED_BYTES_TO_CANCEL) {
          sendToOpenAI({ type: "response.cancel" });
          if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
            twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
          }
          isAISpeaking = false;
          responseInFlight = false;
        }
        pendingBargeIn = false;
        inboundDecodedBytesWhilePending = 0;
      }, BARGE_IN_DEBOUNCE_MS);
    }

    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) return;

      // Don’t overlap responses
      if (responseInFlight || isAISpeaking) return;

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
    if (!track) return false;
    return track === "inbound" || track === "inbound_track";
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

      if (pendingBargeIn) {
        inboundDecodedBytesWhilePending += Math.floor((payload.length * 3) / 4);
      }

      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
      return;
    }

    if (data.event === "stop") {
      console.log("🔴 Twilio stop");
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
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    } catch {}
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    try {
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    } catch {}
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on", PORT));
