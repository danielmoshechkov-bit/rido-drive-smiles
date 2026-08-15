// Portal klienta Stripe — zmiana karty, anulowanie, historia faktur (4.8).
//
// Świadomie NIE budujemy tych ekranów u siebie. Zmiana karty oznaczałaby
// przyjmowanie numeru karty na naszej stronie, a to zupełnie inna klasa
// obowiązków (PCI DSS) niż wszystko, co dziś robimy. Anulowanie i historia
// płatności są w portalu za darmo i zawsze aktualne wobec tego, co operator
// naprawdę pobrał.
//
// Podmiot ustalamy PO STRONIE SERWERA z `service_providers.user_id`. Gdyby
// szedł z ciała żądania, każdy zalogowany mógłby otworzyć portal cudzej firmy
// i anulować cudzą subskrypcję albo obejrzeć cudze faktury.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { buildPublicUrl } from "../_shared/publicUrl.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const STRIPE_API = "https://api.stripe.com/v1";

async function stripe(key: string, path: string, form?: Record<string, string>): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Musisz być zalogowany." }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    const caller = userData?.user;
    if (!caller) return json({ error: "Musisz być zalogowany." }, 401);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      // Fail-closed: bez klucza nie udajemy, że portal istnieje.
      console.error("billing-portal: brak STRIPE_SECRET_KEY");
      return json({ error: "GATEWAY_NOT_CONFIGURED", code: "GATEWAY_NOT_CONFIGURED" }, 503);
    }

    // ── Podmiot wołającego ────────────────────────────────────────────
    const { data: providers } = await admin
      .from("service_providers")
      .select("id")
      .eq("user_id", caller.id);

    const providerIds = (providers ?? []).map((p: { id: string }) => p.id);
    if (providerIds.length === 0) {
      return json({ error: "Nie znaleźliśmy Twojej firmy.", code: "NO_PROVIDER" }, 404);
    }

    // ── Klient w Stripe ───────────────────────────────────────────────
    // Kolejność ma znaczenie. Najpierw pytamy o subskrypcję ZAPISANĄ U NAS
    // i z niej bierzemy klienta — to jedyny sposób, żeby trafić do właściwego
    // konta także wtedy, gdy ktoś zmienił adres e-mail po zakupie.
    let customerId: string | null = null;

    const { data: subskrypcje } = await admin
      .from("billing_subscriptions")
      .select("provider_subscription_id, provider, status")
      .eq("subscriber_type", "service_provider")
      .in("subscriber_id", providerIds)
      .eq("provider", "stripe")
      .not("provider_subscription_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const sub = (subskrypcje ?? [])[0] as { provider_subscription_id: string } | undefined;
    if (sub?.provider_subscription_id) {
      try {
        const dane = await stripe(stripeKey, `/subscriptions/${sub.provider_subscription_id}`);
        customerId = typeof dane.customer === "string" ? dane.customer : dane.customer?.id ?? null;
      } catch (e) {
        // Subskrypcja mogła zostać usunięta po stronie operatora — to nie
        // powód, żeby odmówić portalu. Schodzimy do wyszukania po adresie.
        console.warn("billing-portal: nie udało się odczytać subskrypcji:", e);
      }
    }

    // Dopiero gdy nie ma subskrypcji (np. klient jeszcze nie kupił, ale ma
    // konto w Stripe po nieukończonym checkoucie) — szukamy po adresie.
    if (!customerId && caller.email) {
      const znalezieni = await stripe(
        stripeKey,
        `/customers?email=${encodeURIComponent(caller.email)}&limit=1`,
      );
      customerId = znalezieni?.data?.[0]?.id ?? null;
    }

    if (!customerId) {
      // Nie zakładamy klienta „na wszelki wypadek". Portal bez historii
      // płatności i bez karty jest pustym ekranem, a klient odbiera go jak
      // usterkę. Lepiej powiedzieć, że nie ma czym zarządzać.
      return json(
        { error: "Nie masz jeszcze żadnej płatności do zarządzania.", code: "NO_CUSTOMER" },
        404,
      );
    }

    // ── Sesja portalu ─────────────────────────────────────────────────
    const powrot = buildPublicUrl("/uslugi/panel?platnosc=portal");
    const sesja = await stripe(stripeKey, "/billing_portal/sessions", {
      customer: customerId,
      return_url: powrot,
    });

    if (!sesja?.url) {
      return json({ error: "Nie udało się otworzyć portalu płatności." }, 502);
    }

    return json({ url: sesja.url });
  } catch (e) {
    console.error("billing-portal:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
