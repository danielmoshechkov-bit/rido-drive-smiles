import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Payload = {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  city_id?: string;
  token?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body: Payload = await req.json();
    const { email, password, first_name, last_name, city_id, token } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Missing email or password' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Simple protection (one-off bootstrap token)
    const BOOTSTRAP_TOKEN = 'rido-setup-2025';
    if (token !== BOOTSTRAP_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create or fetch auth user
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: first_name || 'Admin',
        last_name: last_name || 'User',
      },
    });

    if (createErr && !String(createErr.message || '').includes('already registered')) {
      console.error('Auth create error:', createErr);
      return new Response(JSON.stringify({ error: createErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userId = created?.user?.id;
    if (!userId) {
      // Try to get existing user by email via PostgREST is not possible; assume failure
      return new Response(JSON.stringify({ error: 'No user id returned' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Upsert into drivers with admin role
    const { error: upsertErr } = await supabase
      .from('drivers')
      .upsert({
        id: userId,
        city_id: city_id || 'f6ecca60-ca80-4227-8409-8a44f5d342fd',
        first_name: first_name || 'Daniel',
        last_name: last_name || 'Admin',
        email,
        user_role: 'admin',
      }, { onConflict: 'id' });

    if (upsertErr) {
      console.error('Drivers upsert error:', upsertErr);
      return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-bootstrap error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});