/**
 * Rozpoczęcie płatności jednorazowej w PayU (4.7).
 *
 * Sprzedajemy tędy pakiety dokupowane: SMS-y, sprawdzenia VIN, minuty Agenta.
 * Subskrypcje idą przez Stripe — PayU nie ma w Polsce wygodnego modelu
 * cyklicznego, a Stripe nie obsługuje BLIK-a.
 *
 * Zasady, których ta funkcja pilnuje:
 *  • KWOTA POCHODZI Z BAZY, nigdy z żądania. Klient wskazuje produkt, cenę
 *    ustalamy sami — inaczej dałoby się kupić pakiet za grosz.
 *  • Podmiot ustalamy z konta wołającego, nie z ciała żądania.
 *  • Fail-closed: brak sekretów albo wyłączona bramka = odmowa, nie „spróbuj
 *    bez konfiguracji".
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { buildPublicUrl } from '../_shared/publicUrl.ts';
import { PAYU_SANDBOX, PAYU_PRODUKCJA, naGrosze, ipKupujacego, tokenPayu } from '../_shared/payu.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Tożsamość ───────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Musisz być zalogowany.' }, 401);

    const { data: userData } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (!caller) return json({ error: 'Musisz być zalogowany.' }, 401);

    // ── Konfiguracja ────────────────────────────────────────────────
    const clientId = Deno.env.get('PAYU_CLIENT_ID');
    const clientSecret = Deno.env.get('PAYU_CLIENT_SECRET');
    const posId = Deno.env.get('PAYU_POS_ID');
    if (!clientId || !clientSecret || !posId) {
      // Brak konfiguracji nie może kończyć się próbą płatności donikąd.
      console.error('billing-payu-order: brak PAYU_CLIENT_ID / PAYU_CLIENT_SECRET / PAYU_POS_ID');
      return json({ error: 'Płatności są chwilowo niedostępne.', code: 'GATEWAY_NOT_CONFIGURED' }, 503);
    }

    const { data: bramka } = await (admin as any)
      .from('billing_gateways')
      .select('is_enabled, is_sandbox')
      .eq('provider', 'payu')
      .maybeSingle();

    if (!bramka?.is_enabled) {
      return json({ error: 'Płatności są chwilowo niedostępne.', code: 'GATEWAY_DISABLED' }, 503);
    }
    const baza = bramka.is_sandbox ? PAYU_SANDBOX : PAYU_PRODUKCJA;

    // ── Produkt, liczba jednostek i kwota ───────────────────────────
    const { product_code, units, plan_code, okres } = await req.json().catch(() => ({}));

    // Dwie rzeczy do kupienia, jedna droga płatności:
    //   • DOŁADOWANIE — produkt z `billing_addon_products`, liczony w sztukach,
    //   • MIESIĄC PLANU — jednorazowa opłata za okres dostępu.
    //
    // Miesiąc płatny BLIK-iem to pełnoprawna droga, nie awaryjna: część
    // warsztatów nie podepnie karty, a bez tego tryb dokończenia pokazuje im
    // drzwi, które nie otwierają się ich kluczem.
    const kupujePlan = typeof plan_code === 'string' && !!plan_code.trim();
    // Okres rozstrzyga BAZA — tu tylko odsiewamy wartości spoza zbioru, żeby
    // nie posyłać śmieci do funkcji wyceniającej.
    const okresZakupu = okres === 'rok' ? 'rok' : 'miesiac';

    if (!kupujePlan && (typeof product_code !== 'string' || !product_code.trim())) {
      return json({ error: 'Nie wskazano produktu ani planu.' }, 400);
    }
    if (kupujePlan && typeof product_code === 'string' && product_code.trim()) {
      // Jedno zamówienie dotyczy jednej rzeczy — tak samo mówi ograniczenie
      // `billing_orders_produkt_albo_plan` w bazie.
      return json({ error: 'Wskaż produkt ALBO plan, nie oba.' }, 400);
    }

    const liczba = kupujePlan ? 1 : Number(units);
    if (!kupujePlan && (!Number.isInteger(liczba) || liczba <= 0)) {
      return json({ error: 'Nieprawidłowa liczba sztuk.' }, 400);
    }

    // Warsztat ustalamy PRZED wyceną: cena miesiąca zależy od jego gwarancji
    // ceny startowej, a nie od samego kodu planu.
    const { data: warsztat } = await admin
      .from('service_providers')
      .select('id, company_name, owner_email, company_email')
      .eq('user_id', caller.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!warsztat) {
      return json({ error: 'Ten pakiet jest dla usługodawców.', code: 'NO_PROVIDER' }, 404);
    }

    /**
     * Jedna pozycja zamówienia, dwa źródła.
     *
     * Doładowanie i miesiąc planu różnią się WYCENĄ i tym, którą kolumnę
     * wypełniają (`product_id` albo `plan_id`). Wszystko dalej — założenie
     * wiersza, wyjście do operatora, adres powrotu — jest identyczne, więc
     * stoi w jednym miejscu. Dwie kopie tej ścieżki rozjechałyby się przy
     * pierwszej poprawce w obsłudze płatności.
     */
    interface Pozycja {
      product_id?: string;
      plan_id?: string;
      units: number;
      amount_gross: number;
      opis: string;
      snapshot: Record<string, unknown>;
    }
    let pozycja: Pozycja | null = null;

    // ── MIESIĄC PLANU ───────────────────────────────────────────────
    if (kupujePlan) {
      /**
       * 🔴 WARSZTAT PŁACĄCY KARTĄ NIE KUPUJE OKRESU BLIK-IEM.
       *
       * Subskrypcja u operatora odnawia się sama. Doładowanie okresu BLIK-iem
       * dołożyłoby czas na wierzchu, a karta i tak pobrałaby swoje przy
       * najbliższym odnowieniu — klient zapłaciłby dwa razy za ten sam czas
       * i miałby pełne prawo żądać zwrotu.
       *
       * Ten sam warunek co w `billing-checkout`: liczy się subskrypcja
       * NAPRAWDĘ odnawiana u operatora, a nie sam wiersz w bazie. Okres próbny
       * i miesiąc kupiony wcześniej BLIK-iem to stany, z których klient
       * wychodzi kupując — tych nie blokujemy.
       */
      /**
       * FAIL-CLOSED: BEZ DANYCH NABYWCY NIE STARTUJEMY PŁATNOŚCI.
       *
       * Faktury z pustym nabywcą nie da się poprawić edycją — wymaga korekty,
       * a korekta idzie do KSeF i zostaje w ewidencji na zawsze. Taniej jest
       * odmówić startu płatności niż wystawić dokument do naprawienia.
       *
       * Okno zakupu pyta o te dane w osobnym kroku przed wyborem metody, więc
       * klient nie ma prawa tu dotrzeć bez nich. Ta kontrola jest po to, żeby
       * ktoś, kto woła funkcję z pominięciem okna, też ich nie ominął.
       */
      {
        const { data: komplet, error: bladDanych } = await admin
          .rpc("billing_dane_nabywcy_kompletne", { p_provider_id: warsztat.id });
        if (bladDanych) throw bladDanych;
        if (komplet !== true) {
          return json({
            error: "Zanim zapłacisz, uzupełnij dane do faktury.",
            code: "BRAK_DANYCH_NABYWCY",
          }, 409);
        }
      }

      const { data: kartowa } = await admin
        .from('billing_subscriptions')
        .select('id')
        .eq('subscriber_type', 'service_provider')
        .eq('subscriber_id', warsztat.id)
        .eq('provider', 'stripe')
        .in('status', ['active', 'past_due'])
        .not('provider_subscription_id', 'is', null)
        .maybeSingle();

      if (kartowa) {
        return json({
          error: 'Ten warsztat ma abonament odnawiany kartą. Zmiana planu odbywa się bez nowej płatności — wybierz plan, a różnicę rozliczy operator karty.',
          code: 'MASZ_KARTE',
        }, 409);
      }

      const { data: cena, error: bladCeny } = await (admin as any)
        .rpc('billing_cena_okresu', {
          p_plan_code: plan_code.trim(), p_provider: warsztat.id, p_okres: okresZakupu,
        })
        .maybeSingle();

      if (bladCeny || !cena) {
        const tresc = (bladCeny as { message?: string } | null)?.message ?? '';
        const znane = tresc.startsWith('PLAN_NIEZNANY') || tresc.startsWith('PLAN_NIE_DO_KUPIENIA');
        console.warn('billing-payu-order: wycena miesiąca odrzucona', tresc);
        return json({
          error: znane ? 'Tego planu nie da się kupić na miesiąc.' : 'Nie udało się wycenić miesiąca.',
          code: 'BAD_PLAN',
        }, 400);
      }

      pozycja = {
        plan_id: cena.plan_id,
        units: 1,
        amount_gross: Number(cena.cena_brutto),
        opis: `GetRido — ${cena.nazwa}, ${okresZakupu === 'rok' ? 'rok' : 'miesiąc'}`,
        snapshot: {
          rodzaj: 'okres_planu',
          plan_code: plan_code.trim(),
          // Liczba miesięcy jedzie w zamówieniu, bo to ona rozstrzyga wydanie.
          // Zamrożona razem z ceną: klient dostaje okres, który kupił, choćby
          // rabat zmienił się przed nadejściem powiadomienia.
          okres: okresZakupu,
          miesiecy: cena.miesiecy,
          bez_rabatu_netto: cena.bez_rabatu_netto,
          name: cena.nazwa,
          amount_net: cena.cena_netto,
          amount_gross: cena.cena_brutto,
          vat_rate: cena.vat_rate,
          po_gwarancji: cena.po_gwarancji,
          data: new Date().toISOString(),
        },
      };
    }

    // ── DOŁADOWANIE ─────────────────────────────────────────────────
    // `else` do gałęzi planu wyżej. Bez tego wycena miesiąca ustawiała pozycję,
    // a wykonanie leciało dalej i pytało bazę o produkt, którego żądanie nie
    // podało — kończąc się odmową mimo poprawnego zamówienia.
    if (!kupujePlan) {
    // KWOTĘ LICZY BAZA, nie ta funkcja i tym bardziej nie żądanie. Tam też
    // siedzi sprawdzenie kroku i minimum, więc reguła obowiązuje niezależnie
    // od tego, kto pyta — inaczej dałoby się kupić 1 SMS zamiast setki.
    const { data: wycena, error: bladWyceny } = await (admin as any)
      .rpc('billing_wylicz_doladowanie', { p_code: product_code.trim(), p_units: liczba })
      .maybeSingle();

    if (bladWyceny || !wycena) {
      // 22023 = nasze własne odrzucenia z funkcji (krok, minimum, nieznany
      // produkt). Komunikat jest po polsku i nadaje się do pokazania.
      const czyNasze = (bladWyceny as { code?: string } | null)?.code === '22023';
      console.warn('billing-payu-order: wycena odrzucona', bladWyceny?.message);
      return json({
        error: czyNasze ? bladWyceny!.message : 'Nie udało się wycenić doładowania.',
        code: 'BAD_UNITS',
      }, 400);
    }

    const { data: produkt } = await (admin as any)
      .from('billing_addon_products')
      .select('id, code, name, vat_rate, feature_id, waznosc_dni, unit_price_net, step, min_units')
      .eq('id', wycena.product_id)
      .maybeSingle();

    if (!produkt) return json({ error: 'Ten pakiet jest niedostępny.', code: 'NO_PRODUCT' }, 404);

    pozycja = {
      product_id: produkt.id,
      units: liczba,
      amount_gross: Number(wycena.amount_gross),
      opis: `GetRido — ${liczba} × ${produkt.name}`,
      // Zamrożona STAWKA, nie tylko kwota. Przy sporze trzeba umieć odtworzyć,
      // po ile klient kupował, a nie tylko ile zapłacił.
      snapshot: {
        rodzaj: 'doladowanie',
        code: produkt.code,
        name: produkt.name,
        units: liczba,
        unit_price_net: wycena.unit_price_net,
        amount_net: wycena.amount_net,
        amount_gross: wycena.amount_gross,
        vat_rate: wycena.vat_rate,
        waznosc_dni: produkt.waznosc_dni,
        data: new Date().toISOString(),
      },
    };
    }

    // Żadna gałąź nie ustawiła pozycji — nie wiemy, za co pobierać pieniądze.
    // Fail-closed: brak wiedzy to odmowa, nie domyślne przepuszczenie.
    if (!pozycja) {
      console.error('billing-payu-order: żadna gałąź nie ustawiła pozycji zamówienia');
      return json({ error: 'Nie udało się rozpocząć płatności.' }, 500);
    }

    // ── Zamówienie u nas — PRZED wyjściem do operatora ───────────────
    // Wiersz powstaje najpierw, żeby powiadomienie miało do czego wrócić,
    // nawet gdyby odpowiedź operatora zaginęła po drodze.
    const { data: zamowienie, error: bladZam } = await (admin as any)
      .from('billing_orders')
      .insert({
        subscriber_type: 'service_provider',
        subscriber_id: warsztat.id,
        user_id: caller.id,
        ...(pozycja.product_id ? { product_id: pozycja.product_id } : {}),
        ...(pozycja.plan_id ? { plan_id: pozycja.plan_id } : {}),
        units: pozycja.units,
        amount_gross: pozycja.amount_gross,
        status: 'nowe',
        provider: 'payu',
        snapshot: pozycja.snapshot,
      })
      .select('id')
      .maybeSingle();

    if (bladZam || !zamowienie) {
      console.error('billing-payu-order: nie udało się założyć zamówienia', bladZam);
      return json({ error: 'Nie udało się rozpocząć płatności.' }, 503);
    }

    // ── Zamówienie u operatora ──────────────────────────────────────
    const dostep = await tokenPayu(baza, clientId, clientSecret);
    const grosze = naGrosze(pozycja.amount_gross);

    const odpowiedz = await fetch(`${baza}/api/v2_1/orders`, {
      method: 'POST',
      // Bez tego `fetch` podąży za przekierowaniem 302 i zgubi treść
      // z `redirectUri`, po której klient ma trafić na stronę płatności.
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${dostep}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notifyUrl: `${supabaseUrl}/functions/v1/billing-payu-webhook`,
        continueUrl: buildPublicUrl('/uslugi/panel?platnosc=payu'),
        customerIp: ipKupujacego(req.headers),
        merchantPosId: posId,
        description: pozycja.opis,
        currencyCode: 'PLN',
        totalAmount: String(grosze),
        // `extOrderId` wiąże powiadomienie z naszym wierszem. To po nim,
        // a nie po kwocie czy czasie, rozpoznajemy, czego dotyczy zapłata.
        extOrderId: zamowienie.id,
        buyer: {
          email: warsztat.owner_email || warsztat.company_email || caller.email,
          language: 'pl',
        },
        products: [{
          name: pozycja.opis,
          unitPrice: String(grosze),
          quantity: '1',
        }],
      }),
    });

    const wynik = await odpowiedz.json().catch(() => ({}));
    const przekierowanie = wynik?.redirectUri;
    const idUOperatora = wynik?.orderId;

    if (!przekierowanie || !idUOperatora) {
      console.error('billing-payu-order: odpowiedź bez redirectUri', odpowiedz.status, JSON.stringify(wynik));
      await (admin as any).from('billing_orders')
        .update({ status: 'odrzucone', updated_at: new Date().toISOString() })
        .eq('id', zamowienie.id);
      return json({ error: 'Operator płatności odrzucił zamówienie.' }, 502);
    }

    await (admin as any).from('billing_orders')
      .update({
        provider_order_id: idUOperatora,
        status: 'oczekuje',
        updated_at: new Date().toISOString(),
      })
      .eq('id', zamowienie.id);

    console.log(JSON.stringify({
      event: 'payu_zamowienie', order: zamowienie.id, payu: idUOperatora,
      pozycja: pozycja.snapshot.rodzaj, jednostek: pozycja.units, grosze,
    }));

    return json({ url: przekierowanie, order_id: zamowienie.id });
  } catch (e) {
    console.error('billing-payu-order:', e);
    return json({ error: 'Nie udało się rozpocząć płatności.' }, 500);
  }
});
