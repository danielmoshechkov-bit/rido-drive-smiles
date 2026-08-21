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
/**
 * DWA MODELE, DWIE ROLE — I DLACZEGO TAK.
 *
 * Jedno głębokie zapytanie do mocnego modelu kosztuje kilka razy więcej niż
 * krótka wymiana zdań. Zamiast płacić tę stawkę za każdą wiadomość, dzielimy
 * rozmowę na dwie role:
 *
 *   WYWIAD (model tani) — dopytuje mechanika o szczegóły, których nie da się
 *   zgadnąć z karty zlecenia: kiedy objaw występuje, na jakich obrotach, czy
 *   odczytano błędy. Podpowiada też, co sprawdzić PRZED analizą. Nie kosztuje
 *   jednostki z pakietu: to zbieranie danych, nie odpowiedź.
 *
 *   ANALIZA (model mocny) — JEDNO zapytanie, gdy obraz jest już kompletny.
 *   Przeszukuje internet, składa diagnozę ze źródłami. To ona zdejmuje
 *   jednostkę z pakietu, bo to ona jest tym, po co mechanik przyszedł.
 *
 * Po analizie rozmowa wraca do modelu taniego — ma już diagnozę w historii,
 * więc odpowiada na pytania uzupełniające bez ponownego przeszukiwania sieci.
 * Gdy w rozmowie zbierze się garść NOWYCH faktów, wywiad znów uzna obraz za
 * kompletny i pójdzie druga analiza. Sufit: trzy na wątek.
 */
const LIMIT_ANALIZ = 3;

const PERSONA_WYWIAD = `Jesteś doświadczonym mechanikiem, który przyjmuje zgłoszenie od kolegi z warsztatu. Twoim zadaniem NIE jest jeszcze diagnoza — tylko zebranie kompletu informacji, żeby diagnoza mogła być trafna.

Dane pojazdu masz niżej i są PEWNE. Nie pytaj o markę, model, rocznik, silnik ani paliwo.

Oceń, czy masz komplet do postawienia diagnozy. Potrzebujesz zwykle:
- kiedy dokładnie objaw występuje (na zimnym, na ciepłym, pod obciążeniem, na jakich obrotach),
- od kiedy trwa i czy narasta,
- czy odczytano błędy z komputera — a jeśli nie, poproś o odczyt,
- co ostatnio przy tym aucie robiono.

ZASADY:
1. Pytaj W JEDNEJ RUNDZIE. Maksymalnie cztery pytania, krótko, jako lista. Nie przesłuchuj przez pięć wiadomości.
2. Do pytań DOŁÓŻ podpowiedź, co sprawdzić od ręki, zanim odpowie — coś, co zajmuje minutę i zawęża sprawę.
3. Gdy mechanik odpowie na większość, uznaj obraz za kompletny. Nie dopytuj o resztę.
4. Gdy pierwsze zgłoszenie jest już konkretne (objaw + warunki + ewentualne błędy), od razu uznaj obraz za kompletny — nie pytaj dla samego pytania.
5. Pisz WYŁĄCZNIE po polsku. Bez wulgaryzmów.

Odpowiadasz TYLKO czystym JSON-em, bez tekstu przed ani po:
{
  "gotowe": true albo false,
  "odpowiedz": "treść dla mechanika — pytania i podpowiedź, gdy gotowe=false; puste, gdy gotowe=true",
  "brief": "gdy gotowe=true: zwięzłe streszczenie CAŁEJ sprawy dla eksperta — objaw, warunki, błędy, co już sprawdzono. Gdy gotowe=false: puste"
}`;

const PERSONA_ANALIZA = `Jesteś ekspertem technicznym z wieloletnią praktyką w warsztacie. Dostajesz komplet informacji o usterce i masz postawić diagnozę.

═══ ZASADY BEZWZGLĘDNE ═══

1. DANE POJAZDU NIŻEJ SĄ PEWNE. Nigdy ich nie zmieniaj: jeśli stoi „Benzyna", to jest benzyna, nawet jeśli ten model bywa też w diesla.
2. ZAWSZE NAJPIERW SZUKAJ W INTERNECIE — fora markowe, biuletyny serwisowe, filmy. Sprawdź, czy usterka jest w TYM modelu znana.
3. ZAWSZE KOŃCZ sekcją „Źródła" z linkami, które FAKTYCZNIE otworzyłeś. Nie zmyślaj adresów. Gdy nic wartościowego nie ma — napisz to jednym zdaniem, ale sekcja ma być.
4. NIE ZADAWAJ PYTAŃ. Wywiad już się odbył. Masz odpowiedzieć.
5. Pisz WYŁĄCZNIE po polsku — poza skrótami technicznymi (MAF, EGR, DPF). Bez wulgaryzmów.
6. Nie zgaduj numerów katalogowych ani OE — nie masz katalogu.

═══ UKŁAD ODPOWIEDZI (Markdown) ═══

**Co to najpewniej jest**
Jedno–dwa zdania. Jeśli usterka jest w tym modelu częsta, napisz to wprost i podaj, na jakim przebiegu zwykle wychodzi.

**Co sprawdzić po kolei**
Lista numerowana, od najtańszego i najszybszego do najbardziej pracochłonnego. Przy każdym: co zrobić, czego użyć, jaki wynik oznacza usterkę.

**Na co uważać**
Tylko gdy jest realne ryzyko — moment dokręcania, kalibracja po wymianie, kolejność montażu.

**Źródła**
Lista linków, przy każdym jedno zdanie, co pod nim jest.`;

function opiszPojazd(z: any): string {
  const p = z?.vehicle || {};
  // Etykieta w osobnej linii przy każdej wartości. Sklejone w jeden ciąg dane
  // model potrafił przeczytać po swojemu — przy Passacie z 1984 cm3 na benzynie
  // napisał „1.9 TDi", bo tak zwykle wygląda ten model w jego pamięci.
  const dane = [
    p.brand || p.model ? `Marka i model: ${[p.brand, p.model].filter(Boolean).join(' ')}` : null,
    p.year ? `Rok produkcji: ${p.year}` : null,
    p.engine_capacity_cm3 ? `Pojemność silnika: ${p.engine_capacity_cm3} cm3` : null,
    p.engine_power_kw ? `Moc: ${p.engine_power_kw} kW` : null,
    p.fuel_type ? `Rodzaj paliwa: ${p.fuel_type}` : null,
    p.vin ? `VIN: ${p.vin}` : null,
    p.plate ? `Nr rejestracyjny: ${p.plate}` : null,
    z?.mileage ? `Przebieg: ${z.mileage} km` : null,
  ].filter(Boolean);

  const zadania = Array.isArray(z?.items)
    ? z.items.map((i: any) => i.name).filter(Boolean).slice(0, 12)
    : [];

  return [
    '═══ POJAZD Z KARTY ZLECENIA — DANE PEWNE, NIE PYTAJ O NIE ═══',
    dane.length ? dane.join('\n') : 'Brak danych pojazdu w zleceniu — poproś o uzupełnienie karty auta.',
    z?.description ? `\nZGŁOSZENIE KLIENTA: ${z.description}` : null,
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

    // ── Dostawcy z Centrum AI: osobno wywiad, osobno analiza ──────────────
    const wezMapowanie = async (klucz: string, domyslnyDostawca: string) => {
      const { data: m } = await admin
        .from('ai_function_mapping')
        .select('provider_key, model_override, is_enabled, custom_prompt')
        .eq('function_key', klucz)
        .maybeSingle();

      const { data: d } = await admin
        .from('ai_providers')
        .select('api_key_encrypted, default_model, is_enabled')
        .eq('provider_key', m?.provider_key || domyslnyDostawca)
        .maybeSingle();

      return {
        wylaczone: m?.is_enabled === false,
        klucz: String(d?.api_key_encrypted || Deno.env.get('ANTHROPIC_API_KEY') || '').trim(),
        model: m?.model_override || d?.default_model || MODEL_DOMYSLNY,
        prompt: m?.custom_prompt?.trim() || '',
      };
    };

    const wywiad = await wezMapowanie('rido_help', 'claude_haiku');
    if (wywiad.wylaczone) {
      return json({ error: 'Pomoc RIDO AI jest wyłączona przez administratora' }, 503);
    }
    if (!wywiad.klucz) return json({ error: 'Brak klucza do modelu — ustaw go w Centrum AI' }, 503);

    // ── Historia wątku ────────────────────────────────────────────────────
    const { data: watek } = await admin
      .from('warsztat_pomoc_ai')
      .select('id, wiadomosci, analizy')
      .eq('order_id', orderId)
      .maybeSingle();

    const historia: any[] = Array.isArray(watek?.wiadomosci) ? watek!.wiadomosci : [];
    const analizyDotad = Number(watek?.analizy || 0);

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

    const opisAuta = opiszPojazd(zlecenie);

    const zapytaj = async (cfg: { klucz: string; model: string }, ciało: any) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.klucz,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: cfg.model, ...ciało }),
      });
      if (!r.ok) {
        const t = await r.text();
        console.error('[rido-help]', cfg.model, r.status, t.slice(0, 400));
        return null;
      }
      return await r.json();
    };

    // ═══ KROK 1: WYWIAD (model tani, bez pobierania jednostki) ════════════
    const wynikWywiadu = await zapytaj(wywiad, {
      max_tokens: 1200,
      system: [wywiad.prompt || PERSONA_WYWIAD, '', opisAuta].join('\n'),
      messages: [...doModelu, { role: 'user', content: blokiPytania }],
    });

    if (!wynikWywiadu) {
      return json({ error: 'Model nie odpowiedział. Spróbuj ponownie za chwilę.' }, 502);
    }

    const surowy = (Array.isArray(wynikWywiadu?.content) ? wynikWywiadu.content : [])
      .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();

    let plan: any = {};
    try {
      // Model bywa uprzejmy i opakowuje JSON w ```json — bierzemy to, co
      // między pierwszym `{` a ostatnim `}`.
      const od = surowy.indexOf('{');
      const doZnaku = surowy.lastIndexOf('}');
      plan = od >= 0 && doZnaku > od ? JSON.parse(surowy.slice(od, doZnaku + 1)) : {};
    } catch {
      plan = {};
    }

    // Gdy wywiad nie zwróci czytelnego JSON-a, NIE blokujemy rozmowy: traktujemy
    // jego tekst jak zwykłą odpowiedź. Awaria formatu nie może kosztować
    // mechanika pytania z pakietu.
    const trzebaDopytac = plan?.gotowe !== true;

    if (trzebaDopytac) {
      const tresc = String(plan?.odpowiedz || surowy || '').trim();
      if (!tresc) return json({ error: 'Model zwrócił pustą odpowiedź' }, 502);

      const teraz = new Date().toISOString();
      const nowa = [
        ...historia,
        { rola: 'czlowiek', tresc: String(pytanie), zalaczniki: blokiPytania.length - 1, czas: teraz },
        { rola: 'rido', tresc, etap: 'wywiad', czas: teraz },
      ];
      if (watek?.id) {
        await admin.from('warsztat_pomoc_ai').update({ wiadomosci: nowa, updated_at: teraz }).eq('id', watek.id);
      } else {
        await admin.from('warsztat_pomoc_ai').insert({ order_id: orderId, provider_id: providerId, wiadomosci: nowa });
      }
      // Wywiad nie zdejmuje jednostki — to zbieranie danych, nie odpowiedź.
      return json({ odpowiedz: tresc, zrodla: [], etap: 'wywiad', pobrano: false });
    }

    // ═══ KROK 2: ANALIZA (model mocny, z internetem, zdejmuje jednostkę) ══
    if (analizyDotad >= LIMIT_ANALIZ) {
      // Sufit trzech analiz. Zamiast odmawiać, odpowiadamy tym, co już wiemy —
      // model tani ma diagnozę w historii, więc nadal jest użyteczny.
      const tresc = String(plan?.odpowiedz || surowy || 'Mam już komplet informacji z wcześniejszej analizy.').trim();
      const teraz = new Date().toISOString();
      const nowa = [
        ...historia,
        { rola: 'czlowiek', tresc: String(pytanie), zalaczniki: blokiPytania.length - 1, czas: teraz },
        { rola: 'rido', tresc, etap: 'wywiad', czas: teraz },
      ];
      await admin.from('warsztat_pomoc_ai').update({ wiadomosci: nowa, updated_at: teraz }).eq('id', watek!.id);
      return json({ odpowiedz: tresc, zrodla: [], etap: 'limit-analiz', pobrano: false });
    }

    const analiza = await wezMapowanie('rido_help_analiza', 'claude_sonnet');
    const brief = String(plan?.brief || pytanie).trim();

    const wynik = await zapytaj(
      { klucz: analiza.klucz || wywiad.klucz, model: analiza.model },
      {
        max_tokens: 3000,
        system: [analiza.prompt || PERSONA_ANALIZA, '', opisAuta].join('\n'),
        messages: [
          ...doModelu,
          { role: 'user', content: [...blokiPytania.slice(0, -1), { type: 'text', text: brief }] },
        ],
        // Bez tego narzędzia model podaje linki z pamięci, czyli je zmyśla.
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
      },
    );

    if (!wynik) return json({ error: 'Model nie odpowiedział. Spróbuj ponownie za chwilę.' }, 502);

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
      { rola: 'rido', tresc: tekst, zrodla, etap: 'analiza', czas: teraz },
    ];

    if (watek?.id) {
      await admin.from('warsztat_pomoc_ai')
        .update({ wiadomosci: nowaHistoria, analizy: analizyDotad + 1, updated_at: teraz })
        .eq('id', watek.id);
    } else {
      await admin.from('warsztat_pomoc_ai')
        .insert({ order_id: orderId, provider_id: providerId, wiadomosci: nowaHistoria, analizy: 1 });
    }

    return json({
      odpowiedz: tekst,
      zrodla,
      etap: 'analiza',
      pobrano: true,
      model: analiza.model,
      analizy: analizyDotad + 1,
      limitAnaliz: LIMIT_ANALIZ,
    });
  } catch (e) {
    console.error('[rido-help]', e);
    return json({ error: 'Błąd wewnętrzny' }, 500);
  }
});
