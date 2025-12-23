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

/** ---------------- ELEVENLABS-STYLE ENERGY BARGE-IN ---------------- **/

// μ-law decode table (Twilio G.711 μ-law needs bit-invert before decode)
const MULAW_DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const sign = (i & 0x80) ? -1 : 1;
  const exponent = (i >> 4) & 0x07;
  const mantissa = i & 0x0F;
  const magnitude = ((mantissa << 3) + 132) << exponent;
  MULAW_DECODE[i] = sign * (magnitude - 132);
}

function calculateEnergyDb(base64Payload) {
  if (!base64Payload) return -100;
  try {
    const buffer = Buffer.from(base64Payload, "base64");
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      const pcm = MULAW_DECODE[(~buffer[i]) & 0xff];
      sumSquares += pcm * pcm;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, buffer.length));
    return 20 * Math.log10(rms / 32768 + 1e-10);
  } catch {
    return -100;
  }
}

/** ---------------- filler + question detection (local only) ---------------- **/

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

  // Response state
  let isAISpeaking = false;
  let responseInFlight = false;

  // Energy barge-in state
  let lastAiAudioAt = 0;
  let responseStartedAt = 0;
  let bargeInProgress = false;
  let cancelInProgress = false;
  let energyPacketCount = 0;

  // Greeting: must be exactly-once
  let greetingSent = false;     // sent to OpenAI
  let greetingCompleted = false; // response.done after greeting
  let greetingSafetyTimer = null;

  // After cancel: guarantee a response once it’s safe
  let respondAfterCancel = false;

  // Transcript de-dupe
  const seenTranscriptItemIds = new Set();
  let lastTranscriptNorm = "";
  let lastTranscriptAt = 0;

  // Tuning (snappy)
  const ENERGY_THRESHOLD_DB = -50;
  const PRE_CANCEL_PACKETS = 2;   // ~40ms
  const BARGE_GRACE_MS = 120;     // echo safety, still snappy
  const SPEAKING_WINDOW_MS = 600; // “Roy is talking” fallback based on last audio delta

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

  function fireGreeting() {
    if (!streamSid) return;
    if (greetingSent) return;

    greetingSent = true;
    console.log("👋 Greeting fired", { streamSid });

    sendToOpenAI({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        temperature: 0,
        instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
        commit: true,
      },
    });

    // Safety: if greeting somehow didn’t produce audio, re-fire once after 900ms
    // (guarded so it cannot loop)
    if (greetingSafetyTimer) clearTimeout(greetingSafetyTimer);
    greetingSafetyTimer = setTimeout(() => {
      if (!greetingCompleted) {
        console.log("⚠️ Greeting safety re-fire (no response.done yet)");
        // Do NOT change greetingSent; just send again once.
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

  function cancelAndClearTwilio(reason) {
    if (cancelInProgress) return;

    cancelInProgress = true;
    bargeInProgress = true;
    respondAfterCancel = false;
    energyPacketCount = 0;

    console.log("⚡ Barge-in: cancel+clear", { reason });

    sendToOpenAI({ type: "response.cancel" });
    if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    }
  }

  function maybeRespondNowOrAfterCancel() {
    // If OpenAI still thinks a response is active, wait for response.done.
    if (responseInFlight || isAISpeaking || cancelInProgress) {
      respondAfterCancel = true;
      return;
    }
    sendToOpenAI({ type: "response.create" });
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

    // If Twilio already started, fire greeting now.
    if (streamSid) fireGreeting();
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

    if (evt.type === "response.created") {
      responseInFlight = true;
    }

    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
      responseStartedAt = Date.now();
    }

    if (evt.type === "response.audio.done") {
      isAISpeaking = false;
    }

    if (evt.type === "response.done") {
      responseInFlight = false;
      isAISpeaking = false;

      // First response.done after greeting fire => greeting completed
      if (!greetingCompleted && greetingSent) {
        greetingCompleted = true;
        console.log("✅ Greeting completed");
      }

      // cancel is now “settled”
      cancelInProgress = false;

      // If we owe a response after a barge-in, fire it now (guaranteed)
      if (respondAfterCancel) {
        respondAfterCancel = false;
        console.log("🎯 Firing queued response after cancel/settle");
        sendToOpenAI({ type: "response.create" });
      }
    }

    // Commit on speech stop (creates the user AUDIO item)
    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // Outgoing audio -> track and hard mute during cancel
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      lastAiAudioAt = Date.now();

      if (cancelInProgress) return;

      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        }));
      }
    }

    // Transcript (local logic only) -> then respond to EXISTING audio item
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) return;

      // De-dupe by item_id
      const itemId = evt.item_id || evt.item?.id || evt.id;
      if (itemId) {
        if (seenTranscriptItemIds.has(itemId)) return;
        seenTranscriptItemIds.add(itemId);
        if (seenTranscriptItemIds.size > 1000) seenTranscriptItemIds.clear();
      }

      // Soft de-dupe
      const norm = normalizeText(transcript);
      const now = Date.now();
      if (norm && norm === lastTranscriptNorm && (now - lastTranscriptAt) < 1000) {
        return;
      }
      lastTranscriptNorm = norm;
      lastTranscriptAt = now;

      const filler = isOnlyFillerWords(transcript);
      const strongQ = isStrongQuestion(transcript);

      // Ignore transcripts during greeting window
      if (!greetingCompleted) {
        return;
      }

      // If Phase 1 barge-in happened:
      if (bargeInProgress) {
        bargeInProgress = false;

        // filler -> do nothing, let Roy remain quiet
        if (filler) return;

        // IMPORTANT: do not go silent; answer questions reliably.
        // If you want “only questions” then keep (strongQ) gating;
        // but your report is “he went silent”, so we answer if it’s not filler.
        // If it IS a question, perfect; if it’s a statement, Roy still replies naturally.
        if (strongQ) {
          console.log("🧠 Phase 2: question -> answer");
        } else {
          console.log("🧠 Phase 2: non-filler -> respond anyway (avoid silence)");
        }

        maybeRespondNowOrAfterCancel();
        return;
      }

      // Normal flow: respond
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

      // YOUR PERFECT GREETING LOGIC: fire on Twilio start
      fireGreeting();
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

      // Always append inbound audio to OpenAI
      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });

      // Don’t barge-in during greeting
      if (!greetingCompleted) return;

      // speakingNow: include real outgoing audio timing
      const elapsedSinceAiAudio = lastAiAudioAt > 0 ? (Date.now() - lastAiAudioAt) : 999999;
      const speakingNow =
        isAISpeaking || responseInFlight || (elapsedSinceAiAudio < SPEAKING_WINDOW_MS);

      const graceActive =
        responseStartedAt > 0 && (Date.now() - responseStartedAt) < BARGE_GRACE_MS;

      if (speakingNow && !graceActive && !bargeInProgress && !cancelInProgress) {
        const energyDb = calculateEnergyDb(payload);

        if (energyDb > ENERGY_THRESHOLD_DB) {
          energyPacketCount += 1;
          if (energyPacketCount >= PRE_CANCEL_PACKETS) {
            cancelAndClearTwilio("energy");
          }
        } else {
          energyPacketCount = 0;
        }
      } else {
        energyPacketCount = 0;
      }

      return;
    }

    if (data.event === "stop") {
      console.log("⛔ Twilio stop");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
      return;
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
