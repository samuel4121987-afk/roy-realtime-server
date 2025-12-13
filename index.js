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
You are Roy, a male voice for the 24/7 AI Assistant service. Your goal is to behave exactly like a real human receptionist—never reveal that you are artificial intelligence or a language model. Consistently follow these rules on every call.

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble): “24/7 AI, this is Roy. How can I help you?” Begin speaking as soon as the call starts.
- Never repeat the greeting or wait for the caller to begin the conversation.

## Tone and Style
- Speak in a natural male voice. Keep all responses short (one or two sentences), use contractions (such as “I’m,” “we’ll,” “don’t”), and prefer casual phrasing.
- Maintain a confident, friendly, and relaxed tone. Do not sound robotic or overly formal. Pace yourself steadily with natural intonation at all times.

## Listening and Interruptions
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- When the caller says filler words (e.g., “yes,” “uh-huh,” “okay,” “aha,” etc.) while you are speaking, do not pause—continue your response naturally, since listeners often vocalize agreement.
- Only stop talking mid-sentence if the caller clearly asks a question or presents new information. Promptly listen, then answer their question directly and succinctly before resuming where you left off.
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

/* ---------------------------
   SMART BARGE-IN CONFIG
---------------------------- */
// Expand this list as you like.
const FILLER_REGEX = /^\s*(?:y(?:eah|ep|up|a)?|yes|ok(?:ay)?|okay|aha|uh\-?huh|mm+|mhm+|right|sure|got it|i see|alright|vale|sí|si|aja|ajá|claro)\s*[.!?…]*\s*$/i;

// If transcript contains a "?" anywhere, treat as interruption.
function isLikelyQuestion(text) {
  return /\?/.test(text) || /\b(what|why|how|when|where|who|can you|could you|do you|are you|is it|tell me|explain)\b/i.test(text);
}

// If transcript has more than just filler, treat as interruption.
function isFillerOnly(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t) return true;
  return FILLER_REGEX.test(t);
}

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let openaiOpen = false;
  const openaiQueue = [];

  // Track assistant speaking so we only consider barge-in then.
  let assistantSpeaking = false;

  // We’ll collect short caller utterance transcripts while assistant is speaking.
  // When we get a completed transcript, decide to cancel or ignore.
  let pendingInterruptCheck = false;

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

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    openaiOpen = true;
    console.log("✅ OpenAI WS connected");

    // Enable transcription so we can distinguish filler vs real interruption.
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0.6,

        // Keep your VAD behavior (works for turn-taking)
        turn_detection: { type: "server_vad" },

        // CRITICAL for smart barge-in
        input_audio_transcription: { model: "whisper-1" },

        instructions: ROY_PROMPT,
      },
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

    if (evt.type === "error") {
      console.error("❌ OpenAI error:", JSON.stringify(evt, null, 2));
      return;
    }

    // Speaking state
    if (evt.type === "response.created") assistantSpeaking = true;
    if (evt.type === "response.done") assistantSpeaking = false;

    // Caller transcription completion events:
    // Different accounts may emit slightly different event names;
    // handle the common ones defensively.
    const transcriptText =
      evt?.transcript ??
      evt?.text ??
      evt?.item?.content?.[0]?.transcript ??
      evt?.item?.content?.[0]?.text;

    const isTranscriptEvent =
      evt.type === "conversation.item.input_audio_transcription.completed" ||
      evt.type === "input_audio_transcription.completed" ||
      (evt.type && evt.type.includes("transcription") && transcriptText);

    if (isTranscriptEvent && pendingInterruptCheck && assistantSpeaking) {
      const t = String(transcriptText || "").trim();
      if (!t) return;

      // Decide: cancel or ignore
      const fillerOnly = isFillerOnly(t);
      const questionLike = isLikelyQuestion(t);

      if (!fillerOnly || questionLike) {
        console.log("🛑 BARGE-IN (real):", t);
        sendToOpenAI({ type: "response.cancel" });
        assistantSpeaking = false;
      } else {
        console.log("✅ Ignoring filler:", t);
      }

      pendingInterruptCheck = false;
      return;
    }

    // Audio back to Twilio
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: evt.delta },
          })
        );
      }
    }
  });

  openaiSocket.on("close", (c, r) => {
    console.error("❌ OpenAI WS closed", c, r ? r.toString() : "");
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (e) => {
    console.error("❌ OpenAI WS error", e);
  });

  let trackLogged = false;
  const isCallerAudio = (track) => {
    if (!track) return true; // allow missing track
    return track === "inbound" || track === "inbound_track";
  };

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start?.streamSid || null;
      console.log("▶️ Twilio start:", streamSid);

      // Single deterministic greeting
      sendToOpenAI({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          temperature: 0,
          instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
        },
      });
      return;
    }

    if (data.event === "media") {
      const track = data.media?.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("ℹ️ Twilio media.track =", track || "(missing)");
      }

      if (!isCallerAudio(track)) return;

      const payload = data.media?.payload;
      if (!payload) return;

      // If caller speaks while Roy is speaking, request a transcript-based interrupt check.
      // We don't cancel immediately; we wait to see if it was filler-only.
      if (assistantSpeaking) {
        pendingInterruptCheck = true;
      }

      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
      return;
    }

    if (data.event === "stop") {
      console.log("⛔ Twilio stop");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔌 Twilio WS closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("🚀 Listening on", PORT));
