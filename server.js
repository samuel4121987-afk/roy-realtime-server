import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

/* ===== ENV ===== */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

/* ===== APP ===== */
const app = express();
app.set("trust proxy", 1);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/* ===== TWIML ===== */
app.post("/twiml", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host  = req.headers["x-forwarded-host"] || req.headers.host;
  const wsScheme = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsScheme}://${host}/media`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track" />
  </Connect>
</Response>`;

  res.type("text/xml").send(twiml);
});

app.get("/", (_req, res) => {
  res.send("Roy server running.");
});

/* ===== SERVER ===== */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  let streamSid = null;
  let openaiReady = false;
  const pendingAudio = [];

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  /* ===== OPENAI READY ===== */
  openaiSocket.on("open", () => {
    openaiReady = true;

    // Minimal session config — THIS IS THE SAFE WORKING SET
    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        modalities: ["audio"]
      }
    }));

    // Immediate greeting — no VAD, no delay
    openaiSocket.send(JSON.stringify({
      type: "response.create",
      response: {
        instructions: "24 7 this is Roy how can I help you?",
        modalities: ["audio"]
      }
    }));

    // Flush buffered audio
    for (const msg of pendingAudio) {
      openaiSocket.send(JSON.stringify(msg));
    }
    pendingAudio.length = 0;
  });

  /* ===== OPENAI → TWILIO ===== */
  openaiSocket.on("message", (event) => {
    const data = JSON.parse(event);
    if (data.type === "response.audio.delta" && streamSid) {
      twilioSocket.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: data.delta }
      }));
    }
  });

  openaiSocket.on("close", () => {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  });

  openaiSocket.on("error", (err) => {
    console.error("OpenAI WS error:", err);
  });

  /* ===== TWILIO → OPENAI ===== */
  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
    }

    if (data.event === "media") {
      const payload = data.media?.payload;
      if (!payload) return;

      const openaiMsg = {
        type: "input_audio_buffer.append",
        audio: payload
      };

      if (openaiReady && openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(JSON.stringify(openaiMsg));
      } else {
        pendingAudio.push(openaiMsg);
      }
    }

    if (data.event === "stop") {
      if (openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.close();
      }
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.close();
      }
    }
  });

  twilioSocket.on("close", () => {
    if (openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });

  twilioSocket.on("error", (err) => {
    console.error("Twilio WS error:", err);
    if (openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });
});

/* ===== LISTEN ===== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Roy listening on ${PORT}`);
});
