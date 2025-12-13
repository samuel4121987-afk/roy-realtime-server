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

## Prohibited Topics
- Never discuss, reveal, or imply that you are an AI, use artificial intelligence, language models, or technology. At all times, maintain the persona of Roy, a genuine human receptionist.

Always follow these instructions for every call without exception.
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

// Twilio can be configured as GET or POST; support both.
app.all("/incoming-call", (req, res) => {
  res.status(200).type("text/xml").send(twimlResponse(req));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

/* ===========================
   ROY INTERRUPTION LOGIC ONLY
   (Everything else untouched)
=========================== */

// Treat these as “do NOT interrupt Roy”
const FILLER_ONLY_REGEX =
  /^\s*(?:y(?:eah|ep|up|a)?|yes|ok(?:ay)?|okay|aha|uh-?huh|mhm+|mm+|right|sure|got ?it|i ?see|alright|vale|si|sí|aja|ajá|claro|bueno)\s*[.!?…]*\s*$/i;

function isFillerOnly(text) {
  const t = (text || "").trim();
  if (!t) return true;
  return FILLER_ONLY_REGEX.test(t);
}

function looksLikeRealInterruption(text) {
  const t = (text || "").trim();
  if (!t) return false;
  if (isFillerOnly(t)) return false;
  // If it contains a question mark OR common question starters, interrupt.
  if (/\?/.test(t)) return true;
  if (/\b(what|why|how|when|where|who|can you|could you|do you|are you|is it|tell me|explain)\b/i.test(t)) return true;
  // Any non-filler phrase => treat as real interruption.
  return true;
}

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let openaiOpen = false;
  const openaiQueue = [];

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

  // ===========================
  // ROY speaking state
  // ===========================
  let assistantSpeaking = false;
  let pendingInterruptCheck = false;

  openaiSocket.on("open", () => {
    openaiOpen = true;
    console.log("✅ OpenAI WS connected");

    // Configure session (modalities MUST include text + audio)
    // ONLY ADDITION: input_audio_transcription for smart barge-in
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0.6,
        instructions: ROY_PROMPT,

        // ✅ Needed so we can know if you said “ok/vale” or a real question
        input_audio_transcription: { model: "whisper-1" },
      },
    });

    flushOpenAIQueue();

    // If Twilio start already arrived, greet immediately.
    if (streamSid) {
      // First, add a user message to the conversation
      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Please greet the caller now.",
            },
          ],
        },
      });
      // Then trigger a response
      sendToOpenAI({
        type: "response.create",
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

    // Track assistant speaking so we only consider interrupting then
    if (evt.type === "response.created") assistantSpeaking = true;
    if (evt.type === "response.done") assistantSpeaking = false;
    if (evt.type === "response.audio.delta") assistantSpeaking = true;

    // ===========================
    // SMART BARGE-IN: decide only after we get a transcript
    // ===========================
    const transcriptText =
      evt?.transcript ??
      evt?.text ??
      evt?.item?.content?.[0]?.transcript ??
      evt?.item?.content?.[0]?.text;

    const isTranscriptionEvent =
      evt.type === "conversation.item.input_audio_transcription.completed" ||
      evt.type === "input_audio_transcription.completed" ||
      (evt.type && evt.type.includes("transcription") && transcriptText);

    if (isTranscriptionEvent && pendingInterruptCheck && assistantSpeaking) {
      const t = String(transcriptText || "").trim();

      if (looksLikeRealInterruption(t)) {
        console.log("🛑 Interrupting Roy (real):", t);

        // Stop Roy immediately
        sendToOpenAI({ type: "response.cancel" });

        // Commit whatever caller audio is in the buffer so OpenAI has the question
        sendToOpenAI({ type: "input_audio_buffer.commit" });

        // Generate a new response immediately (Roy answers)
        sendToOpenAI({ type: "response.create" });

        assistantSpeaking = false;
      } else {
        console.log("✅ Ignoring filler:", t);
        // Do nothing; Roy continues speaking
      }

      pendingInterruptCheck = false;
    }

    // Forward audio from OpenAI back to Twilio
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
    if (!track) return false; // keep your exact behavior
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

      // Greet immediately as soon as both sides are ready (queued if OpenAI not open yet)
      sendToOpenAI({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          temperature: 0,
          instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
          commit: true, // leaving exactly as you had it
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

      // Prevent feedback loop: only caller audio
      if (!isCallerAudio(track)) return;

      const payload = data.media && data.media.payload;
      if (!payload) return;

      // If caller speaks while Roy is speaking, don’t cancel yet.
      // Wait for transcript to decide filler vs real interruption.
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
