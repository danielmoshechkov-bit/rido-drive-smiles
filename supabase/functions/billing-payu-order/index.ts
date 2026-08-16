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
    const { product_code, units } = await req.json().catch(() => ({}));
    if (typeof product_code !== 'string' || !product_code.trim()) {
      return json({ error: 'Nie wskazano produktu.' }, 400);
    }
    const liczba = Number(units);
    if (!Number.isInteger(liczba) || liczba <= 0) {
      return json({ error: 'Nieprawidłowa liczba sztuk.' }, 400);
    }

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

    // ── Zamówienie u nas — PRZED wyjściem do operatora ───────────────
    // Wiersz powstaje najpierw, żeby powiadomienie miało do czego wrócić,
    // nawet gdyby odpowiedź operatora zaginęła po drodze.
    const { data: zamowienie, error: bladZam } = await (admin as any)
      .from('billing_orders')
      .insert({
        subscriber_type: 'service_provider',
        subscriber_id: warsztat.id,
        user_id: caller.id,
        product_id: produkt.id,
        units: liczba,
        amount_gross: wycena.amount_gross,
        status: 'nowe',
        provider: 'payu',
        // Zamrożona STAWKA, nie tylko kwota. Przy sporze trzeba umieć
        // odtworzyć, po ile klient kupował, a nie tylko ile zapłacił.
        snapshot: {
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
      })
      .select('id')
      .maybeSingle();

    if (bladZam || !zamowienie) {
      console.error('billing-payu-order: nie udało się założyć zamówienia', bladZam);
      return json({ error: 'Nie udało się rozpocząć płatności.' }, 503);
    }

    // ── Zamówienie u operatora ──────────────────────────────────────
    const dostep = await tokenPayu(baza, clientId, clientSecret);
    const grosze = naGrosze(Number(wycena.amount_gross));

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
        description: `GetRido — ${liczba} × ${produkt.name}`,
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
          name: `${produkt.name} (${liczba} szt.)`,
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
      produkt: produkt.code, jednostek: liczba, grosze,
    }));

    return json({ url: przekierowanie, order_id: zamowienie.id });
  } catch (e) {
    console.error('billing-payu-order:', e);
    return json({ error: 'Nie udało się rozpocząć płatności.' }, 500);
  }
});
