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
    const { client_id, status, notes } = body;

    if (!client_id || !status) {
      return new Response(
        JSON.stringify({ error: 'Client ID and status are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate status
    const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'inactive'];
    if (!validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ error: 'Invalid status value' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update client status
    const updateData: any = {
      status,
      last_contact_date: new Date().toISOString()
    };

    // Add notes to metadata if provided
    if (notes) {
      const { data: currentClient } = await supabase
        .from('clients')
        .select('metadata')
        .eq('id', client_id)
        .single();

      const currentMetadata = currentClient?.metadata || {};
      const statusHistory = currentMetadata.status_history || [];
      
      updateData.metadata = {
        ...currentMetadata,
        status_history: [
          ...statusHistory,
          {
            status,
            notes,
            timestamp: new Date().toISOString()
          }
        ]
      };
    }

    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', client_id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update client status', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Client status updated successfully',
        client: data
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