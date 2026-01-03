import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ✅ SECURE: Only use environment variable - no hardcoded fallback
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

if (!OPENAI_API_KEY) {
  console.error("❌ CRITICAL: OPENAI_API_KEY not found in environment variables");
  throw new Error("OPENAI_API_KEY must be set in Supabase Edge Function secrets");
}

const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

const ROY_INSTRUCTIONS = `
You are Roy, a fast, natural, human-sounding phone receptionist for "24/7 AI Assistant".

Never say you are an AI.

You explain:
- 24/7 AI builds virtual receptionists for hotels, clinics, salons, rentals, and small businesses.
- The AI answers calls, chats, and emails 24/7.
- It increases bookings and reduces staff costs.

STYLE:
- Short, clear sentences.
- Friendly, confident, human.
- English or Spanish depending on caller.
- Ask one question at a time.
- If a name is unclear, ask to spell it.

FLOW:
1. Greet the caller warmly: "24/7 AI, this is Roy. How can I help you?"
2. Ask for their name.
3. Ask what kind of business they have.
4. Ask about their current challenges (e.g., missed calls, booking issues, staff costs).
5. Explain how 24/7 AI helps that specific business.
6. Ask if they'd like a demo or more information.
7. Collect their contact details:
   - Full name (already asked)
   - Business name
   - Phone number (you already have this from the call)
   - Email address
   - Business type/industry
8. Confirm you'll have someone reach out within 24 hours.
9. Thank them for calling.

IMPORTANT: Always try to collect at least: name, business name, email, and business type before ending the call.
`;

serve((req: Request): Response => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 400 });
  }

  const { socket: twilioSocket, response } = Deno.upgradeWebSocket(req);

  let openaiSocket: WebSocket | null = null;
  let streamSid: string | null = null;
  let callSid: string | null = null;
  let callerPhone: string | null = null;
  let conversationTranscript: string[] = [];
  let collectedInfo: any = {};
  let callStartTime = Date.now();

  openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiSocket.onopen = () => {
    console.log("✅ OpenAI WebSocket connected");
    
    openaiSocket!.send(JSON.stringify({
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "echo",
        instructions: ROY_INSTRUCTIONS,
        turn_detection: { 
          type: "server_vad",
          threshold: 0.4,
          prefix_padding_ms: 200,
          silence_duration_ms: 500
        },
        modalities: ["audio", "text"],
        temperature: 0.7,
        input_audio_transcription: { model: "whisper-1" }
      }
    }));

    // Trigger initial greeting
    if (streamSid) {
      openaiSocket!.send(JSON.stringify({
        type: "response.create",
        response: {
          instructions: "Greet the caller immediately with: '24/7 AI, this is Roy. How can I help you?'",
          modalities: ["audio", "text"]
        }
      }));
    }
  };

  openaiSocket.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    
    // Send audio back to Twilio
    if (data.type === "response.audio.delta" && streamSid) {
      twilioSocket.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: data.delta }
      }));
    }

    // Capture user transcript
    if (data.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = data.transcript || "";
      if (transcript) {
        conversationTranscript.push(`Caller: ${transcript}`);
        console.log(`👤 Caller: ${transcript}`);
        
        // Extract information
        const text = transcript.toLowerCase();
        
        // Extract name
        const nameMatch = transcript.match(/(?:my name is|i'm|i am|this is|name's)\s+([a-z]+(?:\s+[a-z]+)?)/i);
        if (nameMatch && !collectedInfo.name) {
          collectedInfo.name = nameMatch[1];
          console.log(`📝 Name captured: ${collectedInfo.name}`);
        }
        
        // Extract email
        const emailMatch = transcript.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
        if (emailMatch) {
          collectedInfo.email = emailMatch[1];
          console.log(`📧 Email captured: ${collectedInfo.email}`);
        }
        
        // Extract phone (if they mention it)
        const phoneMatch = transcript.match(/(?:phone|number|call me at)\s*(?:is)?\s*([0-9\s\-\(\)]+)/i);
        if (phoneMatch) {
          collectedInfo.phone = phoneMatch[1].replace(/[^0-9]/g, '');
          console.log(`📞 Phone captured: ${collectedInfo.phone}`);
        }
        
        // Extract business name
        if (text.includes("business") || text.includes("company")) {
          const businessMatch = transcript.match(/(?:business|company)(?:\s+is)?\s+(?:called\s+)?([A-Z][a-zA-Z\s&]+)/);
          if (businessMatch) {
            collectedInfo.business = businessMatch[1].trim();
            console.log(`🏢 Business captured: ${collectedInfo.business}`);
          }
        }
        
        // Extract business type
        if (text.includes("hotel") || text.includes("hospitality")) collectedInfo.businessType = "hotel";
        else if (text.includes("clinic") || text.includes("medical") || text.includes("doctor")) collectedInfo.businessType = "clinic";
        else if (text.includes("salon") || text.includes("spa") || text.includes("beauty")) collectedInfo.businessType = "salon";
        else if (text.includes("rental") || text.includes("property")) collectedInfo.businessType = "rental";
        else if (text.includes("restaurant") || text.includes("cafe")) collectedInfo.businessType = "restaurant";
        else if (text.includes("retail") || text.includes("store") || text.includes("shop")) collectedInfo.businessType = "retail";
      }
    }

    // Capture AI responses
    if (data.type === "response.text.done" || data.type === "response.done") {
      const text = data.text || data.output?.[0]?.content?.[0]?.text || "";
      if (text) {
        conversationTranscript.push(`Roy: ${text}`);
        console.log(`🤖 Roy: ${text}`);
      }
    }
  };

  openaiSocket.onerror = (error) => {
    console.error("❌ OpenAI WebSocket error:", error);
  };

  openaiSocket.onclose = async () => {
    console.log("🔴 OpenAI WebSocket closed");
    
    // Save call data to database when call ends
    if (callSid && (collectedInfo.name || collectedInfo.email || conversationTranscript.length > 0)) {
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

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

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
  };

  twilioSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      callSid = msg.start.callSid;
      
      // Extract caller phone number
      if (msg.start.customParameters?.From) {
        callerPhone = msg.start.customParameters.From;
      }
      
      console.log(`📞 Call started: ${callSid} from ${callerPhone}`);

      // Trigger greeting once stream is ready
      if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(JSON.stringify({
          type: "response.create",
          response: {
            instructions: "Greet the caller immediately with: '24/7 AI, this is Roy. How can I help you?'",
            modalities: ["audio", "text"]
          }
        }));
      }
    }

    if (msg.event === "media") {
      if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: msg.media.payload
        }));
      }
    }

    if (msg.event === "stop") {
      console.log("🔴 Call ended");
      if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.close();
      }
      twilioSocket.close();
    }
  };

  twilioSocket.onerror = (error) => {
    console.error("❌ Twilio WebSocket error:", error);
  };

  twilioSocket.onclose = () => {
    console.log("🔴 Twilio WebSocket closed");
    if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  };

  return response;
});