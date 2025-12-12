import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

/**
 * REQUIREMENTS:
 * - Railway env var: OPENAI_API_KEY
 * - Twilio <Connect><Stream> to /media
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

// Use the current Realtime model name shown in the OpenAI WebSocket docs
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

// Twilio Media Streams is bidirectional when initiated with <Connect><Stream>
// Docs: you can send "media" back to Twilio to play into the call.  [oai_citation:2‡Twilio](https://www.twilio.com/docs/voice/media-streams/websocket-messages?utm_source=chatgpt.com)

const app = express();
app.set("trust proxy", 1);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio webhook -> TwiML
app.post("/twiml", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsScheme = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsScheme}://${host}/media`;

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`);
});

app.get("/", (_req, res) => res.send("Roy bridge running."));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let openaiReady = false;
  let sessionReady = false;

  // Buffer OpenAI audio until Twilio sends streamSid
  const pendingAudioToTwilio = [];

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function sendToTwilioMedia(base64Payload) {
    if (!streamSid) {
      pendingAudioToTwilio.push(base64Payload);
      return;
    }
    if (twilioSocket.readyState !== WebSocket.OPEN) return;

    twilioSocket.send(
      JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: base64Payload },
      })
    );
  }

  function flushPendingAudio() {
    if (!streamSid) return;
    while (pendingAudioToTwilio.length) {
      sendToTwilioMedia(pendingAudioToTwilio.shift());
    }
  }

  function maybeGreet() {
    if (!openaiReady || !sessionReady || !streamSid) return;
    console.log("🔊 Sending greeting");
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

    // IMPORTANT: Twilio audio is PCM u-law (pcmu).
    // Twilio + OpenAI tutorial explicitly switches formats to audio/pcmu for Twilio.  [oai_citation:3‡Twilio](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-node)
    openaiSocket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          // Minimal—no giant prompt
          instructions: "",
          // Audio formats for Twilio
          audio: {
            input: { format: { type: "audio/pcmu" } },
            output: { format: { type: "audio/pcmu" }, voice: "alloy" },
            input_turn_detection: { type: "server_vad" },
          },
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

    // Log the important stuff so we see what’s going on
    if (evt.type === "error") {
      console.error("❌ OpenAI error:", JSON.stringify(evt, null, 2));
      return;
    }
    if (evt.type === "session.created" || evt.type === "session.updated") {
      console.log("✅ OpenAI session event:", evt.type);
      if (evt.type === "session.updated") {
        sessionReady = true;
        maybeGreet();
      }
      return;
    }

    // Audio from OpenAI -> Twilio
    if (evt.type === "response.audio.delta" && evt.delta) {
      sendToTwilioMedia(evt.delta);
      return;
    }

    // If you want extra debug:
    // if (evt.type?.startsWith("input_audio_buffer.")) console.log("OpenAI:", evt.type);
  });

  openaiSocket.on("close", (code, reason) => {
    console.error("❌ OpenAI WS closed:", code, reason?.toString?.() || "");
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
      console.log("✅ Twilio start streamSid:", streamSid);
      flushPendingAudio();
      maybeGreet();
      return;
    }

    if (data.event === "media") {
      const payload = data.media?.payload;
      if (!payload) return;

      // Send audio to OpenAI
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
    console.log("🔌 Twilio WS closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (err) => {
    console.error("❌ Twilio WS error:", err);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Listening on ${PORT}`));
