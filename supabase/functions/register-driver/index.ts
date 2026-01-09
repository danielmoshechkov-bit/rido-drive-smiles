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
  language?: string;
  fleet_nip?: string;
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
    const { first_name, last_name, email, phone, city_id, password, payment_method, iban, language = "pl", fleet_nip } = body;

    console.log("📝 Starting driver registration for:", email, "language:", language, "fleet_nip:", fleet_nip);

    // Resolve fleet_id from fleet NIP if provided
    let fleetId: string | null = null;
    if (fleet_nip) {
      const { data: fleetData } = await supabaseAdmin
        .from("fleets")
        .select("id")
        .eq("nip", fleet_nip)
        .maybeSingle();
      
      if (fleetData) {
        fleetId = fleetData.id;
        console.log("🏢 Fleet found for NIP:", fleet_nip, "->", fleetId);
      } else {
        console.log("⚠️ Fleet NIP not found:", fleet_nip);
      }
    }

    // 1. Create auth user with email_confirm: true (user can login immediately)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Email is confirmed, user can login immediately
      user_metadata: { first_name, last_name, preferred_language: language }
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

    // 2. Check for existing driver - PRIORITIZE PHONE (most stable identifier)
    let driverId: string | null = null;
    let existingDriver: { id: string; getrido_id: string | null } | null = null;
    
    // First, search by phone number (primary identifier)
    const { data: driverByPhone } = await supabaseAdmin
      .from("drivers")
      .select("id, getrido_id")
      .eq("phone", phone)
      .maybeSingle();
    
    if (driverByPhone) {
      existingDriver = driverByPhone;
      console.log("📱 Found existing driver by phone:", driverByPhone.id);
    } else {
      // If not found by phone, search by email
      const { data: driverByEmail } = await supabaseAdmin
        .from("drivers")
        .select("id, getrido_id")
        .eq("email", email)
        .maybeSingle();
      
      if (driverByEmail) {
        existingDriver = driverByEmail;
        console.log("📧 Found existing driver by email:", driverByEmail.id);
      }
    }

    if (existingDriver) {
      // Update existing driver - KEEP getrido_id, update name/contact info
      driverId = existingDriver.id;
      console.log("📋 Updating existing driver:", driverId, "getrido_id:", existingDriver.getrido_id);
      
      const updateData: Record<string, any> = {
        first_name,  // Update name to what driver entered
        last_name,   // Update surname to what driver entered
        email,       // Update email if changed
        phone,       // Update phone if changed
        payment_method,
        iban: payment_method === "transfer" ? iban : null,
        preferred_language: language,
        updated_at: new Date().toISOString()
        // NOTE: getrido_id, city_id, driver_platform_ids are NOT updated - preserved!
      };
      
      // If registering via fleet NIP, update fleet_id and registered_via_code
      if (fleetId) {
        updateData.fleet_id = fleetId;
        updateData.registered_via_code = fleet_nip;
      }
      
      await supabaseAdmin
        .from("drivers")
        .update(updateData)
        .eq("id", driverId);
      
      console.log("✅ Driver updated, getrido_id preserved:", existingDriver.getrido_id, "fleet_id:", fleetId);
    } else {
      // Create new driver with getrido_id
      const getrido_id = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const insertData: Record<string, any> = {
        first_name,
        last_name,
        email,
        phone,
        city_id,
        payment_method,
        iban: payment_method === "transfer" ? iban : null,
        getrido_id,
        preferred_language: language,
        registration_date: new Date().toISOString()
      };
      
      // If registering via fleet NIP, set fleet_id and registered_via_code
      if (fleetId) {
        insertData.fleet_id = fleetId;
        insertData.registered_via_code = fleet_nip;
      }
      
      const { data: newDriver, error: driverError } = await supabaseAdmin
        .from("drivers")
        .insert(insertData)
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
      console.log("✅ New driver created:", driverId, "fleet_id:", fleetId);
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

    // Send our custom RIDO email ASYNCHRONOUSLY (don't wait - registration completes immediately)
    // This prevents 2+ minute registration times caused by slow SMTP
    const emailPromise = fetch(`${supabaseUrl}/functions/v1/send-registration-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        email,
        first_name,
        last_name,
        activation_link: activationLink,
        language
      })
    });

    // Use EdgeRuntime.waitUntil to run email in background without blocking response
    // @ts-ignore - Deno EdgeRuntime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        emailPromise
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              console.log("✅ RIDO registration email sent successfully in language:", language);
            } else {
              console.error("⚠️ Failed to send RIDO email:", result.error);
            }
          })
          .catch(err => console.error("⚠️ Error sending email:", err))
      );
    } else {
      // Fallback: fire and forget (don't await)
      emailPromise
        .then(res => res.json())
        .then(result => console.log("📧 Email result:", result.success ? "sent" : result.error))
        .catch(err => console.error("⚠️ Email error:", err));
    }

    console.log("🎉 Registration completed successfully for:", email, "(email sending in background)");

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
