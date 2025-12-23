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
  "si","sí","vale","bueno","claro","ya","a","ver",
  "no","nah"
]);

// COMMAND WORDS - these should IMMEDIATELY stop Roy from speaking
const STOP_COMMANDS = new Set([
  "wait","stop","hold","pause","hang","hold on","wait a minute","one moment","one second",
  "espera","para","espérate","esperate","momento","un momento","detente"
]);

// Background noise patterns that should be completely ignored
const NOISE_PATTERNS = [
  "cough", "coughing", "sneeze", "sneezing", "laugh", "laughing",
  "sigh", "sighing", "clearing", "throat", "ahem", "achoo",
  "music", "tv", "television", "background", "noise"
];

function isBackgroundNoise(text) {
  if (!text) return true;
  const lower = text.toLowerCase();
  // Check if transcript is just noise description
  if (NOISE_PATTERNS.some(pattern => lower.includes(pattern))) return true;
  // Check if transcript is very short (likely just noise)
  if (text.trim().length < 3) return true;
  return false;
}

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

function isStopCommand(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const words = wordsOf(lower);
  
  // Only trigger if the ENTIRE transcript is a stop command or starts with one
  // This prevents "explain more" from triggering "para" in Spanish
  if (STOP_COMMANDS.has(lower)) return true;
  
  // Check if first word is a stop command
  if (words.length > 0 && STOP_COMMANDS.has(words[0])) return true;
  
  // Check for multi-word stop commands at the start
  const twoWords = words.slice(0, 2).join(" ");
  if (STOP_COMMANDS.has(twoWords)) return true;
  
  return false;
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

// Important: avoid false cancels from tiny echo fragments like "what", "how"
// But don't be TOO strict - let the AI handle most cases
function isStrongQuestion(text) {
  const raw = (text || "").trim();
  if (!raw) return false;
  
  const w = wordsOf(raw);
  
  // Only filter out VERY short single-word fragments that are likely echoes
  // Examples: "what", "how", "huh" by themselves
  if (w.length === 1 && raw.length < 5) return false;
  
  // Everything else (2+ words or longer single words) should be treated as valid
  // Let the AI decide if it's worth responding to
  return true;
}

/** ---------------- ELEVENLABS-STYLE: µ-law energy detection (FIXED) ---------------- **/

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

  // barge state
  let bargeEnabled = false;     // 🔒 LOCKED until greeting finishes
  let greetingInFlight = false; // track the initial greeting response
  let bargeInProgress = false;  // Phase 1 fired
  let cancelInProgress = false; // hard mute window
  let energyPacketCount = 0;
  let recentEnergyLevels = [];  // Track recent energy to detect sustained speech vs bursts

  // "real audio activity" tracking
  let lastAiAudioAt = 0;
  let aiSpeechStartedAt = 0;

  // Optional: stop double answers if transcript repeats
  let lastTranscript = "";
  let lastTranscriptAt = 0;
  
  // Track if recent audio was likely a noise burst (cough, etc.)
  let lastNoiseDetectedAt = 0;

  // TUNING
  const ENERGY_THRESHOLD_DB = -50; // if too hard: -55; if too sensitive: -45
  const PRE_CANCEL_PACKETS = 2;    // ~40ms - balanced for quick interruption without false triggers
  const BARGE_GRACE_MS = 100;      // grace period after Roy starts speaking
  const ENERGY_SUSTAIN_WINDOW = 4; // Track energy over 4 packets to detect sustained speech vs burst

  function speakingNow() {
    const elapsed = lastAiAudioAt ? (Date.now() - lastAiAudioAt) : 999999;
    return isAISpeaking || responseInFlight || (elapsed < 350);
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

  function injectUserTextAndRespond(text, afterCancel = false) {
    const createItem = () => {
      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }]
        }
      });
      sendToOpenAI({ type: "response.create" });
    };
    
    // If this is right after a cancel, give it a tiny moment to settle
    if (afterCancel) {
      setTimeout(createItem, 50);
    } else {
      createItem();
    }
  }

  function cancelAndClearTwilio() {
    sendToOpenAI({ type: "response.cancel" });
    if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    }
    // IMPORTANT: do NOT force isAISpeaking/responseInFlight to false here.
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
    }

    if (evt.type === "response.audio.done") {
      isAISpeaking = false;
    }

    if (evt.type === "response.done") {
      responseInFlight = false;
      isAISpeaking = false;

      // Greeting completed → enable barge-in
      if (greetingInFlight) {
        greetingInFlight = false;
        bargeEnabled = true;
        console.log("✅ Greeting finished → barge-in ENABLED");
      }

      // End cancel/hard-mute window cleanly
      cancelInProgress = false;
      bargeInProgress = false;
      energyPacketCount = 0;
    }

    // Commit on speech stop so transcription completes
    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // Track AI audio output + HARD MUTE while canceling
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      lastAiAudioAt = Date.now();

      if (cancelInProgress) {
        // critical: don't forward post-cancel tail audio
        return;
      }

      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        }));
      }
    }

    // Phase 2 decision after transcript
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) {
        bargeInProgress = false;
        cancelInProgress = false;
        return;
      }

      // CRITICAL: Ignore transcripts that came right after a noise burst
      const timeSinceNoise = Date.now() - lastNoiseDetectedAt;
      if (timeSinceNoise < 1500) {
        console.log("🔇 Ignoring transcript from noise burst:", transcript);
        bargeInProgress = false;
        cancelInProgress = false;
        return;
      }

      // CRITICAL: Ignore background noise (coughs, laughs, TV, etc.)
      if (isBackgroundNoise(transcript)) {
        console.log("🔇 Ignoring background noise:", transcript);
        bargeInProgress = false;
        cancelInProgress = false;
        return;
      }

      // CRITICAL: Check for STOP commands first - these MUST stop Roy immediately
      const isStop = isStopCommand(transcript);
      if (isStop) {
        console.log("⛔ STOP command detected:", transcript);
        // Force cancel if Roy is speaking
        if (speakingNow()) {
          cancelAndClearTwilio();
        }
        bargeInProgress = false;
        cancelInProgress = false;
        return; // Don't respond, just stop
      }

      // CRITICAL: Ignore filler words - don't let them stop Roy
      const filler = isOnlyFillerWords(transcript);
      if (filler) {
        console.log("🔇 Ignoring filler words:", transcript);
        bargeInProgress = false;
        cancelInProgress = false;
        return;
      }

      // De-dupe transcript to prevent double answering
      const now = Date.now();
      if (transcript === lastTranscript && (now - lastTranscriptAt) < 900) {
        return;
      }
      lastTranscript = transcript;
      lastTranscriptAt = now;

      // If we barge-canceled Roy, respond to the user's input
      // (filler words already filtered above, so anything here is real speech)
      if (bargeInProgress) {
        bargeInProgress = false;
        cancelInProgress = false;
        energyPacketCount = 0;
        recentEnergyLevels = [];
        
        console.log("✅ Responding to interruption:", transcript);
        injectUserTextAndRespond(transcript, true); // afterCancel = true
        return;
      }

      // Normal flow when Roy isn't speaking - respond to everything (filler already filtered above)
      console.log("✅ Normal response to:", transcript);
      injectUserTextAndRespond(transcript, false);
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

      // ✅ FORCE GREETING - inject assistant message then create response
      greetingInFlight = true;
      bargeEnabled = false; // lock barge-in during greeting

      // First, inject the greeting as an assistant message
      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [{ 
            type: "input_text", 
            text: "24/7 AI, this is Roy. How can I help you?" 
          }]
        }
      });

      // Then immediately create a response to speak it
      sendToOpenAI({ type: "response.create" });

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

      // Phase 1: SMART energy detection - distinguish sustained speech from noise bursts
      const db = ulawEnergyDb(payload);
      
      // Track recent energy levels (always, not just during barge)
      recentEnergyLevels.push(db);
      if (recentEnergyLevels.length > ENERGY_SUSTAIN_WINDOW) {
        recentEnergyLevels.shift();
      }
      
      // Detect noise bursts (high energy but not sustained)
      const highEnergyCount = recentEnergyLevels.filter(e => e > ENERGY_THRESHOLD_DB).length;
      if (db > ENERGY_THRESHOLD_DB && highEnergyCount < 2) {
        // Single high energy spike = likely cough/noise, not speech
        lastNoiseDetectedAt = Date.now();
        console.log("🔊 Noise burst detected (likely cough/background)");
      }
      
      if (bargeEnabled && !bargeInProgress && speakingNow()) {
        const grace = aiSpeechStartedAt && (Date.now() - aiSpeechStartedAt) < BARGE_GRACE_MS;
        if (!grace) {
          // Only trigger if we have SUSTAINED high energy (not just a burst like a cough)
          if (highEnergyCount >= PRE_CANCEL_PACKETS) {
            energyPacketCount += 1;
            if (energyPacketCount >= PRE_CANCEL_PACKETS) {
              bargeInProgress = true;
              cancelInProgress = true;
              energyPacketCount = 0;
              recentEnergyLevels = [];
              cancelAndClearTwilio();
              // Phase 2 decides after transcript (filler => ignore, question => answer)
            }
          } else {
            // Not sustained enough - likely just a cough or noise burst
            if (energyPacketCount > 0) energyPacketCount = Math.max(0, energyPacketCount - 1);
          }
        } else {
          energyPacketCount = 0;
          recentEnergyLevels = [];
        }
      } else {
        energyPacketCount = 0;
        recentEnergyLevels = [];
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
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("🚀 Listening on", PORT));
