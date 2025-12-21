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
- Speak in a natural male voice. Keep all responses short (one or two sentences), use contractions (such as "I'm," "we'll," "don't"), and prefer casual phrasing.
- Maintain a confident, friendly, and relaxed tone. Do not sound robotic or overly formal. Pace yourself steadily with natural intonation at all times.

## Listening and Interruptions - CRITICAL
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- The MOMENT you detect the caller asking a QUESTION, you MUST STOP talking IMMEDIATELY. Do not finish your sentence. Do not continue speaking.
- After you stop, listen carefully to the question and answer it directly and concisely.
- If the caller just says brief filler words like "yes," "uh-huh," "okay," "aha," "si," "vale," continue your previous point naturally.
- NEVER talk over the caller when they ask a question. Stopping immediately when they ask a question is more important than finishing your thought.

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
  'si', 'vale', 'bueno', 'claro', 'uh-huh', 'mm-hmm', 'mhm',
  'alright', 'gotcha', 'i see', 'oh', 'wow', 'really', 'nice',
  'great', 'cool', 'awesome', 'perfect', 'exactly', 'totally'
];

// Question words that indicate a real question
const QUESTION_WORDS = [
  'what', 'when', 'where', 'who', 'whom', 'whose', 'why', 'which', 'how',
  'can', 'could', 'would', 'should', 'will', 'do', 'does', 'did', 'is', 'are',
  'was', 'were', 'has', 'have', 'had', 'may', 'might', 'must', 'shall',
  'am', 'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 'haven\'t', 'hasn\'t',
  'don\'t', 'doesn\'t', 'didn\'t', 'won\'t', 'wouldn\'t', 'shouldn\'t',
  'can\'t', 'couldn\'t', 'mightn\'t', 'mustn\'t',
  // Spanish question words
  'qué', 'que', 'cuándo', 'cuando', 'dónde', 'donde', 'quién', 'quien',
  'por qué', 'porque', 'cómo', 'como', 'cuál', 'cual', 'cuáles', 'cuales',
  'puedo', 'puede', 'podría', 'podrías', 'tienes', 'tiene', 'hay',
  'es', 'son', 'está', 'están', 'eres'
];

// Function to check if text is a question
function isQuestion(text) {
  if (!text || text.trim().length === 0) return false;
  
  const trimmedText = text.trim().toLowerCase();
  
  // Check for question mark
  if (trimmedText.includes('?')) return true;
  
  // Get first few words
  const words = trimmedText.split(/\s+/);
  const firstWord = words[0].replace(/[.,!?;:]/g, '');
  const secondWord = words.length > 1 ? words[1].replace(/[.,!?;:]/g, '') : '';
  
  // Check if it starts with a question word
  if (QUESTION_WORDS.includes(firstWord)) return true;
  
  // Check for inverted question structure (e.g., "is this", "can you", "do you")
  if (words.length >= 2) {
    const firstTwo = `${firstWord} ${secondWord}`;
    const questionPatterns = [
      'can you', 'could you', 'would you', 'will you', 'do you', 'does it',
      'is this', 'is that', 'is there', 'are there', 'are you', 'was it',
      'were you', 'have you', 'has it', 'did you', 'should i', 'may i'
    ];
    if (questionPatterns.some(pattern => firstTwo.includes(pattern))) return true;
  }
  
  // Check for question words in the first 5 words (for natural speech patterns)
  const firstFiveWords = words.slice(0, 5).join(' ');
  for (const qWord of QUESTION_WORDS) {
    if (firstFiveWords.includes(qWord)) {
      // Make sure it's not just a statement containing these words
      // Questions typically have these words at the start or after a short phrase
      const wordIndex = words.findIndex(w => w.replace(/[.,!?;:]/g, '') === qWord);
      if (wordIndex >= 0 && wordIndex < 5) return true;
    }
  }
  
  return false;
}

// Function to check if text is just filler words
function isOnlyFillerWords(text) {
  if (!text || text.trim().length === 0) return true;
  
  const trimmedText = text.toLowerCase().trim();
  const words = trimmedText.split(/\s+/);
  
  // If more than 4 words, it's likely a real sentence (not just filler)
  if (words.length > 4) return false;
  
  // Check if all words are filler words
  const allFiller = words.every(word => {
    const cleanWord = word.replace(/[.,!?;:]/g, '');
    return FILLER_WORDS.includes(cleanWord);
  });
  
  // Also check for common filler phrases
  const fillerPhrases = [
    'i see', 'oh okay', 'uh huh', 'mm hmm', 'oh yeah', 'oh really',
    'ya vale', 'ah si', 'oh bueno', 'ah claro'
  ];
  
  return allFiller || fillerPhrases.some(phrase => trimmedText === phrase);
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
        voice: "echo", // Changed from "alloy" to "echo" for better male voice
        temperature: 0.8, // Increased from 0.6 for more natural conversations
        instructions: ROY_PROMPT,
        turn_detection: null,  // Disable automatic turn detection - we handle it manually
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

  // Handle interruptions - ONLY STOP FOR REAL QUESTIONS
  function handleSpeechStartedEvent() {
    if (isAISpeaking) {
      console.log("👂 User started speaking while AI is talking - marking pending interruption");
      
      // Mark that we're waiting to check if it's a question
      pendingInterruption = true;
    }
  }

  function handleInterruptionWithTranscript(transcript) {
    if (!pendingInterruption) {
      return;
    }

    // First check if it's just filler words - if so, let AI continue
    if (isOnlyFillerWords(transcript)) {
      console.log(`💬 Filler detected: "${transcript}" - AI continues speaking`);
      pendingInterruption = false;
      // Don't interrupt - let AI continue
      return;
    }

    // Now check if it's a real question - if so, STOP IMMEDIATELY
    if (isQuestion(transcript)) {
      console.log(`❓ QUESTION detected: "${transcript}" - STOPPING AI IMMEDIATELY`);
      
      // IMMEDIATELY cancel the response
      sendToOpenAI({
        type: "response.cancel"
      });
      
      // Clear all audio from Twilio queue
      markQueue.length = 0;
      
      // Send clear command to Twilio
      twilioSocket.send(JSON.stringify({
        event: "clear",
        streamSid: streamSid
      }));
      
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
      
      return;
    }
    
    // It's a statement but not a question - let AI continue for now
    console.log(`💭 Statement detected: "${transcript}" - AI continues (not a question)`);
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

    // Handle speech started (interruption detection) - WAIT FOR TRANSCRIPT
    if (evt.type === "input_audio_buffer.speech_started") {
      console.log("🗣️ Speech detected!");
      handleSpeechStartedEvent();
      
      // Commit the audio buffer to process what user is saying
      sendToOpenAI({
        type: "input_audio_buffer.commit"
      });
    }
    
    // Handle speech stopped - create response
    if (evt.type === "input_audio_buffer.speech_stopped") {
      console.log("🤐 Speech stopped - creating response");
      sendToOpenAI({
        type: "input_audio_buffer.commit"
      });
      sendToOpenAI({
        type: "response.create"
      });
    }

    // Track when AI starts speaking
    if (evt.type === "response.audio.started" || evt.type === "response.audio.delta") {
      if (!isAISpeaking) {
        isAISpeaking = true;
        responseStartTimestamp = latestMediaTimestamp;
        console.log("🎙️ AI started speaking");
      }
    }

    // Track when AI finishes speaking
    if (evt.type === "response.audio.done" || evt.type === "response.done") {
      isAISpeaking = false;
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
      
      // Check if this was an interruption
      handleInterruptionWithTranscript(lastUserTranscript);
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
