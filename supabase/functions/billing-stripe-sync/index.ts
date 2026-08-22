// Synchronizacja cennika z Stripe: billing_plans → Products + Prices.
//
// Dlaczego DWIE ceny na plan:
//   Ceny w Stripe są niezmienne — zmiana kwoty to nowy obiekt Price, nie edycja
//   istniejącego. Gwarancja ceny (12 miesięcy od aktywacji) kończy się przejściem
//   klienta z ceny startowej na docelową, a to jest podmiana pozycji subskrypcji.
//   Gdyby istniała tylko cena startowa, w dniu wygaśnięcia trzeba by zakładać
//   ceny ręcznie, per klient. Dlatego obie powstają od razu (podetap 4.20).
//
// Kwota w Stripe jest BRUTTO (decyzja z 13.08): operator pobiera jedną kwotę,
// a rozbicie na netto i VAT robi nasza faktura. Wystawienie tam netto oznaczałoby
// obciążenie klienta o stawkę VAT za mało.
//
// Idempotencja: produkt szukany po `metadata.plan_code`, cena po zgodności
// (kwota, waluta, interwał) wśród aktywnych cen produktu. Powtórne uruchomienie
// nie tworzy duplikatów i nie rusza tego, co już pasuje.
//
// Brama: JWT → auth.getUser → rola platform_admin z user_roles. Ta sama co
// w billing-admin-plans; cennik u operatora zmienia tylko właściciel platformy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const STRIPE_API = "https://api.stripe.com/v1";

/** Kwota brutto w groszach. Stripe liczy w najmniejszej jednostce waluty. */
const grosze = (net: number | null, vat: number | null): number =>
  Math.round(Number(net ?? 0) * (1 + Number(vat ?? 0) / 100) * 100);

interface StripeCall {
  path: string;
  method?: "GET" | "POST";
  form?: Record<string, string>;
}

/** Wywołanie Stripe formularzem — SDK nie jest potrzebne do czterech endpointów. */
async function stripe(key: string, { path, method = "GET", form }: StripeCall): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Stripe ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * OPISU PLANU NIE WYSYŁAMY DO STRIPE'A — świadomie.
 *
 * `billing_plans.description` jest tekstem CENNIKOWYM i zawiera segmentację
 * po wielkości warsztatu („Warsztat od 4 stanowisk…"). Na `/cennik` to ma
 * sens: klient porównuje plany i wybiera swój rozmiar. Na stronie płatności
 * działa odwrotnie — warsztat z dwoma stanowiskami czyta „od 4 stanowisk"
 * dokładnie w chwili, gdy ma zapłacić, i się wycofuje.
 *
 * Zamiast redagować opis pod dwa różne konteksty zostawiamy w Stripe samą
 * nazwę („GetRido Pro"). Cennik dalej czyta `description` z bazy, więc ta
 * zmiana go nie dotyka.
 */
async function ensureProduct(key: string, plan: any): Promise<string> {
  // Produkty założone WCZEŚNIEJ mają opis zapisany po stronie operatora.
  // Samo przestanie go wysyłać nic by nie dało — trzeba go aktywnie wyczyścić,
  // bo `ensureProduct` przy znalezionym produkcie i tak kończy działanie.
  const wyczyscOpis = async (productId: string) => {
    try {
      await stripe(key, {
        path: `/products/${productId}`,
        method: "POST",
        // Pusty łańcuch to w API Stripe'a sposób na skasowanie pola opcjonalnego.
        form: { description: "" },
      });
    } catch (e) {
      // Nieudane czyszczenie nie może wywrócić synchronizacji cennika —
      // najwyżej na stronie płatności zostanie stary opis.
      console.warn(`ensureProduct: nie udało się wyczyścić opisu produktu ${productId}:`, e);
    }
  };

  if (plan.stripe_product_id) {
    try {
      const existing = await stripe(key, { path: `/products/${plan.stripe_product_id}` });
      if (existing && !existing.deleted) {
        if (existing.description) await wyczyscOpis(existing.id);
        return existing.id;
      }
    } catch {
      // Produkt zniknął po stronie operatora (np. inne środowisko) — zakładamy nowy.
    }
  }

  const found = await stripe(key, {
    path: `/products/search?query=${encodeURIComponent(`metadata['plan_code']:'${plan.code}'`)}`,
  });
  if (found?.data?.length) {
    const znaleziony = found.data[0];
    if (znaleziony.description) await wyczyscOpis(znaleziony.id);
    return znaleziony.id;
  }

  const created = await stripe(key, {
    path: "/products",
    method: "POST",
    form: {
      name: `GetRido ${plan.name}`,
      "metadata[plan_code]": plan.code,
      "metadata[product_line]": plan.product_line ?? "other",
    },
  });
  return created.id;
}

/**
 * Cena o zadanej kwocie — istniejąca albo nowa.
 *
 * Nie dezaktywujemy starych cen: subskrypcje klientów wciąż na nie wskazują,
 * a gwarancja ceny mówi, że mają na nich zostać przez 12 miesięcy.
 */
async function ensurePrice(
  key: string,
  productId: string,
  amount: number,
  interval: string,
  rodzaj: "startowa" | "docelowa",
): Promise<string> {
  const lista = await stripe(key, {
    path: `/prices?product=${productId}&active=true&limit=100`,
  });
  const pasuje = (lista?.data ?? []).find(
    (p: any) =>
      p.unit_amount === amount &&
      p.currency === "pln" &&
      p.recurring?.interval === interval &&
      p.metadata?.rodzaj === rodzaj,
  );
  if (pasuje) return pasuje.id;

  const created = await stripe(key, {
    path: "/prices",
    method: "POST",
    form: {
      product: productId,
      currency: "pln",
      unit_amount: String(amount),
      "recurring[interval]": interval,
      "metadata[rodzaj]": rodzaj,
    },
  });
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- brama ----
    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "platform_admin").maybeSingle();
    if (roleErr) {
      console.error("billing-stripe-sync: nie można potwierdzić roli", roleErr);
      return json({ error: "Nie można potwierdzić uprawnień" }, 503);
    }
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    // ---- konfiguracja ----
    // Fail-closed: brak klucza to odmowa, nie ciche pominięcie synchronizacji.
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return json({ error: "GATEWAY_NOT_CONFIGURED", detail: "Brak sekretu STRIPE_SECRET_KEY" }, 503);
    }
    const tryb = stripeKey.startsWith("sk_live_") ? "produkcja" : "test";

    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const tylkoPlan: string | undefined = body?.plan_code;

    // Plany indywidualne (is_custom) nie mają ceny, więc nie mają czego
    // synchronizować — kwota jest ustalana per umowa poza operatorem.
    let q = admin.from("billing_plans")
      .select("id, code, name, description, product_line, price_net, price_net_target, vat_rate, billing_interval, is_active, is_custom, stripe_product_id, stripe_price_id, stripe_price_id_target, stripe_price_id_rok, stripe_price_id_rok_target")
      .eq("is_active", true).eq("is_custom", false);
    if (tylkoPlan) q = q.eq("code", tylkoPlan);

    const { data: plans, error: plansErr } = await q.order("sort_order");
    if (plansErr) throw plansErr;

    const wynik: Array<Record<string, unknown>> = [];

    for (const plan of plans ?? []) {
      try {
        const interval = plan.billing_interval === "year" ? "year" : "month";
        const kwotaStart = grosze(plan.price_net, plan.vat_rate);

        // Plan darmowy nie ma czego sprzedawać — Stripe nie przyjmie ceny 0
        // w subskrypcji bez dodatkowej konfiguracji, a Free i tak nie przechodzi
        // przez checkout.
        if (kwotaStart <= 0) {
          wynik.push({ plan: plan.code, pominiety: "cena zerowa" });
          continue;
        }

        const productId = await ensureProduct(stripeKey, plan);
        const priceStart = await ensurePrice(stripeKey, productId, kwotaStart, interval, "startowa");

        let priceTarget: string | null = null;
        if (plan.price_net_target != null) {
          const kwotaTarget = grosze(plan.price_net_target, plan.vat_rate);
          if (kwotaTarget > 0) {
            priceTarget = await ensurePrice(stripeKey, productId, kwotaTarget, interval, "docelowa");
          }
        }

        /**
         * CENY ROCZNE — ten sam plan, drugi okres.
         *
         * Ceny w Stripe są niezmienne, więc każdy okres potrzebuje własnego
         * obiektu. Zamiast zakładać osobne PLANY roczne (co podwoiłoby cennik
         * i zamieniło wybór okresu w wybór planu), jeden plan dostaje dwie pary
         * cen: miesięczną i roczną, każda w wariancie startowym i docelowym.
         *
         * Kwotę roczną liczy BAZA — `billing_cena_okresu` z jednym mnożnikiem
         * w jednym miejscu. Ta funkcja tylko przenosi wynik do Stripe; gdyby
         * liczyła sama, rabat roczny istniałby w dwóch kopiach.
         *
         * Linię warsztatową sprzedajemy miesięcznie albo rocznie; pozostałe
         * (Agent) zostają przy swoim `billing_interval` do osobnej decyzji.
         */
        let priceRok: string | null = null;
        let priceRokTarget: string | null = null;

        if (plan.product_line === "warsztat" && interval === "month" && !plan.is_custom) {
          const { data: wycena } = await (admin as any)
            .rpc("billing_cena_okresu", {
              p_plan_code: plan.code, p_provider: null, p_okres: "rok",
            })
            .maybeSingle();

          if (wycena?.cena_brutto) {
            const kwotaRok = Math.round(Number(wycena.cena_brutto) * 100);
            if (kwotaRok > 0) {
              priceRok = await ensurePrice(stripeKey, productId, kwotaRok, "year", "startowa");
            }
          }

          if (plan.price_net_target != null) {
            // Cena docelowa roku: ta sama reguła (dziesięć miesięcy), tyle że
            // liczona z ceny docelowej. Nie pytamy o nią bazy, bo funkcja
            // wycenia po gwarancji KLIENTA, a tu nie ma klienta — mnożnik jest
            // ten sam i wynika z tej samej reguły.
            const kwotaRokTarget = grosze(Number(plan.price_net_target) * 10, plan.vat_rate);
            if (kwotaRokTarget > 0) {
              priceRokTarget = await ensurePrice(stripeKey, productId, kwotaRokTarget, "year", "docelowa");
            }
          }
        }

        const patch = {
          stripe_product_id: productId,
          stripe_price_id: priceStart,
          stripe_price_id_target: priceTarget,
          stripe_price_id_rok: priceRok,
          stripe_price_id_rok_target: priceRokTarget,
        };
        const { error: updErr } = await admin.from("billing_plans").update(patch).eq("id", plan.id);
        if (updErr) throw updErr;

        await admin.from("billing_audit_log").insert({
          actor_id: caller.id,
          action: "plan.stripe_synced",
          target_table: "billing_plans",
          target_id: plan.id,
          before: {
            stripe_product_id: plan.stripe_product_id,
            stripe_price_id: plan.stripe_price_id,
            stripe_price_id_target: plan.stripe_price_id_target,
          },
          after: { ...patch, tryb },
        });

        wynik.push({ plan: plan.code, ...patch });
      } catch (e: any) {
        // Jeden plan nie może zatrzymać reszty — raportujemy i idziemy dalej.
        console.error("billing-stripe-sync: plan", plan.code, e?.message);
        wynik.push({ plan: plan.code, blad: e?.message ?? String(e) });
      }
    }

    return json({ tryb, zsynchronizowano: wynik.filter((w) => !w.blad && !w.pominiety).length, wynik });
  } catch (e: any) {
    console.error("billing-stripe-sync error:", e);
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
