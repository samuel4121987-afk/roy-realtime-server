import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    
    // ✅ LOG EVERYTHING to see what we're receiving
    console.log('========================================');
    console.log('📥 FULL WEBHOOK PAYLOAD:', JSON.stringify(payload, null, 2));
    console.log('========================================');

    // ✅ Extract data from multiple possible field structures
    const conversationId = payload.conversationId || payload.id || payload.call_id || payload.conversation_id || `conv_${Date.now()}`;
    const transcript = payload.transcript || payload.messages || payload.conversation || payload.text || '';
    const transcriptText = typeof transcript === 'string' ? transcript : JSON.stringify(transcript);
    
    // ✅ Extract user info from transcript
    const extractedInfo = extractAllInfo(transcriptText);
    
    // ✅ Try to get data from various possible field names
    const userName = payload.userName || payload.name || payload.customer_name || extractedInfo.name || 'Unknown';
    const userEmail = payload.userEmail || payload.email || payload.customer_email || extractedInfo.email || null;
    const userPhone = payload.userPhone || payload.phone || payload.customer_phone || extractedInfo.phone || null;
    const businessName = payload.businessName || payload.business || payload.company || extractedInfo.business || null;
    const messageContent = payload.message || payload.lastMessage || payload.summary || extractedInfo.message || null;
    const callDuration = payload.duration || payload.callDuration || payload.call_duration || 0;
    const status = payload.status || payload.call_status || 'new';

    const conversationData = {
      conversation_id: conversationId,
      user_name: userName,
      user_email: userEmail,
      user_phone: userPhone,
      business_name: businessName,
      business_type: extractedInfo.businessType || payload.businessType || payload.industry || null,
      message_content: messageContent,
      transcript: transcriptText,
      call_duration: callDuration,
      status: status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Saving conversation data:', conversationData);

    // Save to database
    const { data, error } = await supabase
      .from('readdy_agent_conversations')
      .insert([conversationData])
      .select();

    if (error) {
      console.error('❌ Database error:', error);
      throw error;
    }

    console.log('✅ Successfully saved conversation:', data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Conversation saved successfully',
        data: data 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

// ✅ Enhanced extraction function
function extractAllInfo(text: string): any {
  if (!text) return {};
  
  const info: any = {};
  const lowerText = text.toLowerCase();
  
  // Extract email
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) info.email = emailMatch[0];
  
  // Extract phone
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) info.phone = phoneMatch[0];
  
  // Extract name - look for "my name is X" or "I'm X" or "this is X"
  const namePatterns = [
    /(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:here|speaking|calling)/i,
    /name:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      info.name = match[1].trim();
      break;
    }
  }
  
  // Extract business name
  const businessPatterns = [
    /(?:from|at|with|representing)\s+([A-Z][A-Za-z0-9\s&]+(?:Inc|LLC|Ltd|Corp|Company|Airbnb)?)/i,
    /(?:business|company|organization)\s+(?:is|called|named)\s+([A-Z][A-Za-z0-9\s&]+)/i,
    /calling from\s+([A-Z][A-Za-z0-9\s&]+)/i
  ];
  
  for (const pattern of businessPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      info.business = match[1].trim();
      break;
    }
  }
  
  // Detect business type
  if (lowerText.includes("airbnb") || lowerText.includes("rental")) {
    info.businessType = "rental";
  } else if (lowerText.includes("hotel")) {
    info.businessType = "hotel";
  } else if (lowerText.includes("clinic") || lowerText.includes("medical")) {
    info.businessType = "clinic";
  } else if (lowerText.includes("salon") || lowerText.includes("spa")) {
    info.businessType = "salon";
  } else if (lowerText.includes("restaurant")) {
    info.businessType = "restaurant";
  }
  
  // Extract urgency/message
  if (lowerText.includes("urgent") || lowerText.includes("as soon as possible") || lowerText.includes("asap")) {
    info.message = "URGENT: Requested immediate callback";
  }
  
  return info;
}