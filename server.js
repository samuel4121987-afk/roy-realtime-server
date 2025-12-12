import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

/* ====== SAFETY LOGGING ====== */
process.on("SIGTERM", () => console.error("🛑 SIGTERM received"));
process.on("SIGINT", () => console.error("🛑 SIGINT received"));
process.on("uncaughtException", (e) => console.error("❌ uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("❌ unhandledRejection", e));

/* ====== APP ====== */
const app = express();
app.set("trust proxy", 1);

/* ====== TWIML ====== */
app.post("/twiml", (req, res) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const ws = proto === "http" ? "ws" : "wss";

  res.type("text/xml").send(`
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${ws}://${host}/media"/>
  </Connect>
</Response>`);
});

/* ====== SERVER ====== */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("✅ Twilio connected");
  let streamSid;
  let interval;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("🎧 streamSid:", streamSid);

      // 20ms audio frame, audible square-wave buzz
      const frame = Buffer.alloc(160);
      for (let i = 0; i < 160; i++) frame[i] = i % 2 ? 0x00 : 0x7f;
      const payload = frame.toString("base64");

      interval = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload }
        }));
      }, 20);
    }

    if (data.event === "stop") {
      console.log("🛑 stream stopped");
      clearInterval(interval);
    }
  });

  ws.on("close", () => clearInterval(interval));
});

/* ====== LISTEN ====== */
const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () =>
  console.log("✅ Listening on", PORT)
);
