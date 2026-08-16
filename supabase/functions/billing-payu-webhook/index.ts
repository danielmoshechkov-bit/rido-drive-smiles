/**
 * Powiadomienia PayU o zmianie statusu zamówienia (4.7).
 *
 * Tożsamość nadawcy potwierdza PODPIS, nie JWT — PayU nie wysyła nagłówka
 * `Authorization`. Dlatego `verify_jwt = false` w konfiguracji, a cała bramka
 * siedzi tutaj: brak podpisu, zły podpis albo brak drugiego klucza = odmowa.
 *
 * Trzy warstwy zabezpieczenia przed podwójnym wydaniem pakietu:
 *  1. `billing_events` — zdarzenie zajmowane PRZED przetworzeniem;
 *  2. `billing_orders.wydane_at` — znacznik wydania w wierszu zamówienia;
 *  3. `billing_wydaj_paczke` — blokada wiersza (`FOR UPDATE`) w bazie.
 *
 * Jedna by nie wystarczyła: PayU potrafi przysłać to samo powiadomienie kilka
 * razy, także równolegle, a dwa razy wydany pakiet to towar oddany za darmo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import {
  sprawdzPodpisPayu, mapujStatusPayu, potwierdzOdbior, tokenPayu,
  PAYU_SANDBOX, PAYU_PRODUKCJA,
} from '../_shared/payu.ts';

/** Tylko te pola zamówienia są tu potrzebne — nazwany typ, bo `as typeof x`
 *  jest samozwrotne i gubi zawężenie po sprawdzeniu na null. */
interface Zamowienie {
  id: string;
  status: string;
  wydane_at: string | null;
  amount_gross: number | string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const drugiKlucz = Deno.env.get('PAYU_SECOND_KEY') ?? '';
  if (!drugiKlucz) {
    console.error('billing-payu-webhook: brak PAYU_SECOND_KEY — odmawiam');
    return json({ error: 'NOT_CONFIGURED' }, 503);
  }

  // Treść czytana RAZ, jako tekst. Podpis dotyczy dokładnie tych znaków, więc
  // nie przepuszczamy ich przez parsowanie i ponowne serializowanie.
  const surowaTresc = await req.text();

  const podpis = sprawdzPodpisPayu(surowaTresc, req.headers.get('openpayu-signature'), drugiKlucz);
  if (!podpis.ok) {
    // Nadawcy bez poprawnego podpisu nie mówimy, co dokładnie mu nie wyszło.
    console.error('billing-payu-webhook: podpis odrzucony —', podpis.powod);
    return json({ error: 'Nieprawidłowy podpis' }, 400);
  }

  let zdarzenie: any;
  try {
    zdarzenie = JSON.parse(surowaTresc);
  } catch {
    return json({ error: 'Nieprawidłowa treść' }, 400);
  }

  const zamowienieP = zdarzenie?.order ?? {};
  const idUOperatora: string | undefined = zamowienieP.orderId;
  const naszeId: string | undefined = zamowienieP.extOrderId;
  const statusPayu: string = zamowienieP.status ?? '';

  if (!idUOperatora) return json({ error: 'Brak orderId' }, 400);

  const status = mapujStatusPayu(statusPayu);

  // ── Warstwa 1: zajęcie zdarzenia ──────────────────────────────────
  // Klucz zawiera status, bo dla jednego zamówienia przychodzi kilka
  // powiadomień (PENDING → COMPLETED) i każde ma być przetworzone raz.
  const kluczZdarzenia = `payu:${idUOperatora}:${statusPayu}`;
  const { error: bladZajecia } = await (admin as any).from('billing_events').insert({
    provider: 'payu',
    event_type: `order.${statusPayu.toLowerCase() || 'unknown'}`,
    external_id: kluczZdarzenia,
    payload: zdarzenie,
    status: 'pending',
  });

  if (bladZajecia) {
    // 23505 = to powiadomienie już było. Odpowiadamy 200, żeby operator
    // przestał je powtarzać.
    if ((bladZajecia as { code?: string }).code === '23505') {
      console.log('billing-payu-webhook: powtórka', kluczZdarzenia);
      return json({ ok: true, duplikat: true });
    }
    console.error('billing-payu-webhook: nie udało się zapisać zdarzenia', bladZajecia);
    return json({ error: 'Błąd zapisu zdarzenia' }, 503);
  }

  const zakoncz = async (wynik: string, blad?: string) => {
    await (admin as any).from('billing_events')
      .update({ status: wynik, last_error: blad ?? null, processed_at: new Date().toISOString() })
      .eq('external_id', kluczZdarzenia);
  };

  try {
    // ── Odnalezienie zamówienia ─────────────────────────────────────
    // Najpierw po NASZYM identyfikatorze z `extOrderId` — jest pewniejszy niż
    // identyfikator operatora, bo istnieje od chwili założenia wiersza.
    let zamowienie: Zamowienie | null = null;

    if (naszeId) {
      const { data } = await (admin as any).from('billing_orders')
        .select('id, status, wydane_at, amount_gross').eq('id', naszeId).maybeSingle();
      zamowienie = (data ?? null) as Zamowienie | null;
    }
    if (!zamowienie) {
      const { data } = await (admin as any).from('billing_orders')
        .select('id, status, wydane_at, amount_gross')
        .eq('provider', 'payu').eq('provider_order_id', idUOperatora).maybeSingle();
      zamowienie = (data ?? null) as Zamowienie | null;
    }

    if (!zamowienie) {
      // Klient zapłacił, a my nie mamy zamówienia. To nie jest sukces i nie
      // wolno tego zamknąć jako przetworzone — inaczej sprawa zniknie.
      console.error('billing-payu-webhook: zapłacone zamówienie bez odpowiednika', idUOperatora, naszeId);
      await zakoncz('failed', `Zamówienie ${idUOperatora} nieznane w bazie`);
      return json({ ok: true, uwaga: 'zamówienie nieznane' });
    }

    await (admin as any).from('billing_orders')
      .update({
        status,
        provider_order_id: idUOperatora,
        updated_at: new Date().toISOString(),
      })
      .eq('id', zamowienie.id);

    // ── Potwierdzenie odbioru środków ───────────────────────────────
    //
    // 🔴 ZNALEZIONE W TEŚCIE SANDBOXA (17.08.2026): przy wyłączonym
    // automatycznym odbiorze PayU zatrzymuje zamówienie na
    // `WAITING_FOR_CONFIRMATION` i CZEKA, aż sprzedawca sam potwierdzi.
    // Bez tego kroku zamówienie stało w nieskończoność — klient zapłacił,
    // operator potwierdził, a pakiet nie został wydany.
    //
    // Pakietu tu NIE wydajemy: pieniądze są nasze dopiero po potwierdzeniu,
    // a PayU przyśle wtedy osobne powiadomienie ze statusem `COMPLETED`.
    if (statusPayu.toUpperCase() === 'WAITING_FOR_CONFIRMATION') {
      const clientId = Deno.env.get('PAYU_CLIENT_ID');
      const clientSecret = Deno.env.get('PAYU_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        // Bez poświadczeń nie da się potwierdzić — i trzeba o tym wiedzieć,
        // bo zamówienie utknie z opłaconą płatnością i bez towaru.
        console.error('billing-payu-webhook: brak PAYU_CLIENT_ID/SECRET — nie mogę potwierdzić odbioru');
        await zakoncz('failed', 'Brak poświadczeń do potwierdzenia odbioru');
        return json({ ok: true, uwaga: 'brak poświadczeń' });
      }

      const { data: bramka } = await (admin as any)
        .from('billing_gateways').select('is_sandbox').eq('provider', 'payu').maybeSingle();
      const baza = bramka?.is_sandbox === false ? PAYU_PRODUKCJA : PAYU_SANDBOX;

      try {
        const dostep = await tokenPayu(baza, clientId, clientSecret);
        const wynik = await potwierdzOdbior(baza, dostep, idUOperatora);
        if (wynik.ok) {
          console.log(JSON.stringify({
            event: 'payu_odbior_potwierdzony', order: zamowienie.id, payu: idUOperatora,
            uwaga: wynik.powod ?? null,
          }));
        } else {
          console.error('billing-payu-webhook: potwierdzenie odbioru nieudane —', wynik.powod);
          await zakoncz('failed', `Potwierdzenie odbioru: ${wynik.powod}`);
          return json({ ok: true, uwaga: 'odbiór niepotwierdzony' });
        }
      } catch (e) {
        console.error('billing-payu-webhook: potwierdzenie odbioru rzuciło wyjątkiem', e);
        await zakoncz('failed', e instanceof Error ? e.message : String(e));
        return json({ ok: true, uwaga: 'odbiór niepotwierdzony' });
      }
    }

    // ── Kwota musi się zgadzać ──────────────────────────────────────
    //
    // Podpis potwierdza NADAWCĘ, nie treść zamówienia. Bez tego sprawdzenia
    // powiadomienie z poprawnym podpisem i niepełną kwotą wydawało pełną
    // paczkę — a PayU dopuszcza płatności częściowe.
    //
    // Porównujemy w groszach, żeby nie zderzyć się z arytmetyką zmiennoprzecinkową.
    if (status === 'oplacone') {
      const oczekiwane = Math.round(Number(zamowienie.amount_gross) * 100);
      const zaplacone = Math.round(Number(zamowienieP.totalAmount ?? NaN));

      if (!Number.isFinite(zaplacone)) {
        console.error('billing-payu-webhook: brak totalAmount przy COMPLETED', zamowienie.id);
        await zakoncz('failed', 'Powiadomienie o zapłacie bez kwoty');
        return json({ ok: true, uwaga: 'brak kwoty' });
      }

      if (zaplacone !== oczekiwane) {
        // Nie wydajemy nic. To wymaga zajrzenia człowieka: albo klient zapłacił
        // mniej, albo rozjechał nam się cennik między założeniem zamówienia
        // a zapłatą. Jedno i drugie kosztuje, jeśli wydamy towar automatycznie.
        console.error(JSON.stringify({
          event: 'payu_kwota_niezgodna', order: zamowienie.id,
          oczekiwane_grosze: oczekiwane, zaplacone_grosze: zaplacone,
        }));
        await zakoncz('failed', `Kwota niezgodna: oczekiwano ${oczekiwane} gr, przyszło ${zaplacone} gr`);
        return json({ ok: true, uwaga: 'kwota niezgodna' });
      }
    }

    // ── Wydanie pakietu ─────────────────────────────────────────────
    if (status === 'oplacone') {
      const { data: packId, error: bladWydania } = await admin
        .rpc('billing_wydaj_paczke', { p_order_id: zamowienie.id });

      if (bladWydania) {
        console.error('billing-payu-webhook: nie udało się wydać pakietu', bladWydania);
        await zakoncz('failed', bladWydania.message);
        // 200, bo powtarzanie tego samego powiadomienia nic nie naprawi —
        // sprawa wymaga zajrzenia człowieka.
        return json({ ok: true, uwaga: 'pakiet niewydany' });
      }

      console.log(JSON.stringify({
        event: 'payu_pakiet_wydany', order: zamowienie.id, pack: packId,
      }));
    }

    await zakoncz('processed');
    return json({ ok: true });
  } catch (e) {
    console.error('billing-payu-webhook:', e);
    await zakoncz('failed', e instanceof Error ? e.message : String(e));
    return json({ error: 'Błąd przetwarzania' }, 500);
  }
});
