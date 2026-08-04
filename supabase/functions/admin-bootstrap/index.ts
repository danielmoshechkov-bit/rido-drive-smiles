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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Porównanie sekretów przez skrót SHA-256, nie znak po znaku. Zwykłe `!==` kończy
 * pracę na pierwszej różnicy, więc czas odpowiedzi zdradza, ile znaków się zgadza —
 * przy publicznym endpoincie to wystarcza, żeby sekret odgadnąć bajt po bajcie.
 * Skróty mają zawsze tę samą długość, więc nie wycieka nawet długość sekretu.
 */
async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const bootstrapSecret = Deno.env.get('ADMIN_BOOTSTRAP_SECRET');

    // Fail-closed: brak skonfigurowanego sekretu NIE otwiera endpointu.
    if (!bootstrapSecret) {
      console.error('admin-bootstrap: ADMIN_BOOTSTRAP_SECRET nie jest ustawiony');
      return json({ error: 'Endpoint niedostępny — brak konfiguracji' }, 503);
    }

    // 1. Tożsamość wywołującego z JWT, nie z body.
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    const caller = userData?.user;
    if (!caller) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);

    // 2. Rola z bazy, nigdy z body ani z metadanych tokenu.
    const { data: callerRow, error: callerErr } = await supabase
      .from('drivers')
      .select('user_role')
      .eq('id', caller.id)
      .maybeSingle();

    if (callerErr) {
      console.error('admin-bootstrap: nie można potwierdzić roli', callerErr);
      return json({ error: 'Nie można potwierdzić uprawnień' }, 503);
    }
    if (callerRow?.user_role !== 'admin') {
      return json({ error: 'Forbidden' }, 403);
    }

    const body: Payload = await req.json();
    const { email, password, first_name, last_name, city_id, token } = body;

    if (!email || !password) {
      return json({ error: 'Missing email or password' }, 400);
    }

    // 3. Drugi składnik: sekret operacyjny. Sam admin nie wystarcza — nadanie
    //    kolejnej roli admina wymaga też wiedzy spoza sesji przeglądarki.
    if (!token || !(await secretsMatch(token, bootstrapSecret))) {
      console.warn('admin-bootstrap: zły sekret, wywołujący', caller.id);
      return json({ error: 'Unauthorized' }, 401);
    }

    console.log('admin-bootstrap: nadanie roli admin przez', caller.id);

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
      return json({ error: createErr.message }, 500);
    }

    const userId = created?.user?.id;
    if (!userId) {
      // Try to get existing user by email via PostgREST is not possible; assume failure
      return json({ error: 'No user id returned' }, 500);
    }

    // Upsert into drivers with admin role
    const { error: upsertErr } = await supabase
      .from('drivers')
      .upsert({
        id: userId,
        city_id: city_id || 'f6ecca60-ca80-4227-8409-8a44f5d342fd',
        first_name: first_name || 'Admin',
        last_name: last_name || 'User',
        email,
        user_role: 'admin',
      }, { onConflict: 'id' });

    if (upsertErr) {
      console.error('Drivers upsert error:', upsertErr);
      return json({ error: upsertErr.message }, 500);
    }

    return json({ success: true, user_id: userId });
  } catch (e) {
    console.error('admin-bootstrap error:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
