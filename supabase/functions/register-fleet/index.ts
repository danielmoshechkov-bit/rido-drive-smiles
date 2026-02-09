import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RegisterFleetRequest {
  company_name: string;
  company_short_name: string;
  nip: string;
  address: string;
  city: string;
  postal_code: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  driver_contact_name?: string;
  driver_contact_phone?: string;
  email?: string;
  password?: string;
  existing_user_id?: string; // For logged-in users adding fleet role
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

    const body: RegisterFleetRequest = await req.json();
    const { 
      company_name, company_short_name, nip, address, city, postal_code,
      contact_name, contact_email, contact_phone,
      driver_contact_name, driver_contact_phone,
      email, password, existing_user_id
    } = body;

    console.log("📝 Starting fleet registration for:", company_name, existing_user_id ? "(existing user)" : "(new user)");

    // Check if feature toggle is enabled
    const { data: toggleData } = await supabaseAdmin
      .from('feature_toggles')
      .select('is_enabled')
      .eq('feature_key', 'fleet_registration_enabled')
      .single();

    if (toggleData && !toggleData.is_enabled) {
      return new Response(
        JSON.stringify({ error: "Rejestracja floty jest tymczasowo wyłączona. Skontaktuj się z administratorem." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if NIP already exists
    const { data: existingFleet } = await supabaseAdmin
      .from("fleets")
      .select("id")
      .eq("nip", nip)
      .maybeSingle();

    if (existingFleet) {
      return new Response(
        JSON.stringify({ error: "Flota z tym NIP-em już istnieje w systemie.", field: "nip" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userId: string;

    // If existing user is adding fleet role
    if (existing_user_id) {
      userId = existing_user_id;
      console.log("✅ Using existing user:", userId);
    } else {
      // Validate email/password for new users
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Email i hasło są wymagane dla nowych użytkowników." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Create auth user (NOT auto-confirmed - requires email verification)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // Require email confirmation
        user_metadata: { 
          company_name, 
          contact_name,
          account_type: 'fleet' 
        }
      });

      if (authError) {
        console.error("❌ Auth error:", authError.message);
        
        if (authError.message.includes("already been registered") || authError.message.includes("already exists")) {
          return new Response(
            JSON.stringify({ error: "Ten email jest już zarejestrowany.", field: "email" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = authData.user!.id;
      console.log("✅ Auth user created:", userId);
    }

    // 2. Create fleet record (using existing columns in fleets table)
    const { data: fleetData, error: fleetError } = await supabaseAdmin
      .from("fleets")
      .insert({
        name: company_name,
        nip,
        address,
        city,
        postal_code,
        contact_name,
        email: contact_email, // Map to existing 'email' column
        phone: contact_phone, // Map to existing 'phone' column
        contact_phone_for_drivers: driver_contact_phone || null,
        owner_name: contact_name,
        owner_phone: contact_phone
      })
      .select()
      .single();

    if (fleetError) {
      console.error("❌ Fleet insert error:", fleetError.message);
      // Rollback auth user only if we created a new one
      if (!existing_user_id) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(
        JSON.stringify({ error: "Błąd tworzenia floty: " + fleetError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Fleet created:", fleetData.id);

    // 3. Assign fleet_settlement role with fleet_id
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "fleet_settlement",
        fleet_id: fleetData.id
      });

    if (roleError) {
      console.error("❌ Role assignment error:", roleError.message);
    } else {
      console.log("✅ Fleet role assigned");
    }

    // 4. Create driver record for fleet owner (so they appear in their own settlements)
    const nameParts = contact_name.split(" ");
    const firstName = nameParts[0] || contact_name;
    const lastName = nameParts.slice(1).join(" ") || "";
    
    const { data: driverData, error: driverError } = await supabaseAdmin
      .from("drivers")
      .insert({
        fleet_id: fleetData.id,
        first_name: firstName,
        last_name: lastName,
        email: contact_email,
        phone: contact_phone,
        payment_method: 'transfer'
      })
      .select()
      .single();

    if (driverError) {
      console.error("⚠️ Driver record creation error (non-fatal):", driverError.message);
    } else {
      console.log("✅ Fleet owner driver record created:", driverData.id);
      
      // 5. Link driver to user account via driver_app_users
      await supabaseAdmin
        .from("driver_app_users")
        .insert({
          driver_id: driverData.id,
          user_id: userId,
          fleet_id: fleetData.id,
          settlement_frequency: 'weekly',
          app_access_enabled: true
        });
      console.log("✅ Driver app user link created");
    }

    // 6. Also create marketplace profile for the fleet owner
    await supabaseAdmin
      .from("marketplace_user_profiles")
      .insert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName || null,
        email: contact_email,
        phone: contact_phone,
        account_mode: 'business',
        company_name
      });

    console.log("🎉 Fleet registration completed for:", company_name);

    // 7. Send activation email for new users
    if (!existing_user_id && email) {
      try {
        // Generate activation link
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'signup',
          email,
          options: {
            redirectTo: 'https://rido-drive-smiles.lovable.app/fleet/aktywacja'
          }
        });
        
        const activationLink = linkData?.properties?.action_link || `https://rido-drive-smiles.lovable.app/fleet/aktywacja?email=${encodeURIComponent(email)}`;
        
        // Call email sending function
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-fleet-registration-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`
          },
          body: JSON.stringify({
            email,
            company_name,
            contact_name,
            activation_link: activationLink
          })
        });
        
        if (emailResponse.ok) {
          console.log("✅ Fleet activation email sent");
        } else {
          console.error("⚠️ Failed to send activation email:", await emailResponse.text());
        }
      } catch (emailError) {
        console.error("⚠️ Email sending error (non-fatal):", emailError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Flota została zarejestrowana! Sprawdź email, aby aktywować konto.",
        fleet_id: fleetData.id,
        requires_activation: !existing_user_id
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