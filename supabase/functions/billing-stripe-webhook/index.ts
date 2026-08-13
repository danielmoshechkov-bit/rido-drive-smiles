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

/**
 * Weryfikacja podpisu operatora.
 *
 * Zwraca diagnostykę, nie samo `true/false` — przy odrzuceniu trzeba wiedzieć,
 * CZY problem jest w sekrecie, czy w ładunku, a jedno i drugie wygląda tak samo
 * z zewnątrz.
 *
 * Dwie rzeczy, na których poprzednia wersja się wykładała:
 *
 *  1. Nagłówek może zawierać WIELE podpisów `v1` — Stripe wysyła je równolegle
 *     podczas rotacji sekretu. `Object.fromEntries` zostawiał ostatni, więc gdy
 *     pasował pierwszy, weryfikacja padała. Sprawdzamy wszystkie.
 *  2. Sekret z panelu bywa wklejony z niewidocznym znakiem końca linii.
 *     `importKey` bierze bajty dosłownie, więc `whsec_abc` i `whsec_abc\n` to
 *     dwa różne klucze. Przycinamy.
 *
 * Ładunek składamy z BAJTÓW, nie z tekstu: `t.` + surowe body, bez dekodowania
 * i ponownego kodowania. Round-trip przez UTF-8 jest bezstratny dla poprawnego
 * wejścia, ale nie ma powodu go robić — podpis dotyczy bajtów, które przyszły.
 */
interface WynikPodpisu {
  ok: boolean;
  powod?: string;
  diag: Record<string, unknown>;
}

async function sprawdzPodpis(
  bajtyCiala: Uint8Array,
  naglowek: string,
  sekretSurowy: string,
): Promise<WynikPodpisu> {
  const sekret = sekretSurowy.trim();
  const diag: Record<string, unknown> = {
    sekret_prefiks: sekret.slice(0, 8),
    sekret_dlugosc: sekret.length,
    sekret_przyciety: sekret.length !== sekretSurowy.length,
    body_bajtow: bajtyCiala.length,
    naglowek_obecny: !!naglowek,
  };

  if (!naglowek) return { ok: false, powod: "brak nagłówka stripe-signature", diag };

  let t = 0;
  const podpisyV1: string[] = [];
  for (const czesc of naglowek.split(",")) {
    const i = czesc.indexOf("=");
    if (i < 0) continue;
    const klucz = czesc.slice(0, i).trim();
    const wartosc = czesc.slice(i + 1).trim();
    if (klucz === "t") t = Number(wartosc);
    else if (klucz === "v1") podpisyV1.push(wartosc);
  }
  diag.timestamp = t;
  diag.podpisow_v1 = podpisyV1.length;

  if (!t || podpisyV1.length === 0) {
    return { ok: false, powod: "nagłówek bez t albo v1", diag };
  }

  const roznicaS = Math.abs(Date.now() / 1000 - t);
  diag.roznica_czasu_s = Math.round(roznicaS);
  if (roznicaS > TOLERANCJA_S) {
    return { ok: false, powod: `znacznik czasu poza tolerancją (${Math.round(roznicaS)} s)`, diag };
  }

  const klucz = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sekret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // `${t}.` jako bajty + surowe bajty ciała, sklejone bez konwersji tekstowej.
  const prefiks = new TextEncoder().encode(`${t}.`);
  const ladunek = new Uint8Array(prefiks.length + bajtyCiala.length);
  ladunek.set(prefiks, 0);
  ladunek.set(bajtyCiala, prefiks.length);

  const podpis = await crypto.subtle.sign("HMAC", klucz, ladunek);
  const hex = Array.from(new Uint8Array(podpis))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  diag.policzony_prefiks = hex.slice(0, 12);
  diag.otrzymane_prefiksy = podpisyV1.map((p) => p.slice(0, 12));

  const pasuje = podpisyV1.some((v) => rowneStale(hex, v));
  return pasuje ? { ok: true, diag } : { ok: false, powod: "żaden podpis v1 nie pasuje", diag };
}

const naDate = (sekundy: number | null | undefined): string | null =>
  sekundy ? new Date(sekundy * 1000).toISOString() : null;

/**
 * Okres rozliczeniowy subskrypcji.
 *
 * Od wersji API `2026-06-24.dahlia` `current_period_start` i `current_period_end`
 * NIE są już polami subskrypcji — zeszły na poziom pozycji
 * (`subscription.items.data[]`), bo pozycje jednej subskrypcji mogą mieć różne
 * okresy. Czytanie ze starego miejsca dawało `undefined`, a stąd NULL w kolumnie
 * `NOT NULL` i odrzucony zapis.
 *
 * Bierzemy pozycję pierwszą (sprzedajemy jeden plan na subskrypcję), z odwrotem
 * do pól na poziomie subskrypcji — na wypadek konta pinowanego do starszej
 * wersji API. Gdy nie ma ani jednego, zwracamy null i decyzję zostawiamy
 * wywołującemu, zamiast wstawiać NULL do kolumny, która go nie przyjmie.
 */
function okresSubskrypcji(sub: any): { start: string | null; end: string | null } {
  const pozycja = sub?.items?.data?.[0];
  const start = pozycja?.current_period_start ?? sub?.current_period_start ?? null;
  const end = pozycja?.current_period_end ?? sub?.current_period_end ?? null;
  return { start: naDate(start), end: naDate(end) };
}

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

  // Ciało czytane RAZ, jako bajty. Podpis dotyczy dokładnie tych bajtów, więc
  // nie przepuszczamy ich przez dekodowanie i ponowne kodowanie.
  const bajtyCiala = new Uint8Array(await req.arrayBuffer());
  const naglowek = req.headers.get("stripe-signature") || "";

  const wynik = await sprawdzPodpis(bajtyCiala, naglowek, sekret);
  if (!wynik.ok) {
    // Diagnostyka w logu, nie w odpowiedzi: nadawcy bez poprawnego podpisu nie
    // mówimy, co dokładnie mu nie wyszło. Sekret wyłącznie jako 8 znaków —
    // tyle wystarczy, żeby porównać z panelem, i za mało, żeby go użyć.
    console.error("billing-stripe-webhook: podpis odrzucony", JSON.stringify({
      powod: wynik.powod,
      ...wynik.diag,
    }));
    return json({ error: "Nieprawidłowy podpis" }, 400);
  }

  let zdarzenie: any;
  try {
    zdarzenie = JSON.parse(new TextDecoder().decode(bajtyCiala));
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
        const okres = okresSubskrypcji(sub);

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
          // Okres z pozycji subskrypcji — patrz okresSubskrypcji(). Gdy operator
          // go nie poda, zostawiamy wartość domyślną kolumny zamiast NULL-a.
          ...(okres.start ? { current_period_start: okres.start } : {}),
          current_period_end: okres.end,
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

        const okres = okresSubskrypcji(sub);
        const trafione = await aktualizujSubskrypcje(admin, subId, {
          status: mapujStatus(sub.status),
          ...(okres.start ? { current_period_start: okres.start } : {}),
          current_period_end: okres.end,
        });
        if (trafione === 0) {
          console.error("billing-stripe-webhook: opłacona subskrypcja bez odpowiednika w bazie", subId);
          await zakoncz("failed", `Subskrypcja ${subId} nieznana w bazie — klient płaci, my o tym nie wiemy`);
          break;
        }

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

        const trafione = await aktualizujSubskrypcje(admin, subId, { status: "past_due" });
        if (trafione === 0) {
          await zakoncz("failed", `Subskrypcja ${subId} nieznana w bazie`);
          break;
        }

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
        const okres = okresSubskrypcji(obiekt);
        const trafione = await aktualizujSubskrypcje(admin, obiekt.id, {
          status,
          ...(okres.start ? { current_period_start: okres.start } : {}),
          current_period_end: okres.end,
          canceled_at: obiekt.canceled_at ? naDate(obiekt.canceled_at) : null,
          cancel_at: obiekt.cancel_at ? naDate(obiekt.cancel_at) : null,
        });
        if (trafione === 0) {
          // Subskrypcja spoza naszej bazy (np. sprzed wdrożenia webhooka).
          // `ignored`, nie `failed`: przy anulowaniu takiej subskrypcji nie ma
          // czego naprawiać, a ponawianie w nieskończoność nic nie da.
          console.warn("billing-stripe-webhook: zdarzenie cyklu życia dla nieznanej subskrypcji", obiekt.id);
          await zakoncz("ignored", `Subskrypcja ${obiekt.id} nieznana w bazie`);
          break;
        }
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
