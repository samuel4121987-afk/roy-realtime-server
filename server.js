import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

/* ===== SAFETY LOGS ===== */
process.on("SIGTERM", () => console.error("SIGTERM"));
process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

/* ===== CONFIG ===== */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

/* ===== APP ===== */
const app = express();
app.set("trust proxy", 1);

app.get("/", (_req, res) => res.status(200).send("OK"));

/* ===== TWIML ===== */
app.all("/twiml", (req, res) => {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host).toString();
  const ws = proto === "http" ? "ws" : "wss";
  const wsUrl = `${ws}://${host}/media`;

  const twiml =
`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`;

  res.status(200).type("text/xml").send(twiml);
});

/* ===== SERVER ===== */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  console.log("Twilio WS connected");

  let streamSid = null;
  let openaiReady = false;
  let greeted = false;

  // Buffer OpenAI audio until streamSid exists
  const pendingToTwilio = [];

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function sendToTwilio(base64) {
    if (!streamSid) {
      pendingToTwilio.push(base64);
      return;
    }
    if (twilioSocket.readyState !== WebSocket.OPEN) return;
    twilioSocket.send(JSON.stringify({
      event: "media",
      streamSid,
      media: { payload: base64 },
    }));
  }

  function flushToTwilio() {
    if (!streamSid) return;
    while (pendingToTwilio.length) sendToTwilio(pendingToTwilio.shift());
  }

  function forceGreeting() {
    if (!openaiReady || !streamSid || greeted) return;
    greeted = true;

    console.log("Greeting (forced exact)");
    openaiSocket.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        temperature: 0,
        instructions:
          "Say EXACTLY this sentence and nothing else: 24 7 this is Roy how can I help you?",
      },
    }));
  }

  /* ===== OPENAI ===== */
  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("OpenAI WS connected");

    // Hard constraints to stop role-slip and “fake caller” lines
    const STYLE =
      "You are Roy, the receptionist. You ONLY speak as Roy. " +
      "NEVER speak as the caller. NEVER say things like 'Hi Roy' or describe issues as if you are the caller. " +
      "Do NOT narrate. Do NOT add filler acknowledgements like 'Understood' repeatedly. " +
      "Short, natural 1–2 sentence replies. Sound human. " +
      "If caller speaks Spanish, reply in Spanish; otherwise English. " +
      "Never say you are an AI.";

    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],      // REQUIRED by your error log
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0.5,
        turn_detection: { type: "server_vad" },
        instructions: STYLE,
      },
    }));

    // Don’t wait on session.updated; just greet once streamSid exists
    setTimeout(forceGreeting, 250);
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try { evt = JSON.parse(raw.toString()); } catch { return; }

    if (evt.type === "error") {
      console.error("OpenAI error:", JSON.stringify(evt, null, 2));
      return;
    }

    if (evt.type === "session.updated" || evt.type === "session.created") {
      flushToTwilio();
      forceGreeting();
      return;
    }

    if (evt.type === "response.audio.delta" && evt.delta) {
      sendToTwilio(evt.delta);
      return;
    }
  });

  openaiSocket.on("close", (c, r) => {
    console.error("OpenAI closed", c, r?.toString?.() || "");
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (e) => console.error("OpenAI WS error", e));

  /* ===== TWILIO ===== */
  twilioSocket.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg.toString()); } catch { return; }

    if (data.event === "start") {
      streamSid = data.start?.streamSid || null;
      console.log("Twilio start", streamSid);
      flushToTwilio();
      forceGreeting();
      return;
    }

    if (data.event === "media") {
      // Critical: only inbound audio goes to OpenAI (prevents feedback loop)
      if (data.media?.track !== "inbound") return;

      if (openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        }));
      }
      return;
    }

    if (data.event === "stop") {
      console.log("Twilio stop");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("Twilio WS closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => {
    console.error("Twilio WS error", e);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

/* ===== LISTEN ===== */
const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("Listening on", PORT));
