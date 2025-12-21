const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const ROY_PROMPT = `
You are Roy, a virtual receptionist.
Greet immediately with: "24/7 AI, this is Roy. How can I help you?"
Speak naturally, briefly, and never cut yourself off.
`.trim();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function twimlResponse(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsProto = proto === "http" ? "ws" : "wss";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsProto}://${host}/media-stream" track="inbound_track"/>
  </Connect>
</Response>`;
}

app.all("/incoming-call", (req, res) => {
  res.type("text/xml").send(twimlResponse(req));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  let streamSid = null;

  let isAISpeaking = false;
  let responseInFlight = false;
  let cancelInProgress = false;
  let greeted = false;

  let queuedTranscript = null;
  let inboundAudioBytes = 0;
  let pendingBargeIn = false;

  const MIN_BARGE_BYTES = 4000;
  const GRACE_MS = 800;
  let aiSpeechStartedAt = 0;

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function send(obj) {
    if (openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(JSON.stringify(obj));
    }
  }

  function safeCreateResponse(text) {
    if (isAISpeaking || responseInFlight || cancelInProgress) {
      queuedTranscript = text;
      return;
    }
    send({
      type: "response.create",
      response: {
        instructions: text.length < 4
          ? "Reply briefly with acknowledgment only."
          : "Answer clearly in one or two sentences.",
      },
    });
  }

  function requestCancel() {
    if (cancelInProgress) return;
    cancelInProgress = true;
    send({ type: "response.cancel" });
    setTimeout(() => {
      if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
        twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
      }
    }, 40);
  }

  openaiSocket.on("open", () => {
    send({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "echo",
        instructions: ROY_PROMPT,
        turn_detection: {
          type: "server_vad",
          threshold: 0.8,
          silence_duration_ms: 900,
        },
        input_audio_transcription: { model: "whisper-1" },
      },
    });
  });

  openaiSocket.on("message", (msg) => {
    const evt = JSON.parse(msg.toString());

    if (evt.type === "response.created") responseInFlight = true;
    if (evt.type === "response.done") {
      responseInFlight = false;
      cancelInProgress = false;
      isAISpeaking = false;
      if (queuedTranscript) {
        const t = queuedTranscript;
        queuedTranscript = null;
        safeCreateResponse(t);
      }
    }

    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
      aiSpeechStartedAt = Date.now();
    }

    if (evt.type === "response.audio.delta" && !cancelInProgress) {
      twilioSocket.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: evt.delta }
      }));
    }

    if (evt.type === "input_audio_buffer.speech_started") {
      if (!isAISpeaking) return;
      if (Date.now() - aiSpeechStartedAt < GRACE_MS) return;
      pendingBargeIn = true;
      inboundAudioBytes = 0;
    }

    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (evt.transcript || "").trim();
      if (pendingBargeIn && inboundAudioBytes > MIN_BARGE_BYTES) {
        requestCancel();
      }
      pendingBargeIn = false;
      safeCreateResponse(transcript);
    }
  });

  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      if (!greeted) {
        greeted = true;
        send({
          type: "response.create",
          response: { instructions: ROY_PROMPT }
        });
      }
    }

    if (data.event === "media") {
      inboundAudioBytes += Math.floor(data.media.payload.length * 0.75);
      send({ type: "input_audio_buffer.append", audio: data.media.payload });
    }
  });
});

server.listen(process.env.PORT || 8080, () => {
  console.log("Server listening");
});
