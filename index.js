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

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_, res) => res.send("OK"));

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
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let greetingInFlight = true;

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    console.log("✅ OpenAI WS connected");

    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0,
        turn_detection: {
          type: "server_vad",
          threshold: 0.8,
          silence_duration_ms: 800
        },
        input_audio_transcription: {
          model: "whisper-1"
        }
      }
    }));
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try { evt = JSON.parse(raw); } catch { return; }

    // Forward AI audio to Twilio
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      twilioSocket.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: evt.delta }
      }));
    }

    // Greeting finished → unlock listening
    if (evt.type === "response.done" && greetingInFlight) {
      greetingInFlight = false;
      console.log("🔓 Greeting finished — caller can speak now");
    }
  });

  twilioSocket.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("▶️ Call started:", streamSid);

      // 🔊 FORCE GREETING — ALWAYS
      openaiSocket.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
          commit: true
        }
      }));
      return;
    }

    if (data.event === "media") {
      const payload = data.media && data.media.payload;
      if (!payload) return;

      // ✅ ALWAYS append audio (even during greeting)
      openaiSocket.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: payload
      }));
    }

    if (data.event === "stop") {
      console.log("⛔ Call ended");
      openaiSocket.close();
    }
  });

  twilioSocket.on("close", () => openaiSocket.close());
  twilioSocket.on("error", () => openaiSocket.close());
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () =>
  console.log("🚀 Listening on", PORT)
);
