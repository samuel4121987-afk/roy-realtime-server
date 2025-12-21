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

/**
 * NOTE: Kept your Roy style, but removed the “pretend human / never reveal AI” requirement.
 * Roy is a virtual receptionist for 24/7 AI, and can be transparent if asked.
 */
const ROY_PROMPT = `
You are Roy, the virtual receptionist for the company "24/7 AI".

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence:
"24/7 AI, this is Roy. How can I help you?"
- Never repeat the greeting.

## Tone
- Natural, friendly, confident, human-sounding.
- Keep responses short: 1–2 sentences.

## Listening & Interruptions (CRITICAL)
- If the caller asks a real question while you are speaking, STOP immediately and answer the question.
- If the caller only says filler words while you are speaking (e.g., "yeah", "ok", "uh-huh", "aha", "sí", "vale"), do NOT stop—continue naturally.

## Scope
- Only discuss 24/7 AI: receptionist coverage, bookings/reservations, lead capture, onboarding, setup, and basic pricing.
- If asked what the company does: 1–2 sentences:
"24/7 AI answers calls 24/7, handles bookings and inquiries, and captures leads so you never miss a call."

## Language
- English by default.
- Switch to Spanish ONLY if the caller clearly speaks Spanish or explicitly asks for Spanish.

## Transparency
- If asked directly, you may say you are a virtual receptionist for 24/7 AI.
`.trim();

/** ---------------- Question vs filler detection ---------------- **/

const FILLER_WORDS = new Set([
  "uh","um","hmm","ah","er","like","you","know",
  "aha","yes","yeah","yep","okay","ok","sure","right",
  "uh-huh","mm-hmm","mhm","mm","yup",
  "si","sí","vale","bueno","claro","ya","espera","a","ver",
  "no","nah","alright","thanks","thank","thx"
]);

function normalizeText(t) {
  return (t || "")
    .toLowerCase()
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:()]/g, "")
    .replace(/\s+/g, " ");
}

function wordsOf(t) {
  const s = normalizeText(t);
  return s ? s.split(/\s+/).filter(Boolean) : [];
}

function isOnlyFillerWords(text) {
  const w = wordsOf(text);
  if (w.length === 0) return true;
  if (w.length > 4) return false;
  return w.every(x => FILLER_WORDS.has(x));
}

function isStrongQuestion(text) {
  const raw = (text || "").trim();
  if (!raw) return false;

  // Hard question mark
  if (raw.includes("?")) return true;

  const w = wordsOf(raw);
  if (w.length === 0) return false;

  // Avoid cancelling on tiny fragments like "what"
  const cleanedLen = normalizeText(raw).length;
  if (w.length < 3 && cleanedLen < 12) return false;

  const first = w[0];
  const starters = new Set([
    "who","what","when","where","why","how",
    "can","could","do","does","did",
    "is","are","am","was","were",
    "will","would","should",
    "tell","explain",
    "qué","que","cómo","como","cuándo","cuando","dónde","donde","cuánto","cuanto",
    "puedo","puede","podría","podria"
  ]);
  if (starters.has(first)) return true;

  const lower = raw.toLowerCase();
  const markers = [
    "price","pricing","cost","charge","fee","fees","rate","rates",
    "book","booking","reserve","reservation","schedule","setup","onboard","onboarding",
    "how much","what is","what are",
    "precio","coste","costo","tarifa","reservar","reserva","cita","configurar","instalar"
  ];
  return markers.some(m => lower.includes(m));
}

/** ---------------- Express + TwiML ---------------- **/

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

/** ---------------- WebSockets ---------------- **/

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;

  // OpenAI state
  let openaiOpen = false;
  const openaiQueue = [];

  // Speaking state (so we can hard-interrupt)
  let isAISpeaking = false;
  let responseInFlight = false;

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

  function cancelAndClearTwilio() {
    // Cancel model output + clear buffered Twilio audio immediately
    sendToOpenAI({ type: "response.cancel" });
    if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    }
    // Local flags (don’t wait on events)
    isAISpeaking = false;
    responseInFlight = false;
  }

  function injectUserAndAnswer(transcript) {
    // Add user message into the model conversation
    sendToOpenAI({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: transcript }]
      }
    });

    // Force short on-topic answer
    sendToOpenAI({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        temperature: 0.4,
        max_response_output_tokens: 140,
        instructions:
          "Answer the caller's question in 1–2 short sentences. Stay ONLY on 24/7 AI. If unrelated, redirect back to 24/7 AI."
      }
    });
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

    // Enable transcription + VAD so we can detect questions while Roy is speaking
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0.6,
        instructions: ROY_PROMPT,
        turn_detection: {
          type: "server_vad",
          threshold: 0.78,
          prefix_padding_ms: 300,
          silence_duration_ms: 800
        },
        input_audio_transcription: { model: "whisper-1" },
      },
    });

    flushOpenAIQueue();

    // If Twilio start already arrived, greet immediately (your working behavior)
    if (streamSid) {
      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Please greet the caller now." }]
        }
      });
      sendToOpenAI({ type: "response.create" });
    }
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

    // Track speaking lifecycle
    if (evt.type === "response.created") responseInFlight = true;
    if (evt.type === "response.done") { responseInFlight = false; isAISpeaking = false; }
    if (evt.type === "response.audio.started") isAISpeaking = true;
    if (evt.type === "response.audio.done") isAISpeaking = false;

    // Send audio to Twilio
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        }));
      }
    }

    // Commit audio buffer after speech stops so transcription completes quickly
    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // Transcription completed: THIS is where we decide to interrupt or ignore
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) return;

      const filler = isOnlyFillerWords(transcript);
      const question = isStrongQuestion(transcript);

      // If Roy is currently talking and you asked a real question => STOP and answer
      if ((isAISpeaking || responseInFlight) && question && !filler) {
        cancelAndClearTwilio();
        injectUserAndAnswer(transcript);
        return;
      }

      // If he’s talking and you only said filler => ignore it completely
      if ((isAISpeaking || responseInFlight) && filler) {
        return;
      }

      // Otherwise: normal turn, answer it
      injectUserAndAnswer(transcript);
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
    if (!track) return false;
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
      streamSid = data.start && data.start.streamSid ? data.start.streamSid : null;
      console.log("▶️ Twilio start:", streamSid);

      // Immediate greeting on start (your base working behavior)
      sendToOpenAI({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          temperature: 0,
          max_response_output_tokens: 60,
          instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
          commit: true,
        },
      });
      return;
    }

    if (data.event === "media") {
      const track = data.media && data.media.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("ℹ️ Twilio media.track =", track || "(missing)");
      }

      if (!isCallerAudio(track)) return;

      const payload = data.media && data.media.payload;
      if (!payload) return;

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
