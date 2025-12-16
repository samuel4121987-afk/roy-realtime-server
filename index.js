const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

// NOTE: You are using the older beta-style model name.
// Keep it if it works in your account, but the audio config below uses GA-safe shapes.
const OPENAI_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const PORT = Number(process.env.PORT || 8080);

// Keep it short; phone audio + long prompts = more misfires.
const ROY_PROMPT = `
You are Roy, a voice receptionist for "24/7 AI Assistant".
Speak naturally, quick pace, concise (1–2 sentences).
If unsure what the caller meant, ask one short clarification question instead of guessing.
If asked "tell me about your company", explain briefly what you do and ask what business they run.

Company: 24/7 call answering for hotels, vacation rentals, clinics, salons/spas, and small businesses—bookings, reservations, and lead capture.
Language: default English; if caller speaks Spanish, switch to Spanish.
`.trim();

// --- Express + TwiML ---
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

server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on", PORT));

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let latestMediaTimestamp = 0;

  // Assistant tracking for barge-in truncation
  let isAssistantSpeaking = false;
  let lastAssistantItemId = null;
  let assistantAudioStartTs = null;

  // Greeting only once
  let openaiReady = false;
  let greeted = false;

  function twilioSend(obj) {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.send(JSON.stringify(obj));
    }
  }

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      // Keep this header if your account relies on beta behavior.
      // Docs say GA does not require it, but keeping it can preserve beta behavior.  [oai_citation:1‡OpenAI Platform](https://platform.openai.com/docs/guides/realtime)
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function oaiSend(obj) {
    if (openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(JSON.stringify(obj));
    }
  }

  function maybeGreet() {
    if (!greeted && openaiReady && streamSid) {
      greeted = true;
      oaiSend({
        type: "response.create",
        response: {
          instructions:
            'Greet exactly with: "24/7 AI, this is Roy. How can I help you?"',
          max_output_tokens: 80,
        },
      });
    }
  }

  function bargeInStop() {
    // Stop generation
    oaiSend({ type: "response.cancel" });

    // Flush Twilio queued audio
    if (streamSid) twilioSend({ event: "clear", streamSid });

    // Truncate assistant item to what caller actually heard
    if (lastAssistantItemId && assistantAudioStartTs != null) {
      const audio_end_ms = Math.max(0, latestMediaTimestamp - assistantAudioStartTs);
      oaiSend({
        type: "conversation.item.truncate",
        item_id: lastAssistantItemId,
        content_index: 0,
        audio_end_ms,
      });
    }

    isAssistantSpeaking = false;
    lastAssistantItemId = null;
    assistantAudioStartTs = null;
  }

  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("✅ OpenAI WS connected");

    // CRITICAL: Configure μ-law using GA-safe session.audio shape.
    // If you send PCM16 to Twilio you will hear loud static.  [oai_citation:2‡OpenAI Platform](https://platform.openai.com/docs/guides/realtime)
    oaiSend({
      type: "session.update",
      session: {
        type: "realtime",
        // Audio config moved here in GA
        audio: {
          input: { format: "g711_ulaw" },
          output: { format: "g711_ulaw", voice: "alloy" },
        },
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
        temperature: 0.3, // reduce “guessing”
        instructions: ROY_PROMPT,
      },
    });

    maybeGreet();
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Barge-in: if user speaks while assistant speaking, stop immediately
    if (evt.type === "input_audio_buffer.speech_started") {
      if (isAssistantSpeaking) bargeInStop();
      return;
    }

    // End of user turn: commit + respond (one response per turn)
    if (evt.type === "input_audio_buffer.speech_stopped") {
      oaiSend({ type: "input_audio_buffer.commit" });
      oaiSend({
        type: "response.create",
        response: { max_output_tokens: 140 },
      });
      return;
    }

    // Handle BOTH beta and GA audio delta event names
    const isAudioDelta =
      (evt.type === "response.audio.delta" || evt.type === "response.output_audio.delta") &&
      evt.delta &&
      streamSid;

    if (isAudioDelta) {
      if (!isAssistantSpeaking) {
        isAssistantSpeaking = true;
        assistantAudioStartTs = latestMediaTimestamp;
      }
      if (evt.item_id) lastAssistantItemId = evt.item_id;

      // evt.delta MUST be base64 g711_ulaw bytes for Twilio
      twilioSend({
        event: "media",
        streamSid,
        media: { payload: evt.delta },
      });
      return;
    }

    // Done events (both beta and GA patterns)
    if (
      evt.type === "response.audio.done" ||
      evt.type === "response.output_audio.done" ||
      evt.type === "response.done"
    ) {
      isAssistantSpeaking = false;
      lastAssistantItemId = null;
      assistantAudioStartTs = null;
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

  // --- Twilio inbound ---
  let trackLogged = false;

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
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

      if (!trackLogged) {
        trackLogged = true;
        console.log("📞 Twilio media.track =", track || "(missing)");
      }

      // inbound only
      if (track !== "inbound" && track !== "inbound_track") return;

      if (typeof data.media?.timestamp === "number") {
        latestMediaTimestamp = data.media.timestamp;
      }

      const payload = data.media?.payload;
      if (!payload) return;

      // forward to OpenAI audio input buffer
      oaiSend({ type: "input_audio_buffer.append", audio: payload });
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
