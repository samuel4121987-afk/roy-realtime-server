import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("✅ Supabase client initialized");
} else {
  console.warn("⚠️ Supabase not configured - client data will not be saved");
}

const OPENAI_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

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

function isOnlyFillerWords(text: string): boolean {
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

function extractClientInfo(transcript: string): any {
  const info: any = {};
  const text = transcript.toLowerCase();
  
  // Extract name
  const nameMatch = transcript.match(/(?:my name is|i'm|i am|this is)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (nameMatch) {
    info.name = nameMatch[1];
  }
  
  // Extract email
  const emailMatch = transcript.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  if (emailMatch) {
    info.email = emailMatch[1];
  }
  
  // Extract phone number
  const phoneMatch = transcript.match(/(?:phone|number|call me at)\s*(?:is)?\s*([0-9\s\-\(\)]+)/i);
  if (phoneMatch) {
    info.phone = phoneMatch[1].replace(/[^0-9]/g, '');
  }
  
  // Extract business name
  if (text.includes("business") || text.includes("company")) {
    const businessMatch = transcript.match(/(?:business|company)(?:\s+is)?\s+(?:called\s+)?([A-Z][a-zA-Z\s&]+)/);
    if (businessMatch) {
      info.business = businessMatch[1].trim();
    }
  }
  
  // Extract business type
  if (text.includes("hotel") || text.includes("hospitality")) info.businessType = "hotel";
  else if (text.includes("clinic") || text.includes("medical") || text.includes("doctor")) info.businessType = "clinic";
  else if (text.includes("salon") || text.includes("spa") || text.includes("beauty")) info.businessType = "salon";
  else if (text.includes("rental") || text.includes("property")) info.businessType = "rental";
  else if (text.includes("restaurant") || text.includes("cafe")) info.businessType = "restaurant";
  else if (text.includes("retail") || text.includes("store") || text.includes("shop")) info.businessType = "retail";
  
  return info;
}

serve(async (req) => {
  const url = new URL(req.url);
  
  // Health check endpoint
  if (url.pathname === "/" && req.method === "GET") {
    return new Response("ROY is running", { status: 200 });
  }

  // TwiML endpoint for incoming calls
  if (url.pathname === "/incoming-call") {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const wsProto = proto === "http" ? "ws" : "wss";
    const wsUrl = `${wsProto}://${host}/media-stream`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" }
    });
  }

  // WebSocket endpoint for media stream
  if (url.pathname === "/media-stream") {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const { socket: twilioSocket, response } = Deno.upgradeWebSocket(req);

    let openaiSocket: WebSocket | null = null;
    let streamSid: string | null = null;
    let callSid: string | null = null;
    let callerPhone: string | null = null;
    let openaiOpen = false;
    const openaiQueue: string[] = [];
    let latestMediaTimestamp = 0;
    let lastAssistantItem: string | null = null;
    let responseStartTimestamp: number | null = null;
    const markQueue: string[] = [];
    let lastUserTranscript = '';
    let isAISpeaking = false;
    let pendingInterruption = false;
    let aiSpeakingStartTime: number | null = null;
    const INTERRUPTION_GRACE_PERIOD = 200; // 200ms instead of 300ms
    let lastTranscriptTime = 0;
    const DUPLICATE_WINDOW_MS = 500; // 500ms to better prevent duplicates

    // Call data tracking
    let callStartTime = Date.now();
    let conversationTranscript: string[] = [];
    let collectedInfo: any = {};

    function sendToOpenAI(obj: any) {
      const msg = JSON.stringify(obj);
      if (openaiOpen && openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(msg);
      } else {
        openaiQueue.push(msg);
      }
    }

    function flushOpenAIQueue() {
      while (openaiQueue.length && openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(openaiQueue.shift()!);
      }
    }

    // Connect to OpenAI
    openaiSocket = new WebSocket(OPENAI_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiSocket.onopen = () => {
      openaiOpen = true;
      console.log("✅ OpenAI WS connected");

      // Configure session
      sendToOpenAI({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: "echo",
          temperature: 0.7,
          instructions: ROY_PROMPT,
          turn_detection: {
            type: "server_vad",
            threshold: 0.25,           // More sensitive - 0.25 instead of 0.3
            prefix_padding_ms: 100,    // Shorter padding - 100ms instead of 150ms
            silence_duration_ms: 350   // Shorter silence - 350ms instead of 400ms
          },
          max_response_output_tokens: 150,
          input_audio_transcription: { model: "whisper-1" },
        },
      });

      flushOpenAIQueue();
      console.log("⏳ Waiting for streamSid before greeting...");
    };

    // Handle interruptions - INSTANT with shorter grace period
    function handleSpeechStartedEvent() {
      if (isAISpeaking) {
        // Check if we're still in grace period
        const timeSinceAIStarted = Date.now() - (aiSpeakingStartTime || 0);
        if (timeSinceAIStarted < INTERRUPTION_GRACE_PERIOD) {
          console.log(`⏳ Speech detected but in grace period (${timeSinceAIStarted}ms) - ignoring`);
          return;
        }
        
        console.log("👂 User started speaking while AI is talking - STOPPING IMMEDIATELY");
        
        // IMMEDIATELY cancel the response
        sendToOpenAI({
          type: "response.cancel"
        });
        
        // Clear all audio from Twilio queue
        markQueue.length = 0;
        
        // Clear Twilio's audio buffer
        if (streamSid && twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.send(JSON.stringify({
            event: "clear",
            streamSid: streamSid
          }));
        }
        
        pendingInterruption = true;
        isAISpeaking = false; // Immediately mark as not speaking
      }
    }

    function handleInterruptionWithTranscript(transcript: string) {
      if (!pendingInterruption) {
        return;
      }

      // Check if it's just filler words
      if (isOnlyFillerWords(transcript)) {
        console.log(`💬 Filler detected: "${transcript}" - AI already stopped`);
        pendingInterruption = false;
        return;
      }

      // Real interruption confirmed
      console.log(`🛑 Real interruption confirmed: "${transcript}"`);
      
      // Truncate the conversation item
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

    openaiSocket.onmessage = (event) => {
      let evt: any;
      try {
        evt = JSON.parse(event.data);
      } catch {
        return;
      }

      // Log important events for debugging
      if (LOG_EVENT_TYPES.includes(evt.type)) {
        console.log(`📊 Event: ${evt.type}`);
      }

      // Handle speech started - IMMEDIATE ACTION
      if (evt.type === "input_audio_buffer.speech_started") {
        console.log("🗣️ Speech detected!");
        handleSpeechStartedEvent();
      }

      // Track when AI starts speaking
      if (evt.type === "response.audio.started" || (evt.type === "response.audio.delta" && !isAISpeaking)) {
        if (!isAISpeaking) {
          isAISpeaking = true;
          aiSpeakingStartTime = Date.now();
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
      if (evt.type === "response.audio.delta" && evt.delta && streamSid && twilioSocket.readyState === WebSocket.OPEN) {
        const audioDelta = {
          event: "media",
          streamSid: streamSid,
          media: { payload: evt.delta }
        };
        twilioSocket.send(JSON.stringify(audioDelta));

        // Track each audio chunk with a mark
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

      // Capture conversation transcript with better duplicate prevention
      if (evt.type === "conversation.item.input_audio_transcription.completed") {
        const currentTranscript = evt.transcript || '';
        const now = Date.now();
        
        // Better duplicate detection - check both transcript AND timing
        if (currentTranscript === lastUserTranscript && (now - lastTranscriptTime) < DUPLICATE_WINDOW_MS) {
          console.log("⏭️ Duplicate transcript ignored");
          return;
        }
        
        // Also ignore if transcript is too similar (fuzzy match)
        if (lastUserTranscript && currentTranscript.length > 0) {
          const similarity = currentTranscript.toLowerCase().includes(lastUserTranscript.toLowerCase()) || 
                            lastUserTranscript.toLowerCase().includes(currentTranscript.toLowerCase());
          if (similarity && (now - lastTranscriptTime) < DUPLICATE_WINDOW_MS * 2) {
            console.log("⏭️ Similar transcript ignored");
            return;
          }
        }
        
        lastUserTranscript = currentTranscript;
        lastTranscriptTime = now;
        
        console.log(`👤 User said: "${lastUserTranscript}"`);
        
        // Add to conversation history
        conversationTranscript.push(`Caller: ${lastUserTranscript}`);
        
        // Extract client information
        const extracted = extractClientInfo(lastUserTranscript);
        collectedInfo = { ...collectedInfo, ...extracted };
        
        if (Object.keys(extracted).length > 0) {
          console.log("📝 Collected info:", extracted);
        }
        
        // Check if this was an interruption
        handleInterruptionWithTranscript(lastUserTranscript);
      }

      // Capture AI responses
      if (evt.type === "response.text.done") {
        const aiResponse = evt.text || '';
        console.log(`🤖 AI response: "${aiResponse}"`);
        conversationTranscript.push(`Roy: ${aiResponse}`);
      }
    };

    openaiSocket.onerror = (error) => {
      console.error("❌ OpenAI WebSocket error:", error);
    };

    openaiSocket.onclose = async () => {
      console.log("🔴 OpenAI WebSocket closed");
      
      // Save call data to database when call ends
      if (supabase && callSid && (collectedInfo.name || collectedInfo.email || conversationTranscript.length > 0)) {
        try {
          const callDuration = Math.floor((Date.now() - callStartTime) / 1000);
          const transcript = conversationTranscript.join("\n");
          
          // Create a summary
          const summary = `Call from ${callerPhone || 'unknown'}. ${
            collectedInfo.name ? `Caller: ${collectedInfo.name}. ` : ''
          }${
            collectedInfo.business ? `Business: ${collectedInfo.business}. ` : ''
          }${
            collectedInfo.businessType ? `Type: ${collectedInfo.businessType}. ` : ''
          }`;

          console.log("💾 Saving call data to database...");
          console.log("Collected info:", collectedInfo);

          const { data, error } = await supabase
            .from('clients')
            .insert({
              name: collectedInfo.name || 'Unknown Caller',
              email: collectedInfo.email || null,
              phone: collectedInfo.phone || callerPhone,
              company: collectedInfo.business || null,
              business_type: collectedInfo.businessType || null,
              source: 'phone_call',
              call_sid: callSid,
              call_duration: callDuration,
              call_transcript: transcript,
              call_summary: summary,
              status: 'new',
              last_contact_date: new Date().toISOString(),
              metadata: {
                collected_info: collectedInfo,
                call_date: new Date().toISOString()
              }
            });

          if (error) {
            console.error('❌ Failed to save call data:', error);
          } else {
            console.log('✅ Call data saved successfully!');
          }
        } catch (error) {
          console.error('❌ Error saving call data:', error);
        }
      } else {
        console.log("ℹ️ No data to save (no name, email, or transcript)");
      }
      
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.close();
      }
    };

    // Helper function to check if audio is from caller
    const isCallerAudio = (track: string | undefined) => {
      if (!track) return false;
      return track === "inbound" || track === "inbound_track";
    };

    let trackLogged = false;

    twilioSocket.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.event === "start") {
        streamSid = data.start && data.start.streamSid ? data.start.streamSid : null;
        callSid = data.start && data.start.callSid ? data.start.callSid : null;
        
        // Extract caller phone number
        if (data.start && data.start.customParameters && data.start.customParameters.From) {
          callerPhone = data.start.customParameters.From;
        }
        
        console.log(`📞 Call started: ${callSid} from ${callerPhone}`);

        // Trigger greeting immediately when streamSid is ready
        if (streamSid && openaiOpen && openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
          console.log("👋 Triggering greeting now...");
          sendToOpenAI({
            type: "response.create"
          });
        } else {
          // Shorter fallback timeout - 300ms instead of 500ms
          setTimeout(() => {
            if (streamSid && openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
              console.log("👋 Triggering greeting (fallback)...");
              sendToOpenAI({
                type: "response.create"
              });
            }
          }, 300);
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
        if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
        if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
      }
    };

    twilioSocket.onclose = () => {
      console.log("🔴 Twilio WebSocket closed");
      if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    };

    twilioSocket.onerror = (error) => {
      console.error("❌ Twilio WebSocket error:", error);
      if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    };

    return response;
  }

  return new Response("Not Found", { status: 404 });
});
