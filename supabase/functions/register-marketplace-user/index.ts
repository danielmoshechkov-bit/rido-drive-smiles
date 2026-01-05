import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterMarketplaceUserRequest {
  first_name: string;
  last_name?: string;
  email: string;
  phone: string;
  city_id?: string;
  password: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body: RegisterMarketplaceUserRequest = await req.json();
    const { first_name, last_name, email, phone, city_id, password } = body;

    console.log("📝 Starting marketplace user registration for:", email);

    // 1. Create auth user with email_confirm: true
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name, account_type: 'marketplace' }
    });

    if (authError) {
      console.error("❌ Auth error:", authError.message);
      
      if (authError.message.includes("already been registered") || authError.message.includes("already exists")) {
        return new Response(
          JSON.stringify({ error: "Ten email jest już zarejestrowany. Użyj logowania lub resetuj hasło." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user!.id;
    console.log("✅ Auth user created:", userId);

    // 2. Create marketplace user profile
    const { error: profileError } = await supabaseAdmin
      .from("marketplace_user_profiles")
      .insert({
        user_id: userId,
        first_name,
        last_name: last_name || null,
        email,
        phone,
        city_id: city_id || null,
        account_mode: 'buyer' // Start as buyer, can upgrade later
      });

    if (profileError) {
      console.error("❌ Profile insert error:", profileError.message);
      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Błąd tworzenia profilu: " + profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Marketplace profile created");

    // 3. Assign marketplace_user role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: userId,
        role: "marketplace_user"
      }, { onConflict: "user_id,role" });

    if (roleError) {
      console.error("❌ user_roles error:", roleError.message);
    } else {
      console.log("✅ Marketplace role assigned");
    }

    console.log("🎉 Marketplace registration completed for:", email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Rejestracja zakończona. Możesz się teraz zalogować.",
        user_id: userId
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
