import express from "express";
import bodyParser from "body-parser";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const app = express();
app.set("trust proxy", 1);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

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

app.get("/", (_req, res) => res.send("Roy server running."));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;

  // OpenAI state
  let openaiReady = false;
  let sessionUpdated = false;

  // Buffers
  const pendingToTwilio = []; // audio deltas waiting for streamSid
  const pendingToOpenAI = []; // inbound audio waiting for OpenAI WS open

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function trySendGreeting() {
    // Only greet when Twilio streamSid exists AND OpenAI session is updated
    if (!streamSid || !openaiReady || !sessionUpdated) return;

    console.log("🔊 Sending greeting (streamSid ready)");
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

  function flushPendingToTwilio() {
    if (!streamSid) return;
    while (pendingToTwilio.length) {
      const payload = pendingToTwilio.shift();
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload },
          })
        );
      }
    }
  }

  function flushPendingToOpenAI() {
    if (!openaiReady) return;
    while (pendingToOpenAI.length) {
      openaiSocket.send(JSON.stringify(pendingToOpenAI.shift()));
    }
  }

  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("✅ OpenAI WS connected");

    // Minimal safe session config
    openaiSocket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: "alloy",
          modalities: ["audio"],
        },
      })
    );

    flushPendingToOpenAI();
  });

  openaiSocket.on("message", (event) => {
    let data;
    try {
      data = JSON.parse(event);
    } catch {
      return;
    }

    if (data.type === "session.updated") {
      sessionUpdated = true;
      console.log("✅ OpenAI session.updated received");
      trySendGreeting();
      return;
    }

    if (data.type === "response.audio.delta" && data.delta) {
      // If we don't have streamSid yet, buffer it instead of dropping it
      if (!streamSid) {
        pendingToTwilio.push(data.delta);
        return;
      }

      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: data.delta },
          })
        );
      }
      return;
    }

    if (data.type === "error") {
      console.error("❌ OpenAI error:", data);
    }
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
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start?.streamSid || null;
      console.log("✅ Twilio start streamSid:", streamSid);

      // Now that streamSid exists, flush any buffered audio to Twilio
      flushPendingToTwilio();

      // Now greet (only once session.updated also arrived)
      trySendGreeting();
      return;
    }

    if (data.event === "media") {
      const payload = data.media?.payload;
      if (!payload) return;

      const append = { type: "input_audio_buffer.append", audio: payload };

      // If OpenAI not ready yet, buffer inbound audio
      if (!openaiReady || openaiSocket.readyState !== WebSocket.OPEN) {
        pendingToOpenAI.push(append);
        return;
      }

      openaiSocket.send(JSON.stringify(append));

      // Commit + response for each chunk (works, noisy but functional)
      openaiSocket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      openaiSocket.send(
        JSON.stringify({ type: "response.create", response: { modalities: ["audio"] } })
      );

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
server.listen(PORT, () => console.log(`✅ Roy listening on ${PORT}`));
