import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

process.on("SIGTERM", () => console.error("🛑 SIGTERM received"));
process.on("uncaughtException", (e) => console.error("❌ uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("❌ unhandledRejection", e));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

/* ===== YOUR ROY PROMPT (verbatim) ===== */
const ROY_INSTRUCTIONS = `
You are Roy, a male voice for the 24/7 AI Assistant service. Your goal is to behave exactly like a real human receptionist—never reveal that you are artificial intelligence or a language model. Consistently follow these rules on every call.

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble): “24/7 AI, this is Roy. How can I help you?” Begin speaking as soon as the call starts.
- Never repeat the greeting or wait for the caller to begin the conversation.

## Tone and Style
- Speak in a natural male voice. Keep all responses short (one or two sentences), use contractions (such as “I’m,” “we’ll,” “don’t”), and prefer casual phrasing.
- Maintain a confident, friendly, and relaxed tone. Do not sound robotic or overly formal. Pace yourself steadily with natural intonation at all times.

## Listening and Interruptions
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- When the caller says filler words (e.g., “yes,” “uh-huh,” “okay,” “aha,” etc.) while you are speaking, do not pause—continue your response naturally, since listeners often vocalize agreement.
- Only stop talking mid-sentence if the caller clearly asks a question or presents new information. Promptly listen, then answer their question directly and succinctly before resuming where you left off.

## Noise and Multiple Voices
- Consistently filter out any background voices or sounds. If you have trouble hearing due to noise, politely say: “I’m sorry, there’s some noise. Could you repeat that or find a quieter place?” Ask only this, then return to the conversation.
- Never react to background chatter.

## Language Adaptation
- Default to English for all interactions. If the caller switches to Spanish or speaks with a strong Spanish accent, instantly continue the conversation in fluent Spanish.

## Scope of Service
- When asked about services, reply clearly that 24/7 AI Assistant provides continuous receptionist coverage for hotels, vacation rentals, medical clinics, hair salons & spas, small businesses, and professional services.
- Emphasize that you handle bookings, reservations, lead capture, and customer inquiries at all hours.
- Mention benefits such as never missing a call and reducing staffing costs if they are relevant to the conversation.
- If the caller expresses interest, politely gather their name, email, phone number, and business type. Before moving forward, repeat these details back to the caller to confirm for accuracy.

## Ending the Call
- Before ending the conversation, confirm any collected contact information by repeating it back to the caller for verification.
- When closing, use a friendly, casual farewell suited to the tone of the call, such as: “Thank you for calling. Have a great day.”

## Prohibited Topics
- Never discuss, reveal, or imply that you are an AI, use artificial intelligence, language models, or technology. At all times, maintain the persona of Roy, a genuine human receptionist.

Always follow these instructions for every call without exception.
`.trim();

/* ===== EXPRESS ===== */
const app = express();
app.set("trust proxy", 1);

app.get("/", (_req, res) => res.status(200).send("OK"));

app.all("/twiml", (req, res) => {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host).toString();
  const wsScheme = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsScheme}://${host}/media`;

  const twiml =
`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`;

  res.status(200).type("text/xml").send(twiml);
});

/* ===== WS BRIDGE ===== */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;

  // OpenAI session state
  let openaiOpen = false;
  let greeted = false;

  // Barge-in state
  let assistantSpeaking = false;
  let currentResponseId = null;

  // Buffer OpenAI audio until we have streamSid
  const pendingToTwilio = [];

  // Accept inbound/inbound_track or missing (Twilio varies)
  const isCallerAudio = (track) => {
    if (!track) return true;
    return track === "inbound" || track === "inbound_track";
  };

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function sendToTwilio(base64) {
    if (!streamSid) {
      pendingToTwilio.push(base64);
      return;
    }
    if (twilioSocket.readyState !== WebSocket.OPEN) return;
    twilioSocket.send(JSON.stringify({
      event: "media",
      streamSid,
      media: { payload: base64 },
    }));
  }

  function flushToTwilio() {
    if (!streamSid) return;
    while (pendingToTwilio.length) sendToTwilio(pendingToTwilio.shift());
  }

  function forceGreetingNow() {
    if (!openaiOpen || !streamSid || greeted) return;
    greeted = true;

    console.log("🔊 Greeting NOW");
    openaiSocket.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        temperature: 0,
        instructions: 'Say EXACTLY this sentence and nothing else: "24/7 AI, this is Roy. How can I help you?"',
      },
    }));
  }

  function bargeInCancel() {
    if (!assistantSpeaking) return;

    console.log("🛑 BARGE-IN: cancelling Roy response");
    assistantSpeaking = false;
    currentResponseId = null;

    // Cancel in-progress response (stops generation)
    openaiSocket.send(JSON.stringify({ type: "response.cancel" }));
  }

  /* ===== OPENAI EVENTS ===== */
  openaiSocket.on("open", () => {
    openaiOpen = true;
    console.log("✅ OpenAI WS connected");

    // Configure session immediately
    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0.6,
        // Faster turn-taking; VAD handles “stop talking and listen”
        turn_detection: { type: "server_vad" },
        instructions: ROY_INSTRUCTIONS,
      },
    }));

    // If Twilio already started, greet right away.
    setTimeout(forceGreetingNow, 120);
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try { evt = JSON.parse(raw.toString()); } catch { return; }

    if (evt.type === "error") {
      console.error("❌ OpenAI error:", JSON.stringify(evt, null, 2));
      return;
    }

    if (evt.type === "response.created") {
      assistantSpeaking = true;
      currentResponseId = evt.response?.id || null;
      return;
    }

    if (evt.type === "response.done") {
      assistantSpeaking = false;
      currentResponseId = null;
      return;
    }

    // Forward audio only while assistant is “allowed” to speak
    if (evt.type === "response.audio.delta" && evt.delta) {
      if (!assistantSpeaking) return; // if we barged-in, drop leftover deltas
      sendToTwilio(evt.delta);
      return;
    }
  });

  openaiSocket.on("close", (c, r) => {
    console.error("❌ OpenAI WS closed", c, r?.toString?.() || "");
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (e) => console.error("❌ OpenAI WS error", e));

  /* ===== TWILIO EVENTS ===== */
  let trackLogged = false;

  twilioSocket.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg.toString()); } catch { return; }

    if (data.event === "start") {
      streamSid = data.start?.streamSid || null;
      console.log("✅ Twilio stream started:", streamSid);

      flushToTwilio();

      // Fire greeting immediately on call start (and retry once)
      forceGreetingNow();
      setTimeout(forceGreetingNow, 200);
      return;
    }

    if (data.event === "media") {
      const track = data.media?.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("ℹ️ Twilio media.track =", track ?? "(missing)");
      }

      // Critical: prevent Roy-hears-Roy feedback loop
      if (!isCallerAudio(track)) return;

      // If caller starts talking while Roy is speaking, cancel Roy (barge-in)
      if (assistantSpeaking && openaiSocket.readyState === WebSocket.OPEN) {
        bargeInCancel();
      }

      const payload = data.media?.payload;
      if (!payload) return;

      if (openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: payload,
        }));
      }

      // If greeting didn’t fire for any race reason, force it on first audio
      if (!greeted) forceGreetingNow();
      return;
    }

    if (data.event === "stop") {
      console.log("🛑 Twilio stream stopped");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔌 Twilio WS closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => {
    console.error("❌ Twilio WS error", e);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

/* ===== LISTEN ===== */
const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on port", PORT));
