import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendRequest {
  email: string;
  language?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { email, language = "pl" }: ResendRequest = await req.json();
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "Nieprawidłowy adres email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("🔁 Resend activation request for:", normalizedEmail);

    // Znajdź usera po mailu (bez tworzenia nowego — generateLink 'signup'
    // dla nieistniejącego maila utworzyłby konto-widmo)
    const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) {
      console.error("❌ listUsers error:", listError.message);
      throw listError;
    }
    const user = usersPage.users.find(
      (u) => (u.email || "").toLowerCase() === normalizedEmail
    );

    // Celowo ten sam komunikat dla "brak konta" — nie zdradzamy, które maile są zarejestrowane
    if (!user) {
      console.log("⏭️ No user for this email");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Jeśli konto istnieje i wymaga aktywacji, link został wysłany.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (user.email_confirmed_at) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "already_confirmed",
          message: "To konto jest już aktywne. Możesz się zalogować.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Wygeneruj świeży link aktywacyjny (signup dla istniejącego niepotwierdzonego usera).
    // Konto zarejestrowane na moduł → wróć na /aktywacja?module=... (routing do panelu modułu).
    const siteUrl = Deno.env.get("SITE_URL") || "https://getrido.pl";
    const userModule = (user.user_metadata as Record<string, string> | undefined)?.module;
    const activationPath = userModule ? `/aktywacja?module=${userModule}` : "/aktywacja";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: normalizedEmail,
      password: crypto.randomUUID(), // ignorowane dla istniejącego usera, wymagane przez API
      options: { redirectTo: `${siteUrl}${activationPath}` },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("❌ generateLink error:", linkError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Nie udało się wygenerować linku aktywacyjnego." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const meta = (user.user_metadata || {}) as Record<string, string>;
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-registration-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        email: normalizedEmail,
        first_name: (meta.first_name || "").trim(),
        last_name: (meta.last_name || "").trim(),
        activation_link: linkData.properties.action_link,
        language,
      }),
    });

    const emailResult = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok || emailResult.success === false) {
      console.error("❌ Resend email failed:", JSON.stringify(emailResult));
      return new Response(
        JSON.stringify({ success: false, error: "Wysyłka maila nie powiodła się. Spróbuj ponownie później." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Activation email re-sent to:", normalizedEmail);
    return new Response(
      JSON.stringify({
        success: true,
        message: "Jeśli konto istnieje i wymaga aktywacji, link został wysłany.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Unexpected error in resend-activation-email:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
