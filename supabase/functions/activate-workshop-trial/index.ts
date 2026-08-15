import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveWorkshopTrialDays, workshopTrialExpiresAt } from "../_shared/workshopTrial.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Aktywacja modułu warsztatowego na ISTNIEJĄCYM, zalogowanym koncie
 * (landing /warsztat-info dla usera z sesją oraz ServiceRegistrationModal).
 *
 * Idempotentna: rola/provider/trial zakładane tylko, jeśli ich brak.
 * UWAGA: minimalny trial — tylko zapis expires_at, bez logiki wygasania.
 * Długość okresu bierze się z billing_plans.trial_days (patrz _shared/workshopTrial.ts),
 * nie z liczby w kodzie.
 *
 * TODO (odłożone, do wdrożenia później): wymagać danych firmy (NIP, REGON, dane
 * rejestrowe) ZANIM trial ruszy — żeby użytkownicy nie zakładali kont na marne /
 * przypadkiem. Dziś trial startuje od razu; docelowo aktywacja powinna być bramkowana
 * kompletem danych firmowych (walidacja NIP/REGON, np. przez GUS).
 */
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

    // Autoryzacja: token zalogowanego usera z nagłówka
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Musisz być zalogowany." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const user = userData.user;
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const plan: string | undefined = typeof body.plan === "string" ? body.plan : undefined;

    console.log("🔧 Activating workshop module for:", user.email, "plan:", plan || "-");

    // 1. user_metadata: module + plan (merge, nie nadpisujemy pozostałych pól)
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { ...meta, module: "warsztat", ...(plan ? { plan } : {}) },
    });

    // 2. Wpis usługodawcy (status wstępny) — tylko jeśli brak.
    //    MUSI poprzedzać nadanie roli: patrz komentarz niżej.
    const { data: existingProvider } = await supabaseAdmin
      .from("service_providers")
      .select("id, status")
      .eq("user_id", userId)
      // Konto może mieć więcej niż jeden warsztat. `maybeSingle` zwraca wtedy
      // BŁĄD, nie pierwszy wiersz — a błąd tutaj wyglądał jak „brak warsztatu"
      // i zakładał KOLEJNY.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existingProvider) {
      const firstName = (meta.first_name as string) || "";
      const lastName = (meta.last_name as string) || "";
      const { error: spError } = await supabaseAdmin.from("service_providers").insert({
        user_id: userId,
        company_name: [firstName, lastName].filter(Boolean).join(" ").trim() || user.email,
        owner_first_name: firstName || null,
        owner_last_name: lastName || null,
        owner_email: user.email,
        company_email: user.email,
        company_phone: (meta.phone as string) || null,
        status: "pending",
      });
      if (spError) {
        // Rzucamy, zamiast tylko logować. Wcześniej nieudany zapis zostawiał
        // konto z rolą `service_provider` wskazującą na NIC: panel wpuszczał,
        // a warsztatu nie było — i nic tego stanu nie naprawiało, bo dla
        // ponownego wywołania rola już istniała.
        console.error("❌ service_providers insert error:", spError.message);
        throw spError;
      }
      console.log("✅ service_provider row created (pending)");
    }

    // Rola DOPIERO TERAZ, gdy warsztat na pewno istnieje. Odwrócona kolejność
    // znaczy, że nie ma czego wycofywać przy błędzie — a wycofywanie roli
    // byłoby zgadywaniem, czy nadaliśmy ją my, czy była wcześniej.
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "service_provider" }, { onConflict: "user_id,role" });
    if (roleError) {
      console.error("❌ role error:", roleError.message);
      throw roleError;
    }

    // 4. Minimalny trial — tylko jeśli user nie ma żadnej subskrypcji.
    // Istniejące triale zostają na swoich datach: to INSERT, nie upsert,
    // i wykonuje się wyłącznie przy braku wiersza.
    const { data: existingSub } = await supabaseAdmin
      .from("paid_service_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingSub) {
      const trialDays = await resolveWorkshopTrialDays(supabaseAdmin);
      const trialEndsAt = workshopTrialExpiresAt(trialDays);
      const { error: trialError } = await supabaseAdmin.from("paid_service_subscriptions").insert({
        user_id: userId,
        status: "trial",
        started_at: new Date().toISOString(),
        expires_at: trialEndsAt,
        amount_paid: 0,
        metadata: {
          module: "warsztat",
          plan: plan || null,
          trial: true,
          trial_days: trialDays,
          source: "existing_account_activation",
        },
      });
      if (trialError) {
        console.error("⚠️ trial insert error:", trialError.message);
      } else {
        console.log(`✅ Workshop trial saved (+${trialDays} dni), expires_at:`, trialEndsAt);
      }
    }

    console.log("🎉 Workshop module activated for:", user.email);
    return new Response(
      JSON.stringify({ success: true, message: "Moduł warsztatowy aktywowany." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ activate-workshop-trial error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Nie udało się aktywować modułu. Spróbuj ponownie." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
