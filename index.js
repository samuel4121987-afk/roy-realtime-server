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

  if (starters.has(w[0])) return true;

  const lower = raw.toLowerCase();
  const markers = [
    "price","pricing","cost","charge","fee","fees","rate","rates",
    "book","booking","reserve","reservation","schedule","setup","onboard","onboarding",
    "how much","what is","what are",
    "precio","coste","costo","tarifa","reservar","reserva","cita","configurar","instalar"
  ];
  return markers.some(m => lower.includes(m));
}

// Avoid false “question” from tiny fragments like “what”, “how”
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

  // speaking flags
  let isAISpeaking = false;
  let responseInFlight = false;
  let pendingBargeIn = false;

  // FAST STOP tuning
  let bargePacketCount = 0;
  let preCancelFired = false;
  const PRE_CANCEL_PACKETS = 2; // snappy
  let aiSpeechStartedAt = 0;
  const BARGE_GRACE_MS = 350;

  // cancel / transcript handling
  let cancelInProgress = false;
  let queuedTranscript = null;

  // ✅ prevent “answered twice” from duplicate transcription events
  let lastProcessedTranscript = "";
  let lastProcessedAt = 0;
  const TRANSCRIPT_DEDUPE_MS = 1200;

  // ✅ capture what Roy was saying so he can resume naturally after interrupt
  let currentAssistantText = "";
  let lastAssistantText = "";

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

  function injectUserTextAndRespond(text, { interrupted = false, resumeSnippet = "" } = {}) {
    let userText = text;

    // If this came from an interruption question, force a “human” pivot + resume
    if (interrupted) {
      const snippet = (resumeSnippet || "").trim();
      userText =
        `Caller interrupted you mid-sentence with a question.\n` +
        `1) Start with a quick human interjection like "Yeah—" or "Sure—" (one beat), then answer the question clearly in 1–2 sentences.\n` +
        `2) Then say exactly: "And like I was saying," and continue the previous explanation naturally without restarting.\n` +
        (snippet ? `Here is the last thing you were saying (continue from it, don’t repeat it): ${snippet}\n` : "") +
        `Question: ${text}`;
    }

    sendToOpenAI({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: userText }]
      }
    });

    sendToOpenAI({ type: "response.create" });
  }

  function cancelAndClearTwilio() {
    cancelInProgress = true;
    sendToOpenAI({ type: "response.cancel" });
    if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
      twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
    }
    // Do NOT force flags false here (prevents “Roy goes silent”).
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

    // Keep base behavior
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

    // Capture assistant text for resume-after-interrupt
    if (evt.type === "response.text.delta" && evt.delta) {
      currentAssistantText += String(evt.delta);
    }
    if (evt.type === "response.text.done" && typeof evt.text === "string") {
      // Some servers send full text here; prefer it if present
      currentAssistantText = evt.text;
    }

    // Speaking flags
    if (evt.type === "response.created") {
      responseInFlight = true;
      currentAssistantText = ""; // start new assistant utterance capture
    }

    if (evt.type === "response.done") {
      responseInFlight = false;
      isAISpeaking = false;
      cancelInProgress = false;

      // finalize assistant text capture
      if (currentAssistantText && currentAssistantText.trim()) {
        lastAssistantText = currentAssistantText.trim();
      }
      currentAssistantText = "";

      if (queuedTranscript) {
        const t = queuedTranscript;
        queuedTranscript = null;
        injectUserTextAndRespond(t);
      }
    }

    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
      aiSpeechStartedAt = Date.now();
    }

    if (evt.type === "response.audio.done") {
      isAISpeaking = false;
    }

    // Mark pending barge-in if caller speech starts while Roy is speaking
    if (evt.type === "input_audio_buffer.speech_started") {
      if (isAISpeaking || responseInFlight) {
        pendingBargeIn = true;
        bargePacketCount = 0;
        preCancelFired = false;
      }
    }

    // Commit on speech stop
    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // Audio to Twilio
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      if (cancelInProgress) return;
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        }));
      }
    }

    // Transcription completed
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (!transcript) { pendingBargeIn = false; preCancelFired = false; return; }

      // Dedupe identical transcripts arriving twice
      const now = Date.now();
      if (
        transcript.toLowerCase() === lastProcessedTranscript.toLowerCase() &&
        (now - lastProcessedAt) < TRANSCRIPT_DEDUPE_MS
      ) {
        return;
      }
      lastProcessedTranscript = transcript;
      lastProcessedAt = now;

      const filler = isOnlyFillerWords(transcript);
      const strongQ = isStrongQuestion(transcript);

      // If we pre-canceled (Roy stopped instantly), decide what to do now:
      if (preCancelFired) {
        pendingBargeIn = false;
        preCancelFired = false;

        if (filler) return;

        // Only “hard-interrupt” behavior when it’s a real question
        if (strongQ) {
          const snippet = lastAssistantText ? lastAssistantText.slice(-320) : "";
          if (cancelInProgress || isAISpeaking || responseInFlight) {
            queuedTranscript = transcript;
            return;
          }
          injectUserTextAndRespond(transcript, { interrupted: true, resumeSnippet: snippet });
          return;
        }

        // Not a question -> treat as normal turn
        if (cancelInProgress || isAISpeaking || responseInFlight) {
          queuedTranscript = transcript;
          return;
        }
        injectUserTextAndRespond(transcript);
        return;
      }

      // If caller interrupted while Roy was talking but we didn't pre-cancel:
      if ((isAISpeaking || responseInFlight) && pendingBargeIn) {
        pendingBargeIn = false;

        if (filler) return;

        // Only stop-and-pivot if it's a real question
        if (strongQ) {
          cancelAndClearTwilio();
          const snippet = lastAssistantText ? lastAssistantText.slice(-320) : "";

          if (cancelInProgress || isAISpeaking || responseInFlight) {
            // queue and handle on response.done
            queuedTranscript = transcript;
            return;
          }

          injectUserTextAndRespond(transcript, { interrupted: true, resumeSnippet: snippet });
          return;
        }

        // Not a question -> ignore interruption and let Roy continue
        return;
      }

      // Normal turn when Roy isn't talking
      pendingBargeIn = false;
      preCancelFired = false;
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

      // Greeting (UNCHANGED)
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

      // FAST STOP: cancel quickly once caller is truly speaking over Roy (after grace window)
      if ((isAISpeaking || responseInFlight) && pendingBargeIn && !preCancelFired) {
        if (Date.now() - aiSpeechStartedAt > BARGE_GRACE_MS) {
          bargePacketCount += 1;
          if (bargePacketCount >= PRE_CANCEL_PACKETS) {
            preCancelFired = true;
            cancelAndClearTwilio();
            // transcript will arrive; we pivot ONLY if it's a real question
          }
        }
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
