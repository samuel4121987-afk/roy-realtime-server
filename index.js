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
 * IMPORTANT:
 * - We keep Roy strictly on 24/7 AI receptionist coverage.
 * - We allow “Transparency” if asked (you changed this), but STILL keep it on business value.
 * - We DO NOT switch language based on accent. Only on clear Spanish text or explicit request.
 */
const ROY_PROMPT = `
You are Roy, the virtual receptionist for "24/7 AI" (a business that provides 24/7 AI receptionist coverage).
You are professional, natural, and helpful.

ABSOLUTE RULES:
1) STAY ON TOPIC: Only talk about 24/7 AI receptionist service, call handling, bookings, reservations, lead capture,
   pricing basics, setup, and business onboarding. If the caller asks something unrelated, redirect politely:
   "I can help with 24/7 AI receptionist coverage—what kind of business are you calling about?"
2) NO RANDOM FACTS: Do not answer general knowledge questions unless it directly connects to 24/7 AI service.
3) LANGUAGE: Default English. Switch to Spanish ONLY if:
   - The caller explicitly asks: "Spanish / español / en español", OR
   - The caller speaks a clear Spanish sentence (not just one or two words).
   Never switch because of “accent”.
4) GREETING: At the start of every call, greet immediately with EXACTLY:
   "24/7 AI, this is Roy. How can I help you?"
   Do not wait for the caller to speak.
5) CONCISE: 1–2 sentences per answer. Sound human. No long explanations.
6) BARGE-IN: If the caller starts speaking while you’re talking, stop quickly and listen. Do not talk over them.
7) TRANSPARENCY (ONLY IF ASKED): If asked what you are or what OpenAI does, you may say:
   "I’m a virtual assistant that helps 24/7 AI answer calls and capture leads."
   Keep it brief and immediately tie back to what 24/7 AI does for businesses.
`.trim();

// Filler words (EN + ES) for transcript checks
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
  if (words.length > 4) return false; // longer => likely real
  return words.every(w => FILLER_WORDS.has(w));
}

/**
 * Language switching: ONLY switch if the caller clearly speaks Spanish.
 * This avoids “he switched to Spanish for no reason”.
 */
function shouldSwitchToSpanish(transcript) {
  const t = (transcript || "").trim().toLowerCase();
  if (!t) return false;

  // explicit request
  if (t.includes("español") || t.includes("en español") || t.includes("spanish")) return true;

  // Require a meaningful Spanish sentence (>= 6 words) AND at least 2 Spanish markers
  const words = t.split(/\s+/);
  if (words.length < 6) return false;

  const spanishMarkers = [
    "qué","que","cómo","como","cuánto","cuanto","dónde","donde","por","para","con","sin",
    "necesito","quiero","hola","buenas","gracias","precio","reservar","cita","empresa","negocio"
  ];

  let hits = 0;
  for (const m of spanishMarkers) if (t.includes(m)) hits++;
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
  const openaiQueue = [];

  // Conversation / flow state
  let meaningfullyGreeted = false;
  let pendingGreet = false;

  // Speaking / cancellation state
  let isAISpeaking = false;
  let responseInFlight = false;

  // Echo / barge-in protection
  let aiSpeechStartedAt = 0;
  const BARGE_IN_GRACE_MS = 650; // protect right after Roy starts (echo risk)
  let pendingBargeIn = false;
  let bargeTimer = null;
  const BARGE_IN_DEBOUNCE_MS = 140;

  // Minimum inbound audio before allowing cancel (base64->decoded estimate)
  let inboundDecodedBytesWhilePending = 0;
  const MIN_DECODED_BYTES_TO_CANCEL = 2600; // ~150–300ms typical, tune as needed

  // Cooldown to prevent spam-cancel loops
  let cancelCooldownUntil = 0;
  const CANCEL_COOLDOWN_MS = 350;

  // Language state
  let currentLang = "en"; // "en" or "es"

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
    if (meaningfullyGreeted) return;
    if (!openaiOpen || !streamSid) {
      pendingGreet = true;
      return;
    }

    pendingGreet = false;
    meaningfullyGreeted = true;

    // Force exact greeting
    sendToOpenAI({
      type: "response.create",
      response: {
        instructions:
          "Start of call. Say EXACTLY this greeting and nothing else: '24/7 AI, this is Roy. How can I help you?'"
      }
    });

    // Fallback: if audio never starts (rare), re-try once after 1.2s
    setTimeout(() => {
      if (!isAISpeaking && meaningfullyGreeted) {
        // Do NOT spam; just one safety retry
        sendToOpenAI({
          type: "response.create",
          response: {
            instructions:
              "If you have not spoken yet, say EXACTLY: '24/7 AI, this is Roy. How can I help you?'"
          }
        });
      }
    }, 1200);
  }

  function cancelRoyIfRealBargeIn() {
    // Only cancel if Roy is actually talking or a response is active
    if (!isAISpeaking && !responseInFlight) return;

    // Cooldown prevents repeated cancels
    if (Date.now() < cancelCooldownUntil) return;

    // Stop Roy
    sendToOpenAI({ type: "response.cancel" });

    // Clear Twilio buffered audio to stop cleanly
    if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    }

    // Reset
    isAISpeaking = false;
    responseInFlight = false;
    pendingBargeIn = false;
    inboundDecodedBytesWhilePending = 0;
    cancelCooldownUntil = Date.now() + CANCEL_COOLDOWN_MS;
  }

  function createRoyResponseFromTranscript(transcriptRaw) {
    const transcript = (transcriptRaw || "").trim();

    // Update language ONLY when clearly Spanish (never showy switching)
    if (currentLang === "en" && shouldSwitchToSpanish(transcript)) currentLang = "es";

    // Keep responses strictly on-topic
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
              : `${baseScope} Caller utterance was a filler/acknowledgment. Reply very briefly: 'Okay' or 'Got it' and wait.`
        }
      });
      return;
    }

    // Normal answer
    sendToOpenAI({
      type: "response.create",
      response: {
        instructions:
          currentLang === "es"
            ? `${baseScope} Responde en español en 1–2 frases. Si preguntan "qué hace OpenAI", contesta brevemente que 24/7 AI usa un asistente virtual para atender llamadas y capturar leads, y vuelve a preguntar por su negocio.`
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

    // Configure session
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "echo",
        temperature: 0.5,
        instructions: ROY_PROMPT,
        // We use server VAD to get speech start/stop events
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

    // If Twilio already started, greet now
    if (pendingGreet || (streamSid && !meaningfullyGreeted)) requestGreeting();
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Track response lifecycle
    if (evt.type === "response.created") responseInFlight = true;
    if (evt.type === "response.done") responseInFlight = false;

    // Track when Roy starts speaking
    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
      aiSpeechStartedAt = Date.now();
      // Reset barge-in state whenever Roy starts
      pendingBargeIn = false;
      inboundDecodedBytesWhilePending = 0;
    }

    // Track when Roy ends speaking
    if (evt.type === "response.audio.done") {
      isAISpeaking = false;
      // After greeting, if caller hasn’t said anything, we just wait.
    }

    // STREAM AUDIO TO TWILIO
    if ((evt.type === "response.audio.delta" || evt.type === "response.output_audio.delta") && evt.delta) {
      // Ensure speaking flag even if started event doesn’t fire
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

    /**
     * BARGE-IN:
     * - On speech_started while Roy is speaking, we DO NOT instantly cancel (echo risk).
     * - We set a short debounce window and require minimum inbound decoded bytes.
     * - If conditions are met, cancel quickly (human-like).
     */
    if (evt.type === "input_audio_buffer.speech_started") {
      // if Roy not speaking, ignore
      if (!isAISpeaking && !responseInFlight) return;

      // grace window after Roy begins (echo prone)
      if (Date.now() - aiSpeechStartedAt < BARGE_IN_GRACE_MS) return;

      // cooldown
      if (Date.now() < cancelCooldownUntil) return;

      pendingBargeIn = true;
      inboundDecodedBytesWhilePending = 0;

      if (bargeTimer) clearTimeout(bargeTimer);
      bargeTimer = setTimeout(() => {
        if (!pendingBargeIn) return;

        if (inboundDecodedBytesWhilePending >= MIN_DECODED_BYTES_TO_CANCEL) {
          cancelRoyIfRealBargeIn();
        } else {
          // Not enough real inbound audio → likely echo/noise
          pendingBargeIn = false;
          inboundDecodedBytesWhilePending = 0;
        }
      }, BARGE_IN_DEBOUNCE_MS);
    }

    // Speech stopped: commit so transcription completes
    if (evt.type === "input_audio_buffer.speech_stopped") {
      // commit user audio buffer (safe even if server already committed internally)
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // When transcription completes, create Roy response (strictly on topic)
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) return;

      // If we were pending barge-in, we should cancel Roy ONLY if transcript is not filler
      // (prevents cancel on "uh-huh"/noise)
      if (pendingBargeIn) {
        const filler = isOnlyFillerWords(transcript);
        if (!filler && inboundDecodedBytesWhilePending >= MIN_DECODED_BYTES_TO_CANCEL) {
          cancelRoyIfRealBargeIn();
        }
        pendingBargeIn = false;
        inboundDecodedBytesWhilePending = 0;
      }

      // Don’t overlap responses
      if (responseInFlight || isAISpeaking) return;

      createRoyResponseFromTranscript(transcript);
    }
  });

  openaiSocket.on("close", (c, r) => {
    console.error("❌ OpenAI WS closed", c, r ? r.toString() : "");
    // Keep Twilio call alive; you can add fallback TTS if you want.
  });

  openaiSocket.on("error", (e) => {
    console.error("❌ OpenAI WS error", e);
  });

  // Only accept inbound track
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

      // Greeting: we trigger as soon as both are ready
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

      // If we’re pending a barge-in, accumulate decoded byte estimate
      if (pendingBargeIn) {
        // base64 length to decoded bytes (~3/4)
        inboundDecodedBytesWhilePending += Math.floor((payload.length * 3) / 4);
      }

      // Send audio to OpenAI
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
      return;
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
