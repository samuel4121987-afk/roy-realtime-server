import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve((req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const wsUrl = `${supabaseUrl.replace('https://', 'wss://')}/functions/v1/twilio-openai-realtime`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`;

  return new Response(twiml, {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
});