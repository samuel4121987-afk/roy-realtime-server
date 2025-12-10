import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

// Helper to greet based on Madrid timezone
function getTimeBasedGreeting() {
  const now = new Date();
  const madridTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Madrid" })
  );
  const hour = madridTime.getHours();
  if (hour < 12) return "Good morning";
  else if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY!");
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

// Basic Roy instructions (similar to original working version)
const ROY_INSTRUCTIONS = `
You are Roy, a natural phone receptionist for "24/7 AI Assistant". Do not mention you’re an AI or language model.

24/7 AI Assistant builds AI receptionists that answer calls, chats, and emails around the clock for hotels, clinics, salons/spas, rentals, small businesses, and professional services. We handle bookings, reservations, questions, and lead capture (name, phone, email, business type).

Speak like a real person, using contractions (I'm, we'll, don't). Keep each reply to 1–2 sentences. If the caller sounds Spanish, switch to Spanish; otherwise use English. Listen while you speak — if the caller says more than a simple “yes/okay,” stop immediately, answer, then continue.

First ask what kind of business they have, briefly explain how 24/7 AI helps that type of business, offer to take their name, email, and phone number or schedule a demo, then confirm their contact details and end politely.
`;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio webhook: connect with inbound stream only
app.post("/twiml", (req, res) => {
  const host = req.headers["host"];
  const wsUrl = `wss://${host}/media`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound"/>
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

// Handle Twilio media connections
wss.on("connection", (twilioSocket) => {
  console.log("📞 Twilio WS connected");
  let streamSid = null;
  let openaiSocket = null;
  let openaiReady = false;
  const pendingAudio = [];

  // Connect to OpenAI Realtime
  openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    console.log("🧠 OpenAI connected");
    openaiReady = true;

    // Configure session (keep close to original working config)
    const sessionUpdate = {
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        instructions: ROY_INSTRUCTIONS,
        modalities: ["audio", "text"],
        temperature: 0.6,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
      },
    };
    openaiSocket.send(JSON.stringify(sessionUpdate));

    // Dynamic greeting
    const greeting = getTimeBasedGreeting();
    const initialResponse = {
      type: "response.create",
      response: {
        text: `24/7 AI, ${greeting}. This is Roy from 24/7 AI Assistant. How can I help you?`,
        modalities: ["audio", "text"],
      },
    };
    openaiSocket.send(JSON.stringify(initialResponse));

    // Send buffered audio to OpenAI after connection established
    for (const msg of pendingAudio) {
      openaiSocket.send(JSON.stringify(msg));
    }
    pendingAudio.length = 0;
  });

  openaiSocket.on("message", (event) => {
    try {
      const data =
        typeof event === "string"
          ? JSON.parse(event)
          : JSON.parse(event.toString());
      if (data.type === "response.audio.delta" && data.delta && streamSid) {
        const twilioMsg = {
          event: "media",
          streamSid,
          media: { payload: data.delta },
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
    console.log("🧠 OpenAI WS closed");
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  });

  openaiSocket.on("error", (err) => {
    console.error("OpenAI WS error:", err);
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
          audio: payload,
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
    console.log("📴 Twilio WS closed");
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });

  twilioSocket.on("error", (err) => {
    console.error("Twilio WS error:", err);
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Roy server listening on port ${PORT}`);
});
