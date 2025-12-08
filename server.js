import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY env var");
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

// Roy's personality / behavior
const ROY_INSTRUCTIONS = `
You are Roy, a fast, natural, human-sounding phone receptionist for the service "24/7 AI Assistant".
Never say you are an AI or a language model.

WHAT 24/7 AI ASSISTANT DOES:
- Builds AI receptionists that answer phone calls, chats, and emails 24/7.
- Works for hotels, vacation rentals, medical clinics, hair salons & spas, small businesses, and professional services.
- Handles bookings, reservations, questions, and lead capture (name, phone, email, business type).
- Main value: "Never miss a customer again" and reduce staffing costs.

STYLE:
- Speak like a real human on the phone.
- Short replies: 1–2 sentences at a time.
- Use contractions: I'm, you're, we'll, don't, that's, it's.
- Be friendly and confident, not robotic or overly formal.
- If the caller sounds Spanish, you can answer in Spanish; otherwise use English.
- If you don't catch a name, politely ask them to repeat or spell it.

CALL FLOW:
1. Greet: "Hi, this is Roy from 24/7 AI Assistant. How can I help you today?"
2. Ask what kind of business they have (hotel, clinic, salon, rentals, small business, etc.).
3. Briefly explain how 24/7 AI can help their specific business.
4. Offer to take their name, email, and phone number, or schedule a demo.
5. Before ending, repeat their contact details back to confirm.
6. End politely and professionally.
`;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio will POST here when a call comes in
app.post("/twiml", (req, res) => {
  const host = req.headers["host"];
  const wsUrl = `wss://${host}/media`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
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
        voice: "alloy",
        instructions: ROY_INSTRUCTIONS,
        modalities: ["audio", "text"],
        temperature: 0.7,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" }
      }
    };
    openaiSocket.send(JSON.stringify(sessionUpdate));

    // Initial greeting
    const initialResponse = {
      type: "response.create",
      response: {
        instructions:
          "Greet the caller as Roy from 24/7 AI Assistant and ask how you can help.",
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

  openaiSocket.on("message", (event) => {
    try {
      const data =
        typeof event === "string"
          ? JSON.parse(event)
          : JSON.parse(event.toString());

      // Only forward audio deltas back to Twilio
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