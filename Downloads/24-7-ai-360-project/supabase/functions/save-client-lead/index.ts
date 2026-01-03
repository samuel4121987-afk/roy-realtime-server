import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    
    // Extract data from request
    const {
      name,
      email,
      phone,
      company,
      industry,
      business_type,
      current_solution,
      timeline,
      message,
      challenges,
      goals,
      source, // 'phone_call', 'web_form', or 'integration_form'
      call_sid,
      call_duration,
      call_transcript,
      call_summary,
      metadata
    } = body;

    // Validate required fields
    if (!name || !source) {
      return new Response(
        JSON.stringify({ error: 'Name and source are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert client lead into database
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name,
        email,
        phone,
        company,
        industry,
        business_type,
        current_solution,
        timeline,
        message,
        challenges,
        goals,
        source,
        call_sid,
        call_duration,
        call_transcript,
        call_summary,
        status: 'new',
        last_contact_date: new Date().toISOString(),
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to save client lead', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Client lead saved successfully',
        client_id: data.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});