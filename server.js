import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

// Helper to generate a time‑based greeting (Europe/Madrid timezone)
function getTimeBasedGreeting() {
  const now = new Date();
  // Convert to Europe/Madrid timezone
  const madridTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Madrid" })
  );
  const hour = madridTime.getHours();
  if (hour < 12) return "Good morning";
  else if (hour < 18) return "Good afternoon";
  else return "Good evening";
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY env var");
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

// Roy's personality / behavior
const ROY_INSTRUCTIONS = `
You are Roy, a human-sounding receptionist for 24/7 AI Assistant. Never say you are an AI.

— Service summary:
24/7 AI Assistant builds virtual receptionists that answer phone calls, chats, and emails 24/7 for hotels, rentals, clinics, salons, small businesses, and professional services. It helps with reservations, bookings, questions, and captures leads (name, email, phone, business type).

— Greeting:
Use the helper function to say "Good morning/afternoon/evening, this is Roy from 24/7 AI Assistant. How can I help you today?" at the start of each call.

— Speaking style:
• Speak quickly and naturally with short sentences (1–2 sentences). Use contractions ("I’m", "we’re").
• Listen while you speak. Continue if the caller only says filler words (“yes”, “yeah”, “uh-huh”) or background noise. Ignore those.
• If the caller starts a new sentence or question, stop immediately, acknowledge, answer briefly, then continue the flow.
• If the caller sounds Spanish, you may answer in Spanish; otherwise use English.
• Be friendly and confident.

— Call flow:
1. Greet with the time-based greeting.
2. Ask what type of business they run.
3. Explain how 24/7 AI Assistant helps that type of business.
4. Offer to record their name, email, phone number, or schedule a demo.
5. Confirm contact details before ending.
`;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio will POST here when a call comes in
app.post("/twiml", (req, res) => {
  const host = req.headers["host"];
  const wsUrl = `wss://${host}/media`;

  // Stream only the caller’s voice (track="inbound_track")
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
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

// Handle each Twilio media stream connection
wss.on("connection", (twilioSocket) => {
  console.log("📞 Twilio WebSocket connected");

  let streamSid = null;
  let openaiSocket = null;
  let openaiReady = false;
  const pendingAudio = [];

  // Connect to OpenAI Realtime
  openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  openaiSocket.on("open", () => {
    console.log("🧠 OpenAI Realtime connected");
    openaiReady = true;

    // Configure session
    const sessionUpdate = {
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        // Use OpenAI's "onyx" voice; no ElevenLabs here
        voice: "onyx",
        instructions: ROY_INSTRUCTIONS,
        modalities: ["audio", "text"],
        temperature: 0.7,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" }
      }
    };
    openaiSocket.send(JSON.stringify(sessionUpdate));

    // Initial greeting using the time-based helper
    const initialResponse = {
      type: "response.create",
      response: {
        instructions: `${getTimeBasedGreeting()}, this is Roy from 24/7 AI Assistant. How can I help you today?`,
        modalities: ["audio", "text"]
      }
    };
    openaiSocket.send(JSON.stringify(initialResponse));

    // Flush buffered audio if any
    for (const msg of pendingAudio) {
      openaiSocket.send(JSON.stringify(msg));
    }
    pendingAudio.length = 0;
  });

  // Forward audio from OpenAI to Twilio
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
          media: {
            payload: data.delta // base64 g711_ulaw
          }
        };
        if (twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.send(JSON.stringify(twilioMsg));
        }
      }
    } catch (err) {
      console.error("❌ Error parsing OpenAI message:", err);
    }
  });

  openaiSocket.on("close", () => {
    console.log("🧠 OpenAI WS closed");
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  });

  openaiSocket.on("error", (err) => {
    console.error("❌ OpenAI WS error:", err);
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
          audio: payload // base64 g711_ulaw from Twilio
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
      console.error("❌ Error parsing Twilio message:", err);
    }
  });

  twilioSocket.on("close", () => {
    console.log("📴 Twilio WS closed");
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });

  twilioSocket.on("error", (err) => {
    console.error("❌ Twilio WS error:", err);
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Roy realtime server listening on port ${PORT}`);
});
