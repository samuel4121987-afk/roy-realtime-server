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

/** ---------------- filler + question detection ---------------- **/

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

function isStrongQuestion(text) {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (raw.includes("?")) return true;

  const w = wordsOf(raw);
  const cleanedLen = normalizeText(raw).replace(/\s+/g, " ").length;

  if (w.length < 3 && cleanedLen < 12) return false;
  return looksLikeQuestion(raw);
}

/** ---------------- ELEVENLABS-style µ-law energy detection ---------------- **/

function ulawByteToPcm16(b) {
  // Twilio µ-law byte must be inverted
  let u = (~b) & 0xff;

  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;

  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;

  return sign ? -sample : sample;
}

function ulawEnergyDb(base64Payload) {
  if (!base64Payload) return -100;

  let buf;
  try {
    buf = Buffer.from(base64Payload, "base64");
  } catch {
    return -100;
  }
  if (!buf.length) return -100;

  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const s = ulawByteToPcm16(buf[i]);
    sumSq += s * s;
  }

  const rms = Math.sqrt(sumSq / buf.length);
  const norm = rms / 32768;
  return 20 * Math.log10(norm + 1e-10);
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

  // speaking flags
  let isAISpeaking = false;
  let responseInFlight = false;

  // greeting handshake (FIXES: "no greet until hello")
  let greetingInFlight = false;
  let greetingSent = false;             // we actually sent the greeting request (not just queued intent)
  let greetingAudioStarted = false;     // we saw response.audio.started for greeting
  let greetingWatchdog = null;
  let pendingGreeting = false;          // set on Twilio start; executed once OpenAI is ready

  // barge state
  let bargeEnabled = false;     // locked until greeting audio starts (NOT until response.done)
  let bargeInProgress = false;  // Phase 1 fired
  let cancelInProgress = false; // hard mute window
  let energyPacketCount = 0;

  // real audio activity tracking (critical)
  let lastAiAudioAt = 0;
  let aiSpeechStartedAt = 0;

  // after barge cancel, ensure we DO answer (no silence)
  let pendingResponseAfterBarge = false;

  // transcript dedupe
  let lastTranscript = "";
  let lastTranscriptAt = 0;

  // TUNING
  const ENERGY_THRESHOLD_DB = -50;
  const PRE_CANCEL_PACKETS = 2;
  const BARGE_GRACE_MS = 120;
  const SPEAKING_WINDOW_MS = 450;

  function speakingNow() {
    const elapsed = lastAiAudioAt ? (Date.now() - lastAiAudioAt) : 999999;
    return isAISpeaking || responseInFlight || (elapsed < SPEAKING_WINDOW_MS);
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

  function cancelAndClearTwilio() {
    sendToOpenAI({ type: "response.cancel" });
    if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    }
  }

  function startGreetingWatchdog() {
    if (greetingWatchdog) clearTimeout(greetingWatchdog);
    greetingWatchdog = setTimeout(() => {
      // If we still didn't see any greeting audio, resend once (hard guarantee)
      if (greetingInFlight && !greetingAudioStarted) {
        console.log("⚠️ Greeting watchdog: no audio started yet. Resending greeting once.");
        sendToOpenAI({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            temperature: 0,
            instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
            commit: true,
          },
        });
      }
    }, 900);
  }

  function maybeSendGreeting() {
    if (!pendingGreeting) return;
    if (!openaiOpen || openaiSocket.readyState !== WebSocket.OPEN) return;
    if (!streamSid) return;

    pendingGreeting = false;
    greetingInFlight = true;
    greetingSent = true;
    greetingAudioStarted = false;
    bargeEnabled = false; // locked until greeting audio actually starts

    console.log("🎤 Sending greeting handshake now (OpenAI ready + streamSid set).");
    sendToOpenAI({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        temperature: 0,
        instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
        commit: true,
      },
    });

    startGreetingWatchdog();
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

    // If Twilio start already happened, send greeting now (fixes "no greet until hello")
    maybeSendGreeting();
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

    if (evt.type === "response.created") responseInFlight = true;

    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
      aiSpeechStartedAt = Date.now();

      // If greeting is in flight, this is the moment we can unlock barge-in safely
      if (greetingInFlight && greetingSent && !greetingAudioStarted) {
        greetingAudioStarted = true;
        bargeEnabled = true;
        console.log("✅ Greeting audio STARTED → barge-in ENABLED");
      }
    }

    if (evt.type === "response.audio.done") {
      isAISpeaking = false;
    }

    if (evt.type === "response.done") {
      responseInFlight = false;
      isAISpeaking = false;

      // greeting finished
      if (greetingInFlight) {
        greetingInFlight = false;
        if (greetingWatchdog) {
          clearTimeout(greetingWatchdog);
          greetingWatchdog = null;
        }
        // barge remains enabled (already enabled on audio.started)
        console.log("✅ Greeting response DONE");
      }

      // end cancel window
      cancelInProgress = false;

      // if we owe an answer after barge cancel, fire it now
      if (pendingResponseAfterBarge) {
        pendingResponseAfterBarge = false;
        sendToOpenAI({ type: "response.create" });
      }
    }

    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // Track outgoing audio + HARD MUTE while canceling
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      lastAiAudioAt = Date.now();

      if (cancelInProgress) {
        return; // hard mute: do not forward tails after cancel
      }

      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        }));
      }
    }

    // Phase 2 (smart) after transcript
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) {
        bargeInProgress = false;
        pendingResponseAfterBarge = false;
        return;
      }

      // de-dupe
      const now = Date.now();
      if (transcript === lastTranscript && (now - lastTranscriptAt) < 900) {
        return;
      }
      lastTranscript = transcript;
      lastTranscriptAt = now;

      // During greeting, ignore transcripts (prevents weird behavior)
      if (greetingInFlight) return;

      const filler = isOnlyFillerWords(transcript);
      const strongQ = isStrongQuestion(transcript);

      if (bargeInProgress) {
        bargeInProgress = false;
        energyPacketCount = 0;

        if (!filler && strongQ) {
          // KEY: do NOT create text item. Answer committed audio item.
          if (cancelInProgress || responseInFlight || isAISpeaking) {
            pendingResponseAfterBarge = true;
          } else {
            sendToOpenAI({ type: "response.create" });
          }
        }
        return;
      }

      // Normal flow: answer committed audio item (prevents double answers)
      sendToOpenAI({ type: "response.create" });
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

      // DON’T send greeting directly here anymore.
      // We mark it pending and send it when OpenAI session is ready.
      pendingGreeting = true;
      greetingInFlight = true;
      greetingSent = false;
      greetingAudioStarted = false;
      bargeEnabled = false;

      // If OpenAI is already ready, send immediately. Otherwise open handler will send.
      maybeSendGreeting();
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

      // Phase 1: instant stop based on energy overlap
      if (bargeEnabled && !bargeInProgress && !cancelInProgress && speakingNow()) {
        const grace = aiSpeechStartedAt && (Date.now() - aiSpeechStartedAt) < BARGE_GRACE_MS;
        if (!grace) {
          const db = ulawEnergyDb(payload);

          if (db > ENERGY_THRESHOLD_DB) {
            energyPacketCount += 1;

            if (energyPacketCount >= PRE_CANCEL_PACKETS) {
              bargeInProgress = true;
              cancelInProgress = true;
              energyPacketCount = 0;

              cancelAndClearTwilio();
            }
          } else {
            energyPacketCount = 0;
          }
        }
      } else {
        energyPacketCount = 0;
      }

      // Always append audio for transcription
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
    if (greetingWatchdog) clearTimeout(greetingWatchdog);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    if (greetingWatchdog) clearTimeout(greetingWatchdog);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("🚀 Listening on", PORT));
