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
  const MULAW_MAX = 0x1FFF;
  const BIAS = 33;
  const out = Buffer.alloc(pcm16.length / 2);

  for (let i = 0, j = 0; i < pcm16.length; i += 2, j++) {
    let sample = pcm16.readInt16LE(i);
    let sign = sample < 0 ? 0x80 : 0;
    if (sign) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;
    sample += BIAS;

    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

    let mantissa = (sample >> (exponent + 3)) & 0x0F;
    out[j] = ~(sign | (exponent << 4) | mantissa);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* APP + TWIML                                                        */
/* ------------------------------------------------------------------ */
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.get("/", (_, res) => res.send("OK"));

app.all("/incoming-call", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsProto = proto === "http" ? "ws" : "wss";

  res.type("text/xml").send(`
<Response>
  <Connect>
    <Stream url="${wsProto}://${host}/media-stream" track="inbound_track"/>
  </Connect>
</Response>
`);
});

/* ------------------------------------------------------------------ */
/* SERVER + SOCKETS                                                   */
/* ------------------------------------------------------------------ */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

server.listen(PORT, () => console.log("✅ Listening on", PORT));

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio connected");

  let streamSid = null;
  let latestTs = 0;
  let speaking = false;
  let greeted = false;

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  const sendToTwilio = (obj) => {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.send(JSON.stringify(obj));
    }
  };

  const sendToOpenAI = (obj) => {
    if (openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(JSON.stringify(obj));
    }
  };

  openaiSocket.on("open", () => {
    console.log("✅ OpenAI connected");

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
If unsure what the caller means, ask ONE clarification question.
If asked about the company, explain briefly then ask their business type.
Switch to Spanish if caller speaks Spanish.
`.trim(),
      },
    });
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try { evt = JSON.parse(raw); } catch { return; }

    if (evt.type === "input_audio_buffer.speech_started" && speaking) {
      sendToOpenAI({ type: "response.cancel" });
      sendToTwilio({ event: "clear", streamSid });
      speaking = false;
      return;
    }

    if (evt.type === "input_audio_buffer.speech_stopped") {
      sendToOpenAI({ type: "input_audio_buffer.commit" });
      sendToOpenAI({ type: "response.create" });
      return;
    }

    if (
      (evt.type === "response.audio.delta" ||
       evt.type === "response.output_audio.delta") &&
      evt.delta &&
      streamSid
    ) {
      speaking = true;

      const pcm = Buffer.from(evt.delta, "base64");
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
    }
  });

  twilioSocket.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      if (!greeted) {
        greeted = true;
        sendToOpenAI({
          type: "response.create",
          response: {
            instructions: 'Say exactly: "24/7 AI, this is Roy. How can I help you?"',
          },
        });
      }
      return;
    }

    if (data.event === "media") {
      if (data.media.track !== "inbound_track") return;
      latestTs = data.media.timestamp;
      sendToOpenAI({
        type: "input_audio_buffer.append",
        audio: data.media.payload,
      });
    }
  });

  twilioSocket.on("close", () => openaiSocket.close());
  openaiSocket.on("close", () => twilioSocket.close());
});
