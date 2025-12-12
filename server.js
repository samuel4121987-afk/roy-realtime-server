import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

// Your OpenAI API key must be set in the environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY environment variable");
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio will call this URL on inbound calls
app.post("/twiml", (req, res) => {
  const host = req.headers["host"];
  const wsUrl = `wss://${host}/media`;
  // Use inbound_track so Roy only hears the caller
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track" />
  </Connect>
</Response>`;
  res.type("text/xml").send(twiml);
});

// Simple health check
app.get("/", (_req, res) => {
  res.send("Roy realtime server is running.");
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

// When a new media stream is created by Twilio
wss.on("connection", (twilioSocket) => {
  console.log("📞 Twilio WebSocket connected");
  let streamSid = null;
  let openaiSocket = null;
  let openaiReady = false;
  const pendingAudio = [];

  // Connect to OpenAI Realtime API
  openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  openaiSocket.on("open", () => {
    console.log("🧠 OpenAI realtime connected");
    openaiReady = true;
    // Configure the session; no greeting or instructions here
    const sessionUpdate = {
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        instructions: "", // handled in your OpenAI assistant
        modalities: ["audio", "text"],
        temperature: 0.7,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" }
      }
    };
    openaiSocket.send(JSON.stringify(sessionUpdate));
    // Flush any buffered audio
    for (const msg of pendingAudio) {
      openaiSocket.send(JSON.stringify(msg));
    }
    pendingAudio.length = 0;
  });

  openaiSocket.on("message", (event) => {
    try {
      const data =
        typeof event === "string" ? JSON.parse(event) : JSON.parse(event.toString());
      // Forward audio deltas back to Twilio
      if (data.type === "response.audio.delta" && data.delta && streamSid) {
        const twilioMsg = {
          event: "media",
          streamSid,
          media: { payload: data.delta }
        };
        if (twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.send(JSON.stringify(twilioMsg));
        }
      }
    } catch (err) {
      console.error("Error parsing OpenAI message:", err);
    }
  });

  openaiSocket.on("close", () => {
    console.log("🧠 OpenAI WebSocket closed");
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  });

  openaiSocket.on("error", (err) => {
    console.error("OpenAI WebSocket error:", err);
  });

  // Handle messages from Twilio
  twilioSocket.on("message", (msg) => {
    try {
      const data =
        typeof msg === "string" ? JSON.parse(msg) : JSON.parse(msg.toString());
      const eventType = data.event;

      if (eventType === "start") {
        streamSid = data.start?.streamSid || null;
        console.log("▶️ Stream started:", streamSid);
      }

      if (eventType === "media") {
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

      if (eventType === "stop") {
        console.log("⏹️ Stream stopped");
        if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
          openaiSocket.close();
        }
        if (twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.close();
        }
      }
    } catch (err) {
      console.error("Error parsing Twilio message:", err);
    }
  });

  twilioSocket.on("close", () => {
    console.log("📴 Twilio WebSocket closed");
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });

  twilioSocket.on("error", (err) => {
    console.error("Twilio WebSocket error:", err);
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Roy realtime server listening on port ${PORT}`);
});
