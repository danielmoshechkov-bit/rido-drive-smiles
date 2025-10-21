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
    console.log('🧹 Cleaning up fake @rido.internal auth accounts...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all auth users
    const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) throw listError;

    // Filter users with @rido.internal emails
    const fakeUsers = allUsers?.users?.filter(u => u.email?.includes('@rido.internal')) || [];
    
    console.log(`📊 Found ${fakeUsers.length} fake accounts to delete`);

    const results = {
      total: fakeUsers.length,
      deleted: 0,
      errors: [] as string[]
    };

    // Delete each fake user
    for (const user of fakeUsers) {
      try {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        
        if (deleteError) {
          console.error(`❌ Failed to delete ${user.email}:`, deleteError);
          results.errors.push(`${user.email}: ${deleteError.message}`);
        } else {
          console.log(`✅ Deleted: ${user.email}`);
          results.deleted++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error deleting ${user.email}:`, errorMsg);
        results.errors.push(`${user.email}: ${errorMsg}`);
      }
    }

    console.log('✅ CLEANUP COMPLETED:', results);

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
