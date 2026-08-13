// Webhook Stripe — jedyne miejsce, w którym subskrypcja powstaje i zmienia stan.
//
// Zasada: pieniądze potwierdza operator, nie przeglądarka. `billing-checkout`
// tylko otwiera sesję; wszystko, co dotyczy dostępu klienta, dzieje się tutaj,
// po podpisanym zdarzeniu.
//
// IDEMPOTENCJA. Operator ponawia dostawę przy każdym timeoucie i błędzie 5xx,
// czasem godzinami. Zdarzenie jest najpierw ZGŁASZANE do billing_events; konflikt
// na indeksie (provider, external_id) znaczy „już to widzieliśmy" i kończy
// obsługę odpowiedzią 200. Bez tego druga dostawa `invoice.paid` założyłaby
// drugą subskrypcję, a po 4.17 wystawiła drugą fakturę.
//
// PODPIS. Weryfikowany ręcznie (HMAC-SHA256 po `${timestamp}.${surowe_ciało}`),
// bo SDK Stripe'a w Deno ciągnie zależność, której nie potrzebujemy do jednego
// porównania. Ciało czytane RAZ jako tekst — przeliczenie po sparsowaniu JSON-a
// dałoby inny bajt po bajcie ładunek i podpis nigdy by się nie zgodził.
//
// FAIL-CLOSED. Brak sekretu = 503 i żadnego przetwarzania. Zły podpis = 400.
// Nigdy nie ufamy treści zdarzenia bez potwierdzenia, że pochodzi od operatora.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const STRIPE_API = "https://api.stripe.com/v1";
/** Okno tolerancji znacznika czasu — chroni przed odtworzeniem starego żądania. */
const TOLERANCJA_S = 300;

async function stripeGet(key: string, path: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

/** Porównanie w czasie stałym — długość i tak jest jawna, treść nie. */
function rowneStale(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let roznica = 0;
  for (let i = 0; i < a.length; i++) roznica |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return roznica === 0;
}

async function podpisPoprawny(surowe: string, naglowek: string, sekret: string): Promise<boolean> {
  // Nagłówek ma postać: t=1700000000,v1=abc...,v0=... (v0 ignorujemy)
  const czesci = Object.fromEntries(
    naglowek.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(czesci.t);
  const v1 = czesci.v1;
  if (!t || !v1) return false;

  if (Math.abs(Date.now() / 1000 - t) > TOLERANCJA_S) {
    console.error("billing-stripe-webhook: znacznik czasu poza tolerancją");
    return false;
  }

  const klucz = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sekret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const podpis = await crypto.subtle.sign("HMAC", klucz, new TextEncoder().encode(`${t}.${surowe}`));
  const hex = Array.from(new Uint8Array(podpis))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return rowneStale(hex, v1);
}

const naDate = (sekundy: number | null | undefined): string | null =>
  sekundy ? new Date(sekundy * 1000).toISOString() : null;

/** Statusy Stripe → nasze. `incomplete_expired` i `unpaid` traktujemy jak koniec. */
function mapujStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "unpaid": return "canceled";
    default: return "past_due";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const sekret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sekret || !stripeKey) {
    console.error("billing-stripe-webhook: brak STRIPE_WEBHOOK_SECRET lub STRIPE_SECRET_KEY");
    return json({ error: "GATEWAY_NOT_CONFIGURED" }, 503);
  }

  // Ciało czytane RAZ i tylko jako tekst — podpis liczy się z dokładnie tych bajtów.
  const surowe = await req.text();
  const naglowek = req.headers.get("stripe-signature") || "";
  if (!naglowek || !(await podpisPoprawny(surowe, naglowek, sekret))) {
    console.error("billing-stripe-webhook: podpis odrzucony");
    return json({ error: "Nieprawidłowy podpis" }, 400);
  }

  let zdarzenie: any;
  try {
    zdarzenie = JSON.parse(surowe);
  } catch {
    return json({ error: "Nieprawidłowy ładunek" }, 400);
  }

  const typ = String(zdarzenie?.type ?? "");
  const eventId = String(zdarzenie?.id ?? "");
  if (!eventId) return json({ error: "Zdarzenie bez identyfikatora" }, 400);

  // ---- ZGŁOSZENIE ZDARZENIA (idempotencja) ----
  const { error: claimErr } = await admin.from("billing_events").insert({
    provider: "stripe",
    event_type: typ,
    external_id: eventId,
    payload: zdarzenie,
    status: "pending",
  });

  if (claimErr) {
    if (claimErr.code !== "23505") {
      console.error("billing-stripe-webhook: nie zgłoszono zdarzenia", claimErr);
      // 500 — niech operator ponowi, bo nie wiemy, czy przetworzyliśmy.
      return json({ error: "Nie zapisano zdarzenia" }, 500);
    }

    // Zdarzenie już widzieliśmy — ale „widzieliśmy" nie znaczy „obsłużyliśmy".
    // Gdyby każdy konflikt kończył się 200, pierwsza nieudana próba (chwilowy
    // błąd sieci przy odpytaniu operatora) przepadłaby na zawsze: ponowienie
    // trafiałoby na ten sam konflikt i odchodziło z sukcesem.
    // Domykamy tylko to, co naprawdę domknięte; resztę przetwarzamy ponownie.
    const { data: istniejace } = await admin.from("billing_events")
      .select("status, attempts")
      .eq("provider", "stripe").eq("external_id", eventId)
      .maybeSingle();

    if (istniejace && (istniejace.status === "processed" || istniejace.status === "ignored")) {
      console.log(JSON.stringify({ event: "duplikat", typ, eventId, status: istniejace.status }));
      return json({ received: true, duplicate: true });
    }

    await admin.from("billing_events")
      .update({ attempts: (istniejace?.attempts ?? 0) + 1, status: "pending" })
      .eq("provider", "stripe").eq("external_id", eventId);
    console.log(JSON.stringify({ event: "ponowienie", typ, eventId, proba: (istniejace?.attempts ?? 0) + 1 }));
  }

  const zakoncz = async (status: "processed" | "ignored" | "failed", blad?: string) => {
    await admin.from("billing_events")
      .update({ status, processed_at: new Date().toISOString(), last_error: blad ?? null })
      .eq("provider", "stripe").eq("external_id", eventId);
  };

  try {
    const obiekt = zdarzenie?.data?.object ?? {};

    switch (typ) {
      // ---------------------------------------------- pierwsza płatność
      case "checkout.session.completed": {
        if (obiekt.mode !== "subscription") { await zakoncz("ignored"); break; }

        const meta = obiekt.metadata ?? {};
        const planId = meta.plan_id;
        const subscriberId = meta.subscriber_id;
        const subscriberType = meta.subscriber_type ?? "service_provider";
        if (!planId || !subscriberId) {
          await zakoncz("failed", "Brak metadanych plan_id/subscriber_id");
          break;
        }

        const sub = await stripeGet(stripeKey, `/subscriptions/${obiekt.subscription}`);

        const { data: plan } = await admin.from("billing_plans")
          .select("code, name, price_net, price_gross, vat_rate, price_net_target")
          .eq("id", planId).maybeSingle();

        // 4.9 — gwarancja ceny: 12 miesięcy od aktywacji, jeśli zakup nastąpił
        // w okresie promocyjnym. Data jest przypisana do wejścia klienta na
        // platformę, więc przy zmianie planu ma zostać nietknięta.
        const { data: ustawienia } = await admin.from("billing_settings")
          .select("promo_enrollment_until").eq("id", true).maybeSingle();
        const doKiedyPromo = ustawienia?.promo_enrollment_until;
        const wPromocji = !doKiedyPromo || new Date() <= new Date(doKiedyPromo);
        const gwarancja = wPromocji
          ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
          : null;

        const { error: insErr } = await admin.from("billing_subscriptions").insert({
          subscriber_type: subscriberType,
          subscriber_id: subscriberId,
          plan_id: planId,
          status: mapujStatus(sub.status),
          current_period_start: naDate(sub.current_period_start),
          current_period_end: naDate(sub.current_period_end),
          provider: "stripe",
          provider_subscription_id: sub.id,
          price_guarantee_until: gwarancja,
          price_snapshot: {
            code: plan?.code ?? null,
            name: plan?.name ?? null,
            price_net: plan?.price_net ?? null,
            price_gross: plan?.price_gross ?? null,
            vat_rate: plan?.vat_rate ?? null,
            price_net_target: plan?.price_net_target ?? null,
            zrodlo: "checkout",
            data: new Date().toISOString(),
          },
        });

        if (insErr) {
          // 23505 = indeks jednej aktywnej subskrypcji na linię produktową.
          // Klient zapłacił dwa razy za to samo — to sprawa do zwrotu, nie do
          // ponawiania webhooka, więc kończymy zdarzenie jako nieudane i 200.
          if (insErr.code === "23505") {
            console.error("billing-stripe-webhook: subskrypcja już istnieje", subscriberId, planId);
            await zakoncz("failed", "Subskrypcja w tej linii produktowej już istnieje — sprawdź zwrot");
            break;
          }
          throw insErr;
        }

        console.log(JSON.stringify({ event: "subskrypcja_zalozona", plan: plan?.code, subscriberId }));
        await zakoncz("processed");
        break;
      }

      // ------------------------------------------------- kolejne okresy
      case "invoice.paid": {
        const subId = obiekt.subscription;
        if (!subId) { await zakoncz("ignored"); break; }
        const sub = await stripeGet(stripeKey, `/subscriptions/${subId}`);

        const { error } = await admin.from("billing_subscriptions").update({
          status: mapujStatus(sub.status),
          current_period_start: naDate(sub.current_period_start),
          current_period_end: naDate(sub.current_period_end),
        }).eq("provider", "stripe").eq("provider_subscription_id", subId);
        if (error) throw error;

        // TODO(4.17): tutaj wpina się wystawienie faktury VAT GetRido —
        // idempotentnie, po `external_id` zdarzenia, żeby powtórna dostawa
        // nie stworzyła drugiego dokumentu.
        await zakoncz("processed");
        break;
      }

      // ------------------------------------------- nieudana płatność
      case "invoice.payment_failed": {
        const subId = obiekt.subscription;
        if (!subId) { await zakoncz("ignored"); break; }

        const { error } = await admin.from("billing_subscriptions")
          .update({ status: "past_due" })
          .eq("provider", "stripe").eq("provider_subscription_id", subId);
        if (error) throw error;

        // Karencja (billing_settings.grace_period_days, domyślnie 7 dni) z pełnym
        // dostępem; zejście na read_only robi zadanie cykliczne z 4.16, nie webhook.
        console.log(JSON.stringify({ event: "platnosc_nieudana", subId }));
        await zakoncz("processed");
        break;
      }

      // -------------------------------------- zmiany cyklu życia
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const status = typ.endsWith("deleted") ? "canceled" : mapujStatus(obiekt.status);
        const { error } = await admin.from("billing_subscriptions").update({
          status,
          current_period_start: naDate(obiekt.current_period_start),
          current_period_end: naDate(obiekt.current_period_end),
          canceled_at: obiekt.canceled_at ? naDate(obiekt.canceled_at) : null,
          cancel_at: obiekt.cancel_at ? naDate(obiekt.cancel_at) : null,
        }).eq("provider", "stripe").eq("provider_subscription_id", obiekt.id);
        if (error) throw error;
        await zakoncz("processed");
        break;
      }

      // ------------------------------------------------------- zwroty
      case "charge.refunded": {
        // Korekta faktury i ewentualne zamknięcie dostępu to 4.17. Na razie
        // zdarzenie zostaje zapisane w całości — bez niego nie odtworzymy,
        // co i kiedy zwrócono.
        console.log(JSON.stringify({ event: "zwrot", charge: obiekt.id, kwota: obiekt.amount_refunded }));
        await zakoncz("ignored");
        break;
      }

      default:
        await zakoncz("ignored");
    }

    return json({ received: true });
  } catch (e: any) {
    console.error("billing-stripe-webhook:", typ, e?.message ?? e);
    await zakoncz("failed", String(e?.message ?? e));
    // 500 → operator ponowi, a ponowienie wejdzie ścieżką dla statusu `failed`
    // i spróbuje jeszcze raz. Zdarzenia zakończone jako `processed`/`ignored`
    // są odporne na ponowienia; nieudane celowo nie są.
    return json({ error: "Nie przetworzono zdarzenia" }, 500);
  }
});
