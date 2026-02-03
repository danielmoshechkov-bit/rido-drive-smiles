import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { corsHeaders } from '../_shared/cors.ts';

const TEST_ACCOUNTS = [
  {
    email: 'warsztat@test.pl',
    password: 'Test123!',
    companyName: 'Warsztat Testowy',
    role: 'service_provider',
  },
  {
    email: 'detaling@test.pl',
    password: 'Test123!',
    companyName: 'Detaling Testowy',
    role: 'service_provider',
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const results = [];

    for (const account of TEST_ACCOUNTS) {
      // Check if user already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === account.email);

      if (existingUser) {
        console.log(`User ${account.email} already exists`);
        results.push({ email: account.email, status: 'exists', userId: existingUser.id });
        continue;
      }

      // Create user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
      });

      if (createError) {
        console.error(`Error creating ${account.email}:`, createError);
        results.push({ email: account.email, status: 'error', error: createError.message });
        continue;
      }

      const userId = newUser.user.id;
      console.log(`Created user ${account.email} with ID ${userId}`);

      // Create entity for the company
      const { data: entity, error: entityError } = await supabase
        .from('entities')
        .insert({
          name: account.companyName,
          owner_user_id: userId,
          type: 'service_provider',
        })
        .select()
        .single();

      if (entityError) {
        console.error(`Error creating entity for ${account.email}:`, entityError);
      }

      // Add user role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: account.role,
        });

      if (roleError) {
        console.error(`Error adding role for ${account.email}:`, roleError);
      }

      // Create AI agent config
      const { data: agentConfig, error: configError } = await supabase
        .from('ai_agent_configs')
        .insert({
          user_id: userId,
          company_name: account.companyName,
          language: 'pl',
          is_active: false,
        })
        .select()
        .single();

      if (configError) {
        console.error(`Error creating AI config for ${account.email}:`, configError);
      } else if (agentConfig) {
        // Create sample business profile
        await supabase
          .from('ai_call_business_profiles')
          .insert({
            config_id: agentConfig.id,
            business_description: `${account.companyName} - usługi motoryzacyjne najwyższej jakości`,
            services_json: [
              { name: 'Mycie podstawowe', price_from: 50, price_to: 100, currency: 'PLN', duration_minutes: 30 },
              { name: 'Mycie premium', price_from: 150, price_to: 300, currency: 'PLN', duration_minutes: 60 },
            ],
          });
      }

      results.push({ 
        email: account.email, 
        status: 'created', 
        userId,
        entityId: entity?.id,
        configId: agentConfig?.id,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating test accounts:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
