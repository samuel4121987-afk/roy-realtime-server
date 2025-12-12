import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) process.exit(1);

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const app = express();
app.set("trust proxy", 1);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post("/twiml", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host  = req.headers["x-forwarded-host"] || req.headers.host;
  const wsUrl = `${proto === "http" ? "ws" : "wss"}://${host}/media`;

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  let streamSid;
  let openaiReady = false;

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  openaiSocket.on("open", () => {
    openaiReady = true;

    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        modalities: ["audio"]
      }
    }));

    // 🔊 IMMEDIATE GREETING (WORKS)
    openaiSocket.send(JSON.stringify({
      type: "response.create",
      response: {
        instructions: "24 7 this is Roy how can I help you?",
        modalities: ["audio"]
      }
    }));
  });

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

  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
    }

    if (data.event === "media" && openaiReady) {
      // 1️⃣ append audio
      openaiSocket.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.media.payload
      }));

      // 2️⃣ COMMIT AUDIO  ← ← ← THIS WAS MISSING
      openaiSocket.send(JSON.stringify({
        type: "input_audio_buffer.commit"
      }));

      // 3️⃣ ASK FOR RESPONSE
      openaiSocket.send(JSON.stringify({
        type: "response.create",
        response: { modalities: ["audio"] }
      }));
    }

    if (data.event === "stop") {
      openaiSocket.close();
      twilioSocket.close();
    }
  });
});

server.listen(process.env.PORT || 3000);
