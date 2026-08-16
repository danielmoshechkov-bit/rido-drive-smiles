/**
 * Odczyt umowy najmu dla portalu klienta — jedyna droga.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO
 * ═══════════════════════════════════════════════════════════════════════════
 * Polityka „Public can read rentals with token" przepuszczała odczyt warunkiem
 * `portal_access_token IS NOT NULL` — czyli sprawdzała, że umowa MA token, a nie
 * że wołający go ZNA. Filtr po tokenie dokładała przeglądarka i wystarczyło go
 * pominąć.
 *
 * Ekran umowy pobiera przy tym `*` wraz ze złączeniami: PESEL najemcy, adres,
 * numer prawa jazdy, telefon, e-mail, dane floty i pojazdu. Czyli dowolna osoba
 * z kluczem anonimowym — a ten jest w paczce JavaScriptu — mogła pobrać komplet
 * danych osobowych każdego najemcy w systemie.
 *
 * Tutaj token porównujemy z wierszem umowy. Bez zgodności nie oddajemy nic.
 *
 * DWA ZAKRESY, bo dwa ekrany potrzebują różnych rzeczy:
 *   'portal' — ekran podpisu: status, pojazd, imię najemcy. Bez PESEL-u.
 *   'umowa'  — renderowanie treści umowy: pełen komplet, bo bez niego nie da
 *              się złożyć dokumentu.
 * Domyślny jest węższy. Szerszy trzeba poprosić jawnie.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const POLA_PORTAL = `
  id, status, driver_signed_at, contract_locked_at, driver_signature_url,
  vehicle:vehicle_id (brand, model, plate),
  driver:driver_id (first_name, last_name)
`;

const POLA_UMOWA = `
  *,
  vehicles:vehicle_id (id, plate, brand, model, year, vin),
  drivers:driver_id (id, first_name, last_name, email, phone, pesel,
                     address_street, address_city, address_postal_code, license_number),
  fleets:fleet_id (id, name, nip, street, city, postal_code, phone, email)
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !serviceKey) return json({ error: 'Funkcja nieskonfigurowana' }, 503);

    const admin = createClient(url, serviceKey);
    const { rentalId, token, zakres } = await req.json().catch(() => ({}));
    if (!rentalId) return json({ error: 'Brak identyfikatora umowy' }, 400);

    // Najpierw sam token umowy — najwęższy możliwy odczyt, żeby porównać.
    const { data: kontrola } = await admin
      .from('vehicle_rentals')
      .select('id, fleet_id, portal_access_token')
      .eq('id', rentalId)
      .maybeSingle();

    // Nie rozróżniamy „nie ma umowy" od „zły token" — inaczej dałoby się
    // sprawdzać, które identyfikatory istnieją.
    const odmowa = () => json(
      { error: 'NIEWAZNY_LINK', message: 'Link jest nieprawidłowy lub wygasł.' }, 403);

    if (!kontrola) return odmowa();

    let uprawniony = false;

    if (typeof token === 'string' && token.trim()) {
      uprawniony = !!kontrola.portal_access_token
        && token.trim() === kontrola.portal_access_token;
      if (!uprawniony) {
        console.warn(`rental-portal-get: zły token dla ${rentalId}`);
        return odmowa();
      }
    } else {
      // Bez tokenu wpuszczamy wyłącznie zalogowanego z TEJ floty albo admina —
      // tak otwiera umowę pracownik z panelu.
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
      if (!jwt) return odmowa();

      const { data: dane } = await admin.auth.getUser(jwt);
      const uzytkownik = dane?.user;
      if (!uzytkownik) return odmowa();

      const { data: idFloty } = await admin.rpc('get_user_fleet_id', { _user_id: uzytkownik.id });
      const { data: czyAdmin } = await admin.rpc('has_role', {
        _user_id: uzytkownik.id, _role: 'admin',
      });

      uprawniony = czyAdmin === true || (!!idFloty && idFloty === kontrola.fleet_id);
      if (!uprawniony) return odmowa();
    }

    const pola = zakres === 'umowa' ? POLA_UMOWA : POLA_PORTAL;
    const { data: umowa, error } = await admin
      .from('vehicle_rentals')
      .select(pola)
      .eq('id', rentalId)
      .maybeSingle();

    if (error || !umowa) {
      console.error('rental-portal-get: odczyt', error);
      return json({ error: 'Nie udało się wczytać umowy' }, 503);
    }

    // `portal_access_token` NIE wychodzi na zewnątrz przy zakresie 'umowa',
    // gdzie idzie `*`. Kto ma link, ten go zna; kto nie ma, nie ma go dostać.
    if (zakres === 'umowa' && typeof umowa === 'object' && umowa !== null) {
      delete (umowa as Record<string, unknown>).portal_access_token;
    }

    return json({ ok: true, umowa });
  } catch (e) {
    console.error('rental-portal-get:', e);
    return json({ error: 'Błąd przetwarzania' }, 500);
  }
});
