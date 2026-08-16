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
import { sprawdzPodpisPayu, mapujStatusPayu } from '../_shared/payu.ts';

/** Tylko te pola zamówienia są tu potrzebne — nazwany typ, bo `as typeof x`
 *  jest samozwrotne i gubi zawężenie po sprawdzeniu na null. */
interface Zamowienie {
  id: string;
  status: string;
  wydane_at: string | null;
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
        .select('id, status, wydane_at').eq('id', naszeId).maybeSingle();
      zamowienie = (data ?? null) as Zamowienie | null;
    }
    if (!zamowienie) {
      const { data } = await (admin as any).from('billing_orders')
        .select('id, status, wydane_at')
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

      // ── Faktura ───────────────────────────────────────────────────
      //
      // ⚠️ CAŁY TEN BLOK JEST DODATKIEM, NIE WARUNKIEM. Paczka została już
      // wydana wyżej i klient ma swoje SMS-y niezależnie od tego, co stanie
      // się tutaj. Brak faktury to sprawa do naprawienia, a nie powód, żeby
      // odbierać towar albo kazać operatorowi ponawiać powiadomienie w kółko.
      //
      // Dzięki temu doładowania działają, zanim fakturowanie ruszy: na `main`
      // tego bloku po prostu nie ma, a płatność przebiega tak samo.
      try {
        const { data: zam } = await (admin as any)
          .from('billing_orders')
          .select('id, units, amount_gross, snapshot, subscriber_id, provider_order_id')
          .eq('id', zamowienie.id)
          .maybeSingle();

        const { data: warsztat } = zam?.subscriber_id
          ? await (admin as any).from('service_providers')
              .select('company_name, company_nip, company_address, company_postal_code, company_city, company_email, owner_email')
              .eq('id', zam.subscriber_id).maybeSingle()
          : { data: null };

        const snap = (zam?.snapshot ?? {}) as Record<string, unknown>;
        const sztuk = Number(zam?.units ?? 0);
        const brutto = Number(zam?.amount_gross ?? 0);

        if (sztuk > 0 && brutto > 0) {
          const adres = [
            warsztat?.company_address,
            `${warsztat?.company_postal_code ?? ''} ${warsztat?.company_city ?? ''}`.trim(),
          ].filter(Boolean).join(', ');

          const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/billing-invoice-issue`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              // Identyfikator zamówienia u operatora, nie zdarzenia: to samo
              // obciążenie potrafi dojść kilkoma powiadomieniami, a faktura
              // ma być jedna.
              external_payment_ref: `payu:${zam?.provider_order_id ?? zamowienie.id}`,
              items: [{
                name: String(snap.name ?? 'Doładowanie GetRido'),
                quantity: sztuk,
                unit: 'szt.',
                // Cena JEDNOSTKOWA BRUTTO — `billing-invoice-issue` liczy VAT
                // „w stu", więc suma zgadza się z obciążeniem co do grosza.
                unit_gross_price: Math.round((brutto / sztuk) * 10000) / 10000,
                vat_rate: Number(snap.vat_rate ?? 23),
              }],
              buyer_name: warsztat?.company_name ?? null,
              buyer_nip: warsztat?.company_nip ?? null,
              buyer_address: adres || null,
              buyer_email: warsztat?.company_email || warsztat?.owner_email || null,
              paid_at: new Date().toISOString(),
              sale_date: new Date().toISOString().slice(0, 10),
              payment_method: 'other',
              notes: `Doładowanie ${sztuk} szt. — PayU ${zam?.provider_order_id ?? ''}`.trim(),
              pre_ksef: true,
            }),
          });

          const wynik = await res.json().catch(() => ({}));
          if (res.ok && wynik?.invoice_id && !wynik?.duplicate) {
            console.log(JSON.stringify({
              event: 'faktura_doladowania', numer: wynik.invoice_number, order: zamowienie.id,
            }));
          } else if (!res.ok) {
            console.error('billing-payu-webhook: faktura nieudana', res.status, JSON.stringify(wynik));
          }
        }
      } catch (e) {
        // Świadomie połykamy: paczka jest wydana, płatność przyjęta.
        console.error('billing-payu-webhook: wystawienie faktury nie powiodło się', e);
      }
    }

    await zakoncz('processed');
    return json({ ok: true });
  } catch (e) {
    console.error('billing-payu-webhook:', e);
    await zakoncz('failed', e instanceof Error ? e.message : String(e));
    return json({ error: 'Błąd przetwarzania' }, 500);
  }
});
