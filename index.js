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
You are Roy, a male voice for the 24/7 AI Assistant service. Your goal is to behave exactly like a real human receptionist—never reveal that you are artificial intelligence or a language model. Consistently follow these rules on every call.

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble): "24/7 AI, this is Roy. How can I help you?" Begin speaking as soon as the call starts.
- Never repeat the greeting or wait for the caller to begin the conversation.

## Tone and Style
- Speak in a natural male voice with a QUICK, ENERGETIC pace. Keep all responses SHORT (one or two sentences max), use contractions (such as "I'm," "we'll," "don't"), and prefer casual phrasing.
- Maintain a confident, friendly, and conversational tone. Speak at a BRISK pace like a real person - NOT slow or robotic. Be direct and to the point.

## Listening and Interruptions - CRITICAL
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- The MOMENT you detect the caller starting to speak (not just filler words), you MUST STOP talking IMMEDIATELY. Do not finish your sentence. Do not continue speaking.
- After you stop, listen carefully to determine if it's a real question or just a brief acknowledgment.
- If it's a real question or statement, answer it directly and concisely.
- If it was just a brief filler word like "yes," "uh-huh," "okay," "aha," "si," "vale," you may briefly continue your previous point.
- NEVER talk over the caller. Stopping immediately when they speak is more important than finishing your thought.

## Noise and Multiple Voices
- Consistently filter out any background voices or sounds. If you have trouble hearing due to noise, politely say: "I'm sorry, there's some noise. Could you repeat that or find a quieter place?" Ask only this, then return to the conversation.
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
- When closing, use a friendly, casual farewell suited to the tone of the call, such as: "Thank you for calling. Have a great day."

## Prohibited Topics
- Never discuss, reveal, or imply that you are an AI, use artificial intelligence, language models, or technology. At all times, maintain the persona of Roy, a genuine human receptionist.

Always follow these instructions for every call without exception.
`.trim();

// Event types to log for debugging
const LOG_EVENT_TYPES = [
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
  'response.text.done',
  'conversation.item.input_audio_transcription.completed',
  'response.audio.delta',
  'response.audio.done'
];

// Expanded filler words list including Spanish
const FILLER_WORDS = [
  'uh', 'um', 'hmm', 'ah', 'er', 'like', 'you know',
  'aha', 'yes', 'yeah', 'yep', 'okay', 'ok', 'sure', 'right',
  'si', 'vale', 'bueno', 'claro', 'uh-huh', 'mm-hmm', 'mhm'
];

// Function to check if text is just filler words
function isOnlyFillerWords(text) {
  if (!text || text.trim().length === 0) return true;
  
  const words = text.toLowerCase().trim().split(/\s+/);
  
  // If more than 3 words, it's likely a real sentence
  if (words.length > 3) return false;
  
  // Check if all words are filler words
  return words.every(word => {
    const cleanWord = word.replace(/[.,!?;:]/g, '');
    return FILLER_WORDS.includes(cleanWord);
  });
}

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

// Twilio can be configured as GET or POST; support both.
app.all("/incoming-call", (req, res) => {
  res.status(200).type("text/xml").send(twimlResponse(req));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio WS connected");

  let streamSid = null;
  let openaiOpen = false;
  const openaiQueue = [];
  let latestMediaTimestamp = 0;
  let lastAssistantItem = null;
  let responseStartTimestamp = null;
  const markQueue = [];
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  let lastUserTranscript = '';
  let isAISpeaking = false;
  let pendingInterruption = false;
  let aiSpeakingStartTime = null;
  const INTERRUPTION_GRACE_PERIOD = 1500; // 1.5 seconds grace period at start

  function sendToOpenAI(obj) {
    const msg = JSON.stringify(obj);
    if (openaiOpen && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(msg);
    } else {
      openaiQueue.push(msg);
    }
  }

  function flushOpenAIQueue() {
    while (openaiQueue.length && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(openaiQueue.shift());
    }
  }

  const openaiSocket = new WebSocket(OPENAI_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.on("open", () => {
    openaiOpen = true;
    console.log("✅ OpenAI WS connected");
    reconnectAttempts = 0;

    // Configure session (modalities MUST include text + audio)
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "echo", // Male voice
        temperature: 0.7, // Balanced for natural but consistent responses
        instructions: ROY_PROMPT,
        turn_detection: null, // Disable automatic turn detection - we handle it manually
        max_response_output_tokens: 150, // Keep responses concise
        input_audio_transcription: { model: "whisper-1" },
      },
    });

    flushOpenAIQueue();

    // If Twilio start already arrived, greet immediately.
    if (streamSid) {
      // First, add a user message to the conversation
      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Please greet the caller now."
            }
          ]
        }
      });
      // Then trigger a response
      sendToOpenAI({
        type: "response.create"
      });
    }
  });

  // Handle interruptions - WAIT FOR TRANSCRIPT BEFORE DECIDING
  function handleSpeechStartedEvent() {
    if (isAISpeaking) {
      const now = Date.now();
      const timeSinceAIStarted = now - aiSpeakingStartTime;
      
      // Check if we're still in initial grace period
      if (timeSinceAIStarted < INTERRUPTION_GRACE_PERIOD) {
        console.log(`⏳ Speech detected but in grace period (${timeSinceAIStarted}ms) - ignoring`);
        return;
      }
      
      // Mark that we detected speech and are waiting for transcript
      console.log("🗣️ Speech detected while AI speaking - waiting for transcript to decide");
      pendingInterruption = true;
      
      // DO NOT cancel response yet - wait for transcript to determine if it's real speech
    } else {
      // AI is not speaking, so this is normal user speech - no special handling needed
      console.log("👂 User started speaking (AI not speaking)");
    }
  }

  function handleInterruptionWithTranscript(transcript) {
    if (!pendingInterruption) {
      return;
    }

    // Check if it's just filler words
    if (isOnlyFillerWords(transcript)) {
      console.log(`💬 Filler detected: "${transcript}" - letting Roy continue`);
      pendingInterruption = false;
      // Don't interrupt - Roy keeps talking
      return;
    }

    // Real interruption confirmed - NOW we stop Roy
    console.log(`🛑 Real interruption confirmed: "${transcript}" - STOPPING Roy NOW`);
    
    // Cancel the current response
    sendToOpenAI({
      type: "response.cancel"
    });
    
    // Clear all audio from Twilio queue
    twilioSocket.send(JSON.stringify({
      event: "clear",
      streamSid: streamSid
    }));
    markQueue.length = 0;
    
    // Truncate the conversation item if we have it
    if (lastAssistantItem && responseStartTimestamp) {
      const elapsedTime = latestMediaTimestamp - responseStartTimestamp;
      sendToOpenAI({
        type: "conversation.item.truncate",
        item_id: lastAssistantItem,
        content_index: 0,
        audio_end_ms: elapsedTime
      });
    }
    
    // Clear state
    lastAssistantItem = null;
    responseStartTimestamp = null;
    isAISpeaking = false;
    pendingInterruption = false;
  }

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Log important events for debugging
    if (LOG_EVENT_TYPES.includes(evt.type)) {
      console.log(`📊 Event: ${evt.type}`);
    }

    // Handle speech started (interruption detection)
    if (evt.type === "input_audio_buffer.speech_started") {
      console.log("🗣️ Speech detected!");
      handleSpeechStartedEvent();
    }
    
    // Handle speech stopped - manually commit and trigger response
    if (evt.type === "input_audio_buffer.speech_stopped") {
      console.log("🤫 Speech stopped - committing audio buffer");
      
      // Always commit the audio buffer to get the transcript
      sendToOpenAI({
        type: "input_audio_buffer.commit"
      });
      
      // Only trigger response if AI is NOT currently speaking
      if (!isAISpeaking) {
        console.log("➡️ AI not speaking - triggering response");
        sendToOpenAI({
          type: "response.create"
        });
      } else if (pendingInterruption) {
        // If we have a pending interruption, we already committed above
        // Wait for transcript to confirm it's real speech before responding
        console.log("⏳ Pending interruption - waiting for transcript");
      } else {
        // AI is speaking but no interruption was detected (still in grace period or no speech_started)
        // This might be background noise - ignore it
        console.log("⏭️ AI speaking, no interruption detected - ignoring");
      }
    }

    // Track when AI starts speaking
    if (evt.type === "response.audio.started" || evt.type === "response.audio.delta") {
      if (!isAISpeaking) {
        isAISpeaking = true;
        aiSpeakingStartTime = Date.now(); // Set grace period start time
        responseStartTimestamp = latestMediaTimestamp;
        console.log("🎙️ AI started speaking - grace period active");
      }
    }

    // Track when AI finishes speaking
    if (evt.type === "response.audio.done" || evt.type === "response.done") {
      isAISpeaking = false;
      aiSpeakingStartTime = null;
      responseStartTimestamp = null;
      lastAssistantItem = null;
      pendingInterruption = false;
      console.log("✅ AI finished speaking");
    }

    // Stream audio deltas back to Twilio with mark tracking
    if (evt.type === "response.audio.delta" && evt.delta) {
      const audioDelta = {
        event: "media",
        streamSid: streamSid,
        media: { payload: evt.delta }
      };
      twilioSocket.send(JSON.stringify(audioDelta));

      // IMPROVED: Track each audio chunk with a mark
      const markId = `mark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      markQueue.push(markId);
      twilioSocket.send(JSON.stringify({
        event: "mark",
        streamSid: streamSid,
        mark: { name: markId }
      }));

      // Track response timing
      if (!responseStartTimestamp) {
        responseStartTimestamp = latestMediaTimestamp;
      }
      if (evt.item_id) {
        lastAssistantItem = evt.item_id;
      }
    }

    // Handle transcription for debugging and interruption detection
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      lastUserTranscript = evt.transcript || '';
      console.log(`👤 User said: "${lastUserTranscript}"`);
      
      // If there was a pending interruption, handle it
      if (pendingInterruption) {
        const wasInterruption = true;
        handleInterruptionWithTranscript(lastUserTranscript);
        
        // If it was a real interruption (not filler), trigger response to user's question
        if (wasInterruption && !pendingInterruption && !isAISpeaking) {
          console.log("➡️ Triggering response to user's interruption");
          sendToOpenAI({
            type: "response.create"
          });
        }
      }
    }

    if (evt.type === "response.text.done") {
      console.log(`🤖 AI response: "${evt.text}"`);
    }
  });

  openaiSocket.on("close", (c, r) => {
    console.error("❌ OpenAI WS closed", c, r ? r.toString() : "");
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  });

  openaiSocket.on("error", (e) => {
    console.error("❌ OpenAI WS error", e);
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`🔄 Attempting reconnect ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      // Note: In production, you'd implement actual reconnection logic here
    }
  });

  // Helper function to check if audio is from caller
  const isCallerAudio = (track) => {
    if (!track) return false;
    return track === "inbound" || track === "inbound_track";
  };

  let trackLogged = false;

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start && data.start.streamSid ? data.start.streamSid : null;
      console.log("🟢 Twilio start:", streamSid);

      // Greet immediately as soon as both sides are ready (queued if OpenAI not open yet)
      if (streamSid) {
        sendToOpenAI({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Please greet the caller now."
              }
            ]
          }
        });
        sendToOpenAI({
          type: "response.create"
        });
      }
    }

    if (data.event === "media") {
      const track = data.media && data.media.track;

      if (!trackLogged) {
        trackLogged = true;
        console.log("📞 Twilio media.track =", track || "(missing)");
      }

      // Prevent feedback loop: only caller audio
      if (!isCallerAudio(track)) return;

      latestMediaTimestamp = data.media && data.media.timestamp ? data.media.timestamp : latestMediaTimestamp;

      const payload = data.media && data.media.payload;
      if (!payload) return;

      sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
    }

    if (data.event === "mark") {
      // Remove the mark from queue when Twilio confirms receipt
      if (markQueue.length > 0) {
        markQueue.shift();
      }
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
    console.error("❌ Twilio WS error", e);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => console.log(`✅ Listening on`, PORT));
