import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const ROY_PROMPT = `
You are Roy, a real human receptionist for 24/7 AI.
Never say you are an AI.
Speak naturally.
Keep replies short.
`;

const app = express();
app.set("trust proxy", 1);

app.all("/twiml", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const ws = proto === "http" ? "ws" : "wss";

  res.type("text/xml").send(
`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${ws}://${host}/media" track="inbound_track"/>
  </Connect>
</Response>`
  );
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilio) => {
  let streamSid = null;

  const openai = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  openai.on("open", () => {
    // configure session
    openai.send(JSON.stringify({
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

  openai.on("message", (msg) => {
    const evt = JSON.parse(msg);
    if (evt.type === "response.audio.delta" && streamSid) {
      twilio.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: evt.delta }
      }));
    }
  });

  twilio.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;

      // 🔥 IMMEDIATE GREETING – NO CONDITIONS
      openai.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: "24/7 AI, this is Roy. How can I help you?"
        }
      }));
    }

    if (data.event === "media") {
      if (data.media.track !== "inbound") return;

      openai.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.media.payload
      }));
    }
  });
});

server.listen(8080, "0.0.0.0", () => {
  console.log("Listening on 8080");
});
