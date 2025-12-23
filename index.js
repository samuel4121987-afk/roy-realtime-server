const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
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
  console.log("Twilio connected");

  let streamSid = null;
  let openaiSocket = null;

  twilioSocket.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("Call started:", streamSid);

      // Connect to OpenAI ONLY after start
      openaiSocket = new WebSocket(OPENAI_URL, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      openaiSocket.on("open", () => {
        console.log("OpenAI connected");

        // Session config
        openaiSocket.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["audio", "text"],
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: "alloy",
            temperature: 0
          }
        }));

        // 🔑 CREATE A USER MESSAGE FIRST
        openaiSocket.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: "Please greet the caller now." }
            ]
          }
        }));

        // 🔊 THEN CREATE THE RESPONSE
        openaiSocket.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio"],
            instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
            commit: true
          }
        }));
      });

      openaiSocket.on("message", (raw) => {
        let evt;
        try { evt = JSON.parse(raw); } catch { return; }

        if (evt.type === "response.audio.delta" && evt.delta) {
          twilioSocket.send(JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: evt.delta }
          }));
        }
      });

      return;
    }

    if (data.event === "media") {
      if (!openaiSocket || openaiSocket.readyState !== WebSocket.OPEN) return;

      openaiSocket.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.media.payload
      }));
    }

    if (data.event === "stop") {
      console.log("Call ended");
      if (openaiSocket) openaiSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    if (openaiSocket) openaiSocket.close();
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () =>
  console.log("Listening on", PORT)
);
