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
  // Klucz serwisowy w osobnej stałej: woła nim nie tylko klient bazy, ale też
  // funkcja wystawiająca fakturę, która przyjmuje wyłącznie takie wywołania.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

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
          .select("code, name, price_net, price_gross, vat_rate, price_net_target, product_line")
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

        // CZY TO PIERWSZY WIERSZ, CZY PRZEJŚCIE Z OKRESU PRÓBNEGO.
        //
        // Do wariantu A klient bez zakupu nie miał żadnego wiersza, więc
        // `INSERT` był poprawny. Teraz każdy warsztat ma wiersz `trialing` —
        // a indeks „jedna aktywna subskrypcja na linię produktową" odrzuciłby
        // drugi. Zakup w okresie próbnym to PRZEJŚCIE tego samego wiersza
        // w stan opłacony, nie założenie kolejnego.
        const { data: dotychczasowa } = await admin
          .from("billing_subscriptions")
          .select("id, price_guarantee_until")
          .eq("subscriber_type", subscriberType)
          .eq("subscriber_id", subscriberId)
          .eq("product_line", plan?.product_line ?? "warsztat")
          .in("status", ["trialing", "active", "past_due", "read_only"])
          .maybeSingle();

        const wiersz = {
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
          // Gwarancja biegnie od PIERWSZEGO zakupu klienta, nie od tego.
          // Kto kupił wcześniej miesiąc BLIK-iem, nie dostaje jej od nowa.
          price_guarantee_until: dotychczasowa?.price_guarantee_until ?? gwarancja,
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
        };

        // Przejście z okresu próbnego (albo z miesiąca kupionego BLIK-iem)
        // aktualizuje istniejący wiersz. Nowy zakładamy tylko wtedy, gdy klient
        // naprawdę nie ma jeszcze nic w tej linii.
        const { error: insErr } = dotychczasowa
          ? await admin.from("billing_subscriptions").update(wiersz).eq("id", dotychczasowa.id)
          : await admin.from("billing_subscriptions").insert(wiersz);

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

        /**
         * FAKTURA VAT GetRido — PO ZAKSIĘGOWANIU OKRESU, NIGDY JAKO WARUNEK.
         *
         * Ta sama zasada i ten sam kształt co przy PayU: dokument powstaje
         * dopiero, gdy dostęp jest przedłużony, a nieudane wystawienie NIE
         * wywraca webhooka. Klient zapłacił i ma dostęp; brak faktury naprawia
         * się jednym wywołaniem, cofnięcie okresu — nie.
         *
         * IDEMPOTENCJA PO IDENTYFIKATORZE RACHUNKU U OPERATORA (`in_...`),
         * nie po identyfikatorze zdarzenia. To samo obciążenie potrafi dojść
         * kilkoma zdarzeniami, a faktura ma być jedna — pilnuje tego unikalny
         * indeks na `external_payment_ref`.
         *
         * KWOTA Z `amount_paid`, w groszach. Bierzemy to, co operator NAPRAWDĘ
         * pobrał, a nie cenę z cennika: przy zmianie planu rachunek opiewa na
         * różnicę, a faktura ma zgadzać się z obciążeniem co do grosza.
         */
        try {
          const { data: naszaSub } = await admin
            .from("billing_subscriptions")
            .select("subscriber_id, plan:billing_plans!billing_subscriptions_plan_id_fkey(name)")
            .eq("provider", "stripe")
            .eq("provider_subscription_id", subId)
            .maybeSingle();

          const { data: nabywca } = naszaSub?.subscriber_id
            ? await admin
                .from("service_providers")
                .select("company_name, company_nip, company_address, company_city, company_postal_code, company_email, owner_email")
                .eq("id", naszaSub.subscriber_id)
                .maybeSingle()
            : { data: null };

          const kwota = Number(obiekt?.amount_paid ?? 0) / 100;
          if (kwota <= 0) {
            // Rachunek na zero (np. sam upust) nie rodzi faktury — nie ma za co.
            console.log(JSON.stringify({ event: "stripe_faktura_pominieta", powod: "kwota_zero", subId }));
          } else {
            const adres = [
              (nabywca as any)?.company_address,
              [(nabywca as any)?.company_postal_code, (nabywca as any)?.company_city]
                .filter(Boolean).join(" "),
            ].filter(Boolean).join(", ");

            const odp = await fetch(`${supabaseUrl}/functions/v1/billing-invoice-issue`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({
                external_payment_ref: `stripe:${obiekt.id}`,
                buyer_name: (nabywca as any)?.company_name ?? null,
                buyer_nip: (nabywca as any)?.company_nip ?? null,
                buyer_address: adres || null,
                buyer_email: (nabywca as any)?.company_email ?? (nabywca as any)?.owner_email ?? null,
                payment_method: "stripe",
                items: [{
                  name: `Abonament ${(naszaSub as any)?.plan?.name ?? "GetRido"}`,
                  quantity: 1,
                  unit: "szt",
                  // BRUTTO — operator pobrał konkretną kwotę i to ona rozstrzyga.
                  unit_gross_price: kwota,
                  vat_rate: 23,
                }],
              }),
            });

            const wynik = await odp.json().catch(() => ({}));
            console.log(JSON.stringify({
              event: odp.ok ? "stripe_faktura" : "stripe_faktura_blad",
              subId, numer: (wynik as any)?.invoice_number ?? null, status: odp.status,
            }));
          }
        } catch (bladFaktury) {
          console.error("billing-stripe-webhook: faktura niewystawiona", bladFaktury);
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

      // ------------------------------ odłożona zmiana planu u operatora
      /**
       * WEJŚCIE W GÓRĘ IDZIE Z `pending_if_incomplete`, więc gdy karta odrzuci
       * rachunek za różnicę, operator NIE stosuje zmiany — oddaje subskrypcję
       * z wypełnionym `pending_update` i my też niczego nie zapisujemy.
       *
       * Ale rachunek u niego WISI i klient może go opłacić później: z maila
       * od operatora albo z portalu rozliczeń. Wtedy zmiana wchodzi w życie
       * po jego stronie i przychodzi to zdarzenie.
       *
       * Bez tej gałęzi klient miałby wyższy plan u operatora i płacił za niego,
       * a u nas dalej niższy zakres funkcji. Pieniądze szłyby, dostęp nie —
       * i nikt by tego nie zauważył, bo obie strony „działają".
       *
       * Plan rozpoznajemy po CENIE, na której subskrypcja stoi po zastosowaniu
       * zmiany. Ta sama zasada, co przy `customer.subscription.updated`: cena
       * spoza cennika nie pozwala zgadywać planu.
       */
      case "customer.subscription.pending_update_applied": {
        const subId = obiekt.id;
        const cenaPo = obiekt?.items?.data?.[0]?.price?.id;
        if (!subId || !cenaPo) {
          console.warn("billing-stripe-webhook: zastosowana zmiana bez ceny", subId);
          await zakoncz("ignored");
          break;
        }

        const { data: dopasowany } = await admin
          .from("billing_plans")
          .select("id, code")
          .or([
            `stripe_price_id.eq.${cenaPo}`,
            `stripe_price_id_target.eq.${cenaPo}`,
            `stripe_price_id_rok.eq.${cenaPo}`,
            `stripe_price_id_rok_target.eq.${cenaPo}`,
          ].join(","))
          .maybeSingle();

        if (!dopasowany?.id) {
          console.error("billing-stripe-webhook: zastosowana cena spoza cennika", cenaPo, subId);
          await zakoncz("failed", `Cena ${cenaPo} nieznana w cenniku`);
          break;
        }

        const okresPo = okresSubskrypcji(obiekt);
        const trafione = await aktualizujSubskrypcje(admin, subId, {
          plan_id: dopasowany.id,
          status: mapujStatus(obiekt.status),
          ...(okresPo.start ? { current_period_start: okresPo.start } : {}),
          current_period_end: okresPo.end,
          // Zmiana weszła w życie, więc odłożona wersja przestaje obowiązywać.
          plan_od_nastepnego_okresu: null,
          plan_zmiana_zgloszona_at: null,
          updated_at: new Date().toISOString(),
        });

        console.log(JSON.stringify({
          event: trafione ? "zmiana_planu_doszla_pozniej" : "zmiana_planu_bez_wiersza",
          subId, plan: dopasowany.code, trafione,
        }));

        await zakoncz(trafione ? "processed" : wynikBrakuWiersza(typ));
        break;
      }

      /**
       * Odłożona zmiana PRZEPADŁA — minęły 23 godziny i operator unieważnił
       * rachunek. Niczego nie zmieniamy, bo u nas nic się nie zmieniło: przy
       * nieudanej zapłacie od razu odmówiliśmy i zostawiliśmy stary plan.
       *
       * Zapisujemy ślad, bo to jest klient, który CHCIAŁ zapłacić więcej
       * i mu się nie udało — najtańszy sygnał sprzedażowy, jaki mamy.
       */
      case "customer.subscription.pending_update_expired": {
        console.warn(JSON.stringify({
          event: "zmiana_planu_przepadla",
          subId: obiekt.id,
          klient: obiekt.customer ?? null,
        }));
        await zakoncz("processed");
        break;
      }

      // -------------------------------------- zmiany cyklu życia
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        /**
         * DOKLEJONY CZAS WYGLĄDA U OPERATORA JAK OKRES PRÓBNY.
         *
         * Przy zmianie okresu doklejamy niewykorzystane dni, ustawiając
         * `trial_end` — to jedyny parametr operatora przyjmujący dowolną datę
         * (`billing_cycle_anchor` przy aktualizacji bierze tylko `now`).
         * Skutkiem subskrypcja ma status `trialing` do tej daty.
         *
         * Gdybyśmy przepisali ten status wprost, klient który właśnie zapłacił
         * za rok zobaczyłby plakietkę „okres próbny" i dostałby ostrzeżenia
         * o jego końcu. Dlatego przy naszym znaczniku `doklejony_czas`
         * zapisujemy `active` — bo to jest opłacony okres, nie próbny.
         */
        const czasDoklejony = String(obiekt?.metadata?.doklejony_czas ?? "") === "1";
        const status = typ.endsWith("deleted")
          ? "canceled"
          : (czasDoklejony && obiekt.status === "trialing" ? "active" : mapujStatus(obiekt.status));
        const okres = okresSubskrypcji(obiekt);

        /**
         * 🔴 PLAN TEŻ SIĘ ZMIENIA, NIE TYLKO STATUS I OKRES.
         *
         * Ta gałąź aktualizowała status, okres i daty anulowania — a `plan_id`
         * zostawiała nietknięte. Skutek: ktokolwiek zmieni plan (klient przez
         * okno zakupu, my ręcznie w panelu Stripe), operator pobiera nową
         * kwotę, a my dalej bramkujemy po STARYM planie.
         *
         * Klient płaci za Pro i widzi Standard. Pieniądze idą, dostęp nie —
         * i nikt tego nie zauważy, bo obie strony „działają".
         *
         * Rozpoznajemy plan po cenie, na której subskrypcja JEST w Stripe.
         * Cztery kolumny, bo plan ma cenę miesięczną i roczną, każdą
         * w wariancie startowym i docelowym — a wszystkie cztery znaczą
         * ten sam plan.
         */
        const cenaTeraz = obiekt?.items?.data?.[0]?.price?.id;
        let planZeStripe: string | null = null;
        if (cenaTeraz) {
          const { data: dopasowany } = await admin
            .from("billing_plans")
            .select("id, code")
            .or([
              `stripe_price_id.eq.${cenaTeraz}`,
              `stripe_price_id_target.eq.${cenaTeraz}`,
              `stripe_price_id_rok.eq.${cenaTeraz}`,
              `stripe_price_id_rok_target.eq.${cenaTeraz}`,
            ].join(","))
            .maybeSingle();
          if (dopasowany?.id) {
            planZeStripe = dopasowany.id;
          } else {
            // Cena spoza naszego cennika — NIE zgadujemy planu. Lepiej zostawić
            // stary i zostawić ślad, niż przypisać zły zakres funkcji.
            console.warn("billing-stripe-webhook: cena nieznana w cenniku", cenaTeraz, obiekt.id);
          }
        }

        const trafione = await aktualizujSubskrypcje(admin, obiekt.id, {
          status,
          ...(okres.start ? { current_period_start: okres.start } : {}),
          current_period_end: okres.end,
          ...(planZeStripe ? { plan_id: planZeStripe } : {}),
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
