import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterDriverRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city_id: string;
  password: string;
  payment_method: string;
  iban?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Admin client bypasses RLS
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body: RegisterDriverRequest = await req.json();
    const { first_name, last_name, email, phone, city_id, password, payment_method, iban } = body;

    console.log("📝 Starting driver registration for:", email);

    // 1. Create auth user with email_confirm: true (user can login immediately)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Email is confirmed, user can login immediately
      user_metadata: { first_name, last_name }
    });

    if (authError) {
      console.error("❌ Auth error:", authError.message);
      
      if (authError.message.includes("already been registered") || authError.message.includes("already exists")) {
        return new Response(
          JSON.stringify({ error: "Email już jest zarejestrowany. Użyj opcji logowania lub resetowania hasła." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user!.id;
    console.log("✅ Auth user created with confirmed email:", userId);

    // 2. Check for existing driver by email or phone
    let driverId: string | null = null;
    
    const { data: existingDriver } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .or(`email.eq.${email},phone.eq.${phone}`)
      .maybeSingle();

    if (existingDriver) {
      // Update existing driver
      driverId = existingDriver.id;
      console.log("📋 Found existing driver, updating:", driverId);
      
      await supabaseAdmin
        .from("drivers")
        .update({
          first_name,
          last_name,
          email,
          phone,
          payment_method,
          iban: payment_method === "transfer" ? iban : null,
          updated_at: new Date().toISOString()
        })
        .eq("id", driverId);
    } else {
      // Create new driver with getrido_id
      const getrido_id = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const { data: newDriver, error: driverError } = await supabaseAdmin
        .from("drivers")
        .insert({
          first_name,
          last_name,
          email,
          phone,
          city_id,
          payment_method,
          iban: payment_method === "transfer" ? iban : null,
          getrido_id,
          registration_date: new Date().toISOString()
        })
        .select("id")
        .single();

      if (driverError) {
        console.error("❌ Driver insert error:", driverError.message);
        // Rollback: delete auth user
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: "Błąd tworzenia profilu kierowcy: " + driverError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      driverId = newDriver.id;
      console.log("✅ New driver created:", driverId);
    }

    // 3. Create driver_app_users link
    const { error: dauError } = await supabaseAdmin
      .from("driver_app_users")
      .upsert({
        user_id: userId,
        driver_id: driverId,
        city_id,
        phone,
        rodo_accepted_at: new Date().toISOString(),
        terms_accepted_at: new Date().toISOString()
      }, { onConflict: "user_id" });

    if (dauError) {
      console.error("❌ driver_app_users error:", dauError.message);
    } else {
      console.log("✅ driver_app_users created");
    }

    // 4. Assign driver role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: userId,
        role: "driver"
      }, { onConflict: "user_id,role" });

    if (roleError) {
      console.error("❌ user_roles error:", roleError.message);
    } else {
      console.log("✅ Driver role assigned");
    }

    // 5. Send ONLY our custom RIDO registration email (no Supabase default email)
    // Generate a magic link for login (does not send email by itself)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: "https://getrido.pl/email-confirmed"
      }
    });

    if (linkError) {
      console.error("⚠️ Magic link generation error:", linkError.message);
    }

    // Get the magic link URL
    const activationLink = linkData?.properties?.action_link || "https://getrido.pl/auth";
    console.log("🔗 Generated magic link for:", email);

    // Send our custom RIDO email using send-registration-email function
    try {
      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-registration-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          email,
          first_name,
          last_name,
          activation_link: activationLink
        })
      });

      const emailResult = await emailResponse.json();
      if (emailResult.success) {
        console.log("✅ RIDO registration email sent successfully");
      } else {
        console.error("⚠️ Failed to send RIDO email:", emailResult.error);
      }
    } catch (emailError) {
      console.error("⚠️ Error calling send-registration-email:", emailError);
    }

    console.log("🎉 Registration completed successfully for:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Rejestracja zakończona. Sprawdź email, aby potwierdzić konto." }),
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
