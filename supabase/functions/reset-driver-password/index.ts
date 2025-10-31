import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();

    if (!email) {
      throw new Error('Email jest wymagany');
    }

    console.log(`🔐 Tworzenie/resetowanie konta dla: ${email}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // If no password provided, generate one
    let finalPassword = password;
    if (!finalPassword) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
      finalPassword = '';
      for (let i = 0; i < 12; i++) {
        finalPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    // Sprawdź czy użytkownik istnieje
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    // Sprawdź czy istnieje stare konto z @rido.internal dla tego samego kierowcy
    const fakeUser = existingUsers?.users?.find(u => u.email?.includes('@rido.internal'));
    if (fakeUser) {
      console.log(`🗑️ Usuwam stare konto: ${fakeUser.email}`);
      await supabase.auth.admin.deleteUser(fakeUser.id);
    }

    if (existingUser) {
      // Resetuj hasło dla istniejącego użytkownika
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { password: finalPassword }
      );

      if (updateError) throw updateError;

      // Ensure driver role is assigned
      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({
          user_id: existingUser.id,
          role: 'driver'
        }, {
          onConflict: 'user_id,role',
          ignoreDuplicates: true
        });

      if (roleError) {
        console.error('⚠️ Nie udało się dodać roli driver:', roleError);
      } else {
        console.log(`✅ Rola driver przypisana dla: ${email}`);
      }

      console.log(`✅ Hasło zmienione dla: ${email}`);

      return new Response(
        JSON.stringify({
          success: true,
          password: password ? undefined : finalPassword, // Return password only if auto-generated
          action: 'reset'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Utwórz nowe konto
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true
      });

      if (authError) throw authError;

      console.log(`✅ Konto utworzone dla: ${email}`);

      // Ensure driver role is assigned for new user
      if (authUser.user) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .upsert({
            user_id: authUser.user.id,
            role: 'driver'
          }, {
            onConflict: 'user_id,role',
            ignoreDuplicates: true
          });

        if (roleError) {
          console.error('⚠️ Nie udało się dodać roli driver:', roleError);
        } else {
          console.log(`✅ Rola driver przypisana dla: ${email}`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          password: password ? undefined : finalPassword, // Return password only if auto-generated
          action: 'created'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('💥 ERROR:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
