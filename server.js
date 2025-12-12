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
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`);
});

app.get("/", (_req, res) => res.send("Tone test server running."));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("✅ Twilio WS connected");
  let streamSid = null;
  let interval = null;

  // 20ms @ 8kHz = 160 samples. Make a nasty square-ish pattern.
  // 0xFF is silence in μ-law; use alternating bytes to make audible buzzing.
  const frame = Buffer.alloc(160);
  for (let i = 0; i < 160; i++) frame[i] = (i % 2 === 0) ? 0x00 : 0x7F; // loud-ish alternation
  const payload = frame.toString("base64");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "start") {
      streamSid = data.start?.streamSid;
      console.log("🎧 start streamSid:", streamSid);

      // Send audio frames every 20ms
      interval = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN || !streamSid) return;

        ws.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload }
        }));
      }, 20);
    }

    if (data.event === "stop") {
      console.log("🛑 stop");
      if (interval) clearInterval(interval);
      interval = null;
      streamSid = null;
    }
  });

  ws.on("close", () => {
    console.log("🔌 Twilio WS closed");
    if (interval) clearInterval(interval);
  });

  ws.on("error", (e) => {
    console.error("❌ WS error:", e);
    if (interval) clearInterval(interval);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🔊 Tone test listening");
});
