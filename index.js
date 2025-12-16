const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

// Use the standard Realtime websocket endpoint + model query param
const OPENAI_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const ROY_PROMPT = `
You are Roy, the 24/7 AI Assistant receptionist. Be transparent that you are an AI voice assistant.
Speak naturally, quick and energetic, short answers (1–2 sentences), contractions, casual.

## Immediate Greeting
At the very start of every call, greet instantly with:
"24/7 AI, this is Roy. How can I help you?"

## Language
Default English. If caller speaks Spanish, continue in Spanish.

## Barge-in / interruptions
If the caller starts speaking, stop immediately and listen.

## Lead capture
If interested: ask name, email, phone, business type; repeat back to confirm.

## Close
Confirm captured info, then: "Thank you for calling. Have a great day."
`.trim();

const LOG_EVENT_TYPES = [
  "session.created",
  "session.updated",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "conversation.item.input_audio_transcription.completed",
  "response.created",
  "response.audio.started",
  "response.audio.delta",
  "response.audio.done",
  "response.done",
  "error",
];

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
  let latestMediaTimestamp = 0;

  let openaiOpen = false;
  const openaiQueue = [];

  let isAISpeaking = false;
  let lastAssistantItem = null;
  let responseStartTimestamp = null;

  let greeted = false;

  const INTERRUPTION_GRACE_PERIOD_MS = 250;
  let aiSpeakingStartWallTime = 0;

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
      // Roy prompt forces the exact greeting at start of call
      sendToOpenAI({ type: "response.create" });
    }
  }

  // Twilio helpers
  const isCallerAudio = (track) =>
    track === "inbound" || track === "inbound_track";

  // OpenAI socket
  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    openaiOpen = true;
    console.log("✅ OpenAI WS connected");

    // IMPORTANT: enable server_vad so speech_started/stopped fire
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        // Pick a supported voice from your account/model docs (e.g. "alloy")
        voice: "alloy",
        temperature: 0.6,
        instructions: ROY_PROMPT,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
        max_response_output_tokens: 180,
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
      console.log(`📊 ${evt.type}`);
    }

    // Mark AI speaking quickly when audio starts arriving
    if (evt.type === "response.audio.started" || evt.type === "response.audio.delta") {
      if (!isAISpeaking) {
        isAISpeaking = true;
        aiSpeakingStartWallTime = Date.now();
        responseStartTimestamp = latestMediaTimestamp;
      }
      if (evt.item_id) lastAssistantItem = evt.item_id;
    }

    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      twilioSocket.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta },
        })
      );
    }

    if (evt.type === "response.audio.done" || evt.type === "response.done") {
      isAISpeaking = false;
      lastAssistantItem = null;
      responseStartTimestamp = null;
    }

    // FAST barge-in: stop speaking immediately on detected speech
    if (evt.type === "input_audio_buffer.speech_started") {
      if (!isAISpeaking) return;

      const elapsed = Date.now() - aiSpeakingStartWallTime;
      if (elapsed < INTERRUPTION_GRACE_PERIOD_MS) return;

      // Cancel current response
      sendToOpenAI({ type: "response.cancel" });

      // Stop Twilio playback buffer immediately
      if (streamSid) {
        twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
      }

      // Truncate assistant item so the conversation state matches what caller heard
      if (lastAssistantItem && responseStartTimestamp != null) {
        const audio_end_ms = Math.max(0, latestMediaTimestamp - responseStartTimestamp);
        sendToOpenAI({
          type: "conversation.item.truncate",
          item_id: lastAssistantItem,
          content_index: 0,
          audio_end_ms,
        });
      }

      isAISpeaking = false;
      lastAssistantItem = null;
      responseStartTimestamp = null;
    }

    // Optional: log transcript for debugging
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      console.log(`👤 User: "${evt.transcript || ""}"`);
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

  // Twilio socket
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
      maybeGreet(); // greet only when both sides are ready
      return;
    }

    if (data.event === "media") {
      const track = data.media?.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("📞 Twilio media.track =", track || "(missing)");
      }

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
server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on", PORT));
