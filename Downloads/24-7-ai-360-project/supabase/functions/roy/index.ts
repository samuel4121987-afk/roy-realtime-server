import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
}

const OPENAI_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

// ✅ ENGLISH ONLY - ULTRA CLEAR INSTRUCTIONS
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

const FILLER_WORDS = new Set([
  "uh","um","hmm","ah","er","like","you","know",
  "aha","yes","yeah","yep","okay","ok","sure","right",
  "uh-huh","mm-hmm","mhm","mm","yup",
  "si","sí","vale","bueno","claro","ya","espera","a","ver",
  "no","nah"
]);

function normalizeText(t: string): string {
  return (t || "")
    .toLowerCase()
    .trim()
    .replace(/[""]/g, '"')
    .replace(/[.,!?;:()]/g, "");
}

function wordsOf(t: string): string[] {
  const s = normalizeText(t);
  return s ? s.split(/\s+/).filter(Boolean) : [];
}

function isOnlyFillerWords(text: string): boolean {
  const w = wordsOf(text);
  if (w.length === 0) return true;
  if (w.length > 4) return false;
  return w.every(x => FILLER_WORDS.has(x));
}

function looksLikeQuestion(text: string): boolean {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (raw.includes("?")) return true;

  const w = wordsOf(raw);
  if (w.length === 0) return false;

  const first = w[0];

  const starters = new Set([
    "who","what","when","where","why","how",
    "can","could","do","does","did",
    "is","are","am","was","were",
    "will","would","should",
    "tell","explain"
  ]);

  if (starters.has(first)) return true;

  const lower = raw.toLowerCase();
  const markers = [
    "price","pricing","cost","charge","fee","fees","rate","rates",
    "book","booking","reserve","reservation","schedule","setup","onboard","onboarding",
    "how much","what is","what are"
  ];
  return markers.some(m => lower.includes(m));
}

function isStrongQuestion(text: string): boolean {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (raw.includes("?")) return true;

  const w = wordsOf(raw);
  const cleanedLen = normalizeText(raw).replace(/\s+/g, " ").length;

  if (w.length < 3 && cleanedLen < 12) return false;
  return looksLikeQuestion(raw);
}

function ulawByteToPcm16(b: number): number {
  let u = (~b) & 0xff;

  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;

  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;

  return sign ? -sample : sample;
}

function ulawEnergyDb(base64Payload: string): number {
  if (!base64Payload) return -100;

  let buf: Uint8Array;
  try {
    const binaryString = atob(base64Payload);
    buf = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      buf[i] = binaryString.charCodeAt(i);
    }
  } catch {
    return -100;
  }
  if (!buf.length) return -100;

  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const s = ulawByteToPcm16(buf[i]);
    sumSq += s * s;
  }

  const rms = Math.sqrt(sumSq / buf.length);
  const norm = rms / 32768;
  return 20 * Math.log10(norm + 1e-10);
}

function extractClientInfo(transcript: string): any {
  const info: any = {};
  const text = transcript.toLowerCase();
  
  const nameMatch = transcript.match(/(?:my name is|i'm|i am|this is|name's)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (nameMatch) {
    info.name = nameMatch[1];
  }
  
  const emailMatch = transcript.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  if (emailMatch) {
    info.email = emailMatch[1];
  }
  
  const phoneMatch = transcript.match(/(?:phone|number|call me at)\s*(?:is)?\s*([0-9\s\-\(\)]+)/i);
  if (phoneMatch) {
    info.phone = phoneMatch[1].replace(/[^0-9]/g, '');
  }
  
  if (text.includes("business") || text.includes("company")) {
    const businessMatch = transcript.match(/(?:business|company)(?:\s+is)?\s+(?:called\s+)?([A-Z][a-zA-Z\s&]+)/);
    if (businessMatch) {
      info.business = businessMatch[1].trim();
    }
  }
  
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
  
  if (url.pathname === "/" && req.method === "GET") {
    return new Response("SARAH is running", { status: 200 });
  }

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

  if (url.pathname === "/media-stream") {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const { socket: twilioSocket, response } = Deno.upgradeWebSocket(req);

    let openaiSocket: WebSocket | null = null;
    let streamSid: string | null = null;
    let openaiOpen = false;
    const openaiQueue: string[] = [];

    let isAISpeaking = false;
    let responseInFlight = false;

    let bargeEnabled = false;
    let greetingInFlight = false;
    let bargeInProgress = false;
    let cancelInProgress = false;
    let energyPacketCount = 0;

    let lastAiAudioAt = 0;
    let aiSpeechStartedAt = 0;

    let lastTranscript = "";
    let lastTranscriptAt = 0;

    let callSid: string | null = null;
    let callerPhone: string | null = null;
    let callStartTime = Date.now();
    let conversationTranscript: string[] = [];
    let collectedInfo: any = {};

    const ENERGY_THRESHOLD_DB = -50;
    const PRE_CANCEL_PACKETS = 2;
    const BARGE_GRACE_MS = 120;

    function speakingNow(): boolean {
      const elapsed = lastAiAudioAt ? (Date.now() - lastAiAudioAt) : 999999;
      return isAISpeaking || responseInFlight || (elapsed < 350);
    }

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

    function injectUserTextAndRespond(text: string) {
      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }]
        }
      });
      sendToOpenAI({ type: "response.create" });
    }

    function cancelAndClearTwilio() {
      sendToOpenAI({ type: "response.cancel" });
      if (twilioSocket.readyState === WebSocket.OPEN && streamSid) {
        twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
      }
    }

    openaiSocket = new WebSocket(OPENAI_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiSocket.onopen = () => {
      openaiOpen = true;
      console.log("✅ OpenAI WS connected");

      // ✅ FORCE ENGLISH WITH MINIMAL SETTINGS
      sendToOpenAI({
        type: "session.update",
        session: {
          modalities: ["text"],
          voice: "shimmer",
          temperature: 0.2,
          max_response_output_tokens: 30,
          instructions: SARAH_PROMPT,
          turn_detection: null
        },
      });

      flushOpenAIQueue();
    };

    openaiSocket.onmessage = (event) => {
      let evt: any;
      try {
        evt = JSON.parse(event.data);
      } catch {
        return;
      }

      if (evt.type === "error") {
        console.error("❌ OpenAI error:", JSON.stringify(evt, null, 2));
        return;
      }

      if (evt.type === "session.created" || evt.type === "session.updated") {
        // ✅ NOW enable audio mode with ENGLISH LOCK
        sendToOpenAI({
          type: "session.update",
          session: {
            modalities: ["audio", "text"],
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: "shimmer",
            temperature: 0.2,
            max_response_output_tokens: 30,
            instructions: SARAH_PROMPT,
            turn_detection: {
              type: "server_vad",
              threshold: 0.78,
              prefix_padding_ms: 300,
              silence_duration_ms: 800
            },
            input_audio_transcription: { model: "whisper-1" },
          },
        });
      }

      if (evt.type === "response.created") responseInFlight = true;

      if (evt.type === "response.audio.started") {
        isAISpeaking = true;
        aiSpeechStartedAt = Date.now();
      }

      if (evt.type === "response.audio.done") {
        isAISpeaking = false;
      }

      if (evt.type === "response.done") {
        responseInFlight = false;
        isAISpeaking = false;

        if (greetingInFlight) {
          greetingInFlight = false;
          bargeEnabled = true;
          console.log("✅ Greeting finished → barge-in ENABLED");
        }

        cancelInProgress = false;
        bargeInProgress = false;
        energyPacketCount = 0;
      }

      if (evt.type === "input_audio_buffer.speech_stopped") {
        sendToOpenAI({ type: "input_audio_buffer.commit" });
      }

      if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
        lastAiAudioAt = Date.now();

        if (cancelInProgress) {
          return;
        }

        if (twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.send(JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: evt.delta }
          }));
        }
      }

      if (evt.type === "conversation.item.input_audio_transcription.completed") {
        const transcript = (evt.transcript || "").trim();
        if (!transcript) {
          bargeInProgress = false;
          cancelInProgress = false;
          return;
        }

        const now = Date.now();
        if (transcript === lastTranscript && (now - lastTranscriptAt) < 900) {
          return;
        }
        lastTranscript = transcript;
        lastTranscriptAt = now;

        console.log(`👤 Caller: ${transcript}`);
        conversationTranscript.push(`Caller: ${transcript}`);

        const extracted = extractClientInfo(transcript);
        collectedInfo = { ...collectedInfo, ...extracted };
        
        if (Object.keys(extracted).length > 0) {
          console.log("📝 Collected info:", extracted);
        }

        const filler = isOnlyFillerWords(transcript);
        const strongQ = isStrongQuestion(transcript);

        if (bargeInProgress) {
          bargeInProgress = false;
          cancelInProgress = false;
          energyPacketCount = 0;

          if (!filler && strongQ) {
            injectUserTextAndRespond(transcript);
          }
          return;
        }

        injectUserTextAndRespond(transcript);
      }

      if (evt.type === "response.text.done") {
        const aiResponse = evt.text || '';
        if (aiResponse) {
          console.log(`🤖 Sarah: ${aiResponse}`);
          conversationTranscript.push(`Sarah: ${aiResponse}`);
        }
      }
    };

    openaiSocket.onerror = (error) => {
      console.error("❌ OpenAI WebSocket error:", error);
    };

    openaiSocket.onclose = async () => {
      console.log("🔴 OpenAI WebSocket closed");
      
      if (callSid && (collectedInfo.name || collectedInfo.email || conversationTranscript.length > 0)) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const supabase = createClient(supabaseUrl, supabaseKey);

          const callDuration = Math.floor((Date.now() - callStartTime) / 1000);
          const transcript = conversationTranscript.join("\n");
          
          const summary = `Call from ${callerPhone || 'unknown'}. ${
            collectedInfo.name ? `Caller: ${collectedInfo.name}. ` : ''
          }${
            collectedInfo.business ? `Business: ${collectedInfo.business}. ` : ''
          }${
            collectedInfo.businessType ? `Type: ${collectedInfo.businessType}. ` : ''
          }`;

          console.log("💾 Saving call data to database...");

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
      }
      
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.close();
      }
    };

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
        
        if (data.start && data.start.customParameters && data.start.customParameters.From) {
          callerPhone = data.start.customParameters.From;
        }
        
        console.log("▶️ Twilio start:", streamSid, "Call:", callSid, "From:", callerPhone);

        greetingInFlight = true;
        bargeEnabled = false;

        // ✅ FORCE ENGLISH GREETING - VERY EXPLICIT
        setTimeout(() => {
          sendToOpenAI({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ 
                type: "input_text", 
                text: "Greet the caller in ENGLISH ONLY. Say exactly: Hey, thanks for calling 24/7 AI. This is Sarah. How can I help you today?" 
              }]
            }
          });
          sendToOpenAI({ type: "response.create" });
        }, 100);

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

        if (bargeEnabled && !bargeInProgress && speakingNow()) {
          const grace = aiSpeechStartedAt && (Date.now() - aiSpeechStartedAt) < BARGE_GRACE_MS;
          if (!grace) {
            const db = ulawEnergyDb(payload);
            if (db > ENERGY_THRESHOLD_DB) {
              energyPacketCount += 1;
              if (energyPacketCount >= PRE_CANCEL_PACKETS) {
                bargeInProgress = true;
                cancelInProgress = true;
                energyPacketCount = 0;
                cancelAndClearTwilio();
              }
            } else {
              energyPacketCount = 0;
            }
          }
        } else {
          energyPacketCount = 0;
        }

        sendToOpenAI({ type: "input_audio_buffer.append", audio: payload });
        return;
      }

      if (data.event === "stop") {
        console.log("⛔ Twilio stop");
        if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
        if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
      }
    };

    twilioSocket.onclose = () => {
      console.log("🔌 Twilio WebSocket closed");
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