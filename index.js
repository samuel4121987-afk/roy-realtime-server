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

const ROY_PROMPT = `
You are Roy, a male voice receptionist for the 24/7 AI Assistant service.

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble): “24/7 AI, this is Roy. How can I help you?” Begin speaking as soon as the call starts.
- Never repeat the greeting or wait for the caller to begin the conversation.

## Tone and Style
- Speak in a natural male voice. Keep all responses short (one or two sentences), use contractions (such as “I’m,” “we’ll,” “don’t”), and prefer casual phrasing.
- Maintain a confident, friendly, and relaxed tone. Do not sound robotic or overly formal. Pace yourself steadily with natural intonation at all times.

## Listening and Interruptions
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- When the caller says filler words (e.g., “yes,” “uh-huh,” “okay,” “aha,” etc.) while you are speaking, do not pause—continue your response naturally.
- Only stop talking mid-sentence if the caller clearly asks a question. Promptly listen, then answer their question directly and succinctly.

## Language Adaptation
- Default to English for all interactions. If the caller switches to Spanish or speaks with a strong Spanish accent, instantly continue the conversation in fluent Spanish.

## Transparency
- If asked directly, be honest you’re the virtual receptionist for 24/7 AI.

Always follow these instructions for every call without exception.
`.trim();

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("OK"));

function twimlResponse(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsProto = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsProto}://${host}/media-stream`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`;
}

app.all("/incoming-call", (req, res) => {
  res.status(200).type("text/xml").send(twimlResponse(req));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;

  // OpenAI socket + queue
  let openaiOpen = false;
  const openaiQueue = [];
  let openaiSocket = null;

  // Debug / state
  let greetingIssued = false;
  let greetingRetryIssued = false;
  let gotAnyAudioDelta = false;
  let greetingWatchdog = null;

  function sendToOpenAI(obj) {
    const msg = JSON.stringify(obj);
    if (openaiOpen && openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(msg);
    } else {
      openaiQueue.push(msg);
    }
  }

  function flushOpenAIQueue() {
    if (!openaiSocket || openaiSocket.readyState !== WebSocket.OPEN) return;
    while (openaiQueue.length) {
      openaiSocket.send(openaiQueue.shift());
    }
  }

  function issueGreeting(label) {
    // 1) Your historically-working pattern: response.create directly
    console.log(`🎤 Greeting: issue (${label})`);

    greetingIssued = true;
    gotAnyAudioDelta = false;

    sendToOpenAI({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        temperature: 0,
        instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
        commit: true,
      },
    });

    // Watchdog: if OpenAI never emits audio, re-issue using "conversation item first"
    if (greetingWatchdog) clearTimeout(greetingWatchdog);
    greetingWatchdog = setTimeout(() => {
      if (gotAnyAudioDelta) return;
      if (greetingRetryIssued) return;

      greetingRetryIssued = true;
      console.log("🛟 No audio deltas seen. Retrying greeting via conversation.item.create + response.create");

      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Please greet the caller now." }],
        },
      });

      sendToOpenAI({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          temperature: 0,
          instructions: 'Say EXACTLY: "24/7 AI, this is Roy. How can I help you?"',
          commit: true,
        },
      });
    }, 1500);
  }

  function connectOpenAIIfNeeded() {
    if (openaiSocket && (openaiSocket.readyState === WebSocket.OPEN || openaiSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    openaiOpen = false;
    openaiSocket = new WebSocket(OPENAI_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiSocket.on("open", () => {
      openaiOpen = true;
      console.log("✅ OpenAI WS connected");

      sendToOpenAI({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: "alloy",
          temperature: 0.6,
          instructions: ROY_PROMPT,
          // keep these on; they should not prevent greeting
          turn_detection: {
            type: "server_vad",
            threshold: 0.78,
            prefix_padding_ms: 300,
            silence_duration_ms: 800,
          },
          input_audio_transcription: { model: "whisper-1" },
        },
      });

      flushOpenAIQueue();

      // If start already happened, issue greeting now
      if (streamSid && !greetingIssued) {
        issueGreeting("on_open");
      }
    });

    openaiSocket.on("message", (raw) => {
      let evt;
      try {
        evt = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (evt.type === "error") {
        console.error("❌ OpenAI error:", JSON.stringify(evt, null, 2));
        return;
      }

      // Helpful debug signals
      if (evt.type === "response.created") console.log("🟦 OpenAI response.created");
      if (evt.type === "response.audio.started") console.log("🟩 OpenAI response.audio.started");
      if (evt.type === "response.audio.done") console.log("🟥 OpenAI response.audio.done");
      if (evt.type === "response.done") console.log("⬛ OpenAI response.done");

      // Stream audio to Twilio
      if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
        gotAnyAudioDelta = true;

        if (twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.send(JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: evt.delta },
          }));
        }
      }
    });

    openaiSocket.on("close", (c, r) => {
      console.error("❌ OpenAI WS closed", c, r ? r.toString() : "");
      openaiOpen = false;
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    });

    openaiSocket.on("error", (e) => {
      console.error("❌ OpenAI WS error", e);
    });
  }

  // Twilio side
  let trackLogged = false;
  const isCallerAudio = (track) => track === "inbound" || track === "inbound_track";

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start && data.start.streamSid ? data.start.streamSid : null;
      console.log("▶️ Twilio start:", streamSid);

      // Connect to OpenAI immediately
      connectOpenAIIfNeeded();

      // If OpenAI already open, greet immediately here (your preferred behavior)
      if (openaiOpen && !greetingIssued) {
        issueGreeting("on_start");
      }

      return;
    }

    if (data.event === "media") {
      const track = data.media && data.media.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("ℹ️ Twilio media.track =", track || "(missing)");
      }

      if (!isCallerAudio(track)) return;

      const payload = data.media && data.media.payload;
      if (!payload) return;

      // Ensure OpenAI exists
      connectOpenAIIfNeeded();

      // Always forward caller audio (so transcription/turn-detect works later)
      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
      return;
    }

    if (data.event === "stop") {
      console.log("⛔ Twilio stop");
      if (greetingWatchdog) clearTimeout(greetingWatchdog);
      if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔌 Twilio WS closed");
    if (greetingWatchdog) clearTimeout(greetingWatchdog);
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    if (greetingWatchdog) clearTimeout(greetingWatchdog);
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("🚀 Listening on", PORT));
