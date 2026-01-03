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

    const url = new URL(req.url);
    const source = url.searchParams.get('source'); // Filter by source
    const status = url.searchParams.get('status'); // Filter by status
    const limit = parseInt(url.searchParams.get('limit') || '100');

    // Build query
    let query = supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (source) {
      query = query.eq('source', source);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch client leads', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get statistics
    const { data: stats } = await supabase
      .from('clients')
      .select('source, status', { count: 'exact' });

    const statistics = {
      total: data.length,
      by_source: {
        phone_call: data.filter(c => c.source === 'phone_call').length,
        web_form: data.filter(c => c.source === 'web_form').length,
        integration_form: data.filter(c => c.source === 'integration_form').length,
      },
      by_status: {
        new: data.filter(c => c.status === 'new').length,
        contacted: data.filter(c => c.status === 'contacted').length,
        qualified: data.filter(c => c.status === 'qualified').length,
        converted: data.filter(c => c.status === 'converted').length,
        inactive: data.filter(c => c.status === 'inactive').length,
      }
    };

    return new Response(
      JSON.stringify({ 
        success: true,
        clients: data,
        statistics
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