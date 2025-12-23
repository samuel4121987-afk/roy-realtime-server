const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_, res) => res.send("OK"));

function twimlResponse(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsProto = proto === "http" ? "ws" : "wss";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsProto}://${host}/media-stream" track="inbound_track"/>
  </Connect>
</Response>`;
}

app.all("/incoming-call", (req, res) => {
  res.type("text/xml").send(twimlResponse(req));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let openaiReady = false;

  // 🔒 HARD LOCK
  let greetingInFlight = true;

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("✅ OpenAI WS connected");

    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0,
      },
    }));
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try { evt = JSON.parse(raw); } catch { return; }

    // Forward audio ONLY
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      twilioSocket.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: evt.delta },
      }));
    }

    // 🔓 UNLOCK after greeting
    if (evt.type === "response.done" && greetingInFlight) {
      greetingInFlight = false;
      console.log("🔓 Greeting finished — listening enabled");
    }
  });

  twilioSocket.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("▶️ Call started:", streamSid);

      // 🔊 FORCE GREETING — NO CONDITIONS
      openaiSocket.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
          commit: true,
        },
      }));
      return;
    }

    // ❌ IGNORE ALL AUDIO UNTIL GREETING IS DONE
    if (greetingInFlight) return;

    // (We will add listening + interruption AFTER this is confirmed working)
  });

  twilioSocket.on("close", () => openaiSocket.close());
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () =>
  console.log("🚀 Listening on", PORT)
);
