/**
 * Pomoc RIDO AI — doradca naprawczy przy KONKRETNYM aucie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO ROBI I CZEGO NIE ROBI
 * ═══════════════════════════════════════════════════════════════════════════
 * Mechanik opisuje objaw. My dokładamy komplet danych auta ZE ZLECENIA — marka,
 * model, rok, pojemność, moc, paliwo, VIN, przebieg i lista zadań — i pytamy
 * model, który MA DOSTĘP DO INTERNETU (narzędzie `web_search` Anthropic).
 *
 * Dostęp do sieci nie jest ozdobą, tylko warunkiem sensowności. Bez niego model
 * podaje linki do filmów i schematów Z PAMIĘCI, czyli je zmyśla: adresy wyglądają
 * poprawnie i nie otwierają się. Z narzędziem wyszukiwania podaje wyłącznie to,
 * co naprawdę znalazł, a my zwracamy listę źródeł, żeby mechanik mógł sprawdzić.
 *
 * ROZLICZENIE: jedno pytanie = jedna jednostka z puli `rido_ai`. Sprawdzenie
 * PRZED wysłaniem, pobranie PO odpowiedzi — ta sama kolejność co przy SMS-ach
 * i z tego samego powodu: pytanie kosztuje w chwili wysłania.
 *
 * FAIL-CLOSED: brak klucza, brak warsztatu, brak pokrycia w puli — odmawiamy.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Model, którym odpowiadamy, gdy administrator nie wybrał innego. */
const MODEL_DOMYSLNY = 'claude-haiku-4-5-20251001';

/**
 * Persona. Krótko, konkretnie, bez lania wody — mechanik czyta to przy aucie
 * na podnośniku, nie przy biurku.
 */
const PERSONA = `Jesteś doświadczonym doradcą technicznym w warsztacie samochodowym. Rozmawiasz z mechanikiem — zawodowcem, nie z klientem. Mów jak kolega z branży: konkretnie, bez uprzejmościowych wstępów i bez tłumaczenia rzeczy oczywistych dla fachowca.

ZASADY:
1. Odpowiadasz WYŁĄCZNIE w sprawie pojazdu opisanego niżej. Pytanie o inne auto — powiedz, że to zlecenie dotyczy innego pojazdu.
2. NAJPIERW SZUKAJ W INTERNECIE. Fora markowe, grupy techniczne, biuletyny serwisowe, filmy instruktażowe. Sprawdź, czy ta usterka jest w tym modelu ZNANA i czy ma typową przyczynę.
3. Podawaj TYLKO linki, które faktycznie otworzyłeś w wyszukiwaniu. Nigdy nie zmyślaj adresów — lepiej napisać „nie znalazłem filmu" niż podać martwy link.
4. Nie zgaduj numerów katalogowych ani OE. Jeśli trzeba, opisz część słowami i powiedz, gdzie sprawdzić numer.

UKŁAD ODPOWIEDZI — trzymaj się go:

**Co to najpewniej jest**
Jedno–dwa zdania. Jeśli usterka jest w tym modelu częsta, napisz to wprost i podaj, na jakim przebiegu zwykle wychodzi.

**Co sprawdzić po kolei**
Numerowana lista czynności od najtańszej i najszybszej do najbardziej pracochłonnej. Przy każdej: co odkręcić, czego użyć, jaki wynik oznacza usterkę.

**Na co uważać**
Tylko jeśli jest realne ryzyko — moment dokręcania, konieczna kalibracja po wymianie, kolejność montażu.

**Źródła**
Wypunktowane linki z krótkim opisem, co jest pod każdym. Pomiń, gdy nic wartościowego nie znalazłeś.

Odpowiadasz po polsku. Bez „mam nadzieję, że pomogłem".`;

function opiszPojazd(z: any): string {
  const p = z?.vehicle || {};
  const dane = [
    p.brand && p.model ? `${p.brand} ${p.model}` : null,
    p.year ? `rocznik ${p.year}` : null,
    p.engine_capacity_cm3 ? `${p.engine_capacity_cm3} cm3` : null,
    p.engine_power_kw ? `${p.engine_power_kw} kW` : null,
    p.fuel_type ? String(p.fuel_type) : null,
    p.vin ? `VIN ${p.vin}` : null,
    p.plate ? `nr rej. ${p.plate}` : null,
    z?.mileage ? `przebieg ${z.mileage} km` : null,
  ].filter(Boolean);

  const zadania = Array.isArray(z?.items)
    ? z.items.map((i: any) => i.name).filter(Boolean).slice(0, 12)
    : [];

  return [
    `POJAZD: ${dane.join(', ') || 'brak danych pojazdu'}`,
    z?.description ? `ZGŁOSZENIE KLIENTA: ${z.description}` : null,
    zadania.length ? `POZYCJE W ZLECENIU: ${zadania.join('; ')}` : null,
  ].filter(Boolean).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!url || !serviceKey || !anonKey) return json({ error: 'Funkcja nieskonfigurowana' }, 503);

    // TOŻSAMOŚĆ Z TOKENU WOŁAJĄCEGO. `verify_jwt` jest w tym projekcie wyłączone
    // dla wszystkich funkcji, więc sprawdzamy sami — inaczej każdy mógłby zadać
    // pytanie na cudzy rachunek.
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Wymagane zalogowanie' }, 401);

    const jako = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: bladUzytkownika } = await jako.auth.getUser();
    if (bladUzytkownika || !user) return json({ error: 'Wymagane zalogowanie' }, 401);

    const admin = createClient(url, serviceKey);
    const { orderId, pytanie, zalaczniki } = await req.json().catch(() => ({}));
    if (!orderId || !String(pytanie || '').trim()) {
      return json({ error: 'Brak zlecenia albo treści pytania' }, 400);
    }

    // ── Zlecenie i uprawnienie ────────────────────────────────────────────
    const { data: zlecenie } = await admin
      .from('workshop_orders')
      .select(`
        id, provider_id, description, mileage,
        vehicle:vehicle_id (brand, model, year, vin, plate, engine_capacity_cm3, engine_power_kw, fuel_type),
        items:workshop_order_items (name)
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (!zlecenie) return json({ error: 'Nie znaleziono zlecenia' }, 404);

    const { data: mojeWarsztaty } = await admin.rpc('get_user_provider_ids', { p_user_id: user.id });
    const wolno = Array.isArray(mojeWarsztaty)
      ? mojeWarsztaty.some((w: any) => (w?.get_user_provider_ids ?? w) === zlecenie.provider_id)
      : false;
    if (!wolno) return json({ error: 'To zlecenie należy do innego warsztatu' }, 403);

    const providerId = zlecenie.provider_id;

    // ── Limit PRZED pytaniem ──────────────────────────────────────────────
    const { data: stan, error: bladStanu } = await admin.rpc('check_usage', {
      p_subscriber_type: 'service_provider',
      p_subscriber_id: providerId,
      p_feature_key: 'rido_ai',
      p_amount: 1,
    });
    if (bladStanu || stan?.allowed !== true) {
      return json({
        error: 'BRAK_PYTAN',
        message: 'Wykorzystałeś limit pytań do Rido AI. Dokup pakiet albo przejdź na wyższy plan.',
      }, 402);
    }

    // ── Model wybrany przez administratora w Centrum AI ────────────────────
    const { data: mapowanie } = await admin
      .from('ai_function_mapping')
      .select('provider_key, model_override, is_enabled, custom_prompt')
      .eq('function_key', 'rido_help')
      .maybeSingle();

    if (mapowanie && mapowanie.is_enabled === false) {
      return json({ error: 'Pomoc RIDO AI jest wyłączona przez administratora' }, 503);
    }

    const { data: dostawca } = await admin
      .from('ai_providers')
      .select('provider_key, api_key_encrypted, default_model, is_enabled')
      .eq('provider_key', mapowanie?.provider_key || 'claude_haiku')
      .maybeSingle();

    const klucz = String(dostawca?.api_key_encrypted || Deno.env.get('ANTHROPIC_API_KEY') || '').trim();
    if (!klucz) return json({ error: 'Brak klucza do modelu — ustaw go w Centrum AI' }, 503);

    const model = mapowanie?.model_override || dostawca?.default_model || MODEL_DOMYSLNY;

    // ── Historia wątku ────────────────────────────────────────────────────
    const { data: watek } = await admin
      .from('warsztat_pomoc_ai')
      .select('id, wiadomosci')
      .eq('order_id', orderId)
      .maybeSingle();

    const historia: any[] = Array.isArray(watek?.wiadomosci) ? watek!.wiadomosci : [];

    // Do modelu idzie OSTATNIE OSIEM wpisów. Cała historia rosłaby bez końca,
    // a przy tej rozmowie liczy się wątek bieżącej usterki, nie sprzed miesiąca.
    const doModelu = historia.slice(-8).map((w: any) => ({
      role: w.rola === 'rido' ? 'assistant' : 'user',
      content: String(w.tresc || ''),
    }));

    // ── Treść pytania: tekst + ewentualne zdjęcia ─────────────────────────
    const blokiPytania: any[] = [];
    for (const z of (Array.isArray(zalaczniki) ? zalaczniki : []).slice(0, 4)) {
      if (z?.typ === 'obraz' && z?.dane && z?.mime) {
        blokiPytania.push({
          type: 'image',
          source: { type: 'base64', media_type: z.mime, data: z.dane },
        });
      } else if (z?.typ === 'pdf' && z?.dane) {
        blokiPytania.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: z.dane },
        });
      }
    }
    blokiPytania.push({ type: 'text', text: String(pytanie) });

    const system = [
      mapowanie?.custom_prompt?.trim() || PERSONA,
      '',
      opiszPojazd(zlecenie),
    ].join('\n');

    // ── Pytanie z DOSTĘPEM DO INTERNETU ───────────────────────────────────
    const odpowiedzApi = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': klucz,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        system,
        messages: [...doModelu, { role: 'user', content: blokiPytania }],
        // Bez tego narzędzia model podaje linki z pamięci, czyli je zmyśla.
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
      }),
    });

    if (!odpowiedzApi.ok) {
      const tresc = await odpowiedzApi.text();
      console.error('[rido-help] model:', odpowiedzApi.status, tresc.slice(0, 500));
      return json({ error: 'Model nie odpowiedział. Spróbuj ponownie za chwilę.' }, 502);
    }

    const wynik = await odpowiedzApi.json();
    const bloki: any[] = Array.isArray(wynik?.content) ? wynik.content : [];

    const tekst = bloki.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!tekst) return json({ error: 'Model zwrócił pustą odpowiedź' }, 502);

    // Źródła zbieramy z wyników wyszukiwania — to są adresy, które model
    // NAPRAWDĘ otworzył, a nie te, które wypisał w treści.
    const zrodla: Array<{ tytul: string; url: string }> = [];
    for (const b of bloki) {
      if (b.type !== 'web_search_tool_result') continue;
      // Przy błędzie narzędzia `content` jest OBIEKTEM, nie listą — bez tego
      // sprawdzenia iteracja rzuca wyjątkiem na pozornie udanej odpowiedzi.
      if (!Array.isArray(b.content)) continue;
      for (const r of b.content) {
        if (r?.url && !zrodla.some((z) => z.url === r.url)) {
          zrodla.push({ tytul: String(r.title || r.url), url: String(r.url) });
        }
      }
    }

    // ── Pobranie jednostki PO odpowiedzi ──────────────────────────────────
    const { data: pobranie } = await admin.rpc('billing_consume', {
      p_subscriber_type: 'service_provider',
      p_subscriber_id: providerId,
      p_feature_key: 'rido_ai',
      p_amount: 1,
    });
    if (pobranie?.ok !== true) {
      // Odpowiedź już powstała i kosztowała — nie ukrywamy, że licznik nie zszedł.
      console.error('[rido-help] odpowiedz przyszla, pobranie nieudane', pobranie);
    }

    // ── Zapis wątku ───────────────────────────────────────────────────────
    const teraz = new Date().toISOString();
    const nowaHistoria = [
      ...historia,
      { rola: 'czlowiek', tresc: String(pytanie), zalaczniki: blokiPytania.length - 1, czas: teraz },
      { rola: 'rido', tresc: tekst, zrodla, czas: teraz },
    ];

    if (watek?.id) {
      await admin.from('warsztat_pomoc_ai')
        .update({ wiadomosci: nowaHistoria, updated_at: teraz })
        .eq('id', watek.id);
    } else {
      await admin.from('warsztat_pomoc_ai')
        .insert({ order_id: orderId, provider_id: providerId, wiadomosci: nowaHistoria });
    }

    return json({ odpowiedz: tekst, zrodla, model });
  } catch (e) {
    console.error('[rido-help]', e);
    return json({ error: 'Błąd wewnętrzny' }, 500);
  }
});
