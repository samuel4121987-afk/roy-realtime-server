const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { createClient } = require('@supabase/supabase-js');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("✅ Supabase client initialized");
} else {
  console.warn("⚠️ Supabase not configured - client data will not be saved");
}

const OPENAI_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

// ✅ ULTRA SHORT INSTRUCTIONS - ENGLISH ONLY
const SARAH_PROMPT = `
YOU ARE SARAH. YOU SPEAK ONLY ENGLISH. NEVER SPANISH. NEVER ANY OTHER LANGUAGE.

CRITICAL RULES:
1. ALWAYS respond in English - no exceptions
2. Keep responses under 10 words
3. Ask ONE question at a time
4. Be direct and friendly

YOUR JOB:
Collect: name, email, phone number

QUESTIONS TO ASK (one at a time):
1. "What's your name?"
2. "What's your email?"
3. "What's your phone number?"

IF ASKED ABOUT SERVICE:
"We provide 24/7 AI receptionists for businesses."

REMEMBER: English only. Short answers. No Spanish ever.
`.trim();

const FILLER_WORDS = [
  'uh', 'um', 'hmm', 'ah', 'er', 'like', 'you know',
  'aha', 'yes', 'yeah', 'yep', 'okay', 'ok', 'sure', 'right',
  'uh-huh', 'mm-hmm', 'mhm'
];

function isOnlyFillerWords(text) {
  if (!text || text.trim().length === 0) return true;
  const words = text.toLowerCase().trim().split(/\s+/);
  if (words.length > 3) return false;
  return words.every(word => {
    const cleanWord = word.replace(/[.,!?;:]/g, '');
    return FILLER_WORDS.includes(cleanWord);
  });
}

function extractClientInfo(transcript) {
  const info = {};
  const text = transcript.toLowerCase();
  
  const nameMatch = transcript.match(/(?:my name is|i'm|i am|this is)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (nameMatch) info.name = nameMatch[1];
  
  const emailMatch = transcript.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  if (emailMatch) info.email = emailMatch[1];
  
  const phoneMatch = transcript.match(/(?:phone|number|call me at)\s*(?:is)?\s*([0-9\s\-\(\)]+)/i);
  if (phoneMatch) info.phone = phoneMatch[1].replace(/[^0-9]/g, '');
  
  if (text.includes("business") || text.includes("company")) {
    const businessMatch = transcript.match(/(?:business|company)(?:\s+is)?\s+(?:called\s+)?([A-Z][a-zA-Z\s&]+)/);
    if (businessMatch) info.business = businessMatch[1].trim();
  }
  
  if (text.includes("hotel")) info.businessType = "hotel";
  else if (text.includes("clinic") || text.includes("medical")) info.businessType = "clinic";
  else if (text.includes("salon") || text.includes("spa")) info.businessType = "salon";
  else if (text.includes("rental")) info.businessType = "rental";
  else if (text.includes("restaurant")) info.businessType = "restaurant";
  else if (text.includes("retail") || text.includes("store")) info.businessType = "retail";
  
  return info;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (_req, res) => res.status(200).send("Sarah AI is running"));

// ✅ NEW: Diagnostic endpoint to test OpenAI connection
app.get("/test-openai", async (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      hasOpenAIKey: !!OPENAI_API_KEY,
      openAIKeyLength: OPENAI_API_KEY ? OPENAI_API_KEY.length : 0,
      openAIKeyPrefix: OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 7) + "..." : "MISSING",
      hasSupabase: !!supabase,
      nodeVersion: process.version,
      port: PORT
    },
    websocketTest: "attempting..."
  };

  // Test OpenAI WebSocket connection
  try {
    const testWs = new WebSocket(OPENAI_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    const testPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        testWs.close();
        reject(new Error("Connection timeout after 5 seconds"));
      }, 5000);

      testWs.on("open", () => {
        clearTimeout(timeout);
        diagnostics.websocketTest = "✅ SUCCESS - OpenAI WebSocket connected";
        testWs.close();
        resolve();
      });

      testWs.on("error", (error) => {
        clearTimeout(timeout);
        diagnostics.websocketTest = `❌ FAILED - ${error.message}`;
        reject(error);
      });

      testWs.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          diagnostics.firstMessage = msg.type;
        } catch (e) {
          // ignore
        }
      });
    });

    await testPromise;
    diagnostics.status = "✅ ALL SYSTEMS OPERATIONAL";
    res.status(200).json(diagnostics);
  } catch (error) {
    diagnostics.websocketTest = `❌ FAILED - ${error.message}`;
    diagnostics.status = "❌ OPENAI CONNECTION FAILED";
    diagnostics.error = error.message;
    
    // Check for common errors
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
      diagnostics.likelyIssue = "Invalid or expired OpenAI API key";
      diagnostics.solution = "Check your OPENAI_API_KEY in Railway environment variables";
    } else if (error.message.includes("timeout")) {
      diagnostics.likelyIssue = "Network connectivity issue";
      diagnostics.solution = "Check Railway network settings or OpenAI service status";
    }
    
    res.status(500).json(diagnostics);
  }
});

app.all("/incoming-call", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const wsProto = proto === "http" ? "ws" : "wss";
  const wsUrl = `${wsProto}://${host}/media-stream`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track"/>
  </Connect>
</Response>`;

  res.status(200).type("text/xml").send(twiml);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioSocket) => {
  console.log("✅ Twilio connected");

  let streamSid = null;
  let callSid = null;
  let callerPhone = null;
  let openaiOpen = false;
  const openaiQueue = [];
  let conversationTranscript = [];
  let collectedInfo = {};
  let callStartTime = Date.now();
  
  // ✅ NEW: Track AI speaking state and response ID
  let isAISpeaking = false;
  let currentResponseId = null;
  let lastAssistantItemId = null;

  function sendToOpenAI(obj) {
    const msg = JSON.stringify(obj);
    if (openaiOpen && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.send(msg);
    } else {
      openaiQueue.push(msg);
    }
  }

  function flushQueue() {
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
    console.log("✅ OpenAI connected");
    console.log("🔧 Configuring session with interruption support...");

    // ✅ INTERRUPTION-OPTIMIZED SESSION
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "shimmer",
        temperature: 0.1,
        max_response_output_tokens: 25,
        instructions: SARAH_PROMPT,
        turn_detection: {
          type: "server_vad",
          threshold: 0.3,
          prefix_padding_ms: 100,
          silence_duration_ms: 400
        },
        input_audio_transcription: { model: "whisper-1" }
      }
    });

    setTimeout(() => {
      console.log("📤 Sending initial greeting...");
      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ 
            type: "input_text", 
            text: "Greet the caller in ENGLISH ONLY. Say exactly: Hey, this is Sarah from 24/7 AI. How can I help you today?" 
          }]
        }
      });
      sendToOpenAI({ type: "response.create" });
    }, 250);

    flushQueue();
  });

  openaiSocket.on("message", (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch (e) {
      console.error("❌ Failed to parse OpenAI message:", e);
      return;
    }

    // ✅ Log important events for debugging
    if (evt.type === "error") {
      console.error("❌ OpenAI error event:", evt.error);
    }

    if (evt.type === "session.created") {
      console.log("✅ Session created:", evt.session?.id);
    }

    if (evt.type === "session.updated") {
      console.log("✅ Session updated successfully");
    }

    // ✅ NEW: Detect when user starts speaking - IMMEDIATELY cancel AI response
    if (evt.type === "input_audio_buffer.speech_started") {
      if (isAISpeaking && currentResponseId) {
        console.log("🛑 User interrupted - canceling AI response");
        
        // Cancel the current response immediately
        sendToOpenAI({
          type: "response.cancel"
        });
        
        // Clear Twilio's audio buffer
        if (streamSid) {
          twilioSocket.send(JSON.stringify({
            event: "clear",
            streamSid: streamSid
          }));
        }
        
        isAISpeaking = false;
        currentResponseId = null;
      }
    }

    // ✅ Track when AI starts speaking
    if (evt.type === "response.created") {
      currentResponseId = evt.response?.id;
      isAISpeaking = true;
      console.log("🎙️ AI started speaking");
    }

    // ✅ Track when AI finishes speaking
    if (evt.type === "response.done" || evt.type === "response.cancelled") {
      isAISpeaking = false;
      currentResponseId = null;
      console.log("✅ AI finished/cancelled speaking");
    }

    if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
      twilioSocket.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: evt.delta }
      }));
      
      // Track the item ID for potential truncation
      if (evt.item_id) {
        lastAssistantItemId = evt.item_id;
      }
    }

    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = evt.transcript || '';
      if (transcript && !isOnlyFillerWords(transcript)) {
        console.log(`👤 Caller: ${transcript}`);
        conversationTranscript.push(`Caller: ${transcript}`);
        
        const extracted = extractClientInfo(transcript);
        collectedInfo = { ...collectedInfo, ...extracted };
        
        if (Object.keys(extracted).length > 0) {
          console.log("📝 Collected:", extracted);
        }
      }
    }

    if (evt.type === "response.text.done") {
      const aiResponse = evt.text || '';
      if (aiResponse) {
        console.log(`🤖 Sarah: ${aiResponse}`);
        conversationTranscript.push(`Sarah: ${aiResponse}`);
      }
    }
  });

  openaiSocket.on("close", async () => {
    console.log("🔴 OpenAI closed");
    
    if (supabase && callSid && (collectedInfo.name || collectedInfo.email || conversationTranscript.length > 0)) {
      try {
        const callDuration = Math.floor((Date.now() - callStartTime) / 1000);
        const transcript = conversationTranscript.join("\n");
        
        const summary = `Call from ${callerPhone || 'unknown'}. ${
          collectedInfo.name ? `Caller: ${collectedInfo.name}. ` : ''
        }${
          collectedInfo.business ? `Business: ${collectedInfo.business}. ` : ''
        }`;

        await supabase.from('clients').insert({
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

        console.log('✅ Call data saved');
      } catch (error) {
        console.error('❌ Save error:', error);
      }
    }
    
    if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
  });

  openaiSocket.on("error", (e) => console.error("❌ OpenAI error:", e));

  twilioSocket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "start") {
      streamSid = data.start?.streamSid;
      callSid = data.start?.callSid;
      callerPhone = data.start?.customParameters?.From;
      
      console.log(`📞 Call started: ${callSid} from ${callerPhone}`);
    }

    if (data.event === "media" && data.media?.track === "inbound_track") {
      const payload = data.media?.payload;
      if (payload) {
        sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
      }
    }

    if (data.event === "stop") {
      console.log("🔴 Call ended");
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    console.log("🔴 Twilio closed");
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  twilioSocket.on("error", (e) => console.error("❌ Twilio error:", e));
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Sarah AI listening on port ${PORT}`);
});
