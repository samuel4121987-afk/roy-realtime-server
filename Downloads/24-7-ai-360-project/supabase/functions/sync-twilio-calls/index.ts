import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract client information from conversation text
function extractClientInfo(transcript: string) {
  const info: any = {
    name: null,
    email: null,
    phone: null,
    company: null,
    business_type: null,
  };

  // Extract name (common patterns)
  const namePatterns = [
    /(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /(?:call me|name's)\s+([A-Z][a-z]+)/i,
  ];
  
  for (const pattern of namePatterns) {
    const match = transcript.match(pattern);
    if (match) {
      info.name = match[1].trim();
      break;
    }
  }

  // Extract email
  const emailMatch = transcript.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    info.email = emailMatch[0];
  }

  // Extract phone (various formats)
  const phoneMatch = transcript.match(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  if (phoneMatch) {
    info.phone = phoneMatch[0];
  }

  // Extract company name
  const companyPatterns = [
    /(?:from|at|work at|company is)\s+([A-Z][A-Za-z\s&]+(?:Hotel|Inn|Resort|Clinic|Spa|Salon|LLC|Inc|Corp))/i,
    /([A-Z][A-Za-z\s&]+(?:Hotel|Inn|Resort|Clinic|Spa|Salon))/,
  ];
  
  for (const pattern of companyPatterns) {
    const match = transcript.match(pattern);
    if (match) {
      info.company = match[1].trim();
      break;
    }
  }

  // Detect business type
  const businessKeywords = {
    hotel: ['hotel', 'inn', 'resort', 'motel', 'lodge', 'accommodation'],
    clinic: ['clinic', 'medical', 'doctor', 'health', 'hospital'],
    salon: ['salon', 'spa', 'beauty', 'hair', 'barber'],
    restaurant: ['restaurant', 'cafe', 'bistro', 'diner'],
    retail: ['store', 'shop', 'boutique', 'retail'],
  };

  const lowerTranscript = transcript.toLowerCase();
  for (const [type, keywords] of Object.entries(businessKeywords)) {
    if (keywords.some(keyword => lowerTranscript.includes(keyword))) {
      info.business_type = type;
      break;
    }
  }

  return info;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { twilioAccountSid, twilioAuthToken } = await req.json();

    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Twilio Account SID and Auth Token are required' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recent calls from Twilio
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const callsResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json?PageSize=50`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      }
    );

    if (!callsResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch Twilio calls. Check your credentials.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const callsData = await callsResponse.json();
    const calls = callsData.calls || [];

    let syncedCount = 0;
    const newLeads = [];

    // Process each call
    for (const call of calls) {
      // Skip if not completed
      if (call.status !== 'completed') continue;

      // Check if already synced
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('metadata->>call_sid', call.sid)
        .single();

      if (existing) continue;

      // Try to get recording/transcript
      let transcript = '';
      try {
        const recordingsResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls/${call.sid}/Recordings.json`,
          {
            headers: {
              'Authorization': `Basic ${auth}`,
            },
          }
        );

        if (recordingsResponse.ok) {
          const recordingsData = await recordingsResponse.json();
          // Note: Twilio doesn't provide automatic transcription
          // You would need to use a transcription service
          transcript = `Call from ${call.from} to ${call.to}. Duration: ${call.duration} seconds.`;
        }
      } catch (e) {
        console.error('Error fetching recording:', e);
      }

      // Extract client info from available data
      const clientInfo = extractClientInfo(transcript);

      // Create lead entry
      const leadData = {
        name: clientInfo.name || `Caller from ${call.from}`,
        email: clientInfo.email,
        phone: call.from,
        company: clientInfo.company,
        business_type: clientInfo.business_type,
        source: 'phone_call',
        status: 'new',
        call_sid: call.sid,
        call_duration: parseInt(call.duration) || 0,
        call_transcript: transcript,
        call_summary: `Call from ${call.from}. Duration: ${Math.floor(call.duration / 60)} minutes.`,
        metadata: {
          call_sid: call.sid,
          from: call.from,
          to: call.to,
          duration: call.duration,
          start_time: call.start_time,
          end_time: call.end_time,
        },
      };

      const { data, error } = await supabase
        .from('clients')
        .insert([leadData])
        .select()
        .single();

      if (!error && data) {
        syncedCount++;
        newLeads.push(data);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: syncedCount,
        total_calls: calls.length,
        new_leads: newLeads,
        message: `Successfully synced ${syncedCount} new call(s) from Twilio`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error syncing Twilio calls:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});