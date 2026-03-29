import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, provider_id, content } = await req.json();

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: provider } = await supabase.from('service_providers')
      .select('gmb_location_id, gmb_access_token').eq('id', provider_id).single();

    if (!provider?.gmb_access_token || !provider?.gmb_location_id) {
      return new Response(JSON.stringify({ error: 'Wizytówka Google nie jest połączona' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const gmbUrl = 'https://mybusiness.googleapis.com/v4';
    const locationPath = provider.gmb_location_id;
    const token = provider.gmb_access_token;

    let result: any;

    switch (action) {
      case 'create_post': {
        const resp = await fetch(`${gmbUrl}/${locationPath}/localPosts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languageCode: 'pl',
            summary: content.text,
            topicType: 'STANDARD',
            ...(content.image_url ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: content.image_url }] } : {}),
            ...(content.cta_url ? { callToAction: { actionType: 'LEARN_MORE', url: content.cta_url } } : {}),
          }),
        });
        result = await resp.json();
        break;
      }
      case 'reply_review': {
        const resp = await fetch(`${gmbUrl}/${content.review_name}/reply`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: content.reply_text }),
        });
        result = await resp.json();
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Nieznana akcja: ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('GMB sync error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Błąd' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
