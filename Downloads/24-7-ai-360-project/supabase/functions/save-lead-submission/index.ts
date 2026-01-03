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
    
    console.log('📥 Received lead submission:', payload);

    const leadData = {
      source: payload.source || 'get-started',
      business_name: payload.businessName || null,
      business_type: payload.businessType || null,
      industry: payload.industry || null,
      website: payload.website || null,
      full_name: payload.fullName || null,
      email: payload.email || null,
      phone: payload.phone || null,
      role: payload.role || null,
      call_volume: payload.callVolume || null,
      languages: payload.languages || [],
      features: payload.features || [],
      integrations: payload.integrations || [],
      current_solution: payload.currentSolution || null,
      timeline: payload.timeline || null,
      budget: payload.budget || null,
      additional_notes: payload.additionalNotes || null,
      status: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Saving lead data:', leadData);

    const { data, error } = await supabase
      .from('lead_submissions')
      .insert([leadData])
      .select();

    if (error) {
      console.error('❌ Database error:', error);
      throw error;
    }

    console.log('✅ Successfully saved lead:', data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Lead saved successfully',
        data: data 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Error saving lead:', error);
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