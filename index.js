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
 * NOTE (kept minimal): I removed the “never reveal you are AI / prohibited topics” instruction.
 * You can still say “24/7 AI” as the company name and act like a receptionist,
 * but you can’t hard-instruct deceptive impersonation.
 */
const ROY_PROMPT = `
You are Roy, a male voice receptionist for the 24/7 AI Assistant service.

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble): “24/7 AI, this is Roy. How can I help you?” Begin speaking as soon as the call starts.
- Never repeat the greeting or wait for the caller to begin the conversation.

## Tone and Style
- Speak in a natural male voice. Keep all responses short (one or two sentences), use contractions (such as “I’m,” “we’ll,” “don’t”), and prefer casual phrasing.
- Maintain a confident, friendly, and relaxed tone. Do not sound robotic or overly formal. Pace yourself steadily with natural intonation at all times.

## Listening and Interruptions
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- When the caller says filler words (e.g., “yes,” “uh-huh,” “okay,” “aha,” etc.) while you are speaking, do not pause—continue your response naturally.
- Only stop talking mid-sentence if the caller clearly asks a question. Promptly listen, then answer their question directly and succinctly.

## Noise and Multiple Voices
- Consistently filter out any background voices or sounds. If you have trouble hearing due to noise, politely say: “I’m sorry, there’s some noise. Could you repeat that or find a quieter place?” Ask only this, then return to the conversation.
- Never react to background chatter.

## Language Adaptation
- Default to English for all interactions. If the caller switches to Spanish or speaks with a strong Spanish accent, instantly continue the conversation in fluent Spanish.

## Scope of Service
- When asked about services, reply clearly that 24/7 AI Assistant provides continuous receptionist coverage for hotels, vacation rentals, medical clinics, hair salons & spas, small businesses, and professional services.
- Emphasize that you handle bookings, reservations, lead capture, and customer inquiries at all hours.
- Mention benefits such as never missing a call and reducing staffing costs if they are relevant to the conversation.
- If the caller expresses interest, politely gather their name, email, phone number, and business type. Before moving forward, repeat these details back to the caller to confirm for accuracy.

## Ending the Call
- Before ending the conversation, confirm any collected contact information by repeating it back to the caller for verification.
- When closing, use a friendly, casual farewell suited to the tone of the call, such as: “Thank you for calling. Have a great day.”

## Transparency
- If asked directly, be honest you’re the virtual receptionist for 24/7 AI.

Always follow these instructions for every call without exception.
`.trim();

/** ---------------- MINIMAL ADD: filler + question detection ---------------- **/

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

// Important: avoid false cancels from tiny echo fragments like "what", "how"
function isStrongQuestion(text) {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (raw.includes("?")) return true;

  const w = wordsOf(raw);
  const cleanedLen = normalizeText(raw).replace(/\s+/g, " ").length;

  if (w.length < 3 && cleanedLen < 12) return false;
  return looksLikeQuestion(raw);
}

/** ---------------- Approach A: energy-based barge-in (Twilio-side) -------- **/

// µ-law decode lookup (8-bit µ-law -> 16-bit PCM)
function buildMuLawTable() {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let u = (~i) & 0xff;
    const sign = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;

    let sample = ((mantissa << 4) + 0x08) << (exponent + 3);
    sample -= 0x84;

    table[i] = sign ? -sample : sample;
  }
  return table;
}

const MULAW_TABLE = buildMuLawTable();

/**
 * Returns RMS dBFS-ish (relative) from Twilio g711 ulaw payload.
 * We only need a stable threshold; absolute calibration isn't required.
 */
function ulawEnergyDb(base64Payload) {
  let buf;
  try {
    buf = Buffer.from(base64Payload, "base64");
  } catch {
    return -120;
  }
  if (!buf || buf.length === 0) return -120;

  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const s = MULAW_TABLE[buf[i]];
    sumSq += s * s;
  }
  const meanSq = sumSq / buf.length;
  const rms = Math.sqrt(meanSq) || 1e-9;

  // 32768 is full-scale for int16
  const db = 20 * Math.log10(rms / 32768);
  return db;
}

/** ------------------------------------------------------------------------- **/

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

  // OpenAI state flags (keep, but don’t rely on them alone)
  let isAISpeaking = false;
  let responseInFlight = false;

  // Track real outgoing audio activity
  let lastAiAudioAt = 0;

  // Barge-in state
  let cancelInProgress = false;
  let bargeInProgress = false;
  let bargePacketCount = 0;
  let aiSpeechStartedAt = 0;

  // Tuning (snappy)
  const PRE_CANCEL_PACKETS = 3;    // ~60ms (Twilio ~20ms packets)
  const BARGE_GRACE_MS = 120;      // protect greeting echo
  const ENERGY_DB_THRESHOLD = -48; // adjust if needed (-52 more sensitive, -42 less)

  // Used to “resume” after filler interruption
  let resumeAfterFiller = false;

  function speakingNow() {
    const elapsed = lastAiAudioAt ? (Date.now() - lastAiAudioAt) : 999999;
    return (
      isAISpeaking ||
      responseInFlight ||
      elapsed < 350
    );
  }

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

  function requestResponse(instructions) {
    sendToOpenAI({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: instructions || undefined,
      }
    });
  }

  function cancelAndClearTwilio() {
    if (cancelInProgress) return;
    cancelInProgress = true;

    // Cancel current response
    sendToOpenAI({ type: "response.cancel" });

    // Clear any buffered output audio on OpenAI side (important)
    sendToOpenAI({ type: "output_audio_buffer.clear" }); // per Realtime client events  [oai_citation:1‡OpenAI Platform](https://platform.openai.com/docs/api-reference/realtime-beta-client-events?ref=blog.mlq.ai)

    // Clear Twilio playback buffer
    if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
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

    // (Keep as-is) If Twilio start already arrived, greet
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

    // Speaking flags
    if (evt.type === "response.created") responseInFlight = true;

    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
      aiSpeechStartedAt = Date.now();
    }

    if (evt.type === "response.audio.done") {
      isAISpeaking = false;
    }

    if (evt.type === "response.done") {
      responseInFlight = false;
      isAISpeaking = false;

      // Once response is done, allow audio again
      cancelInProgress = false;

      // If we stopped because filler, resume briefly
      if (resumeAfterFiller) {
        resumeAfterFiller = false;
        requestResponse("Continue briefly where you left off.");
      }
    }

    // Audio back to Twilio (with hard mute during cancel)
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      lastAiAudioAt = Date.now();

      // HARD MUTE: if canceling, do not forward (prevents “keeps yapping”)
      if (cancelInProgress) return;

      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        }));
      }
    }

    /**
     * IMPORTANT: In Server VAD mode, you do NOT need to send input_audio_buffer.commit.
     * The server commits automatically. Sending commit can create extra user items.  [oai_citation:2‡OpenAI Platform](https://platform.openai.com/docs/api-reference/realtime-beta-client-events?ref=blog.mlq.ai)
     *
     * So we do NOT handle input_audio_buffer.speech_stopped -> commit here.
     */

    // Phase 2: transcription completed
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) {
        bargeInProgress = false;
        return;
      }

      const filler = isOnlyFillerWords(transcript);
      const strongQ = isStrongQuestion(transcript);

      // If this transcript came after a barge-in cancel:
      if (bargeInProgress) {
        bargeInProgress = false;

        // Filler -> do not answer; just resume
        if (filler) {
          // Let OpenAI finish cancel; then resume in response.done handler
          resumeAfterFiller = true;
          return;
        }

        // Only answer if it's a real question (your requirement)
        if (!strongQ) {
          // Not a question: resume instead of answering
          resumeAfterFiller = true;
          return;
        }

        // Real question: answer immediately
        // (We do NOT create a second user message; the server already created it from audio.)
        cancelInProgress = false; // allow audio out for the new response
        requestResponse("Answer the caller's last question directly and succinctly. Then say: “And yeah—like I was saying…” and continue briefly.");
        return;
      }

      // Normal turn when Roy isn't talking (or user spoke after Roy finished)
      if (filler) return;
      requestResponse();
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

      // Greeting (UNCHANGED — do not touch)
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

      // ---- Phase 1: fast barge-in, Twilio-side energy detection ----
      const now = Date.now();
      const speaking = speakingNow();

      // guard against greeting echo: don’t cancel immediately after AI speech starts
      const graceOk = !aiSpeechStartedAt || (now - aiSpeechStartedAt > BARGE_GRACE_MS);

      if (speaking && graceOk && !bargeInProgress) {
        const db = ulawEnergyDb(payload);

        if (db > ENERGY_DB_THRESHOLD) {
          bargePacketCount += 1;
          if (bargePacketCount >= PRE_CANCEL_PACKETS) {
            // STOP NOW
            bargeInProgress = true;
            bargePacketCount = 0;
            cancelAndClearTwilio();
          }
        } else {
          bargePacketCount = 0;
        }
      } else {
        bargePacketCount = 0;
      }

      // Always forward caller audio into OpenAI input buffer
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
