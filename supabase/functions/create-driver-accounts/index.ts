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
    console.log('🚀 Creating auth accounts for existing drivers...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Pobierz wszystkich kierowców z prawdziwymi emailami (nie @rido.internal, nie puste)
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, email, first_name, last_name, phone')
      .not('email', 'is', null)
      .not('email', 'eq', '')
      .not('email', 'like', '%@rido.internal%');

    if (driversError) throw driversError;

    console.log(`📊 Znaleziono ${drivers?.length || 0} kierowców z prawdziwymi emailami`);
    
    // Pobierz wszystkich istniejących użytkowników Auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingEmails = new Set(existingUsers?.users?.map(u => u.email) || []);

    const results = {
      total: drivers?.length || 0,
      created: 0,
      already_exists: 0,
      errors: [] as string[]
    };

    // Dla każdego kierowcy utwórz konto Auth jeśli nie istnieje
    for (const driver of drivers || []) {
      try {
        // Sprawdź czy konto już istnieje
        if (existingEmails.has(driver.email)) {
          console.log(`⏭️ Konto już istnieje: ${driver.email}`);
          results.already_exists++;
          continue;
        }

        // Utwórz nowe konto Auth
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: driver.email,
          password: 'Test12345!',
          email_confirm: true,
          user_metadata: {
            first_name: driver.first_name || '',
            last_name: driver.last_name || '',
            phone: driver.phone || ''
          }
        });

        if (authError) {
          console.error(`❌ Błąd dla ${driver.email}:`, authError);
          results.errors.push(`${driver.email}: ${authError.message}`);
          continue;
        }

        console.log(`✅ Utworzono konto: ${driver.email}`);
        results.created++;

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Błąd dla ${driver.email}:`, errorMsg);
        results.errors.push(`${driver.email}: ${errorMsg}`);
      }
    }

    console.log('✅ ZAKOŃCZONO:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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
