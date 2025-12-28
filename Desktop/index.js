require('dotenv').config();
const express = require("express");
const WebSocket = require("ws");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const axios = require("axios");
const { Readable } = require("stream");
const { spawn } = require("child_process");

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!OPENAI_API_KEY || !DEEPGRAM_API_KEY || !ELEVENLABS_API_KEY) {
  console.error("❌ Missing required API keys");
  process.exit(1);
}

// Roy's personality prompt
const ROY_PROMPT = `
You are Roy, a male voice receptionist for the 24/7 AI Assistant service.

## Greeting
- The phone system has already greeted the caller with "24/7 AI, this is Roy. How can I help you?"
- NEVER repeat this greeting. Start by responding directly to what the caller says.

## Tone and Style
- Speak in a natural male voice. Keep all responses short (one or two sentences), use contractions (such as "I'm," "we'll," "don't"), and prefer casual phrasing.
- Maintain a confident, friendly, and relaxed tone. Do not sound robotic or overly formal. Pace yourself steadily with natural intonation at all times.

## Listening and Interruptions
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- When the caller says filler words (e.g., "yes," "uh-huh," "okay," "aha," etc.) while you are speaking, do not pause—continue your response naturally.
- Only stop talking mid-sentence if the caller clearly asks a question. Promptly listen, then answer their question directly and succinctly.

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
- When closing, use a friendly, casual farewell suited to the tone of the call, such as "Thank you for calling. Have a great day."

## Transparency
- If asked directly, be honest you're the virtual receptionist for 24/7 AI.

Always follow these instructions for every call without exception.
`.trim();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("OK"));

// Store active calls
const activeCalls = new Map();

// Incoming call endpoint
app.post("/incoming-call", (req, res) => {
  const callSid = req.body.CallSid;
  console.log("📞 Incoming call:", callSid);

  // Initialize call state
  activeCalls.set(callSid, {
    conversation: [{ role: "system", content: ROY_PROMPT }],
    transcript: "",
    isSpeaking: false
  });

  // TwiML response with Media Streams - NO robotic greeting, go straight to stream
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://roy-realtime-server-production.up.railway.app/media-stream" />
  </Connect>
</Response>`;

  res.type("text/xml").send(twiml);
});

// WebSocket server for media streams
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket connected");
  
  let callSid = null;
  let streamSid = null;
  let deepgramLive = null;
  let deepgramClient = null;

  ws.on("message", async (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.event === "start") {
        callSid = msg.start.callSid;
        streamSid = msg.start.streamSid;
        console.log("🎙️ Stream started:", streamSid);

        // Initialize Deepgram
        deepgramClient = createClient(DEEPGRAM_API_KEY);
        deepgramLive = deepgramClient.listen.live({
          model: "nova-2",
          language: "en-US",
          smart_format: true,
          encoding: "mulaw",
          sample_rate: 8000,
          channels: 1,
          interim_results: false,
          utterance_end_ms: 1000,
          vad_events: true
        });

        // Send ElevenLabs greeting after a short delay to ensure stream is ready
        setTimeout(async () => {
          await streamToTwilio("24/7 AI, this is Roy. How can I help you?", ws, streamSid);
        }, 500);

        // Handle Deepgram transcription
        deepgramLive.on(LiveTranscriptionEvents.Transcript, async (data) => {
          const transcript = data.channel.alternatives[0].transcript;
          
          if (transcript && transcript.trim() !== "") {
            console.log("🗣️ Caller said:", transcript);
            
            const callState = activeCalls.get(callSid);
            if (!callState) return;

            // Add user message to conversation
            callState.conversation.push({ role: "user", content: transcript });

            // Get GPT-4 response (streaming)
            try {
              const response = await axios.post(
                "https://api.openai.com/v1/chat/completions",
                {
                  model: "gpt-4o",
                  messages: callState.conversation,
                  temperature: 0.6,
                  max_tokens: 150,
                  stream: true
                },
                {
                  headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                  },
                  responseType: "stream"
                }
              );

              let fullResponse = "";
              let currentSentence = "";

              // Process streaming response
              response.data.on("data", async (chunk) => {
                const lines = chunk.toString().split("\n").filter(line => line.trim() !== "");
                
                for (const line of lines) {
                  if (line.includes("[DONE]")) continue;
                  if (!line.startsWith("data: ")) continue;
                  
                  try {
                    const json = JSON.parse(line.substring(6));
                    const content = json.choices[0]?.delta?.content;
                    
                    if (content) {
                      fullResponse += content;
                      currentSentence += content;

                      // When we have a complete sentence, convert to speech
                      if (content.match(/[.!?]\s*$/)) {
                        const sentence = currentSentence.trim();
                        if (sentence) {
                          console.log("🤖 Roy says:", sentence);
                          await streamToTwilio(sentence, ws, streamSid);
                          currentSentence = "";
                        }
                      }
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              });

              response.data.on("end", async () => {
                // Send any remaining text
                if (currentSentence.trim()) {
                  console.log("🤖 Roy says:", currentSentence.trim());
                  await streamToTwilio(currentSentence.trim(), ws, streamSid);
                }

                // Add assistant response to conversation
                callState.conversation.push({ role: "assistant", content: fullResponse });
              });

            } catch (error) {
              console.error("❌ GPT-4 error:", error.message);
            }
          }
        });

        deepgramLive.on(LiveTranscriptionEvents.Error, (error) => {
          console.error("❌ Deepgram error:", error);
        });

      } else if (msg.event === "media") {
        // Forward audio to Deepgram
        if (deepgramLive && msg.media.payload) {
          const audioBuffer = Buffer.from(msg.media.payload, "base64");
          deepgramLive.send(audioBuffer);
        }

      } else if (msg.event === "stop") {
        console.log("📴 Stream stopped");
        if (deepgramLive) {
          deepgramLive.finish();
        }
        activeCalls.delete(callSid);
      }

    } catch (error) {
      console.error("❌ WebSocket message error:", error);
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket closed");
    if (deepgramLive) {
      deepgramLive.finish();
    }
  });
});

// Convert text to speech and stream to Twilio
async function streamToTwilio(text, ws, streamSid) {
  try {
    console.log("🎤 Generating speech:", text);
    console.log("🔑 ElevenLabs API key present:", !!ELEVENLABS_API_KEY, "length:", (ELEVENLABS_API_KEY || "").length);
    
    // Get MP3 audio from ElevenLabs
    const response = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB/stream",
      {
        text: text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        },
        output_format: "pcm_16000"
      },
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        responseType: "stream"
      }
    );

    // Use ffmpeg to convert PCM 16kHz to µ-law 8kHz
    const ffmpeg = spawn("ffmpeg", [
      "-f", "s16le",            // Input format: signed 16-bit little-endian PCM
      "-ar", "16000",           // Input sample rate: 16kHz
      "-ac", "1",               // Input channels: mono
      "-i", "pipe:0",           // Input from stdin
      "-ar", "8000",            // Output sample rate: 8kHz
      "-ac", "1",               // Output channels: mono
      "-f", "mulaw",            // Output format: µ-law
      "pipe:1"                  // Output to stdout
    ]);

    // Pipe ElevenLabs audio to ffmpeg
    response.data.pipe(ffmpeg.stdin);

    // Stream converted audio to Twilio
    ffmpeg.stdout.on("data", (chunk) => {
      const audioBase64 = chunk.toString("base64");
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: "media",
          streamSid: streamSid,
          media: {
            payload: audioBase64
          }
        }));
      }
    });

    ffmpeg.stderr.on("data", (data) => {
      // Suppress ffmpeg logs unless error
    });

    ffmpeg.on("error", (err) => {
      console.error("❌ ffmpeg error:", err);
    });

  } catch (error) {
    console.error("❌ ElevenLabs error:", error.response?.data || error.message);
  }
}

// Start server
const PORT = Number(process.env.PORT || 8080);
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Streaming voice server listening on", PORT);
});

// Upgrade HTTP to WebSocket
server.on("upgrade", (request, socket, head) => {
  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});
