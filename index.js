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
You are Roy, a male voice receptionist for the 24/7 AI Assistant service.

Always speak naturally and concisely.
Never repeat your greeting.
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

app.all("/incoming-call", (req, res) => {
  res.status(200).type("text/xml").send(twimlResponse(req));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio connected");

  let streamSid = null;
  let openaiOpen = false;
  const queue = [];

  let greetingInFlight = true; // 🔒 HARD LOCK
  let isAISpeaking = false;

  function sendToOpenAI(obj) {
    const msg = JSON.stringify(obj);
    if (openaiOpen && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(msg);
    } else {
      queue.push(msg);
    }
  }

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    openaiOpen = true;
    console.log("✅ OpenAI connected");

    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0.4,
        instructions: ROY_PROMPT,
        turn_detection: {
          type: "server_vad",
          threshold: 0.8,
          silence_duration_ms: 800
        },
        input_audio_transcription: { model: "whisper-1" }
      }
    });

    while (queue.length) openaiSocket.send(queue.shift());
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (evt.type === "response.audio.started") {
      isAISpeaking = true;
    }

    if (evt.type === "response.audio.done") {
      isAISpeaking = false;
    }

    if (evt.type === "response.done") {
      if (greetingInFlight) {
        greetingInFlight = false;
        console.log("✅ Greeting completed — listening enabled");
      }
    }

    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: evt.delta }
        }));
      }
    }

    if (
      evt.type === "conversation.item.input_audio_transcription.completed" &&
      !greetingInFlight
    ) {
      const text = (evt.transcript || "").trim();
      if (!text) return;

      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }]
        }
      });
      sendToOpenAI({ type: "response.create" });
    }
  });

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("▶️ Call start", streamSid);

      greetingInFlight = true;

      sendToOpenAI({
        type: "response.create",
        response: {
          modalities: ["audio"],
          temperature: 0,
          instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
          commit: true
        }
      });
      return;
    }

    if (data.event === "media") {
      if (greetingInFlight) {
        // 🔇 IGNORE EVERYTHING during greeting
        return;
      }

      if (data.media?.payload) {
        sendToOpenAI({
          type: "input_audio_buffer.append",
          audio: data.media.payload
        });
      }
    }

    if (data.event === "stop") {
      console.log("⛔ Call ended");
      openaiSocket.close();
      twilioSocket.close();
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () =>
  console.log("🚀 Listening on", PORT)
);
