import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

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
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("✅ Twilio connected");

  let streamSid = null;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("🎧 streamSid:", streamSid);

      // Play a continuous tone every 200ms
      const tone = Buffer.alloc(160, 0xff).toString("base64");

      const interval = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          clearInterval(interval);
          return;
        }

        ws.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: tone }
        }));
      }, 200);
    }
  });
});

server.listen(process.env.PORT || 3000, () =>
  console.log("🔊 Tone test server running")
);
