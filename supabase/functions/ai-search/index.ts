import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROVIDER ROUTING — konfiguracja z ai_routing_rules + ai_providers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type Provider = {
  provider_key: string;
  default_model: string | null;
  api_key: string | null;
  timeout_seconds: number | null;
};

function envKeyFor(providerKey: string): string | null {
  if (providerKey === 'kimi') return Deno.env.get('KIMI_API_KEY') || null;
  if (providerKey.startsWith('claude_')) return Deno.env.get('ANTHROPIC_API_KEY') || null;
  if (providerKey === 'gemini' || providerKey.startsWith('gemini_')) return Deno.env.get('GEMINI_API_KEY') || Deno.env.get('LOVABLE_API_KEY') || null;
  if (providerKey === 'openai') return Deno.env.get('OPENAI_API_KEY') || Deno.env.get('LOVABLE_API_KEY') || null;
  return null;
}

async function loadProvidersForTask(supabase: any, taskType: string): Promise<Provider[]> {
  const { data: rule } = await supabase
    .from('ai_routing_rules')
    .select('primary_provider_key, secondary_provider_key, tertiary_provider_key')
    .eq('task_type', taskType)
    .maybeSingle();

  const keys: string[] = rule
    ? [rule.primary_provider_key, rule.secondary_provider_key, rule.tertiary_provider_key].filter(Boolean) as string[]
    : [];
  if (keys.length === 0) keys.push('kimi', 'claude_haiku');

  const { data: providers } = await supabase
    .from('ai_providers')
    .select('provider_key, default_model, api_key_encrypted, timeout_seconds, is_enabled')
    .in('provider_key', keys);

  const result: Provider[] = [];
  for (const k of keys) {
    const p = providers?.find((x: any) => x.provider_key === k);
    const apiKey = p?.api_key_encrypted || envKeyFor(k);
    if (!apiKey) continue;
    result.push({
      provider_key: k,
      default_model: p?.default_model || null,
      api_key: apiKey,
      timeout_seconds: p?.timeout_seconds || 30,
    });
  }
  return result;
}

async function callKimi(apiKey: string, model: string, system: string, user: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'moonshot-v1-8k',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3,
    }),
  });
  if (!r.ok) throw new Error(`Kimi ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

async function callAnthropic(apiKey: string, model: string, system: string, user: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

async function callLovable(apiKey: string, model: string, system: string, user: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Lovable ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

async function callProviderRaw(p: Provider, system: string, user: string, signal: AbortSignal): Promise<string> {
  if (p.provider_key === 'kimi') return callKimi(p.api_key!, p.default_model || 'moonshot-v1-8k', system, user, signal);
  if (p.provider_key.startsWith('claude_')) return callAnthropic(p.api_key!, p.default_model || 'claude-haiku-4-5-20251001', system, user, signal);
  if (p.provider_key === 'gemini' || p.provider_key.startsWith('gemini_')) {
    return callLovable(p.api_key!, `google/${p.default_model || 'gemini-3-flash-preview'}`, system, user, signal);
  }
  if (p.provider_key === 'openai') return callLovable(p.api_key!, `openai/${p.default_model || 'gpt-4o'}`, system, user, signal);
  throw new Error(`Unsupported provider: ${p.provider_key}`);
}

async function callLLMWithFallback(providers: Provider[], system: string, user: string): Promise<{ content: string; provider_used: string }> {
  let lastErr: Error | null = null;
  for (const p of providers) {
    const timeoutMs = (p.timeout_seconds || 30) * 1000;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const content = await callProviderRaw(p, system, user, ctrl.signal);
      clearTimeout(tid);
      return { content, provider_used: p.provider_key };
    } catch (err) {
      clearTimeout(tid);
      const msg = (err as Error).message || String(err);
      console.warn(`Provider ${p.provider_key} failed: ${msg}`);
      lastErr = err as Error;
    }
  }
  // Ultimate fallback: Lovable Gateway hardcoded (zachowuje produkcję live nawet gdy Kimi/Claude padną)
  if (LOVABLE_API_KEY) {
    try {
      const content = await callLovable(LOVABLE_API_KEY, 'google/gemini-3-flash-preview', system, user);
      return { content, provider_used: 'lovable_gemini_fallback' };
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr || new Error('Brak dostępnego providera AI');
}

async function isAdmin(supabase: any, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  return !!data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mapowanie transaction PL/EN — baza ma polskie wartości
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TX_MAP: Record<string, string[]> = {
  buy:  ['sprzedaz', 'sprzedaż', 'sale', 'buy'],
  rent: ['wynajem', 'wynajem-krotkoterminowy', 'wynajem-dlugoterminowy', 'rent', 'rental'],
};

// Generyczne słowa pojazdów — nie filtruj po brand/model gdy hint to tylko "samochód"/"auto"
const VEHICLE_GENERIC_WORDS = new Set([
  'samochod', 'samochód', 'samochodu', 'samochody',
  'auto', 'auta', 'aut',
  'pojazd', 'pojazdu', 'pojazdy',
  'car', 'cars', 'vehicle', 'vehicles',
]);

function stripVehicleGenerics(hint: string): string[] {
  return hint
    .split(/\s+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 2 && !VEHICLE_GENERIC_WORDS.has(w));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KROK 1: Rozumienie intencji
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function understandIntent(query: string, providers: Provider[]): Promise<{ intent: any; provider_used: string }> {
  // Pre-pass: deterministyczna detekcja multi-intent przez słowa-klucze
  const lower = query.toLowerCase();
  const hits = {
    real_estate: /\b(mieszka|dom|lokal|biuro|magazyn|garaż|garaz|kawalerk|apartament|posesj|działk|dzialk)/i.test(lower),
    vehicles:    /\b(auto|samoch|pojazd|bus|skuter|motor|toyot|bmw|audi|skod|opl|fiat|ford|hond|mazd)/i.test(lower),
    services:    /\b(usług|uslug|sprząt|sprzat|hydraul|elektryk|remont|budowl|projektant|fryzjer|fotograf|\bdj\b|catering|kucharz|wesele|przeprowadzk|ogrodnik|złota\s+rączk|zlota\s+raczk|detailing|ppf|warsztat|serwis|naprawa|wymiana|klock|olej|hamulc)/i.test(lower),
    general:     /\b(meble|kanapa|łóżk|lozk|biurko|szafa|elektronik|laptop|telefon|playstation|rower|narzędzi|narzedzi|telewizor|konsola|aparat|ubrani|odzież|odziez)/i.test(lower),
  };
  const multiHints = Object.values(hits).filter(Boolean).length >= 2;

  // Pre-pass dla is_complex — TYLKO słowa planowania uprawniają do trybu PLAN
  const planRegex = /\b(zaplanuj|zaplanować|plan\s|planow|zorganizuj|zorganizow|potrzebuj[eę]\s+wszystk|wesele|event|remont|urządź|urzadz|od\s+a\s+do\s+z|kompleksow)/i;
  const isPlanningQuery = planRegex.test(lower);

  const systemPrompt = `Jesteś asystentem portalu RIDO. Portal ma 4 sekcje:
- real_estate: nieruchomości (mieszkania, domy, lokale, warsztaty, magazyny, garaże, biura, działki)
- vehicles: pojazdy — SPRZEDAŻ (giełda) i WYNAJEM (flotowy). Rozróżniaj na podstawie intencji.
- services: usługi (sprzątanie, hydraulik, elektryk, przeprowadzki, fryzjer, fotograf, catering, DJ, dekorator, kucharz, organizator wesela, warsztat samochodowy, projektant wnętrz, remonty, budowlanka, wymiana części, naprawa, serwis)
- general: ogłoszenia ogólne (RidoMarket) — meble, elektronika, sport, narzędzia, ubrania, akcesoria motoryzacyjne, dla dzieci, zwierzęta, książki

WAŻNE — multi-intent vs complex:
- "i", "oraz", "+", "plus" łączące kategorie = MULTI-INTENT (kilka categories[] z osobnymi filters), NIE complex
- is_complex = true TYLKO gdy query zawiera słowa planistyczne: "zaplanuj", "zorganizuj", "wesele", "event", "remont", "urządź", "kompleksowo", "od A do Z"
- "auta i mieszkania do 150k" → categories:["vehicles","real_estate"], is_complex:false
- "zaplanuj wesele" → is_complex:true

Per-kategoria zwróć osobne filtry (np. inna cena dla auta sprzedaży vs mieszkania wynajmu).

Zwróć JSON:
{
  "intent": "opis co użytkownik chce zrobić jednym zdaniem",
  "categories": ["real_estate" | "vehicles" | "services" | "general"],
  "filters": {
    "real_estate": { "hint": "słowa kluczowe", "price_max": liczba|null, "price_min": liczba|null, "transaction": "rent"|"buy"|null },
    "vehicles":    { "hint": "marka/model/typ pojazdu", "price_max": liczba|null, "price_min": liczba|null, "transaction": "rent"|"buy"|null },
    "services":    { "hint": "typ usługi lub konkretna czynność (np. wymiana klocków)", "price_max": liczba|null, "price_min": liczba|null },
    "general":     { "hint": "typ przedmiotu", "price_max": liczba|null, "price_min": liczba|null }
  },
  "city": "miasto lub null",
  "is_complex": true/false,
  "complex_plan": "jeśli is_complex=true: lista potrzebnych elementów jako string"
}

PRZYKŁADY:
"auto do 50k Warszawa" → categories:["vehicles"], filters:{"vehicles":{"hint":"samochód","price_max":50000,"transaction":"buy"}}, city:"Warszawa", is_complex:false
"BMW 320d Warszawa" → categories:["vehicles"], filters:{"vehicles":{"hint":"BMW 320d","transaction":"buy"}}, city:"Warszawa"
"auto na weekend Kraków" → categories:["vehicles"], filters:{"vehicles":{"hint":"samochód","transaction":"rent"}}, city:"Kraków"
"mieszkanie warszawa do 3000" → categories:["real_estate"], filters:{"real_estate":{"hint":"mieszkanie","price_max":3000,"transaction":"rent"}}, city:"Warszawa"
"auto i mieszkanie warszawa do 3000" → categories:["vehicles","real_estate"], filters:{"vehicles":{"hint":"samochód","price_max":3000,"transaction":"rent"},"real_estate":{"hint":"mieszkanie","price_max":3000,"transaction":"rent"}}, city:"Warszawa", is_complex:false
"wymiana klocków hamulcowych warszawa" → categories:["services"], filters:{"services":{"hint":"wymiana klocków hamulcowych warsztat"}}, city:"Warszawa", is_complex:false
"szukam mebli do salonu" → categories:["general"], filters:{"general":{"hint":"meble salon kanapa stolik"}}, is_complex:false
"zaplanuj wesele do 50 tys" → is_complex:true, categories:["services","general"], complex_plan:"fotograf, kucharz/catering, DJ, dekorator, sala weselna, organizator, dekoracje"
"szukam warsztatu samochodowego" → categories:["real_estate","services"], filters:{"real_estate":{"hint":"warsztat serwis mechaniczny"},"services":{"hint":"warsztat samochodowy"}}

Odpowiedz TYLKO poprawnym JSON.`;

  const userPrompt = multiHints
    ? `${query}\n\n[wskazówka: wykryto słowa-klucze z >1 kategorii — to prawdopodobnie multi-intent]`
    : query;

  let content = '{}';
  let providerUsed = 'unknown';
  try {
    const r = await callLLMWithFallback(providers, systemPrompt, userPrompt);
    content = r.content;
    providerUsed = r.provider_used;
  } catch (err) {
    console.error('understandIntent LLM call failed:', (err as Error).message);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    parsed = { categories: ['real_estate', 'services', 'general'], filters: {}, intent: query };
  }

  // Backward-compat: jeśli LLM zwrócił stary format z top-level price_max/hint — zmigruj do filters
  if (!parsed.filters && (parsed.price_max || parsed.real_estate_hint || parsed.vehicle_hint || parsed.services_hint)) {
    parsed.filters = {
      real_estate: { hint: parsed.real_estate_hint, price_max: parsed.price_max, price_min: parsed.price_min, transaction: null },
      vehicles:    { hint: parsed.vehicle_hint,     price_max: parsed.price_max, price_min: parsed.price_min, transaction: null },
      services:    { hint: parsed.services_hint,    price_max: parsed.price_max, price_min: parsed.price_min },
      general:     { hint: null, price_max: parsed.price_max, price_min: parsed.price_min },
    };
  }

  // Pre-pass override: NIE pozwalaj LLM aktywować is_complex bez słowa planowania
  if (parsed.is_complex && !isPlanningQuery) {
    parsed.is_complex = false;
    parsed.complex_plan = null;
  }

  return { intent: parsed, provider_used: providerUsed };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KROK 2: Pobierz kandydatów szeroko
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function fetchCandidates(supabase: any, intent: any) {
  const results: any = { real_estate: [], vehicles: [], services: [], general: [] };
  const promises: Promise<void>[] = [];
  const f = intent.filters || {};

  // ── REAL ESTATE ──────────────────────────────────────────
  if (intent.categories?.includes('real_estate')) {
    const fre = f.real_estate || {};
    let q = supabase
      .from('real_estate_listings')
      .select(`
        id, title, description, price, price_type, photos,
        location, city, district, address, area, rooms, floor, total_floors, build_year,
        property_type, transaction_type,
        has_balcony, has_elevator, has_parking, has_garden,
        latitude, longitude, contact_person, contact_phone,
        real_estate_agents!agent_id(company_name)
      `)
      .eq('status', 'active');

    if (fre.price_max) q = q.lte('price', fre.price_max * 1.2);
    if (fre.price_min) q = q.gte('price', fre.price_min * 0.8);
    if (fre.transaction === 'rent' || fre.transaction === 'buy') {
      q = q.in('transaction_type', TX_MAP[fre.transaction]);
    }
    if (intent.city) q = q.or(`city.ilike.%${intent.city}%,location.ilike.%${intent.city}%`);

    if (fre.hint) {
      const words = String(fre.hint).split(' ').filter(Boolean).slice(0, 3);
      if (words.length > 0) {
        const orConds = words.map((w: string) => `title.ilike.%${w}%,description.ilike.%${w}%`).join(',');
        q = q.or(orConds);
      }
    }

    promises.push(
      q.order('created_at', { ascending: false }).limit(30).then(({ data }: any) => {
        results.real_estate = data || [];
      })
    );
  }

  // ── VEHICLES ─ dwa źródła: vehicle_listings (sale) + marketplace_listings (rent) ──
  if (intent.categories?.includes('vehicles')) {
    const fv = f.vehicles || {};
    const wantBuy  = !fv.transaction || fv.transaction === 'buy';
    const wantRent = !fv.transaction || fv.transaction === 'rent';

    if (wantBuy) {
      let q = supabase
        .from('vehicle_listings')
        .select(`id, title, description, price, photos, city, location, brand, model, year, fuel_type, body_type, transaction_type, listed_at`)
        .eq('status', 'active');
      if (fv.price_max) q = q.lte('price', fv.price_max * 1.2);
      if (fv.price_min) q = q.gte('price', fv.price_min * 0.8);
      if (intent.city) q = q.or(`city.ilike.%${intent.city}%,location.ilike.%${intent.city}%`);
      // Mapowanie transaction PL/EN (sprzedaz/sprzedaż)
      if (fv.transaction === 'buy') {
        q = q.in('transaction_type', TX_MAP.buy);
      }
      // Brand/model/fuel/body OR filter — POMIJAMY gdy hint to TYLKO słowo generyczne (samochód/auto)
      if (fv.hint) {
        const hintWords = stripVehicleGenerics(String(fv.hint)).slice(0, 4);
        if (hintWords.length > 0) {
          const orConds = hintWords.flatMap((w: string) => [
            `brand.ilike.%${w}%`,
            `model.ilike.%${w}%`,
            `fuel_type.ilike.%${w}%`,
            `body_type.ilike.%${w}%`,
            `title.ilike.%${w}%`,
            `description.ilike.%${w}%`,
          ]).join(',');
          q = q.or(orConds);
        }
        // Jeśli hint zawierał TYLKO generic words (np. "samochód") → bez OR filter (szeroki zwrot)
      }
      promises.push(
        q.order('listed_at', { ascending: false }).limit(15).then(({ data }: any) => {
          results.vehicles.push(...(data || []).map((v: any) => ({ ...v, _source: 'sale' })));
        })
      );
    }

    if (wantRent) {
      let q = supabase
        .from('marketplace_listings')
        .select(`
          id, title, description, price, price_type, photos, location_text, is_featured, created_at,
          vehicle_id, fleet_id, driver_id,
          fleets:fleet_id (name, contact_phone_for_drivers),
          vehicles:vehicle_id (brand, model, year, fuel_type, plate)
        `)
        .eq('is_active', true)
        .is('deleted_at', null)
        .not('vehicle_id', 'is', null);
      if (fv.price_max) q = q.lte('price', fv.price_max * 1.2);
      if (fv.price_min) q = q.gte('price', fv.price_min * 0.8);
      if (intent.city) q = q.ilike('location_text', `%${intent.city}%`);
      promises.push(
        q.limit(15).then(({ data }: any) => {
          results.vehicles.push(...(data || []).map((v: any) => ({ ...v, _source: 'rent' })));
        })
      );
    }
  }

  // ── SERVICES ─────────────────────────────────────────────
  if (intent.categories?.includes('services')) {
    const fs = f.services || {};
    let q = supabase
      .from('service_providers')
      .select(`
        id, company_name, company_city, company_address, company_phone, company_email,
        description, logo_url, cover_image_url, rating_avg, rating_count, category_id, status,
        category:service_categories!category_id(id, name, slug),
        services:provider_services(id, name, description, short_description, category, price_from, price_to)
      `)
      .eq('status', 'active');

    if (intent.city) q = q.ilike('company_city', `%${intent.city}%`);

    promises.push(
      q.limit(80).then(({ data }: any) => {
        let providers = data || [];
        // JS-side: filtruj po hint w 6 polach (company_name, description, category.name/slug, provider_services.name/description/short_description/category)
        if (fs.hint) {
          const hintWords = String(fs.hint).toLowerCase()
            .split(/\s+/)
            .filter((w: string) => w.length > 2);
          if (hintWords.length > 0) {
            providers = providers.filter((p: any) => {
              const haystack = [
                p.company_name, p.description,
                p.category?.name, p.category?.slug,
                ...(p.services || []).flatMap((s: any) => [s.name, s.description, s.short_description, s.category]),
              ].filter(Boolean).join(' ').toLowerCase();
              return hintWords.some((w: string) => haystack.includes(w));
            });
          }
        }
        results.services = providers.slice(0, 40);
      })
    );
  }

  // ── GENERAL (RidoMarket) ─────────────────────────────────
  if (intent.categories?.includes('general')) {
    const fg = f.general || {};
    let q = supabase
      .from('general_listings')
      .select(`
        id, title, description, price, price_negotiable, condition, location, ai_score, created_at,
        category:general_listing_categories!category_id(id, name, slug),
        photos:general_listing_photos(url, display_order, is_ai_enhanced)
      `)
      .eq('status', 'active');

    if (fg.price_max) q = q.lte('price', fg.price_max * 1.2);
    if (fg.price_min) q = q.gte('price', fg.price_min * 0.8);
    if (intent.city) q = q.ilike('location', `%${intent.city}%`);

    if (fg.hint) {
      const words = String(fg.hint).split(' ').filter(Boolean).slice(0, 3);
      if (words.length > 0) {
        const orConds = words.map((w: string) => `title.ilike.%${w}%,description.ilike.%${w}%`).join(',');
        q = q.or(orConds);
      }
    }

    promises.push(
      q.order('created_at', { ascending: false }).limit(30).then(({ data }: any) => {
        results.general = data || [];
      })
    );
  }

  await Promise.all(promises);
  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KROK 3: AI rankuje i wybiera najlepsze
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function rankResults(query: string, intent: any, candidates: any, providers: Provider[]): Promise<any> {
  // Complex (wesele/event/remont) — zostaje one-shot, rozszerzone o general
  if (intent.is_complex) {
    const summary = {
      services: (candidates.services || []).slice(0, 20).map((s: any) => ({
        id: s.id, name: s.company_name, city: s.company_city, category: s.category?.name,
        rating: s.rating_avg, desc_preview: (s.description || '').substring(0, 100)
      })),
      general: (candidates.general || []).slice(0, 15).map((g: any) => ({
        id: g.id, title: g.title, price: g.price, category: g.category?.name,
        desc_preview: (g.description || '').substring(0, 100)
      }))
    };
    const systemPrompt = `Jesteś planistą wydarzeń/remontu na portalu RIDO.
Dostępni wykonawcy (services): ${JSON.stringify(summary.services)}
Dostępne ogłoszenia ogólne (general): ${JSON.stringify(summary.general)}
Stwórz plan i dobierz pasujące elementy. Zwróć JSON: { "plan": "opis planu", "selected_services": [id...], "selected_general": [id...], "missing": ["kategorie brakujące"], "explanation": "wyjaśnienie" }`;
    try {
      const { content } = await callLLMWithFallback(providers, systemPrompt, query);
      const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
      return { type: 'complex', ...parsed };
    } catch {
      return { type: 'complex', explanation: 'Nie udało się zaplanować', selected_services: [], selected_general: [] };
    }
  }

  // Standardowe — per-category parallel ranking
  const rankOne = async (categoryKey: string, items: any[], summarize: (i: any) => any, maxK: number): Promise<string[]> => {
    if (items.length === 0) return [];
    const summary = items.slice(0, 20).map(summarize);
    const systemPrompt = `Oceń kandydatów (${categoryKey}) i wybierz max ${maxK} ID-ków pasujących do zapytania.
Kandydaci: ${JSON.stringify(summary)}
Zwróć TYLKO JSON: { "ids": [...] }. Jeśli nic nie pasuje — pusta tablica.`;
    const userPrompt = `Zapytanie: "${query}"\nIntencja: ${intent.intent}`;
    try {
      const { content } = await callLLMWithFallback(providers, systemPrompt, userPrompt);
      const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
      return Array.isArray(parsed.ids) ? parsed.ids : [];
    } catch { return []; }
  };

  const [reIds, svcIds, vehIds, genIds] = await Promise.all([
    rankOne('real_estate', candidates.real_estate || [], (l: any) => ({
      id: l.id, title: l.title, price: l.price, city: l.city, district: l.district,
      type: l.property_type, area: l.area, rooms: l.rooms,
      desc: (l.description || '').substring(0, 150)
    }), 10),
    rankOne('services', candidates.services || [], (s: any) => ({
      id: s.id, name: s.company_name, city: s.company_city, category: s.category?.name,
      rating: s.rating_avg, desc: (s.description || '').substring(0, 100),
      services_offered: (s.services || []).slice(0, 5).map((sv: any) => sv.name).filter(Boolean)
    }), 10),
    rankOne('vehicles', candidates.vehicles || [], (v: any) => ({
      id: v.id, title: v.title, price: v.price, source: v._source,
      brand: v.brand || v.vehicles?.brand, model: v.model || v.vehicles?.model,
      year: v.year, fuel_type: v.fuel_type
    }), 10),
    rankOne('general', candidates.general || [], (g: any) => ({
      id: g.id, title: g.title, price: g.price, category: g.category?.name,
      condition: g.condition, desc: (g.description || '').substring(0, 100)
    }), 10),
  ]);

  return {
    real_estate_ids: reIds,
    service_ids: svcIds,
    vehicle_ids: vehIds,
    general_ids: genIds,
    explanation: intent.intent || ''
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Usage tracking (bez zmian)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateUsageTracking(supabase: any, userId: string | null, ipAddress: string, deviceFingerprint: string, query: string, settings: any) {
  if (userId) {
    const { data: existingCredits } = await supabase
      .from('ai_user_credits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingCredits) {
      const wasFree = existingCredits.monthly_free_used < (settings?.user_monthly_limit || 50);

      if (wasFree) {
        await supabase
          .from('ai_user_credits')
          .update({ monthly_free_used: existingCredits.monthly_free_used + 1 })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('ai_user_credits')
          .update({ credits_balance: Math.max(0, existingCredits.credits_balance - 1) })
          .eq('user_id', userId);
      }

      await supabase.from('ai_credit_history').insert({
        user_id: userId,
        query_type: 'search',
        credits_used: wasFree ? 0 : 1,
        query_summary: query.substring(0, 100),
        was_free: wasFree
      });
    } else {
      await supabase.from('ai_user_credits').insert({
        user_id: userId,
        credits_balance: 0,
        monthly_free_used: 1
      });
    }
  } else {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('ai_guest_usage').upsert({
      ip_address: ipAddress || 'unknown',
      device_fingerprint: deviceFingerprint || null,
      usage_date: today,
      query_count: 1
    }, {
      onConflict: 'ip_address,device_fingerprint,usage_date'
    });

    try {
      await supabase.rpc('increment_guest_usage', {
        p_ip: ipAddress || 'unknown',
        p_fingerprint: deviceFingerprint || null,
        p_date: today
      });
    } catch {
      // RPC might not exist
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, userId, ipAddress, deviceFingerprint, searchType = 'vehicle' } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Brak zapytania' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check AI settings
    const { data: settings } = await supabase
      .from('ai_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!settings?.ai_enabled) {
      return new Response(
        JSON.stringify({ error: 'Wyszukiwarka AI jest tymczasowo wyłączona' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check usage limits
    if (userId) {
      const { data: credits } = await supabase
        .from('ai_user_credits')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const today = new Date();
      const resetDate = credits?.monthly_reset_date ? new Date(credits.monthly_reset_date) : null;
      const needsReset = !resetDate ||
        (today.getMonth() !== resetDate.getMonth() || today.getFullYear() !== resetDate.getFullYear());

      if (credits && needsReset) {
        await supabase
          .from('ai_user_credits')
          .update({ monthly_free_used: 0, monthly_reset_date: today.toISOString().split('T')[0] })
          .eq('user_id', userId);
      }

      const monthlyFreeUsed = (credits?.monthly_free_used || 0);
      const creditsBalance = (credits?.credits_balance || 0);
      const monthlyLimit = settings?.user_monthly_limit || 500;

      if (monthlyFreeUsed >= monthlyLimit && creditsBalance <= 0) {
        return new Response(
          JSON.stringify({
            error: 'Wykorzystałeś limit zapytań AI. Doładuj konto, aby kontynuować.',
            limitReached: true,
            creditsBalance: 0
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      const today = new Date().toISOString().split('T')[0];
      const { data: guestUsage } = await supabase
        .from('ai_guest_usage')
        .select('query_count')
        .eq('ip_address', ipAddress || 'unknown')
        .eq('usage_date', today)
        .maybeSingle();

      const guestLimit = settings?.guest_daily_limit || 10;
      if (guestUsage && guestUsage.query_count >= guestLimit) {
        return new Response(
          JSON.stringify({
            error: 'Wykorzystałeś dzienny limit zapytań AI. Zaloguj się, aby kontynuować.',
            limitReached: true,
            requiresLogin: true
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // NOWE PODEJŚCIE: 3 KROKI + provider routing z ai_routing_rules
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // KROK 0: Załaduj providery dla taska 'search' (Kimi → Claude → Lovable fallback)
    const providers = await loadProvidersForTask(supabase, 'search');
    console.log('Providers loaded:', providers.map(p => p.provider_key).join(', '));

    // KROK 1: Rozumienie intencji
    console.log('KROK 1 — Rozumienie intencji dla:', query, 'typ:', searchType);
    const { intent, provider_used: intentProvider } = await understandIntent(query, providers);
    console.log('Intent:', JSON.stringify(intent), 'provider:', intentProvider);

    // KROK 2: Pobierz kandydatów
    console.log('KROK 2 — Pobieranie kandydatów...');
    const candidates = await fetchCandidates(supabase, intent);
    console.log('Kandydaci:', candidates.real_estate?.length, 'nieruchomości,', candidates.services?.length, 'usług,', candidates.vehicles?.length, 'pojazdów,', candidates.general?.length, 'general');

    // KROK 3: AI ranking
    console.log('KROK 3 — AI ranking...');
    const ranked = await rankResults(query, intent, candidates, providers);
    console.log('Ranked:', JSON.stringify(ranked));

    // Zbuduj finalne wyniki
    let finalResults: any = {};
    let explanation = ranked.explanation || intent.intent || '';

    if (ranked.type === 'complex') {
      // Złożone zadanie — zwróć plan + pasujących wykonawców + ogłoszenia ogólne (materiały/meble)
      const selectedServices = candidates.services.filter((s: any) =>
        ranked.selected_services?.includes(s.id)
      );
      const selectedGeneral = (candidates.general || []).filter((g: any) =>
        ranked.selected_general?.includes(g.id)
      );
      finalResults = {
        plan: ranked.plan,
        missing: ranked.missing,
        services: { items: selectedServices, count: selectedServices.length },
        general:  { items: selectedGeneral,  count: selectedGeneral.length }
      };
      explanation = ranked.plan || explanation;
    } else {
      // Standardowe wyniki — filtruj po wybranych ID
      const reItems = candidates.real_estate.filter((l: any) => ranked.real_estate_ids?.includes(l.id));
      const svcItems = candidates.services.filter((s: any) => ranked.service_ids?.includes(s.id));
      const vehItems = candidates.vehicles.filter((v: any) => ranked.vehicle_ids?.includes(v.id));
      const genItems = (candidates.general || []).filter((g: any) => ranked.general_ids?.includes(g.id));

      if (searchType === 'real_estate') {
        finalResults = reItems;
      } else if (searchType === 'services') {
        finalResults = svcItems;
      } else if (searchType === 'general') {
        finalResults = genItems;
      } else if (searchType === 'universal') {
        finalResults = {
          realEstate: { items: reItems, count: reItems.length },
          services:   { items: svcItems, count: svcItems.length },
          vehicles:   { items: vehItems, count: vehItems.length },
          general:    { items: genItems, count: genItems.length }
        };
      } else {
        finalResults = vehItems.length ? vehItems : reItems;
      }
    }

    // Tracking
    await updateUsageTracking(supabase, userId, ipAddress, deviceFingerprint, query, settings);

    // Debug info — tylko dla zalogowanego usera z rolą admin
    let debug: any = null;
    if (await isAdmin(supabase, userId)) {
      debug = {
        intent_raw_llm: intent,
        provider_used: intentProvider,
        providers_configured: providers.map(p => p.provider_key),
        candidates_count: {
          real_estate: candidates.real_estate?.length || 0,
          vehicles:    candidates.vehicles?.length || 0,
          services:    candidates.services?.length || 0,
          general:     candidates.general?.length || 0,
        },
        ranked_count: {
          real_estate: ranked.real_estate_ids?.length || 0,
          vehicles:    ranked.vehicle_ids?.length || 0,
          services:    ranked.service_ids?.length || 0,
          general:     ranked.general_ids?.length || 0,
        },
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        searchType,
        explanation,
        results: finalResults,
        intent: intent.intent,
        is_complex: intent.is_complex || false,
        totalResults: Array.isArray(finalResults) ? finalResults.length :
          Object.values(finalResults).reduce((s: number, v: any) => s + (v?.count || 0), 0),
        ...(debug ? { _debug: debug } : {})
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI Search error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Nieznany błąd' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
