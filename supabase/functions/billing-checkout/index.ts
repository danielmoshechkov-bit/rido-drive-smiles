// Rozpoczęcie płatności za subskrypcję — sesja Stripe Checkout.
//
// Ta funkcja NIE zakłada subskrypcji w naszej bazie. Robi to dopiero webhook
// (podetap 4.6) po potwierdzeniu płatności przez operatora. Jedno źródło prawdy:
// subskrypcja istnieje wtedy, gdy pieniądze doszły, a nie wtedy, gdy ktoś
// kliknął „kupuję" i zamknął kartę na stronie płatności.
//
// Brama: zalogowany użytkownik. Podmiot (`subscriber_id`) ustalamy PO STRONIE
// SERWERA z `service_providers.user_id`, nigdy z ciała żądania — inaczej każdy
// mógłby opłacić subskrypcję cudzemu warsztatowi albo, co gorsza, przypisać
// sobie cudzą.
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
      // Fail-closed: bez bramki nie udajemy, że płatność ruszyła.
      console.error("billing-checkout: brak STRIPE_SECRET_KEY");
      return json({ error: "GATEWAY_NOT_CONFIGURED" }, 503);
    }

    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const planCode = String(body?.plan_code ?? "").trim();
    if (!planCode) return json({ error: "Brak kodu planu" }, 400);

    // Okres rozliczeniowy. Cokolwiek innego niż „rok" znaczy miesiąc — nie
    // zgadujemy i nie odmawiamy, bo brak pola to po prostu starsze wywołanie.
    const okresRok = String(body?.okres ?? "miesiac").trim() === "rok";

    // ---- plan ----
    const { data: plan, error: planErr } = await admin
      .from("billing_plans")
      .select("id, code, name, product_line, price_net, is_active, is_custom, stripe_price_id, stripe_price_id_rok")
      .eq("code", planCode)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan || !plan.is_active) return json({ error: "Plan niedostępny" }, 404);
    if (plan.is_custom) return json({ error: "Ten plan wyceniamy indywidualnie — napisz do nas." }, 400);
    if (Number(plan.price_net) === 0) return json({ error: "Plan darmowy nie wymaga płatności" }, 400);
    /**
     * Cena w Stripe zależy od OKRESU, bo obiekty Price są tam niezmienne
     * i każdy okres ma własny. Zakłada je synchronizacja cennika — jeśli
     * roczna nie istnieje, mówimy to wprost zamiast po cichu sprzedawać
     * miesiąc komuś, kto wybrał rok.
     */
    const cenaStripe = okresRok ? plan.stripe_price_id_rok : plan.stripe_price_id;
    if (okresRok && !plan.stripe_price_id_rok) {
      return json({
        error: "Ten plan nie ma jeszcze ceny rocznej. Wybierz miesiąc albo odezwij się do nas.",
        code: "PLAN_ROK_NOT_SYNCED",
      }, 409);
    }
    if (!plan.stripe_price_id) {
      // Plan po zmianie ceny czeka na resynchronizację — lepiej odmówić niż
      // obciążyć klienta kwotą, której nie ma już w cenniku.
      return json({ error: "Plan wymaga synchronizacji ze Stripe", code: "PLAN_NOT_SYNCED" }, 409);
    }

    // ---- podmiot: wyłącznie z serwera ----
    const { data: providers, error: provErr } = await admin
      .from("service_providers")
      .select("id, company_name")
      .eq("user_id", caller.id)
      .order("created_at", { ascending: true });
    if (provErr) throw provErr;
    if (!providers?.length) {
      return json({ error: "To konto nie ma jeszcze warsztatu.", code: "NO_PROVIDER" }, 409);
    }
    // Do czasu przełącznika podmiotu (4.1) bierzemy najstarszy warsztat konta.
    const provider = providers[0];

    // ---- już opłacone? ----
    // Schemat dopuszcza jedną aktywną subskrypcję na linię produktową i pilnuje
    // tego indeksem. Sprawdzamy wcześniej, żeby klient nie zapłacił za coś,
    // czego baza i tak nie przyjmie.
    //
    // `read_only` ŚWIADOMIE NIE BLOKUJE. To stan po wygasłej karencji, w którym
    // klient widzi ekran „Wybierz plan, aby wrócić do pracy" — i musi móc
    // z niego kupić. Wcześniej ta lista zawierała `read_only`, więc kliknięcie
    // kończyło się komunikatem „masz już aktywną subskrypcję": jedyna ścieżka
    // powrotu prowadziła w ślepy zaułek.
    //
    // Baza na to pozwala: indeks `billing_subscriptions_one_active` obejmuje
    // wyłącznie 'trialing', 'active' i 'past_due', więc nowy wiersz nie wchodzi
    // w konflikt ze starym. Wszędzie, gdzie czytamy subskrypcję, bierzemy
    // najnowszą (`ORDER BY created_at DESC LIMIT 1`) — czyli tę opłaconą.
    // 🔴 NAPRAWIONE 22.08.2026 — TO BLOKOWAŁO CAŁĄ SPRZEDAŻ KARTĄ.
    //
    // Warunek brzmiał `status IN ('trialing','active','past_due')` i był
    // poprawny dokładnie do wariantu A, który dał wiersz `trialing` KAŻDEMU
    // warsztatowi. Od tamtej chwili każdy był „już zasubskrybowany", a klient,
    // który chciał zapłacić, dostawał odmowę 409.
    //
    // Okres próbny i miesiąc kupiony BLIK-iem to stany, z KTÓRYCH klient
    // wychodzi, kupując. Odmawiamy wyłącznie wtedy, gdy naprawdę jest już
    // subskrypcja odnawiana u operatora — bo wtedy druga byłaby podwójnym
    // obciążeniem, a nie zakupem.
    const { data: istniejaca } = await admin
      .from("billing_subscriptions")
      .select("id, status, provider, provider_subscription_id")
      .eq("subscriber_type", "service_provider")
      .eq("subscriber_id", provider.id)
      .eq("product_line", plan.product_line)
      .in("status", ["active", "past_due"])
      .eq("provider", "stripe")
      .not("provider_subscription_id", "is", null)
      .maybeSingle();
    if (istniejaca) {
      return json({
        error: "Ten warsztat ma już subskrypcję odnawianą kartą. Zmienisz plan w panelu rozliczeń.",
        code: "ALREADY_SUBSCRIBED",
      }, 409);
    }

    // ---- klient u operatora ----
    // Szukamy po e-mailu, zanim założymy nowego — inaczej przy drugim zakupie
    // (Warsztat + Agent) klient miałby dwie karty i dwie historie płatności.
    let customerId: string | null = null;
    const znalezieni = await stripe(stripeKey, `/customers?email=${encodeURIComponent(caller.email ?? "")}&limit=1`);
    if (znalezieni?.data?.length) {
      customerId = znalezieni.data[0].id;
    } else {
      const utworzony = await stripe(stripeKey, "/customers", {
        email: caller.email ?? "",
        name: provider.company_name ?? "",
        "metadata[user_id]": caller.id,
        "metadata[provider_id]": provider.id,
      });
      customerId = utworzony.id;
    }

    // ---- sesja ----
    // `session_id` w success_url jest konieczny: webhook potrafi dojechać PO
    // przekierowaniu, więc panel musi mieć czego odpytywać przez chwilę po
    // powrocie. Bez tego klient widzi brak dostępu i płaci drugi raz.
    const sesja = await stripe(stripeKey, "/checkout/sessions", {
      mode: "subscription",
      customer: customerId!,
      "line_items[0][price]": cenaStripe,
      "line_items[0][quantity]": "1",
      success_url: buildPublicUrl("/uslugi/panel?platnosc=ok&session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: buildPublicUrl("/cennik?platnosc=anulowana"),
      client_reference_id: provider.id,
      "metadata[plan_id]": plan.id,
      "metadata[plan_code]": plan.code,
      "metadata[product_line]": plan.product_line,
      "metadata[subscriber_type]": "service_provider",
      "metadata[subscriber_id]": provider.id,
      "metadata[user_id]": caller.id,
      // Te same dane na subskrypcji, nie tylko na sesji: zdarzenia cyklu życia
      // (invoice.paid, subscription.updated) nie niosą metadanych sesji.
      "subscription_data[metadata][plan_id]": plan.id,
      "subscription_data[metadata][subscriber_type]": "service_provider",
      "subscription_data[metadata][subscriber_id]": provider.id,
      "subscription_data[metadata][user_id]": caller.id,
      locale: "pl",
    });

    console.log(JSON.stringify({
      event: "checkout_utworzony",
      plan: plan.code,
      provider: provider.id,
      session: sesja.id,
    }));

    return json({ url: sesja.url, session_id: sesja.id });
  } catch (e: any) {
    console.error("billing-checkout error:", e);
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
