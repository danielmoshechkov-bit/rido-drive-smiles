/**
 * Podpis umowy najmu i jego dziennik — jedyna droga zapisu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO TO POWSTAŁO
 * ═══════════════════════════════════════════════════════════════════════════
 * Do tej pory przeglądarka pisała wprost do bazy, a RLS przepuszczała to
 * warunkiem `portal_access_token IS NOT NULL` — czyli sprawdzała, że umowa MA
 * jakiś token, a nie że wołający go ZNA. Komentarz przy tamtej migracji mówił
 * wprost: „The token check is done at application level for now".
 *
 * W praktyce znaczyło to, że dowolna osoba mogła:
 *   • odczytać każdą umowę najmu (dane najemcy, kwoty, pojazd),
 *   • oznaczyć dowolną umowę jako podpisaną, podstawiając własny obrazek,
 *   • dopisać do dziennika podpisu dowolne zdarzenie z dowolnym adresem IP.
 *
 * Ta funkcja zamyka dwa ostatnie. Odczyt zostaje na razie po staremu i jest
 * opisany osobno — jego zamknięcie wymaga przepisania odczytu portalu.
 *
 * ZASADA: token weryfikujemy TUTAJ, porównując go z wierszem umowy. Nieważny
 * token BLOKUJE podpis, nie tylko dziennik — inaczej zostawałaby ścieżka,
 * w której podpis się udaje, a śladu nie ma.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Zdarzenia, które wolno zapisać. Zgodne z ograniczeniem CHECK na tabeli. */
const DOZWOLONE = new Set([
  'email_sent', 'sms_sent', 'contract_viewed', 'checkboxes_accepted',
  'signature_drawn', 'signature_submitted', 'fleet_signed', 'contract_locked',
]);

/** Statusy, przy których podpis najemcy jest jeszcze możliwy. */
const MOZNA_PODPISAC = new Set(['draft', 'sent', 'pending_signature', 'client_viewing']);

function adresIP(naglowki: Headers): string | null {
  // Pierwszy wpis `x-forwarded-for` to adres klienta; kolejne to pośrednicy.
  // Bierzemy go Z NAGŁÓWKA, nie z ciała żądania — dotąd przeglądarka podawała
  // własne IP i mogła wpisać dowolne.
  const xff = naglowki.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim() || null;
  return naglowki.get('cf-connecting-ip') ?? naglowki.get('x-real-ip');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !serviceKey) return json({ error: 'Funkcja nieskonfigurowana' }, 503);

    const admin = createClient(url, serviceKey);
    const { rentalId, token, action, actorType, metadata, signatureUrl } =
      await req.json().catch(() => ({}));

    if (!rentalId) return json({ error: 'Brak identyfikatora umowy' }, 400);

    const { data: umowa } = await admin
      .from('vehicle_rentals')
      .select('id, fleet_id, status, portal_access_token, driver_signature_url')
      .eq('id', rentalId)
      .maybeSingle();

    if (!umowa) return json({ error: 'Nie znaleziono umowy' }, 404);

    // ── Kto woła ────────────────────────────────────────────────────
    // Dwie ścieżki, bo umowę podpisuje najemca z linku ORAZ pracownik floty
    // zalogowany w panelu. Dla pierwszego dowodem jest token, dla drugiego
    // sesja i przypisanie do tej samej floty.
    let ktoTo: 'driver' | 'fleet' | null = null;

    if (typeof token === 'string' && token.trim()) {
      // Porównanie pełnej wartości, nie „istnieje". To jest cała różnica
      // wobec poprzedniej polityki RLS.
      if (umowa.portal_access_token && token.trim() === umowa.portal_access_token) {
        ktoTo = 'driver';
      } else {
        console.warn(`rental-sign: zły token dla umowy ${rentalId}`);
        return json({ error: 'NIEWAZNY_TOKEN', message: 'Link do umowy jest nieprawidłowy lub wygasł.' }, 403);
      }
    } else {
      const naglowek = req.headers.get('Authorization') ?? '';
      const jwt = naglowek.replace(/^Bearer\s+/i, '').trim();
      if (!jwt) return json({ error: 'NIEWAZNY_TOKEN', message: 'Link do umowy jest nieprawidłowy lub wygasł.' }, 403);

      const { data: dane } = await admin.auth.getUser(jwt);
      const uzytkownik = dane?.user;
      if (!uzytkownik) return json({ error: 'Nieautoryzowany' }, 401);

      // Parametr nazywa się `_user_id` — sprawdzone w migracji definiującej
      // funkcję, nie z pamięci.
      const { data: idFloty } = await admin
        .rpc('get_user_fleet_id', { _user_id: uzytkownik.id });
      if (!idFloty || idFloty !== umowa.fleet_id) {
        return json({ error: 'Brak uprawnień do tej umowy' }, 403);
      }
      ktoTo = 'fleet';
    }

    const rodzaj = typeof action === 'string' ? action : '';
    if (!DOZWOLONE.has(rodzaj)) return json({ error: 'Nieznane zdarzenie' }, 400);

    const wpis = {
      rental_id: rentalId,
      action_type: rodzaj,
      actor_type: actorType === 'system' ? 'system' : ktoTo,
      ip_address: adresIP(req.headers),
      user_agent: req.headers.get('user-agent'),
      metadata: metadata ?? {},
    };

    // ── Złożenie podpisu ────────────────────────────────────────────
    if (rodzaj === 'signature_submitted') {
      if (ktoTo !== 'driver') {
        return json({ error: 'Podpis najemcy wymaga linku z tokenem' }, 403);
      }
      if (typeof signatureUrl !== 'string' || !signatureUrl.trim()) {
        return json({ error: 'Brak podpisu' }, 400);
      }
      // Podpisu nie da się złożyć drugi raz ani po zamknięciu umowy.
      if (umowa.driver_signature_url) {
        return json({ error: 'JUZ_PODPISANA', message: 'Ta umowa została już podpisana.' }, 409);
      }
      if (umowa.status && !MOZNA_PODPISAC.has(umowa.status)) {
        return json({ error: 'ZLY_STATUS', message: `Umowy w stanie „${umowa.status}" nie można podpisać.` }, 409);
      }

      const { error: bladZapisu } = await admin
        .from('vehicle_rentals')
        .update({
          driver_signature_url: signatureUrl,
          driver_signed_at: new Date().toISOString(),
          driver_signature_ip: adresIP(req.headers),
          driver_signature_user_agent: req.headers.get('user-agent'),
          status: 'client_signed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', rentalId)
        // Warunek powtórzony w zapytaniu, nie tylko sprawdzony wyżej: między
        // odczytem a zapisem ktoś mógł podpisać równolegle.
        .is('driver_signature_url', null);

      if (bladZapisu) {
        console.error('rental-sign: zapis podpisu', bladZapisu);
        return json({ error: 'Nie udało się zapisać podpisu' }, 503);
      }
    }

    const { error: bladDziennika } = await admin.from('contract_signature_logs').insert(wpis);
    if (bladDziennika) {
      // Dziennik jest częścią wiarygodności podpisu, więc jego brak to nie
      // drobiazg — ale podpis jest już zapisany i odmowa niczego nie cofnie.
      console.error('rental-sign: dziennik', bladDziennika, JSON.stringify(wpis));
      return json({ ok: true, uwaga: 'zdarzenie niezapisane w dzienniku' });
    }

    return json({ ok: true });
  } catch (e) {
    console.error('rental-sign:', e);
    return json({ error: 'Błąd przetwarzania' }, 500);
  }
});
