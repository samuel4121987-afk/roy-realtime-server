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
 * UPDATED PROMPT:
 * - Adds closing “free trial” push sequence
 * - Adds explicit YES/NO phrase recognition guidance
 * - Keeps your greeting exactly
 */
const ROY_PROMPT = `
You are Roy, the receptionist for the company "24/7 AI".

## Immediate Greeting (EXACT)
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble):
"24/7 AI, this is Roy. How can I help you?"
- Never repeat the greeting.

## Tone and Style
- Natural, friendly, confident, human.
- Short answers: 1–2 sentences. Use contractions. No robotic pacing.

## Listening and Interruptions
- Focus only on the main caller.
- If the caller says filler while you are speaking (e.g., "yeah", "ok", "uh-huh", "aha", "sí", "vale"), do NOT stop—continue.
- Only stop mid-sentence if the caller asks a real question.

## Scope
- Only discuss 24/7 AI: receptionist coverage, bookings/reservations, lead capture, onboarding, setup, and basic pricing.
- If asked what the company does: 1–2 sentences:
"24/7 AI answers calls 24/7, handles bookings and inquiries, and captures leads so you never miss a call."

## Language
- English by default.
- Switch to Spanish ONLY if the caller speaks a clear Spanish sentence or explicitly asks for Spanish.

## Closing Sequence (CRITICAL)
When the caller indicates they are about to end the call (examples: "alright thanks", "thanks for everything", "that’s all", "I’m good", "bye", "talk to you later"),
DO NOT end immediately. Follow this exact sequence:

Step 1 (Offer):
- Say: "Before you go—do you want to test our service free for a few days?"

Step 2 (If they say NO / not interested):
- Push ONE time only:
"You’ve got nothing to lose—try it free, and if you don’t want it after the trial it auto-suspends on its own."

Step 3 (If they say NO again after the push):
- Close politely:
"No problem at all—thanks for calling, have a great day."

Step 4 (If they say YES / OK / fine / sure / why not):
- Collect details in this order:
  1) "Great—what’s your name?"
  2) "What email should I send the setup to?"
  3) "And what’s the best phone number for verification?"
- Repeat back:
"Just to confirm: name __, email __, phone __ — is that correct?"
- If confirmed:
"Perfect—I’ll send it to your email. Thanks for calling, have a great day."

## YES / NO phrase recognition (use this to interpret intent)
Treat these as YES / ACCEPT:
- "yes", "yeah", "yep", "sure", "okay", "ok", "alright", "fine", "why not", "let's do it", "go ahead",
- "sounds good", "I will", "I'll try", "I'll test it", "send it", "let me try",
Spanish YES:
- "sí", "si", "claro", "vale", "de acuerdo", "perfecto", "ok", "dale", "vamos", "por qué no"

Treat these as NO / REFUSE:
- "no", "nope", "nah", "not interested", "not now", "maybe later", "I don't want", "I’m good", "I'm fine", "no thanks", "don't call me",
Spanish NO:
- "no", "para nada", "no gracias", "no me interesa", "ahora no", "quizá después", "estoy bien"

## Do not loop
- Never offer the free trial more than once per call.
- Never push more than one time after a refusal.
`.trim();

/** ---------------- FILLER + QUESTION DETECTION (your requested logic) ---------------- **/

const FILLER_WORDS = new Set([
  "uh","um","hmm","ah","er","like","you","know",
  "aha","yes","yeah","yep","okay","ok","sure","right",
  "uh-huh","mm-hmm","mhm","mm","yup",
  "si","sí","vale","bueno","claro","ya","espera","a","ver",
  "no","nah"
]);

function normalizeText(t) {
  return (t || "")
    .toLowerCase()
    .trim()
    .replace(/[“”]/g, '"')
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

  const starters = new Set([
    "who","what","when","where","why","how",
    "can","could","do","does","did",
    "is","are","am","was","were",
    "will","would","should",
    "tell","explain",
    // Spanish common
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

// Avoid false cancels from tiny echo fragments like "what", "how"
function isStrongQuestion(text) {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (raw.includes("?")) return true;

  const w = wordsOf(raw);
  const cleanedLen = normalizeText(raw).replace(/\s+/g, " ").length;

  if (w.length < 3 && cleanedLen < 12) return false;
  return looksLikeQuestion(raw);
}

/** ---------------------------------------------------------------------- **/

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

  // Speaking flags + “real barge-in” gating
  let isAISpeaking = false;
  let responseInFlight = false;
  let pendingBargeIn = false; // set only when speech_started happens DURING Roy speaking

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

  function injectUserTextAndRespond(text) {
    // Reliable: put transcript into conversation as text, then response.create
    sendToOpenAI({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }]
      }
    });
    sendToOpenAI({ type: "response.create" });
  }

  function cancelAndClearTwilio() {
    sendToOpenAI({ type: "response.cancel" });
    if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    }
    // prevent stuck flags
    isAISpeaking = false;
    responseInFlight = false;
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

    // Enable VAD + transcription (so we can decide interruption)
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

    // If Twilio start already arrived, greet immediately.
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

    // Speaking flags (fixes “stuck speaking”)
    if (evt.type === "response.created") responseInFlight = true;
    if (evt.type === "response.done") { responseInFlight = false; isAISpeaking = false; }
    if (evt.type === "response.audio.started") isAISpeaking = true;
    if (evt.type === "response.audio.done") isAISpeaking = false;

    // Only mark pending barge-in if caller speech starts WHILE Roy is speaking
    if (evt.type === "input_audio_buffer.speech_started") {
      if (isAISpeaking || responseInFlight) pendingBargeIn = true;
    }

    // Commit on speech stop so transcription completes
    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // Audio back to Twilio
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        }));
      }
    }

    // Transcription -> ONLY interrupt for real questions (not filler)
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) { pendingBargeIn = false; return; }

      const filler = isOnlyFillerWords(transcript);
      const strongQ = isStrongQuestion(transcript);

      // If caller tried to interrupt while Roy was talking:
      if ((isAISpeaking || responseInFlight) && pendingBargeIn) {
        // Only cancel if it's a REAL question (and not filler)
        if (!filler && strongQ) {
          cancelAndClearTwilio();
          pendingBargeIn = false;
          injectUserTextAndRespond(transcript);
          return;
        }

        // Not a real question -> ignore (Roy continues)
        pendingBargeIn = false;
        return;
      }

      // If Roy is not talking: respond normally
      pendingBargeIn = false;
      injectUserTextAndRespond(transcript);
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

  // Keep your base EXACTLY (as you said it works for you)
  const isCallerAudio = (track) => {
    if (!track) return false; // reject audio without track
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

      // Greeting (unchanged)
      sendToOpenAI({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          temperature: 0,
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
