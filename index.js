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

// Keep session prompt focused on behavior AFTER the greeting
const ROY_PROMPT = `
You are Roy, the virtual receptionist for "24/7 AI".

Rules:
- Stay strictly on-topic: only talk about 24/7 AI receptionist coverage, bookings, lead capture, onboarding, setup, pricing basics.
  If asked unrelated questions, redirect back to 24/7 AI.
- English by default. Switch to Spanish ONLY if caller explicitly asks for Spanish or speaks a clear Spanish sentence.
- Short, human answers: 1–2 sentences.
- If asked "what does OpenAI do?", answer briefly: 24/7 AI uses a virtual assistant to answer calls and capture leads.
`.trim();

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

  // CRITICAL: deterministic greeting, EXACTLY as you want, BEFORE streaming starts.
  // This eliminates the model paraphrasing the greeting.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>24/7 AI, this is Roy. How can I help you?</Say>
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

  // OpenAI connection + queue
  let openaiOpen = false;
  const openaiQueue = [];

  // We do NOT “gate” audio with fragile session echoes; greeting is Twilio now.
  // We always forward audio deltas if OpenAI produces them.
  let audioReady = true;

  // AI state (we will not block user turns with these flags)
  let isAISpeaking = false;
  let responseInFlight = false;
  let lastResponseId = null;

  // Language heuristic
  let currentLang = "en";

  // Twilio-side end-of-utterance detection (this is what stops post-greeting silence)
  let lastTwilioMediaAt = 0;
  let sawCallerMedia = false;
  let twilioSilenceTimer = null;

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

  // Guaranteed “caller spoke -> Roy responds”
  function commitAndRespond() {
    if (!openaiOpen) return;

    // If caller talks while Roy speaks, barge-in: cancel then respond.
    if (responseInFlight || isAISpeaking) cancelAnyOngoingResponse();

    // Commit buffered audio into a user turn
    sendToOpenAI({ type: "input_audio_buffer.commit" });

    // Create response from that committed audio turn
    sendToOpenAI({
      type: "response.create",
      response: {
        modalities: ["audio"],
        output_audio_format: "g711_ulaw",
        instructions: scopeInstruction()
      }
    });

    // Clear buffer to avoid “stale audio” issues
    sendToOpenAI({ type: "input_audio_buffer.clear" });
  }

  function armTwilioSilenceTimer() {
    if (twilioSilenceTimer) clearTimeout(twilioSilenceTimer);

    // “Silence” threshold after caller audio (tune 650–1200 if you want)
    twilioSilenceTimer = setTimeout(() => {
      const now = Date.now();
      const idleMs = now - lastTwilioMediaAt;

      if (sawCallerMedia && idleMs >= 700) {
        sawCallerMedia = false;
        commitAndRespond();
      } else {
        armTwilioSilenceTimer();
      }
    }, 750);
  }

  // OpenAI WS
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
        // We DO NOT rely on server_vad anymore for turns; Twilio silence timer triggers turns.
        turn_detection: { type: "server_vad", threshold: 0.7, prefix_padding_ms: 300, silence_duration_ms: 900 },
        max_response_output_tokens: 180,
        input_audio_transcription: { model: "whisper-1" }
      }
    });

    flushOpenAIQueue();
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Track response state (only for barge-in cancel; we NEVER block caller turns)
    if (evt.type === "response.created") {
      responseInFlight = true;
      if (evt.response && evt.response.id) lastResponseId = evt.response.id;
    }
    if (evt.type === "response.done") {
      responseInFlight = false;
      isAISpeaking = false;
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

    // If transcription comes, we can switch language intelligently (optional)
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) return;

      console.log("📝 Caller said:", transcript);

      if (currentLang === "en" && shouldSwitchToSpanish(transcript)) currentLang = "es";
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

  // Twilio WS inbound
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

      lastTwilioMediaAt = Date.now();
      sawCallerMedia = false;
      armTwilioSilenceTimer();
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

      // Mark caller audio + update silence detection
      lastTwilioMediaAt = Date.now();
      sawCallerMedia = true;
      armTwilioSilenceTimer();

      // Send caller audio to OpenAI
      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
      return;
    }

    if (data.event === "stop") {
      console.log("🔴 Twilio stop");
      try { if (twilioSilenceTimer) clearTimeout(twilioSilenceTimer); } catch {}
      try { if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close(); } catch {}
      try { if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close(); } catch {}
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔴 Twilio WS closed");
    try { if (twilioSilenceTimer) clearTimeout(twilioSilenceTimer); } catch {}
    try { if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close(); } catch {}
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    try { if (twilioSilenceTimer) clearTimeout(twilioSilenceTimer); } catch {}
    try { if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close(); } catch {}
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on", PORT));
