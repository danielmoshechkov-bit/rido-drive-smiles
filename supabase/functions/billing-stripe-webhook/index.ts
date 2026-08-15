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
import {
  czyDuplikat,
  mapujStatus,
  naDate,
  okresSubskrypcji,
  sprawdzPodpis,
  wynikBrakuWiersza,
  gwarancjaCeny,
  kwotyZFaktury,
} from "../_shared/stripeWebhook.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeGet(key: string, path: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

/**
 * Aktualizacja subskrypcji po identyfikatorze u operatora.
 *
 * Zwraca liczbę trafionych wierszy. Zero znaczy, że operator zna subskrypcję,
 * której my nie mamy — to NIE jest sukces i nie wolno tego zamknąć jako
 * przetworzone. Taki stan powstaje, gdy ktoś kupił, zanim webhook istniał,
 * albo gdy wiersz skasowano ręcznie; cicho pominięty, wracałby co miesiąc przy
 * każdym `invoice.paid` i nikt by się nie dowiedział, że klient płaci za nic.
 */
type KlientBazy = { from: (tabela: string) => any };

async function aktualizujSubskrypcje(
  admin: KlientBazy,
  providerSubId: string,
  patch: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await admin
    .from("billing_subscriptions")
    .update(patch)
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

/**
 * Odtworzenie brakującego wiersza subskrypcji (4.6b).
 *
 * `checkout.session.completed` bywa jedynym zdarzeniem, przy którym zakładamy
 * subskrypcję. Jeśli przepadnie — bo webhook był chwilowo niedostępny, bo
 * sekret akurat rotował, bo funkcja miała błąd — klient płaci co miesiąc,
 * a u nas nie istnieje. Dziś kończy się to wpisem „klient płaci, my o tym nie
 * wiemy" powtarzanym w nieskończoność.
 *
 * Metadane subskrypcji są kompletne (`subscription_data[metadata]` ustawia
 * billing-checkout), więc odtworzenie jest wykonalne. Dwie rzeczy muszą być
 * przy tym zrobione dobrze:
 *
 *  1. GWARANCJA CENY liczy się od ZAŁOŻENIA subskrypcji (`sub.created`),
 *     nie od dnia odzysku. Inaczej klient, którego zdarzenie przepadło,
 *     dostałby gwarancję dłuższą niż ten, u którego wszystko zadziałało —
 *     nagroda za naszą awarię.
 *  2. CENA w snapshocie pochodzi z POZYCJI FAKTURY, nie z bieżącego cennika.
 *     Między zakupem a odzyskiem cennik mógł się zmienić, a snapshot ma
 *     świadczyć o tym, ile klient naprawdę zapłacił.
 */
async function odtworzSubskrypcje(
  admin: KlientBazy,
  sub: any,
  faktura: any,
): Promise<{ ok: boolean; powod?: string }> {
  const meta = sub?.metadata ?? {};
  const planId = meta.plan_id;
  const subscriberId = meta.subscriber_id;
  const subscriberType = meta.subscriber_type ?? "service_provider";

  if (!planId || !subscriberId) {
    return { ok: false, powod: "brak metadanych plan_id/subscriber_id na subskrypcji" };
  }

  const { data: plan } = await admin.from("billing_plans")
    .select("code, name, vat_rate, price_net_target")
    .eq("id", planId).maybeSingle();

  // Data założenia u operatora — sekundy uniksowe.
  const zalozona = sub?.created ? new Date(sub.created * 1000) : new Date();

  const { data: ustawienia } = await admin.from("billing_settings")
    .select("promo_enrollment_until").eq("id", true).maybeSingle();
  const gwarancja = gwarancjaCeny(zalozona, ustawienia?.promo_enrollment_until);

  const stawka = Number(plan?.vat_rate ?? 23);
  const { brutto, netto, zrodlo: zrodloKwoty } = kwotyZFaktury(faktura, stawka);

  const okres = okresSubskrypcji(sub);

  const { error } = await admin.from("billing_subscriptions").insert({
    subscriber_type: subscriberType,
    subscriber_id: subscriberId,
    plan_id: planId,
    status: mapujStatus(sub.status),
    ...(okres.start ? { current_period_start: okres.start } : {}),
    current_period_end: okres.end,
    provider: "stripe",
    provider_subscription_id: sub.id,
    price_guarantee_until: gwarancja,
    price_snapshot: {
      code: plan?.code ?? null,
      name: plan?.name ?? null,
      price_net: netto,
      price_gross: brutto,
      vat_rate: stawka,
      price_net_target: plan?.price_net_target ?? null,
      // Znacznik pochodzenia. Przy sporze o cenę widać od razu, że wiersz
      // powstał z odzysku, a nie z checkoutu — i skąd wzięła się kwota.
      zrodlo: "odzysk_invoice_paid",
      zrodlo_kwoty: zrodloKwoty,
      subskrypcja_zalozona: zalozona.toISOString(),
      data: new Date().toISOString(),
    },
  });

  if (error) {
    // 23505 = ktoś (albo równoległa dostawa zdarzenia) zdążył założyć wiersz.
    // To nie błąd — cel osiągnięty, subskrypcja istnieje.
    if ((error as { code?: string }).code === "23505") return { ok: true };
    return { ok: false, powod: (error as { message?: string }).message ?? "insert nieudany" };
  }
  return { ok: true };
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

    if (istniejace && czyDuplikat(istniejace.status)) {
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
          // 4.6b — zamiast tylko krzyczeć do logu, próbujemy odtworzyć wiersz.
          // Klient zapłacił; brak wiersza u nas jest NASZĄ awarią, nie jego.
          console.warn("billing-stripe-webhook: brak wiersza dla opłaconej subskrypcji, próbuję odtworzyć", subId);
          const odzysk = await odtworzSubskrypcje(admin, sub, obiekt);
          if (!odzysk.ok) {
            console.error("billing-stripe-webhook: odzysk nieudany", subId, odzysk.powod);
            await zakoncz(
              wynikBrakuWiersza(typ),
              `Subskrypcja ${subId} nieznana w bazie i nie dała się odtworzyć: ${odzysk.powod}`,
            );
            break;
          }
          console.log(JSON.stringify({ event: "subskrypcja_odtworzona", subId }));
        }

        // ---- faktura VAT GetRido (4.17-mini) ----
        //
        // Idempotencja NIE opiera się na `external_id` zdarzenia, tylko na
        // identyfikatorze faktury u operatora: to samo obciążenie może dojść
        // kilkoma różnymi zdarzeniami, a faktura ma być jedna.
        //
        // Błąd wystawienia NIE wywraca obsługi zdarzenia. Subskrypcja jest już
        // przedłużona, klient ma dostęp — brak faktury to sprawa do naprawienia,
        // nie powód, żeby cofać dostęp albo kazać operatorowi ponawiać w kółko.
        try {
          const { data: ustawieniaFaktur } = await admin
            .from("billing_settings")
            .select("auto_invoice_on_paid, platform_invoice_user_id")
            .eq("id", true).maybeSingle();

          const { data: sub } = await admin
            .from("billing_subscriptions")
            .select("subscriber_id, plan_id")
            .eq("provider", "stripe").eq("provider_subscription_id", subId)
            .maybeSingle();

          const { data: warsztat } = sub?.subscriber_id
            ? await admin.from("service_providers")
                .select("company_name, company_nip, company_address, company_postal_code, company_city, owner_email, company_email")
                .eq("id", sub.subscriber_id).maybeSingle()
            : { data: null };

          // Pozycje z faktury operatora, kwoty BRUTTO (tak są ustawione ceny).
          // Grosze → złote; VAT liczy „w stu" billing-invoice-issue, żeby suma
          // zgadzała się z obciążeniem co do grosza.
          const linie = (obiekt?.lines?.data ?? []) as any[];
          const pozycje = linie.map((l) => ({
            name: String(l?.description || "Abonament GetRido"),
            quantity: Number(l?.quantity ?? 1),
            unit: "mies.",
            unit_gross_price: Number(l?.amount ?? 0) / 100 / Number(l?.quantity ?? 1),
            vat_rate: 23,
          })).filter((p) => p.unit_gross_price > 0);

          if (!pozycje.length) {
            console.warn("billing-stripe-webhook: faktura operatora bez pozycji do zafakturowania", obiekt?.id);
          } else {
            const adres = [warsztat?.company_address, `${warsztat?.company_postal_code ?? ""} ${warsztat?.company_city ?? ""}`.trim()]
              .filter(Boolean).join(", ");

            const res = await fetch(`${supabaseUrl}/functions/v1/billing-invoice-issue`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                external_payment_ref: obiekt?.id,
                items: pozycje,
                buyer_name: warsztat?.company_name ?? null,
                buyer_nip: warsztat?.company_nip ?? null,
                buyer_address: adres || null,
                buyer_email: warsztat?.company_email || warsztat?.owner_email || null,
                paid_at: naDate(obiekt?.status_transitions?.paid_at) ?? new Date().toISOString(),
                sale_date: naDate(obiekt?.status_transitions?.paid_at)?.slice(0, 10),
                payment_method: "card",
                notes: `Płatność ${obiekt?.number ?? obiekt?.id}`,
                // Faktury wystawione zanim KSeF ruszy muszą dać się odróżnić
                // i wyczyścić. Marker jest w treści, bo przetrwa eksport i jest
                // widoczny bez zaglądania do kolumn technicznych.
                pre_ksef: true,
              }),
            });
            const wynik = await res.json().catch(() => ({}));

            if (res.ok && wynik?.invoice_id && !wynik?.duplicate) {
              console.log(JSON.stringify({ event: "faktura_wystawiona", numer: wynik.invoice_number, ref: obiekt?.id }));

              // Mail WYŁĄCZNIE gdy `billing_settings.auto_invoice_on_paid`.
              //
              // Domyślnie wyłączone i to jest właściwe ustawienie na start:
              // dopóki PDF powstaje w przeglądarce, fakturę wysyła administrator
              // z panelu — jednym kliknięciem, z załącznikiem. Automat wysłałby
              // wtedy DRUGI mail, bez PDF, i klient dostałby dwa dokumenty
              // o tej samej fakturze.
              if (ustawieniaFaktur?.auto_invoice_on_paid) {
                const mail = await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ invoice_id: wynik.invoice_id, type: "new_invoice" }),
                });
                if (!mail.ok) {
                  console.error("billing-stripe-webhook: faktura wystawiona, mail nie wyszedł", wynik.invoice_number, mail.status);
                }
              } else {
                console.log(JSON.stringify({
                  event: "faktura_do_wyslania_recznie",
                  numer: wynik.invoice_number,
                  powod: "auto_invoice_on_paid = false",
                }));
              }
            } else if (!res.ok) {
              console.error("billing-stripe-webhook: faktura NIE wystawiona", res.status, wynik?.error);
            }
          }
        } catch (e) {
          console.error("billing-stripe-webhook: wyjątek przy fakturze", e);
        }

        await zakoncz("processed");
        break;
      }

      // ------------------------------------------- nieudana płatność
      case "invoice.payment_failed": {
        const subId = obiekt.subscription;
        if (!subId) { await zakoncz("ignored"); break; }

        const trafione = await aktualizujSubskrypcje(admin, subId, { status: "past_due" });
        if (trafione === 0) {
          await zakoncz(wynikBrakuWiersza(typ), `Subskrypcja ${subId} nieznana w bazie`);
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
          await zakoncz(wynikBrakuWiersza(typ), `Subskrypcja ${obiekt.id} nieznana w bazie`);
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
