/**
 * Minimal Twilio Media Streams <-> OpenAI Realtime voice agent (G.711 u-law)
 * - Reliable turn taking via server_vad
 * - Single greeting
 * - Fast barge-in (response.cancel + Twilio clear)
 * - One response per user turn: speech_stopped -> commit -> response.create
 */

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

// Keep this short + operational. Long prompts often degrade reliability on phone audio.
const ROY_PROMPT = `
You are Roy, a voice receptionist for "24/7 AI Assistant".
Speak naturally, quick pace, concise (1–2 sentences).
If the caller asks about the company, explain briefly what it does, then ask one clarifying question.

Company summary (use this if asked "what do you do?"):
We provide 24/7 call answering for hotels, vacation rentals, clinics, salons/spas, and small businesses—handling bookings, reservations, and lead capture.

Lead capture (if interested): ask name, phone, email, business type; repeat back to confirm.

Language: default English; if caller speaks Spanish, switch to Spanish.

Important: If you are unsure what the caller meant, ask a short clarification question instead of guessing.
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

// --- Server + WS ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on", PORT));

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let latestMediaTimestamp = 0;

  let openaiReady = false;
  let greeted = false;

  // Track assistant output to support truncate on barge-in
  let isAssistantSpeaking = false;
  let lastAssistantItemId = null;
  let assistantAudioStartTs = null; // Twilio media timestamp at first assistant audio

  function twilioSend(obj) {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.send(JSON.stringify(obj));
    }
  }

  // --- OpenAI WS ---
  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
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

      // Force the greeting deterministically (don’t rely on prompt alone).
      oaiSend({
        type: "response.create",
        response: {
          instructions:
            'Greet exactly with: "24/7 AI, this is Roy. How can I help you?"',
          // Keep phone responses short and stable
          max_output_tokens: 120,
        },
      });
    }
  }

  function bargeInStop() {
    // Cancel generation
    oaiSend({ type: "response.cancel" });

    // Clear queued audio on Twilio side (prevents talking over the caller)
    if (streamSid) twilioSend({ event: "clear", streamSid });

    // Truncate assistant item so conversation state matches what caller heard
    if (lastAssistantItemId && assistantAudioStartTs != null) {
      const audio_end_ms = Math.max(0, latestMediaTimestamp - assistantAudioStartTs);
      oaiSend({
        type: "conversation.item.truncate",
        item_id: lastAssistantItemId,
        content_index: 0,
        audio_end_ms,
      });
    }

    // Reset
    isAssistantSpeaking = false;
    lastAssistantItemId = null;
    assistantAudioStartTs = null;
  }

  openaiSocket.on("open", () => {
    openaiReady = true;
    console.log("✅ OpenAI WS connected");

    // Core session config
    oaiSend({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",

        // Pick a voice that works for your account/model
        voice: "alloy",

        // Most important: reliable turn-taking
        turn_detection: { type: "server_vad" },

        // Transcription helps debugging and improves intent tracking
        input_audio_transcription: { model: "whisper-1" },

        temperature: 0.4, // lower = less “creative guessing”
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

    // ----- User turn events (from server_vad) -----
    if (evt.type === "input_audio_buffer.speech_started") {
      // If assistant is speaking, stop immediately (barge-in)
      if (isAssistantSpeaking) {
        bargeInStop();
      }
      return;
    }

    if (evt.type === "input_audio_buffer.speech_stopped") {
      // Commit the user audio, then generate a response.
      oaiSend({ type: "input_audio_buffer.commit" });
      oaiSend({
        type: "response.create",
        response: {
          max_output_tokens: 180,
        },
      });
      return;
    }

    // Debug transcript (optional)
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const t = (evt.transcript || "").trim();
      if (t) console.log(`👤 User transcript: ${JSON.stringify(t)}`);
      return;
    }

    // ----- Assistant audio streaming -----
    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      // Mark assistant speaking once audio starts arriving
      if (!isAssistantSpeaking) {
        isAssistantSpeaking = true;
        assistantAudioStartTs = latestMediaTimestamp;
      }
      if (evt.item_id) lastAssistantItemId = evt.item_id;

      twilioSend({
        event: "media",
        streamSid,
        media: { payload: evt.delta },
      });
      return;
    }

    if (evt.type === "response.audio.done" || evt.type === "response.done") {
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

  // --- Twilio WS inbound ---
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

      // only caller audio
      if (track !== "inbound" && track !== "inbound_track") return;

      if (typeof data.media?.timestamp === "number") {
        latestMediaTimestamp = data.media.timestamp;
      }

      const payload = data.media?.payload;
      if (!payload) return;

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
