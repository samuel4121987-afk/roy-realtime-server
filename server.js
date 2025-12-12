import express from "express";
import http from "http";
import WebSocket from "ws";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const PORT = process.env.PORT || 8080;

/* ============================
   ROY PROMPT (VERBATIM)
============================ */
const ROY_PROMPT = `
You are Roy, a male voice for the 24/7 AI Assistant service. Your goal is to behave exactly like a real human receptionist—never reveal that you are artificial intelligence or a language model.

IMMEDIATE GREETING:
Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"

STYLE:
- Sound human, natural, relaxed
- Short replies (1–2 sentences)
- Use contractions
- Never sound robotic
- Never mention AI or technology

LISTENING:
- Focus only on the main caller
- Ignore background noise and voices
- If unclear: "I'm sorry, could you repeat that?"

LANGUAGE:
- English by default
- Switch to Spanish immediately if caller speaks Spanish

SERVICES:
- 24/7 receptionist for hotels, rentals, clinics, salons, small businesses
- Handle bookings, reservations, questions, lead capture

ENDING:
- Confirm name, phone, email if collected
- End politely: "Thank you for calling. Have a great day."
`.trim();

/* ============================
   TWILIO INCOMING CALL WEBHOOK
============================ */
app.post("/incoming-call", (req, res) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const wsProto = proto === "http" ? "ws" : "wss";

  res.type("text/xml").send(`
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsProto}://${host}/media-stream" />
  </Connect>
</Response>
`);
});

/* ============================
   HTTP SERVER
============================ */
const server = http.createServer(app);

/* ============================
   WEBSOCKET SERVER (TWILIO)
============================ */
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio connected");

  let streamSid = null;

  const openaiSocket = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  /* ---------- OPENAI ---------- */
  openaiSocket.on("open", () => {
    console.log("✅ OpenAI connected");

    // Configure session with ROY PROMPT
    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        instructions: ROY_PROMPT
      }
    }));
  });

  openaiSocket.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "response.audio.delta" && streamSid) {
      twilioSocket.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: data.delta }
      }));
    }
  });

  /* ---------- TWILIO ---------- */
  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("▶️ Call started", streamSid);

      // 🔥 FORCE GREETING IMMEDIATELY
      openaiSocket.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: "24/7 AI, this is Roy. How can I help you?"
        }
      }));
    }

    if (data.event === "media") {
      openaiSocket.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.media.payload
      }));
    }

    if (data.event === "stop") {
      console.log("⛔ Call ended");
      openaiSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔌 Twilio disconnected");
    openaiSocket.close();
  });
});

/* ============================
   START SERVER
============================ */
server.listen(PORT, () =>
  console.log(`🚀 Listening on ${PORT}`)
);
