import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

process.on("SIGTERM", () => console.error("🛑 SIGTERM received"));
process.on("uncaughtException", (e) => console.error("❌ uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("❌ unhandledRejection", e));

const app = express();
app.set("trust proxy", 1);

// Health check
app.get("/", (_req, res) => res.status(200).send("OK"));

// Twilio webhook (handle GET + POST)
app.all("/twiml", (req, res) => {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host).toString();
  const wsScheme = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsScheme}://${host}/media`;

  const twiml =
`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}"/>
  </Connect>
</Response>`;

  res.status(200);
  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("✅ Twilio WS connected");
  let streamSid = null;
  let interval = null;

  // Audible buzz (NOT silence)
  const frame = Buffer.alloc(160);
  for (let i = 0; i < 160; i++) frame[i] = (i % 2) ? 0x00 : 0x7f;
  const payload = frame.toString("base64");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "start") {
      streamSid = data.start?.streamSid;
      console.log("🎧 start streamSid:", streamSid);

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
    console.log("🔌 WS closed");
    if (interval) clearInterval(interval);
  });

  ws.on("error", (e) => {
    console.error("❌ WS error:", e);
    if (interval) clearInterval(interval);
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on", PORT));
