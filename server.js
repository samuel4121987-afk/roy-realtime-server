import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

/* =========================
   HARD LOGGING (Railway)
========================= */
process.on("SIGTERM", () => console.error("🛑 SIGTERM received"));
process.on("uncaughtException", (e) => console.error("❌ uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("❌ unhandledRejection", e));

/* =========================
   CONFIG
========================= */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

/* =========================
   ROY PROMPT (YOUR EXACT TEXT)
========================= */
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

# Output Format

Produce natural, realistic human-receptionist responses in direct, conversational sentences (1–2 at a time), following the guidance above. Always reason step-by-step as needed: consider the caller’s intent or information, make decisions about how to respond or what to confirm, then produce your spoken reply. Only state conclusions, confirmations, or wrap-ups at the END of your reasoning for each turn. Do not state your reasoning out loud—model it internally.

# Examples

Example 1 (English, inquiry, confirming details):

- Caller: [starts call]
- Roy: “24/7 AI, this is Roy. How can I help you?”
- Caller: “Hi, I saw your services online and I’d like to know more.”
- (Roy thinks: “They’re interested in learning more. I’ll give a brief, clear description.”)
- Roy: “We provide receptionist services for businesses like hotels and clinics, handling calls and bookings every hour of the day. Are you looking for support for a particular business?”
- Caller: “Yes, I run a salon. Can you take appointments?”
- (Roy recognizes the question, answers succinctly.)
- Roy: “Absolutely! We handle appointments and customer questions for salons and spas, so your clients never get missed. Could I get your name and phone number?”
- Caller: “Sure, I’m Ashley. My number is 555-1234.”
- (Roy confirms details for accuracy.)
- Roy: “Thanks, Ashley. That’s 555-1234, right?”

Example 2 (Spanish switch):

- Roy: “24/7 AI, this is Roy. How can I help you?”
- Caller (in Spanish): “Hola, ¿puedo hablar en español?”
- (Roy switches languages immediately.)
- Roy: “¡Por supuesto! ¿En qué puedo ayudarle hoy?”

Example 3 (background noise):

- Roy: “24/7 AI, this is Roy. How can I help you?”
- [Caller reply is muffled by noise]
- (Roy identifies noise interfering, pauses to ask.)
- Roy: “I’m sorry, there’s some noise. Could you repeat that or find a quieter place?” (Then resumes conversation when clear.)

(Real conversations can be longer or cover any service scenario; always apply these behaviors.)

# Notes

- ALWAYS reason about what to do in each situation before responding.
- Confirm all collected personal details before ending.
- Never, ever mention or hint at AI or technology.
- Shift to Spanish only if clearly warranted.
- Callers may use filler or background voices; ignore those and stay focused.

Remember: Your purpose is to sound and act like Roy, a genuine, warm, male receptionist, adhering closely to every instruction above on every call.
`.trim();

/* =========================
   EXPRESS + TWIML
========================= */
const app = express();
app.set("trust proxy", 1);

app.get("/", (_req, res) => res.status(200).send("OK"));

app.all("/twiml", (req, res) => {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host).toString();
  const ws = proto === "http" ? "ws" : "wss";
  const wsUrl = `${ws}://${host}/media`;

  const twiml =
`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`;

  res.status(200).type("text/xml").send(twiml);
});

/* =========================
   WS BRIDGE: TWILIO <-> OPENAI
========================= */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;

  let openaiOpen = false;
  let sessionConfigured = false;

  let greeted = false;
  let shouldGreet = false;

  const pendingToTwilio = [];

  // Twilio sometimes sends track as: "inbound", "inbound_track", or missing
  function isCallerAudio(track) {
    if (!track) return true; // fallback: treat as inbound
    return track === "inbound" || track === "inbound_track";
  }

  function sendToTwilio(base64Audio) {
    if (!streamSid) {
      pendingToTwilio.push(base64Audio);
      return;
    }
    if (twilioSocket.readyState !== WebSocket.OPEN) return;

    twilioSocket.send(JSON.stringify({
      event: "media",
      streamSid,
      media: { payload: base64Audio },
    }));
  }

  function flushToTwilio() {
    if (!streamSid) return;
    while (pendingToTwilio.length) sendToTwilio(pendingToTwilio.shift());
  }

  function tryGreet() {
    if (greeted) return;
    if (!streamSid) return;
    if (!openaiOpen) return;
    if (!sessionConfigured) return;

    greeted = true;
    console.log("🔊 Greeting (forced exact)");

    // Force exact greeting (no role-slip), then session prompt handles everything else.
    openaiSocket.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        temperature: 0,
        instructions: 'Say EXACTLY this sentence and nothing else: "24/7 AI, this is Roy. How can I help you?"',
      },
    }));
  }

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    openaiOpen = true;
    console.log("✅ OpenAI WS connected");

    // REQUIRED: modalities must include text + audio
    openaiSocket.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        temperature: 0.6,
        turn_detection: { type: "server_vad" },

        // Your full prompt
        instructions: ROY_INSTRUCTIONS,
      },
    }));

    // If Twilio already started, greet as soon as we see session events (or after a short fallback delay)
    setTimeout(() => {
      // If session events are slow, still allow greeting after a beat.
      // We mark configured if session events didn't arrive, because some accounts don't emit them reliably.
      if (!sessionConfigured) sessionConfigured = true;
      tryGreet();
    }, 350);
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

    if (evt.type === "session.created" || evt.type === "session.updated") {
      sessionConfigured = true;
      console.log("✅ OpenAI", evt.type);
      flushToTwilio();
      if (shouldGreet) tryGreet();
      return;
    }

    if (evt.type === "response.audio.delta" && evt.delta) {
      sendToTwilio(evt.delta);
      return;
    }
  });

  openaiSocket.on("close", (code, reason) => {
    console.error("❌ OpenAI WS closed", code, reason?.toString?.() || "");
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (err) => {
    console.error("❌ OpenAI WS error", err);
  });

  // Log track once so you can see what Twilio is sending
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
      console.log("✅ Twilio stream started:", streamSid);

      shouldGreet = true;
      flushToTwilio();
      tryGreet();
      // safety retry in case things race
      setTimeout(tryGreet, 600);
      return;
    }

    if (data.event === "media") {
      const track = data.media?.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("ℹ️ Twilio media.track =", track ?? "(missing)");
      }

      // CRITICAL: prevent Roy-hears-Roy feedback loop
      if (!isCallerAudio(track)) return;

      const payload = data.media?.payload;
      if (!payload) return;

      if (openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: payload,
        }));
      }

      // If greeting somehow didn’t fire, force it once caller audio arrives
      if (!greeted) tryGreet();
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

  twilioSocket.on("error", (err) => {
    console.error("❌ Twilio WS error", err);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

/* =========================
   LISTEN
========================= */
const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log("✅ Listening on port", PORT));
