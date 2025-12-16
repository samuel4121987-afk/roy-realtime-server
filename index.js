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
 * IMPORTANT NOTE:
 * For production, avoid instructing the assistant to pretend it's human.
 * If you keep that requirement, you may run into policy/telephony compliance issues.
 */
const ROY_PROMPT = `
You are Roy, a male voice for the 24/7 AI Assistant service.

## Immediate Greeting
At the very start of every call, greet instantly with:
"24/7 AI, this is Roy. How can I help you?"

## Tone and Style
Natural male voice, QUICK energetic pace, SHORT responses (1–2 sentences), contractions.

## Interruptions
If the caller starts speaking, stop talking and listen.

## Language
Default English. If caller switches to Spanish, continue in Spanish.

## Scope
Explain 24/7 AI Assistant coverage (hotels, rentals, clinics, salons/spas, small biz). Capture name/email/phone/business type, repeat back for confirmation.

## Closing
Confirm captured info, then: "Thank you for calling. Have a great day."
`.trim();

// Event types to log for debugging
const LOG_EVENT_TYPES = [
  "error",
  "session.created",
  "session.updated",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.committed",
  "conversation.item.input_audio_transcription.completed",
  "response.created",
  "response.audio.started",
  "response.audio.delta",
  "response.audio.done",
  "response.done",
];

// Expanded filler words list including Spanish + common barge-in crumbs
const FILLER_WORDS = [
  "uh", "um", "hmm", "ah", "er", "like", "you know",
  "aha", "yes", "yeah", "yep", "okay", "ok", "okey", "sure", "right",
  "uh-huh", "mm-hmm", "mhm", "mm", "mmm",
  "i see", "got it", "alright",
  "si", "sí", "vale", "bueno", "claro", "entiendo", "perfecto",
  "no", "nah", "wait", "hold on", "one sec", "a sec", "sec",
  "what", "huh", "eh",
  "qué", "que", "a ver", "espera", "un segundo", "segundo",
];

// Function to check if text is just filler words
function isOnlyFillerWords(text) {
  if (!text || text.trim().length === 0) return true;

  const normalized = text.toLowerCase().trim();

  if (FILLER_WORDS.includes(normalized)) return true;

  const words = normalized.split(/\s+/);
  if (words.length > 5) return false;

  return words.every((word) => {
    const cleanWord = word.replace(/[.,!?;:]/g, "");
    return FILLER_WORDS.includes(cleanWord);
  });
}

// NEW: decide if transcript is “real enough” to justify canceling Roy
function isRealInterruptionTranscript(transcript) {
  const t = (transcript || "").trim();
  if (!t) return false;

  // Ignore very short garbage that often comes from noise
  if (t.length < 4) return false;

  // Ignore filler-only
  if (isOnlyFillerWords(t)) return false;

  // If it's 1 word and short-ish, still likely noise/crumb
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1 && t.length < 8) return false;

  return true;
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

  // Assistant playback tracking
  let lastAssistantItem = null;
  let responseStartTimestamp = null;
  let isAISpeaking = false;
  let aiSpeakingStartWallTime = 0;

  // Interruption tracking
  let pendingInterruption = false;
  let pendingSpeechStartTs = null; // OpenAI VAD timestamp (ms)
  const INTERRUPTION_GRACE_PERIOD_MS = 300;

  // NEW: ignore “speech” shorter than this (major source of false cuts)
  const MIN_SPEECH_BURST_MS = 350;

  // Greeting should happen once
  let greeted = false;

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

  function maybeGreet() {
    if (!greeted && streamSid && openaiOpen) {
      greeted = true;
      sendToOpenAI({ type: "response.create" });
    }
  }

  function cancelRoy(reason) {
    console.log(`🛑 Canceling Roy: ${reason}`);

    sendToOpenAI({ type: "response.cancel" });

    // Only clear Twilio when we’re *sure* (caller truly interrupted).
    // This avoids “random mid-sentence silence” when it was noise.
    twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));

    if (lastAssistantItem && responseStartTimestamp != null) {
      const elapsed = Math.max(0, latestMediaTimestamp - responseStartTimestamp);
      sendToOpenAI({
        type: "conversation.item.truncate",
        item_id: lastAssistantItem,
        content_index: 0,
        audio_end_ms: elapsed,
      });
    }

    lastAssistantItem = null;
    responseStartTimestamp = null;
    isAISpeaking = false;
    pendingInterruption = false;
    pendingSpeechStartTs = null;
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

    // FIX #1: enable server_vad so speech_started/stopped is reliable
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "echo", // keep your choice; change if unsupported in your account
        temperature: 0.7,
        instructions: ROY_PROMPT,
        turn_detection: { type: "server_vad" },
        max_response_output_tokens: 180,
        input_audio_transcription: { model: "whisper-1" },
      },
    });

    flushOpenAIQueue();
    maybeGreet();
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (LOG_EVENT_TYPES.includes(evt.type)) {
      console.log(`📊 Event: ${evt.type}`);
    }

    // Track when AI starts speaking
    if (evt.type === "response.audio.started" || evt.type === "response.audio.delta") {
      if (!isAISpeaking) {
        isAISpeaking = true;
        aiSpeakingStartWallTime = Date.now();
        responseStartTimestamp = latestMediaTimestamp;
        console.log("🎙️ AI started speaking");
      }
      if (evt.item_id) lastAssistantItem = evt.item_id;
    }

    // Stream audio deltas back to Twilio
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      twilioSocket.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        })
      );
    }

    // End speaking state
    if (evt.type === "response.audio.done" || evt.type === "response.done") {
      isAISpeaking = false;
      lastAssistantItem = null;
      responseStartTimestamp = null;
      pendingInterruption = false;
      pendingSpeechStartTs = null;
      console.log("✅ AI finished speaking");
    }

    // Interruption candidate
    if (evt.type === "input_audio_buffer.speech_started") {
      console.log("🗣️ Speech detected!");

      // Record OpenAI VAD start timestamp if present (some builds include it)
      // If missing, we’ll still work with wall-time + transcript checks.
      pendingSpeechStartTs = latestMediaTimestamp;

      if (!isAISpeaking) return;

      const sinceAiStart = Date.now() - aiSpeakingStartWallTime;
      if (sinceAiStart < INTERRUPTION_GRACE_PERIOD_MS) {
        console.log(`⏳ In grace period (${sinceAiStart}ms) – ignoring`);
        return;
      }

      // Don’t cancel yet; mark pending and wait for speech_stopped + transcript
      pendingInterruption = true;
    }

    // Speech ended: commit audio to get transcript
    if (evt.type === "input_audio_buffer.speech_stopped") {
      if (!pendingInterruption) {
        // normal user turn; still commit to get transcript & response
        sendToOpenAI({ type: "input_audio_buffer.commit" });
        return;
      }

      // FIX #2: ignore very short speech bursts (noise)
      const burstMs =
        responseStartTimestamp != null && pendingSpeechStartTs != null
          ? Math.max(0, latestMediaTimestamp - pendingSpeechStartTs)
          : null;

      if (burstMs != null && burstMs < MIN_SPEECH_BURST_MS) {
        console.log(`🧊 Ignoring short burst (${burstMs}ms) – likely noise/echo`);
        pendingInterruption = false;
        pendingSpeechStartTs = null;
        // Still commit so we can see transcript for debugging, but won’t cancel
        sendToOpenAI({ type: "input_audio_buffer.commit" });
        return;
      }

      // Commit so we can decide using transcript
      sendToOpenAI({ type: "input_audio_buffer.commit" });
    }

    // After commit completes
    if (evt.type === "input_audio_buffer.committed") {
      // If AI isn’t speaking, we want a response to the user normally
      if (!isAISpeaking && !pendingInterruption) {
        sendToOpenAI({ type: "response.create" });
      }
      // If pendingInterruption, we wait for transcription to decide cancel vs ignore.
    }

    // Transcript arrived: decide if the “interruption” was real
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = evt.transcript || "";
      console.log(`👤 User said: "${transcript}"`);

      if (pendingInterruption && isAISpeaking) {
        // FIX #3: only cancel if transcript looks real
        if (isRealInterruptionTranscript(transcript)) {
          cancelRoy(`real interruption transcript="${transcript}"`);
          // Now answer the user's interruption
          sendToOpenAI({ type: "response.create" });
        } else {
          console.log(`💬 Not a real interruption – letting Roy continue. transcript="${transcript}"`);
          pendingInterruption = false;
          pendingSpeechStartTs = null;
          // Do NOT cancel Roy; do NOT clear Twilio
        }
      } else if (!isAISpeaking) {
        // Normal turn: generate response
        sendToOpenAI({ type: "response.create" });
      }
    }
  });

  openaiSocket.on("close", (c, r) => {
    console.error("❌ OpenAI WS closed", c, r ? r.toString() : "");
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (e) => {
    console.error("❌ OpenAI WS error", e);
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  // Helper function to check if audio is from caller
  const isCallerAudio = (track) => track === "inbound" || track === "inbound_track";

  let trackLogged = false;

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start?.streamSid || null;
      console.log("🟢 Twilio start:", streamSid);
      maybeGreet();
      return;
    }

    if (data.event === "media") {
      const track = data.media?.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("📞 Twilio media.track =", track || "(missing)");
      }

      // Prevent feedback loop: only caller audio
      if (!isCallerAudio(track)) return;

      if (typeof data.media?.timestamp === "number") {
        latestMediaTimestamp = data.media.timestamp;
      }

      const payload = data.media?.payload;
      if (!payload) return;

      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
      return;
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
