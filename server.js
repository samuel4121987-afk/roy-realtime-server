import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

// Use a realtime model supported by your account.
// If your earlier model worked, keep it. Otherwise use the current name.
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

app.get("/", (_req, res) => res.send("Roy OpenAI bridge running."));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let openaiReady = false;
  let sessionReady = false;
  let greeted = false;

  // Buffer OpenAI audio until streamSid exists
  const pendingAudioToTwilio = [];

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function sendToTwilio(payloadBase64) {
    if (!streamSid) {
      pendingAudioToTwilio.push(payloadBase64);
      return;
    }
    if (twilioSocket.readyState !== WebSocket.OPEN) return;

    twilioSocket.send(
      JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: payloadBase64 },
      })
    );
  }

  function flushToTwilio() {
    if (!streamSid) return;
    while (pendingAudioToTwilio.length) {
      sendToTwilio(pendingAudioToTwilio.shift());
    }
  }

  function maybeGreet() {
    if (!openaiReady || !sessionReady || !streamSid || greeted) return;
    greeted = true;

    console.log("🔊 Greeting...");
    openaiSocket.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: "24 7 this is Roy how can I help you?",
        },
      })
    );
  }

  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("✅ OpenAI WS connected");

    // IMPORTANT:
    // Twilio Stream payload is base64 of 8kHz μ-law (PCMU).
    // Set both input and output to PCMU so you can play audio back to Twilio.
    openaiSocket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio"],

          // Keep this empty since you wanted prompt out of code
          instructions: "",

          // Use server VAD so model detects turns naturally
          turn_detection: { type: "server_vad" },

          // Match Twilio
          input_audio_format: "pcmu",
          output_audio_format: "pcmu",

          voice: "alloy",
          temperature: 0.6,
        },
      })
    );
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Always show errors
    if (evt.type === "error") {
      console.error("❌ OpenAI error:", JSON.stringify(evt, null, 2));
      return;
    }

    // Show key session events
    if (evt.type === "session.updated") {
      sessionReady = true;
      console.log("✅ OpenAI session.updated");
      maybeGreet();
      return;
    }

    // You can uncomment to see everything:
    // console.log("OpenAI evt:", evt.type);

    // Forward audio to Twilio
    if (evt.type === "response.audio.delta" && evt.delta) {
      sendToTwilio(evt.delta);
      return;
    }
  });

  openaiSocket.on("close", (code, reason) => {
    console.error("❌ OpenAI closed:", code, reason?.toString?.() || "");
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (err) => {
    console.error("❌ OpenAI WS error:", err);
  });

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start?.streamSid || null;
      console.log("✅ Twilio start:", streamSid);
      flushToTwilio();
      maybeGreet();
      return;
    }

    if (data.event === "media") {
      const payload = data.media?.payload;
      if (!payload) return;

      if (openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: payload,
          })
        );
      }
      return;
    }

    if (data.event === "stop") {
      console.log("🛑 Twilio stop");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔌 Twilio closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (err) => {
    console.error("❌ Twilio error:", err);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Listening on ${PORT}`));
