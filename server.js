import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

process.on("SIGTERM", () => console.error("🛑 SIGTERM received"));
process.on("uncaughtException", (e) => console.error("❌ uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("❌ unhandledRejection", e));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

// Must use the currently supported realtime endpoint
const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const app = express();
app.set("trust proxy", 1);

// Twilio webhook that returns TwiML
app.all("/twiml", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsScheme = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsScheme}://${host}/media`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track" />
  </Connect>
</Response>`;

  res.status(200).type("text/xml").send(twiml);
});

app.get("/", (_req, res) => res.send("Roy Realtime Bridge Running"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let openaiReady = false;
  let sessionUpdated = false;

  // Buffer any OpenAI audio until we have a streamSid
  const pendingAudioToTwilio = [];

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function sendToTwilio(base64Audio) {
    if (!streamSid) {
      pendingAudioToTwilio.push(base64Audio);
      return;
    }
    if (twilioSocket.readyState !== WebSocket.OPEN) return;

    twilioSocket.send(
      JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: base64Audio },
      })
    );
  }

  function flushPending() {
    if (!streamSid) return;
    while (pendingAudioToTwilio.length > 0) {
      sendToTwilio(pendingAudioToTwilio.shift());
    }
  }

  function maybeGreet() {
    if (!openaiReady || !sessionUpdated || !streamSid) return;

    console.log("🔊 Sending greeting via OpenAI");
    openaiSocket.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions:
            "Hi, this is Roy from 24/7 AI Assistant. How can I help you today?",
        },
      })
    );
  }

  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("✅ OpenAI WS connected");

    // Tell OpenAI about the audio formats and voice
    openaiSocket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: "alloy",
          modalities: ["audio"],
          // server_vad ensures OpenAI waits for end of user speech
          turn_detection: { type: "server_vad" },
        },
      })
    );
  });

  openaiSocket.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "error") {
      console.error("❌ OpenAI error", JSON.stringify(data, null, 2));
      return;
    }

    if (data.type === "session.updated") {
      sessionUpdated = true;
      console.log("✅ OpenAI session.updated");
      maybeGreet();
      flushPending();
      return;
    }

    if (data.type === "response.audio.delta" && data.delta) {
      // Forward any audio from OpenAI to Twilio
      sendToTwilio(data.delta);
    }
  });

  openaiSocket.on("close", (code, reason) => {
    console.error("❌ OpenAI WS closed", code, reason?.toString?.() || "");
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  });

  openaiSocket.on("error", (err) => {
    console.error("❌ OpenAI WS error", err);
  });

  twilioSocket.on("message", (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.event === "start") {
      streamSid = msg.start?.streamSid;
      console.log("🎙 Twilio stream started:", streamSid);
      flushPending();
      maybeGreet();
      return;
    }

    if (msg.event === "media") {
      const payload = msg.media?.payload;
      if (!payload) return;

      // Send caller audio to OpenAI
      if (
        openaiSocket.readyState === WebSocket.OPEN &&
        openaiReady
      ) {
        openaiSocket.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: payload,
          })
        );
      }
    }

    if (msg.event === "stop") {
      console.log("🛑 Twilio stream stopped");
      if (openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.close();
      }
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.close();
      }
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔌 Twilio WS closed");
    if (openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });

  twilioSocket.on("error", (err) => {
    console.error("❌ Twilio WS error", err);
    if (openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () =>
  console.log("📡 Listening on port", PORT)
);
