import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

// Your OpenAI key must be set in Railway as an environment variable.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY env var");
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Generate TwiML when a call comes in. Stream only inbound audio.
app.post("/twiml", (req, res) => {
  const host = req.headers["host"];
  const wsUrl = `wss://${host}/media`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Connect>\n    <Stream url="${wsUrl}" track="inbound_track"/>\n  </Connect>\n</Response>`;
  res.type("text/xml").send(twiml);
});

// Simple health check route
app.get("/", (_req, res) => {
  res.send("Roy realtime server is running.");
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

// Handle each Twilio media stream connection
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
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    console.log("🧠 OpenAI Realtime connected");
    openaiReady = true;

    // Configure session: g711_ulaw audio and choose a male-sounding voice like onyx.
    const sessionUpdate = {
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "onyx", // you can change this voice if you prefer another OpenAI voice
        modalities: ["audio"],
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
      },
    };
    openaiSocket.send(JSON.stringify(sessionUpdate));

    // Kick off the conversation: the assistant will greet according to your system prompt.
    const initialResponse = {
      type: "response.create",
      response: {
        instructions: "Start the conversation.",
        modalities: ["audio"],
      },
    };
    openaiSocket.send(JSON.stringify(initialResponse));

    // Flush any audio that arrived before OpenAI connection was ready
    for (const msg of pendingAudio) {
      openaiSocket.send(JSON.stringify(msg));
    }
    pendingAudio.length = 0;
  });

  // Forward audio from OpenAI back to Twilio
  openaiSocket.on("message", (event) => {
    let data;
    try {
      data =
        typeof event === "string"
          ? JSON.parse(event)
          : JSON.parse(event.toString());
    } catch (err) {
      console.error("❌ Error parsing OpenAI message:", err);
      return;
    }

    // Only forward audio deltas (g711_ulaw) to Twilio
    if (data.type === "response.audio.delta" && data.delta && streamSid) {
      const twilioMsg = {
        event: "media",
        streamSid,
        media: {
          payload: data.delta, // base64 g711_ulaw audio
        },
      };
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify(twilioMsg));
      }
    }
  });

  // Shared cleanup routine
  const closeConnections = () => {
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
    if (twilioSocket && twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  };

  openaiSocket.on("close", closeConnections);
  openaiSocket.on("error", (err) => {
    console.error("❌ OpenAI WS error:", err);
    closeConnections();
  });

  // Handle messages from Twilio (start, media, stop)
  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = typeof msg === "string" ? JSON.parse(msg) : JSON.parse(msg.toString());
    } catch (err) {
      console.error("❌ Error parsing Twilio message:", err);
      return;
    }

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
        audio: payload, // base64 g711_ulaw from Twilio
      };

      if (openaiReady && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(JSON.stringify(openaiMsg));
      } else {
        pendingAudio.push(openaiMsg);
      }
    }

    if (eventType === "stop") {
      console.log("⏹️ Stream stopped");
      closeConnections();
    }
  });

  twilioSocket.on("close", () => {
    console.log("📴 Twilio WS closed");
    closeConnections();
  });

  twilioSocket.on("error", (err) => {
    console.error("❌ Twilio WS error:", err);
    closeConnections();
  });
});

// Start the HTTP and WebSocket server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Roy realtime server listening on port ${PORT}`);
});
