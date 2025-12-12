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

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const app = express();
app.set("trust proxy", 1);

app.get("/", (_req, res) => res.status(200).send("OK"));

app.all("/twiml", (req, res) => {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host).toString();
  const wsScheme = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsScheme}://${host}/media`;

  const twiml =
`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`;

  res.status(200).set("Content-Type", "text/xml").send(twiml);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;

  let openaiReady = false;
  let greeted = false;

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

    twilioSocket.send(JSON.stringify({
      event: "media",
      streamSid,
      media: { payload: base64Audio },
    }));
  }

  function flushToTwilio() {
    if (!streamSid) return;
    while (pendingAudioToTwilio.length) {
      sendToTwilio(pendingAudioToTwilio.shift());
    }
  }

  function greetNow() {
    if (!openaiReady || !streamSid || greeted) return;
    greeted = true;

    console.log("🔊 Greeting…");
    openaiSocket.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        // You wanted the exact line simple and human
        instructions: "24 7 this is Roy how can I help you?",
      },
    }));
  }

  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("✅ OpenAI WS connected");

    // Short style guidance only (not a huge prompt)
    const STYLE = [
      "You are Roy, a human phone receptionist.",
      "Sound natural, not robotic.",
      "Short 1–2 sentence replies.",
      "If caller speaks Spanish, reply in Spanish; otherwise English.",
      "Do not say you are an AI."
    ].join(" ");

    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",

        // If 'verse' errors in logs, change to 'alloy'
        voice: "verse",

        temperature: 0.6,
        turn_detection: { type: "server_vad" },
        instructions: STYLE,
      },
    }));

    // Do NOT wait for session.updated. It can lag or not appear in time.
    // We’ll greet as soon as Twilio streamSid exists.
    setTimeout(greetNow, 250);
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (evt.type === "error") {
      console.error("❌ OpenAI error:", JSON.stringify(evt, null, 2));
      return;
    }

    // optional: see session lifecycle
    if (evt.type === "session.updated" || evt.type === "session.created") {
      console.log("✅ OpenAI", evt.type);
      // if Twilio already started and we haven’t greeted, greet now
      greetNow();
      return;
    }

    if (evt.type === "response.audio.delta" && evt.delta) {
      sendToTwilio(evt.delta);
      return;
    }
  });

  openaiSocket.on("close", (code, reason) => {
    console.error("❌ OpenAI WS closed", code, reason?.toString?.() || "");
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (err) => {
    console.error("❌ OpenAI WS error", err);
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
      console.log("✅ Twilio stream started:", streamSid);
      flushToTwilio();
      // Greeting is keyed off having streamSid + OpenAI ready
      greetNow();
      return;
    }

    if (data.event === "media") {
      const payload = data.media?.payload;
      if (!payload) return;

      if (openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: payload,
        }));
      }
      return;
    }

    if (data.event === "stop") {
      console.log("🛑 Twilio stream stopped");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔌 Twilio WS closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (err) => {
    console.error("❌ Twilio WS error", err);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on port", PORT));
