import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { client_id, caption, image_url } = await req.json();
    if (!client_id || !caption) {
      return new Response(JSON.stringify({ error: 'client_id i caption są wymagane' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: client } = await supabase.from('agency_clients')
      .select('instagram_account_id, instagram_access_token')
      .eq('id', client_id).single();

    if (!client?.instagram_access_token || !client?.instagram_account_id) {
      return new Response(JSON.stringify({ error: 'Klient nie ma podłączonego Instagrama' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const igUserId = client.instagram_account_id;
    const accessToken = client.instagram_access_token;
    const graphUrl = 'https://graph.facebook.com/v18.0';

    let mediaId: string;

    if (image_url) {
      // Create image container
      const createResp = await fetch(`${graphUrl}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url, caption, access_token: accessToken }),
      });
      const createData = await createResp.json();
      if (createData.error) throw new Error(createData.error.message);
      mediaId = createData.id;
    } else {
      return new Response(JSON.stringify({ error: 'Instagram wymaga zdjęcia do publikacji' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Publish
    const publishResp = await fetch(`${graphUrl}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: mediaId, access_token: accessToken }),
    });
    const publishData = await publishResp.json();
    if (publishData.error) throw new Error(publishData.error.message);

    return new Response(JSON.stringify({ success: true, post_id: publishData.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Instagram post error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Błąd publikacji' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
