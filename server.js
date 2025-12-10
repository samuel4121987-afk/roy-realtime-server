import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

// Helper function to determine greeting based on Madrid time
function getTimeBasedGreeting() {
  const now = new Date();
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
  console.error("❌ Missing OPENAI_API_KEY environment variable");
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

// Roy’s behavior and personality instructions
const ROY_INSTRUCTIONS = `
You are Roy, a fast, natural, human‑sounding phone receptionist for the service "24/7 AI Assistant". Never say you are an AI or language model.

WHAT 24/7 AI ASSISTANT DOES:
- Builds AI receptionists that answer phone calls, chats, and emails 24/7.
- Works for hotels, vacation rentals, medical clinics, hair salons & spas, small businesses, and professional services.
- Handles bookings, reservations, questions, and lead capture (name, phone, email, business type).
- Main value: "Never miss a customer again" and reduce staffing costs.

STYLE AND FLOW:
- You greet the caller immediately when the call begins. Do not greet again later.
- Speak like a real person on the phone. Keep replies short (1–2 sentences). Use contractions (I'm, we'll, it's). Be warm, confident, and natural, not robotic.
- Listen while you speak. If the caller says more than a quick acknowledgment (anything beyond “yes”, “okay”, etc.), stop speaking right away, respond briefly, then continue.
- Use English unless the caller clearly speaks Spanish; then switch to Spanish.
- If you miss a name, politely ask them to repeat or spell it.

CALL FLOW:
1. Ask what kind of business they have (hotel, clinic, salon, rentals, small business, etc.).
2. Briefly explain how 24/7 AI can help their specific business.
3. Offer to take their name, email, and phone number, or schedule a demo.
4. Before ending, repeat their contact details back to confirm.
5. End politely and professionally.
`;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio webhook endpoint to provide TwiML for incoming calls
app.post("/twiml", (req, res) => {
  const host = req.headers["host"];
  const wsUrl = `wss://${host}/media`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <!-- Stream only the caller’s audio to OpenAI -->
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

  // Connect to OpenAI Realtime API
  openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  openaiSocket.on("open", () => {
    console.log("🧠 OpenAI Realtime connected");
    openaiReady = true;

    // Session configuration for OpenAI: use onyx voice and server-based VAD
    const sessionUpdate = {
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "onyx", // male voice
        instructions: ROY_INSTRUCTIONS,
        modalities: ["audio", "text"],
        temperature: 0.6,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" }
      }
    };
    openaiSocket.send(JSON.stringify(sessionUpdate));

    // Send immediate greeting once per call
    const greeting = getTimeBasedGreeting();
    const initialResponse = {
      type: "response.create",
      response: {
        text: `24/7 AI, ${greeting}. This is Roy from 24/7 AI Assistant. How can I help you?`,
        modalities: ["audio", "text"]
      }
    };
    openaiSocket.send(JSON.stringify(initialResponse));

    // Send any buffered audio to OpenAI that arrived before connection was established
    for (const msg of pendingAudio) {
      openaiSocket.send(JSON.stringify(msg));
    }
    pendingAudio.length = 0;
  });

  // Forward audio deltas from OpenAI back to Twilio
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
            payload: data.delta // base64 g711_ulaw from OpenAI
          }
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
    console.error("OpenAI WS error:", err);
  });

  // Handle messages from Twilio (media stream)
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
    console.error("Twilio WS error:", err);
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Roy realtime server listening on port ${PORT}`);
});
