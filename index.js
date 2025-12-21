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
You are Roy, a virtual receptionist for the 24/7 AI Assistant service. Your goal is to provide professional, natural, and helpful service. Consistently follow these rules on every call.

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble): "24/7 AI, this is Roy. How can I help you?" Begin speaking as soon as the call starts.
- Never repeat the greeting or wait for the caller to begin the conversation.

## Tone and Style
- Speak in a natural male voice with a QUICK, ENERGETIC pace. Keep all responses SHORT (one or two sentences max), use contractions (such as "I'm," "we'll," "don't"), and prefer casual phrasing.
- Maintain a confident, friendly, and conversational tone. Speak at a BRISK pace like a real person - NOT slow or robotic. Be direct and to the point.

## Listening and Interruptions
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- When the caller speaks, stop immediately and listen.
- NEVER talk over the caller.

## Noise and Multiple Voices
- Consistently filter out any background voices or sounds. If you have trouble hearing due to noise, politely say: "I'm sorry, there's some noise. Could you repeat that or find a quieter place?" Ask only this, then return to the conversation.
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
- When closing, use a friendly, casual farewell suited to the tone of the call, such as: "Thank you for calling. Have a great day."

## Transparency
- If asked about your nature, you may acknowledge that you are a virtual AI assistant helping to manage calls for the business. Be honest and professional.

Always follow these instructions for every call without exception.
`.trim();

// Expanded filler words list including Spanish
const FILLER_WORDS = [
  'uh', 'um', 'hmm', 'ah', 'er', 'like', 'you know',
  'aha', 'yes', 'yeah', 'yep', 'okay', 'ok', 'sure', 'right',
  'si', 'vale', 'bueno', 'claro', 'uh-huh', 'mm-hmm', 'mhm',
  'yup', 'mm', 'no', 'wait', 'hold on', 'what', 'huh',
  'qué', 'espera', 'a ver', 'vale sí', 'ya', 'okay yeah'
];

// Function to check if text is just filler words
function isOnlyFillerWords(text) {
  if (!text || text.trim().length === 0) return true;
  
  const words = text.toLowerCase().trim().split(/\s+/);
  
  // If more than 3 words, it's likely a real sentence
  if (words.length > 3) return false;
  
  // Check if all words are filler words
  return words.every(word => {
    const cleanWord = word.replace(/[.,!?;:]/g, '');
    return FILLER_WORDS.includes(cleanWord);
  });
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

// Twilio can be configured as GET or POST; support both.
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
  let latestMediaTimestamp = 0;
  let isAISpeaking = false;
  let lastUserTranscript = '';
  let greeted = false;
  
  // Debounced barge-in to avoid false triggers from noise
  let bargeTimer = null;
  let pendingBargeIn = false;
  const BARGE_IN_DEBOUNCE_MS = 160;
  let cancelCooldownUntil = 0;
  const CANCEL_COOLDOWN_MS = 350;
  
  // Minimum inbound audio gate to prevent false cancels from echo/noise
  let inboundAudioCounter = 0;
  const MIN_INBOUND_AUDIO_THRESHOLD = 2000; // ~120-250ms of real decoded audio
  
  // Grace window to prevent echo cancels right after Roy starts speaking
  let aiSpeechStartedAt = 0;
  const BARGE_IN_GRACE_MS = 450;
  
  // Prevent overlapping responses
  let responseInFlight = false;

  // NEW: queue transcript if it arrives while Roy is still speaking
  let queuedTranscript = null;
  
  // NEW: block new responses during cancel flush
  let cancelInProgress = false;

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

  function safeCreateResponseFromTranscript(transcript) {
    // Never start a new response while Roy is speaking, in-flight, or canceling
    if (cancelInProgress || isAISpeaking || responseInFlight) {
      queuedTranscript = transcript;
      console.log("⏸️ Queuing transcript (speaking/inflight/canceling)");
      return;
    }

    const filler = isOnlyFillerWords(transcript);

    if (filler) {
      sendToOpenAI({
        type: "response.create",
        response: {
          instructions: "Caller utterance was a brief acknowledgment like 'yeah' or 'okay'. Reply very briefly (just 'Got it' or 'Okay') and continue the prior topic with ONE new sentence."
        }
      });
    } else {
      sendToOpenAI({
        type: "response.create",
        response: {
          instructions: "Caller utterance is a real message or question. Answer directly and briefly (1–2 sentences). If unclear, ask one short clarification question."
        }
      });
    }
  }
  
  function requestCancelAndFlush() {
    cancelInProgress = true;
    sendToOpenAI({ type: "response.cancel" });
    twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    cancelCooldownUntil = Date.now() + CANCEL_COOLDOWN_MS;
    // Do NOT set isAISpeaking=false here; let audio.done / response.done settle it
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

    // Configure session with server VAD for speech detection
    // BUT we use transcript-based confirmation before canceling (prevents echo false-positives)
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "echo",
        temperature: 0.7,
        instructions: ROY_PROMPT,
        turn_detection: {
          type: "server_vad",
          threshold: 0.65,
          prefix_padding_ms: 300,
          silence_duration_ms: 800
        },
        max_response_output_tokens: 150,
        input_audio_transcription: { model: "whisper-1" },
      },
    });

    flushOpenAIQueue();

    // Trigger initial greeting if Twilio already connected (no fake user message)
    if (streamSid && !greeted) {
      greeted = true;
      sendToOpenAI({
        type: "response.create",
        response: {
          instructions: "This is the start of the call. Greet immediately with exactly: '24/7 AI, this is Roy. How can I help you?'"
        }
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

    // Speech started: mark possible barge-in (don't cancel yet)
    if (evt.type === "input_audio_buffer.speech_started") {
      if (!isAISpeaking) return;
      
      if (Date.now() < cancelCooldownUntil) return;
      
      if (Date.now() - aiSpeechStartedAt < BARGE_IN_GRACE_MS) {
        return;
      }
      
      pendingBargeIn = true;
      inboundAudioCounter = 0;
      
      if (bargeTimer) clearTimeout(bargeTimer);
      bargeTimer = setTimeout(() => {
        // Transcript will decide.
      }, BARGE_IN_DEBOUNCE_MS);
    }
    
    // Speech stopped: commit buffer (keep pendingBargeIn until transcript)
    if (evt.type === "input_audio_buffer.speech_stopped") {
      if (bargeTimer) { clearTimeout(bargeTimer); bargeTimer = null; }
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // Track when AI starts speaking
    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
      aiSpeechStartedAt = Date.now();
      console.log("🎙️ Roy started speaking");
    }

    // Track when AI finishes speaking
    if (evt.type === "response.audio.done") {
      isAISpeaking = false;

      // If something was queued, handle it now (only if not canceling)
      if (queuedTranscript && !responseInFlight && !cancelInProgress) {
        const t = queuedTranscript;
        queuedTranscript = null;
        safeCreateResponseFromTranscript(t);
      }
    }
    
    // Response lifecycle
    if (evt.type === "response.created") responseInFlight = true;
    
    if (evt.type === "response.done") {
      responseInFlight = false;
      
      // If we canceled, the cancel "flush" is now complete
      if (cancelInProgress) {
        cancelInProgress = false;
        console.log("✅ Cancel flush complete (response.done)");
      }
      
      // If something was queued, handle it now (safe point)
      if (queuedTranscript && !isAISpeaking && !responseInFlight && !cancelInProgress) {
        const t = queuedTranscript;
        queuedTranscript = null;
        safeCreateResponseFromTranscript(t);
      }
    }

    // Audio to Twilio
    if (
      (evt.type === "response.audio.delta" || evt.type === "response.output_audio.delta") &&
      evt.delta
    ) {
      // IMPORTANT: do NOT flip isAISpeaking=true here; rely on response.audio.started
      // Also ignore deltas while cancel is flushing (these are stale frames)
      if (cancelInProgress) return;
      
      twilioSocket.send(JSON.stringify({
        event: "media",
        streamSid: streamSid,
        media: { payload: evt.delta }
      }));
    }

    // Transcription completed
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      console.log(`👤 User said: "${transcript}"`);

      // If barge-in was detected while Roy spoke, confirm here
      if (pendingBargeIn) {
        const filler = isOnlyFillerWords(transcript);

        if (!filler && inboundAudioCounter >= MIN_INBOUND_AUDIO_THRESHOLD) {
          console.log(`🛑 Confirmed barge-in: "${transcript}" -> cancel now`);
          requestCancelAndFlush();

          // Queue the transcript to respond AFTER cancel flush completes
          queuedTranscript = transcript;

          pendingBargeIn = false;
          inboundAudioCounter = 0;
          return; // CRITICAL: do NOT create response now
        }

        pendingBargeIn = false;
        inboundAudioCounter = 0;
      }

      // Normal path: respond safely (or queue if speaking/inflight/canceling)
      safeCreateResponseFromTranscript(transcript);
    }

    if (evt.type === "response.text.done") {
      console.log(`🤖 Roy: "${evt.text}"`);
    }
  });

  openaiSocket.on("close", (c, r) => {
    console.error("❌ OpenAI WS closed", c, r ? r.toString() : "");
    // Do NOT close the Twilio socket here. Keep the call alive.
    // In production, you could play a fallback TTS message here.
  });

  openaiSocket.on("error", (e) => {
    console.error("❌ OpenAI WS error", e);
  });

  // Helper function to check if audio is from caller
  const isCallerAudio = (track) => {
    if (!track) return false;
    return track === "inbound" || track === "inbound_track";
  };

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

      // Trigger greeting if OpenAI is ready (no fake user message)
      if (openaiOpen && !greeted) {
        greeted = true;
        sendToOpenAI({
          type: "response.create",
          response: {
            instructions: "This is the start of the call. Greet immediately with exactly: '24/7 AI, this is Roy. How can I help you?'"
          }
        });
      }
    }

    if (data.event === "media") {
      const track = data.media && data.media.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("📞 Twilio media.track =", track || "(missing)");
      }

      // Prevent feedback loop: only caller audio
      if (!isCallerAudio(track)) return;

      latestMediaTimestamp = data.media && data.media.timestamp ? data.media.timestamp : latestMediaTimestamp;

      const payload = data.media && data.media.payload;
      if (!payload) return;

      // Track inbound audio for minimum audio gate (prevents false barge-in from echo/noise)
      // Convert base64 length to decoded bytes (base64 is ~4/3 larger than raw)
      if (pendingBargeIn) {
        inboundAudioCounter += Math.floor((payload.length * 3) / 4);
      }

      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
    }

    if (data.event === "stop") {
      console.log("🔴 Twilio stop");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔴 Twilio WS closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log(`✅ Listening on`, PORT));
