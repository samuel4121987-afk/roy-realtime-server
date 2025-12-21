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
You are Roy, a male voice for the 24/7 AI Assistant service.

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble): "24/7 AI, this is Roy. How can I help you?" Begin speaking as soon as the call starts.
- Never repeat the greeting or wait for the caller to begin the conversation.

## Tone and Style
- Speak in a natural male voice. Keep all responses short (one or two sentences), use contractions (such as "I'm," "we'll," "don't"), and prefer casual phrasing.
- Maintain a confident, friendly, and relaxed tone. Do not sound robotic or overly formal. Pace yourself steadily with natural intonation at all times.

## Listening and Interruptions
- When the caller says filler words (e.g., "yes," "uh-huh," "okay," "aha," etc.) while you are speaking, do not pause—continue your response naturally.
- Only stop talking mid-sentence if the caller clearly asks a question or presents new information. Promptly listen, then answer their question directly and succinctly.

## Noise and Multiple Voices
- Ignore background voices/noise; focus only on the main caller.

## Language Adaptation
- Default to English. If the caller switches to Spanish, respond fluently in Spanish.

## Scope of Service
- 24/7 AI Assistant provides continuous receptionist coverage and handles bookings, reservations, lead capture, onboarding, and customer inquiries.

## Transparency
- If asked, you may say you are the virtual receptionist for 24/7 AI.
`.trim();

/** ---------------- FILLER + QUESTION DETECTION ---------------- **/

const FILLER_WORDS = new Set([
  "uh","um","hmm","ah","er","like","you","know",
  "aha","yes","yeah","yep","okay","ok","sure","right","uh-huh","mm-hmm","mhm","mm",
  "yup","no","nah","yep",
  "si","sí","vale","bueno","claro","ya","espera","a","ver","hola","buenas"
]);

function normalizeText(t) {
  return (t || "")
    .toLowerCase()
    .trim()
    .replace(/[“”"]/g, '"')
    .replace(/[.,!?;:()]/g, "");
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

function looksLikeQuestion(text) {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (raw.includes("?")) return true;

  const w = wordsOf(raw);
  if (w.length === 0) return false;

  const first = w[0];

  const questionStarters = new Set([
    "who","what","when","where","why","how",
    "can","could","do","does","did",
    "is","are","am","was","were",
    "will","would","should",
    "tell","explain",
    // Spanish starters
    "qué","que","cómo","como","cuándo","cuando","dónde","donde","por","qué","porque",
    "puedo","puede","pueden","podría","podria","es","son","tienen","tiene"
  ]);

  if (questionStarters.has(first)) return true;

  // intent markers (helps when no ?)
  const lower = raw.toLowerCase();
  const markers = [
    "price","pricing","cost","charge","fee","fees","rate","rates",
    "book","booking","reserve","reservation","schedule","setup","onboard","onboarding",
    "how much","how do","how can","what is","what are",
    "precio","cuánto","cuanto","costo","coste","tarifa","reservar","reserva","cita","configurar","instalar"
  ];
  return markers.some(m => lower.includes(m));
}

/** ---------------- EXPRESS + TWILIO ---------------- **/

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
  let openaiOpen = false;
  const openaiQueue = [];

  // State
  let greeted = false;
  let isAISpeaking = false;
  let responseInFlight = false;

  // Barge-in gating
  let pendingBargeIn = false;      // set when caller speaks while AI is speaking
  let lastTranscript = "";

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

  function cancelAIAndClearTwilio() {
    // Cancel current response + clear any buffered audio in Twilio
    sendToOpenAI({ type: "response.cancel" });
    if (streamSid && twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    }
    // IMPORTANT: also clear local flags so we don't deadlock
    isAISpeaking = false;
    responseInFlight = false;
  }

  function createResponseForCaller() {
    // response.create with no extra instructions: ROY_PROMPT governs behavior
    sendToOpenAI({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        output_audio_format: "g711_ulaw"
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

    // Enable VAD + transcription so we can decide whether to interrupt
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
          threshold: 0.75,
          prefix_padding_ms: 300,
          silence_duration_ms: 800
        },
        input_audio_transcription: { model: "whisper-1" },
        max_response_output_tokens: 180
      },
    });

    flushOpenAIQueue();

    // If Twilio start already arrived, greet immediately.
    if (streamSid && !greeted) {
      greeted = true;
      sendToOpenAI({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          temperature: 0,
          output_audio_format: "g711_ulaw",
          instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"'
        },
      });
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

    // Track speaking/in-flight robustly
    if (evt.type === "response.created") responseInFlight = true;

    if (evt.type === "response.done") {
      responseInFlight = false;
      isAISpeaking = false; // also clear here (audio.done can be flaky)
    }

    if (evt.type === "response.audio.started") isAISpeaking = true;
    if (evt.type === "response.audio.done") isAISpeaking = false;

    // If caller starts speaking while AI is speaking, mark pending barge-in.
    // We DO NOT cancel here. We wait for transcription and decide.
    if (evt.type === "input_audio_buffer.speech_started") {
      if (isAISpeaking || responseInFlight) {
        pendingBargeIn = true;
      }
    }

    // Commit audio on speech stop so transcription completes
    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // Audio to Twilio
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

    // Decision point: transcription completed
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) {
        // Empty transcript: treat as non-interrupting noise/filler
        pendingBargeIn = false;
        return;
      }

      lastTranscript = transcript;
      const filler = isOnlyFillerWords(transcript);
      const question = looksLikeQuestion(transcript);

      console.log(`👤 User said: "${transcript}" | filler=${filler} question=${question} pendingBargeIn=${pendingBargeIn}`);

      // If caller tried to interrupt while Roy was talking:
      if (pendingBargeIn) {
        // Only cancel Roy if it's a REAL question AND not filler
        if (question && !filler) {
          console.log("🛑 Barge-in question detected -> cancel and answer");
          cancelAIAndClearTwilio();
          // Now answer the new user turn
          createResponseForCaller();
        } else {
          // Not a real question -> ignore interruption, let Roy continue
          console.log("➡️ Interruption ignored (filler/non-question) -> Roy continues");
        }

        pendingBargeIn = false;
        return;
      }

      // Normal case (Roy not speaking): answer everything (including non-questions)
      createResponseForCaller();
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

  // IMPORTANT: treat missing track as inbound (Twilio often omits it)
  const isCallerAudio = (track) => {
    if (!track) return true;
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

      // Greet immediately as soon as both sides are ready
      if (!greeted) {
        greeted = true;
        sendToOpenAI({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            temperature: 0,
            output_audio_format: "g711_ulaw",
            instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"'
          },
        });
      }
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
