import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { wymagajRoli, odmowa } from '../_shared/requireRole.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // ── Autoryzacja ────────────────────────────────────────────────────
    // TEGO NIE BYŁO. Funkcja zakładała konto i wpisywała role WPROST z ciała
    // żądania, kluczem service_role — a `app_role` zawiera 'admin', więc
    // `{"roles":["admin"]}` tworzyło administratora platformy bez sesji.
    // To była ta sama luka co w `admin-bootstrap`, tylko mniej widoczna.
    const brama = await wymagajRoli(supabaseAdmin, req, ['admin']);
    if (!brama.ok) return brama.odp;

    const { email, phone, fleet_id, roles } = await req.json();

    if (!email || !fleet_id || !roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rola NIGDY z ciała żądania bez ograniczenia zbioru. Nawet administrator
    // nie zakłada tędy kont administratorskich: to funkcja od kont FLOTOWYCH,
    // a do nadawania ról platformowych jest `admin-create-user`. Zawężenie
    // zbioru znaczy, że przejęcie konta administratora nie daje od razu
    // fabryki kolejnych administratorów.
    const DOZWOLONE = ['fleet_settlement', 'fleet_rental', 'driver'];
    const niedozwolone = (roles as string[]).filter((r) => !DOZWOLONE.includes(r));
    if (niedozwolone.length > 0) {
      console.warn(`create-fleet-account: ${brama.kto.id} próbował nadać role [${niedozwolone.join(',')}]`);
      return odmowa(400, `Niedozwolone role: ${niedozwolone.join(', ')}. Dozwolone: ${DOZWOLONE.join(', ')}.`);
    }

    console.log(`[create-fleet-account] ${brama.kto.email ?? brama.kto.id} → ${email}, role [${(roles as string[]).join(',')}]`);

    // Generate random password
    const generatePassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let password = '';
      for (let i = 0; i < 16; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      phone: phone || undefined,
      password: generatePassword(),
      email_confirm: true,
    });

    if (authError) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authData.user.id;

    // Insert user roles
    for (const role of roles) {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
          fleet_id,
          // Ślad autorstwa. Bez tego nie da się później odpowiedzieć na
          // pytanie „kto nadał tę rolę" — a właśnie tego zabrakło przy audycie.
          created_by: brama.kto.id,
        });

      if (roleError) {
        console.error('Role insert error:', roleError);
        // Rollback - delete user
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: roleError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Send password reset email
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    if (resetError) {
      console.error('Password reset error:', resetError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        reset_link: resetData?.properties?.action_link || null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
