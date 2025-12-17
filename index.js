const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8080);
const OPENAI_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

/* ------------------------------------------------------------------ */
/* μ-LAW ENCODER (PCM16 -> G711 μ-law)                                  */
/* ------------------------------------------------------------------ */
function pcm16ToMulaw(pcm16) {
  const MULAW_MAX = 0x1fff;
  const BIAS = 33;
  const out = Buffer.alloc(pcm16.length / 2);

  for (let i = 0, j = 0; i < pcm16.length; i += 2, j++) {
    let sample = pcm16.readInt16LE(i);
    let sign = sample < 0 ? 0x80 : 0;
    if (sign) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;
    sample += BIAS;

    let exponent = 7;
    for (
      let expMask = 0x4000;
      (sample & expMask) === 0 && exponent > 0;
      exponent--, expMask >>= 1
    ) {}

    let mantissa = (sample >> (exponent + 3)) & 0x0f;
    out[j] = ~(sign | (exponent << 4) | mantissa);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* APP + TWIML                                                         */
/* ------------------------------------------------------------------ */
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.get("/", (_, res) => res.send("OK"));

app.all("/incoming-call", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsProto = proto === "http" ? "ws" : "wss";

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsProto}://${host}/media-stream" track="inbound_track"/>
  </Connect>
</Response>`);
});

/* ------------------------------------------------------------------ */
/* SERVER + WS                                                         */
/* ------------------------------------------------------------------ */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on", PORT));

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let latestTs = 0;
  let speaking = false;
  let greeted = false;

  let openaiReady = false;
  const oaiQueue = [];

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function sendToTwilio(obj) {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.send(JSON.stringify(obj));
    }
  }

  function sendToOpenAI(obj) {
    const msg = JSON.stringify(obj);
    if (openaiReady && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(msg);
    } else {
      oaiQueue.push(msg);
    }
  }

  function flushOpenAIQueue() {
    while (oaiQueue.length && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(oaiQueue.shift());
    }
  }

  function maybeGreet() {
    if (!greeted && streamSid && openaiReady) {
      greeted = true;
      sendToOpenAI({
        type: "response.create",
        response: {
          instructions: 'Say exactly: "24/7 AI, this is Roy. How can I help you?"',
          max_output_tokens: 80,
        },
      });
    }
  }

  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("✅ OpenAI WS connected");

    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
        temperature: 0.4,
        instructions: `
You are Roy, a professional voice receptionist for "24/7 AI Assistant".
Speak clearly, naturally, 1–2 sentences.
If unsure what the caller means, ask ONE clarification question instead of guessing.
If asked about the company, explain briefly then ask their business type.
Switch to Spanish if caller speaks Spanish.
`.trim(),
      },
    });

    flushOpenAIQueue();
    maybeGreet();
  });

  openaiSocket.on("message", (raw) => {
    // FIX: raw is a Buffer
    let evt;
    try {
      evt = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      console.error("❌ Failed to parse OpenAI event:", e);
      return;
    }

    // Barge-in: if caller speaks while assistant speaking, stop
    if (evt.type === "input_audio_buffer.speech_started" && speaking) {
      sendToOpenAI({ type: "response.cancel" });
      if (streamSid) sendToTwilio({ event: "clear", streamSid });
      speaking = false;
      return;
    }

    // End of caller turn -> commit + respond
    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
      sendToOpenAI({ type: "response.create" });
      return;
    }

    // Audio delta (beta or GA naming)
    if (
      (evt.type === "response.audio.delta" ||
        evt.type === "response.output_audio.delta") &&
      evt.delta &&
      streamSid
    ) {
      speaking = true;

      // OpenAI delta may be PCM16. We convert to μ-law to guarantee Twilio compatibility.
      const pcm = Buffer.from(evt.delta, "base64");

      // Guard: if PCM length is odd, it can't be int16 samples; drop to avoid noise
      if (pcm.length % 2 !== 0) {
        console.log("⚠️ Dropping audio delta with odd byte length:", pcm.length);
        return;
      }

      const mulaw = pcm16ToMulaw(pcm);

      sendToTwilio({
        event: "media",
        streamSid,
        media: { payload: mulaw.toString("base64") },
      });
      return;
    }

    if (evt.type === "response.done") {
      speaking = false;
      return;
    }

    if (evt.type === "error") {
      console.log("❌ OpenAI error:", evt);
    }
  });

  openaiSocket.on("close", (code, reason) => {
    console.log("❌ OpenAI WS closed", code, reason?.toString?.() || "");
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (e) => {
    console.log("❌ OpenAI WS error", e);
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  twilioSocket.on("message", (raw) => {
    // FIX: raw is a Buffer
    let data;
    try {
      data = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      console.error("❌ Failed to parse Twilio event:", e);
      return;
    }

    if (data.event === "start") {
      streamSid = data.start?.streamSid || null;
      console.log("🟢 Twilio start:", streamSid);
      maybeGreet();
      return;
    }

    if (data.event === "media") {
      const track = data.media?.track;

      // Accept both possibilities
      if (track !== "inbound_track" && track !== "inbound") return;

      if (typeof data.media?.timestamp === "number") {
        latestTs = data.media.timestamp;
      }

      const payload = data.media?.payload;
      if (!payload) return;

      // Twilio sends μ-law base64 already; OpenAI input buffer expects base64 audio bytes.
      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
      return;
    }

    if (data.event === "stop") {
      console.log("🔴 Twilio stop");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔴 Twilio WS closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => {
    console.log("❌ Twilio WS error", e);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});
