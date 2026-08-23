import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveWorkshopTrialDays, workshopTrialExpiresAt } from "../_shared/workshopTrial.ts";
import { sprawdzKodPlanu } from "../_shared/kodPlanu.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterMarketplaceUserRequest {
  first_name: string;
  last_name?: string;
  phone?: string;
  email: string;
  password: string;
  referral_code?: string;
  /** Rejestracja z landingu modułu (np. 'warsztat') — zapisywane w user_metadata */
  module?: string;
  plan?: string;
}

const KNOWN_MODULES = ["warsztat"];

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
    const { first_name, last_name, phone, email, password, referral_code } = body;
    const module = body.module && KNOWN_MODULES.includes(body.module) ? body.module : undefined;
    const plan = module ? (body.plan || undefined) : undefined;

    console.log("📝 Starting marketplace user registration for:", email, module ? `(module: ${module}, plan: ${plan || '-'})` : "");

    // ── Ograniczenie częstotliwości ────────────────────────────────────
    // Pole „Nie jestem robotem" w formularzu to WYŁĄCZNIE stan przeglądarki
    // (`if (!isHuman) return`) — do serwera nie dociera nic, więc żądanie
    // wysłane z pominięciem formularza omija je w całości. Ta funkcja ma
    // `verify_jwt = false`, zakłada konta i wysyła maile, więc bez limitu
    // jest darmową fabryką jednego i drugiego.
    //
    // Limit liczymy po adresie IP w oknie godzinnym. Świadomie NIE blokujemy
    // po adresie e-mail: to pozwalałoby sprawdzać, które adresy są już
    // zarejestrowane, czyli wyliczać bazę użytkowników.
    // Kod planu sprawdzamy w cenniku ZANIM go gdziekolwiek zapiszemy.
    const planSprawdzony = await sprawdzKodPlanu(supabaseAdmin, plan);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const LIMIT_NA_GODZINE = 5;

    if (ip !== "unknown") {
      const godzinaTemu = new Date(Date.now() - 3600_000).toISOString();
      const { count, error: bladLicznika } = await supabaseAdmin
        .from("rejestracje_ip")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", godzinaTemu);

      // Awaria licznika nie może zatrzymać rejestracji — to byłaby blokada
      // sprzedaży z powodu tabeli pomocniczej. Logujemy i przepuszczamy.
      if (bladLicznika) {
        console.error("⚠️ rejestracje_ip: nie udało się policzyć prób:", bladLicznika.message);
      } else if ((count ?? 0) >= LIMIT_NA_GODZINE) {
        console.warn(`🚧 Limit rejestracji dla IP ${ip}: ${count} prób w godzinę`);
        return new Response(
          JSON.stringify({
            error: "Zbyt wiele prób rejestracji z tego adresu. Spróbuj ponownie za godzinę.",
            code: "RATE_LIMITED",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Zapisujemy PRÓBĘ, nie sukces — inaczej bot odbijający się od walidacji
      // mógłby próbować bez końca, bo żadna próba nie zwiększałaby licznika.
      await supabaseAdmin.from("rejestracje_ip").insert({
        ip, email, sciezka: module ?? "marketplace",
      });
    }

    // Check feature toggle for email confirmation requirement
    const { data: toggleData } = await supabaseAdmin
      .from('feature_toggles')
      .select('is_enabled')
      .eq('feature_key', 'marketplace_email_confirmation_required')
      .single();

    const requireEmailConfirmation = toggleData?.is_enabled ?? false;
    console.log("📧 Email confirmation required:", requireEmailConfirmation);

    // 1. Create auth user - email_confirm: true means auto-confirm, false means requires confirmation
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: !requireEmailConfirmation,
      user_metadata: {
        first_name, last_name, phone, account_type: 'marketplace',
        ...(module ? { module, plan: planSprawdzony } : {})
      }
    });

    if (authError) {
      console.error("❌ Auth error:", authError.message);
      
      if (authError.message.includes("already been registered") || authError.message.includes("already exists")) {
        // Rejestracja Z LANDINGU MODUŁU to inna sytuacja niż zwykła rejestracja.
        // Ten człowiek nie chce drugiego konta — chce dołożyć moduł do konta,
        // które już ma. „Użyj logowania lub resetuj hasło" wysyłałoby go
        // w stronę odzyskiwania dostępu, którego nie zgubił.
        return new Response(
          JSON.stringify({
            error: module
              ? "Na ten adres jest już konto w GetRido. Zaloguj się — moduł dodamy do istniejącego konta, bez zakładania nowego."
              : "Ten email jest już zarejestrowany. Użyj logowania lub resetuj hasło.",
            code: "EMAIL_EXISTS",
            field: "email"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (authError.message.includes("password")) {
        return new Response(
          JSON.stringify({ 
            error: "Hasło nie spełnia wymagań bezpieczeństwa",
            field: "password"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (authError.message.includes("email")) {
        return new Response(
          JSON.stringify({ 
            error: "Niepoprawny format adresu email",
            field: "email"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Ostatnia furtka. NIE odsyłamy `authError.message` — to komunikat
      // Supabase po angielsku, pisany dla programisty. Trafiał wprost na ekran
      // użytkownika. Oryginał zostaje w logu, gdzie jest przydatny.
      console.error("❌ Nieobsłużony błąd auth:", authError.message);
      return new Response(
        JSON.stringify({
          error: "Nie udało się założyć konta. Sprawdź dane i spróbuj ponownie.",
          code: "AUTH_FAILED"
        }),
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
        phone: phone || null,
        city_id: null,
        account_mode: 'buyer'
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

    // 3a-bis. Moduł warsztatowy: rola + wpis usługodawcy (status wstępny) + minimalny trial.
    // Długość triala z billing_plans.trial_days, nie z liczby w kodzie.
    // UWAGA: celowo TYLKO zapis daty końca trialu (expires_at) — egzekwowanie
    // wygasania/blokad/płatności robimy osobno, później.
    if (module === "warsztat") {
      // KOLEJNOŚĆ MA ZNACZENIE: najpierw warsztat, dopiero potem rola.
      //
      // Odwrotnie było tak, że nieudany zapis warsztatu tylko logował ostrzeżenie,
      // a rola `service_provider` zostawała nadana. Konto wchodziło wtedy do
      // panelu, który nie miał czego pokazać, i nic tego nie naprawiało: przy
      // ponownej próbie rola już istniała, więc nikt nie widział problemu.
      // Przy tej kolejności nie ma czego wycofywać — bez warsztatu po prostu
      // nie ma roli.
      const { error: spError } = await supabaseAdmin
        .from("service_providers")
        .insert({
          user_id: userId,
          company_name: [first_name, last_name].filter(Boolean).join(" ").trim() || email,
          owner_first_name: first_name || null,
          owner_last_name: last_name || null,
          owner_email: email,
          company_email: email,
          company_phone: phone || null,
          status: "pending",
        });

      if (spError) {
        // Konto i mail powitalny już istnieją, więc nie wywracamy całej
        // rejestracji — ale roli NIE nadajemy. Klient dokończy aktywację
        // przez `activate-workshop-trial`, które robi dokładnie to samo.
        console.error("❌ service_providers insert error — pomijam nadanie roli:", spError.message);
      } else {
        console.log("✅ Workshop service_provider created (pending)");

        // Identyfikator świeżo założonego warsztatu — pakiet startowy zapisuje
        // się na nim, więc musimy go odczytać.
        const { data: swiezyWarsztat } = await supabaseAdmin
          .from("service_providers").select("id").eq("user_id", userId)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();

        // Pakiet startowy: 50 SMS + 5 sprawdzeń VIN + 50 pytań do Rido AI,
        // raz na adres. Liczby to DOMYŚLNE WARTOŚCI funkcji w bazie i celowo nie
        // powtarzamy ich w wywołaniu: inaczej zmiana pakietu wymagałaby wdrożenia
        // dwóch funkcji brzegowych i rozjechałaby się przy pierwszej pomyłce.
        // Ten komentarz i tak mówił o 20 SMS-ach długo po tym, jak było ich 30.
        //
        // Funkcja jest idempotentna po znormalizowanym e-mailu, więc
        // powtórna rejestracja ani odtworzenie warsztatu nie dadzą drugiego pakietu.
        const { data: pakiet, error: bladPakietu } = await supabaseAdmin.rpc(
          "przyznaj_pakiet_startowy",
          { p_user_id: userId, p_provider_id: swiezyWarsztat?.id ?? null, p_email: email },
        );
        if (bladPakietu) {
          // Brak pakietu nie może wywrócić rejestracji — konto ma powstać.
          console.error("⚠️ pakiet startowy:", bladPakietu.message);
        } else {
          console.log(pakiet ? "✅ Pakiet startowy przyznany" : "ℹ️ Pakiet startowy już był");
        }

        // Panel /uslugi/panel bramkuje po roli service_provider — bez niej "Brak uprawnień"
        const { error: spRoleError } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role: "service_provider" }, { onConflict: "user_id,role" });
        if (spRoleError) {
          console.error("⚠️ service_provider role error:", spRoleError.message);
        } else {
          console.log("✅ service_provider role assigned");
        }
      }

      const trialDays = await resolveWorkshopTrialDays(supabaseAdmin);
      const trialEndsAt = workshopTrialExpiresAt(trialDays);
      const { error: trialError } = await supabaseAdmin
        .from("paid_service_subscriptions")
        .insert({
          user_id: userId,
          status: "trial",
          started_at: new Date().toISOString(),
          expires_at: trialEndsAt,
          amount_paid: 0,
          metadata: { module, plan: planSprawdzony, trial: true, trial_days: trialDays, source: "self_signup" },
        });
      if (trialError) {
        console.error("⚠️ trial subscription insert error:", trialError.message);
      } else {
        console.log("✅ Workshop trial saved, expires_at:", trialEndsAt);
      }
    }

    // 3b. Generate referral code for the new user (so they can refer others)
    try {
      const { data: codeData, error: codeErr } = await supabaseAdmin.rpc("ensure_referral_code", { p_user_id: userId });
      if (codeErr) console.error("⚠️ ensure_referral_code error:", codeErr.message);
      else console.log("✅ Referral code generated:", codeData);
    } catch (e) {
      console.error("⚠️ ensure_referral_code threw:", e);
    }

    // 3c. Link to referrer if a referral code was provided
    let referralLinked = false;
    if (referral_code && referral_code.trim()) {
      try {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        const ua = req.headers.get("user-agent") || null;
        const { data: linkRes, error: linkErr } = await supabaseAdmin.rpc("link_referral_on_signup", {
          p_referred_user_id: userId,
          p_code: referral_code.trim(),
          p_ip: ip,
          p_user_agent: ua,
        });
        if (linkErr) {
          console.error("⚠️ link_referral_on_signup error:", linkErr.message);
        } else {
          console.log("🔗 Referral link result:", linkRes);
          referralLinked = (linkRes as any)?.linked === true;
        }
      } catch (e) {
        console.error("⚠️ link_referral_on_signup threw:", e);
      }
    }

    // 3d. Credit 20 PLN welcome bonus
    try {
      const { data: bonusRes, error: bonusErr } = await supabaseAdmin.rpc("credit_welcome_bonus", {
        p_user_id: userId,
        p_amount: 20,
      });
      if (bonusErr) console.error("⚠️ credit_welcome_bonus error:", bonusErr.message);
      else console.log("🎁 Welcome bonus credited:", bonusRes);
    } catch (e) {
      console.error("⚠️ credit_welcome_bonus threw:", e);
    }

    // 4. Generate activation link and send email ONLY if email confirmation is required
    let emailSent = !requireEmailConfirmation; // gdy potwierdzenie niewymagane, mail nie jest potrzebny
    if (requireEmailConfirmation) {
      const siteUrl = Deno.env.get('SITE_URL') || 'https://getrido.pl';
      const activationPath = module ? `/aktywacja?module=${module}` : '/aktywacja';
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin
        .generateLink({
          type: 'signup',
          email,
          password,
          options: { redirectTo: `${siteUrl}${activationPath}` }
        });

      if (linkError) {
        console.error("❌ Link generation error:", linkError);
      } else {
        console.log("✅ Activation link generated");
        
        // Send registration email asynchronously
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
              last_name: last_name || '',
              activation_link: linkData.properties?.action_link || '',
              language: "pl"
            })
          });
          
          if (emailResponse.ok) {
            const emailResult = await emailResponse.json().catch(() => ({ success: true }));
            emailSent = emailResult.success !== false;
            if (emailSent) {
              console.log("✅ Registration email sent");
            } else {
              console.error("❌ Email send failed:", JSON.stringify(emailResult));
            }
          } else {
            console.error("❌ Email send failed:", await emailResponse.text());
          }
        } catch (emailError) {
          console.error("❌ Email send error:", emailError);
        }
      }
    } else {
      console.log("⏭️ Email confirmation not required, skipping activation email");
    }

    console.log("🎉 Marketplace registration completed for:", email, "email_sent:", emailSent);

    return new Response(
      JSON.stringify({
        success: true,
        message: !requireEmailConfirmation
          ? "Rejestracja zakończona! Możesz się teraz zalogować."
          : emailSent
            ? "Rejestracja zakończona! Sprawdź swoją skrzynkę email i kliknij link aktywacyjny."
            : "Konto utworzone, ale nie udało się wysłać maila aktywacyjnego. Użyj opcji 'Wyślij link ponownie'.",
        user_id: userId,
        requires_activation: requireEmailConfirmation,
        email_sent: emailSent
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
