import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Hart API URLs (per doc v1.5)
const HART_PROD_URL = "https://restapi.hartphp.com.pl";
const HART_SANDBOX_URL = "https://sandbox.restapi.hartphp.com.pl";

// Auto Partner REST API URLs
const AP_PROD_URL = "https://customerapi.autopartner.dev/CustomerAPI.svc/rest";
const AP_SANDBOX_URL = "https://customerapitest.autopartner.dev/CustomerAPI.svc/rest";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

// ==================== AI: resolvePartsQuery ====================
interface ResolvedQuery {
  mode: 'code' | 'description';
  originalQuery: string;
  oeNumbers: string[];
  partDescription: string;
  searchTermsMultiLang?: { pl: string; en: string; de: string };
  // NOWE — z FAZA 2 Plan A+B
  categoryId?: string | null;            // IC categoryId (np. GenericArticle_402)
  categoryPath?: string | null;          // "Układ hamulcowy > Hamulce tarczowe > Klocki hamulcowe"
  expectedManufacturers?: string[];      // typowi producenci dla brand+category (Brembo/Textar/ATE)
  clarificationQuestion: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  // Internal debug payload — exposed in _debug ONLY for admin users
  _aiRaw?: { prompt: string; response: string; timeMs: number };
}

// Pobiera najbliższe ~30 leaf categories z ic_category_tree pasujących do query keywords.
// JS scoring po liczbie matches (label > path) — żeby najlepsze pojawiły się jako pierwsze.
async function getCandidateCategoriesForAI(supabase: any, query: string): Promise<Array<{ category_id: string; full_path: string }>> {
  const words = (query || '').toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 5);
  if (words.length === 0) return [];
  const orFilter = words.map(w => `full_path.ilike.%${w}%,label.ilike.%${w}%`).join(',');
  const { data } = await supabase
    .from('ic_category_tree')
    .select('category_id, full_path, label, has_children, level')
    .or(orFilter)
    .eq('has_children', false)
    .limit(200); // szerzej, posortujemy w JS
  // Scoring: label match (+10), path match (+3), shorter label bonus
  const scored = (data || []).map((r: any) => {
    const labelLower = String(r.label || '').toLowerCase();
    const pathLower = String(r.full_path || '').toLowerCase();
    let score = 0;
    for (const w of words) {
      if (labelLower.includes(w)) score += 10;
      if (pathLower.includes(w)) score += 3;
    }
    // Bonus: krótsze label = bardziej szczegółowa
    score -= (r.label?.length || 0) * 0.02;
    // Bonus: leaves bardziej szczegółowe niż wyższe level
    score += (r.level || 1) * 0.5;
    return { category_id: r.category_id, full_path: r.full_path, label: r.label, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, 30).map((r: any) => ({ category_id: r.category_id, full_path: r.full_path }));
}

// Wyciąga carId/vehicleId/linkageId z dowolnego shape'u response z IC API.
// IC może zwracać różne klucze zależnie od endpoint'u — sprawdzamy wszystkie typowe.
function extractCarId(data: any): string | null {
  if (!data) return null;
  const direct = [
    data.carId, data.car_id,
    data.vehicleId, data.vehicle_id,
    data.linkageId, data.linkage_id, data.linkageTargetId,
    data.tecdocVehicleId, data.tecdoc_vehicle_id, data.tecDocVehicleId,
    data.id,
    data.vehicle?.id, data.vehicle?.carId, data.vehicle?.linkageId, data.vehicle?.tecdocId,
    data.data?.id, data.data?.carId, data.data?.vehicleId, data.data?.linkageId,
    Array.isArray(data) ? data[0]?.id || data[0]?.carId || data[0]?.linkageId : null,
    Array.isArray(data?.items) ? data.items[0]?.id || data.items[0]?.carId || data.items[0]?.linkageId : null,
    Array.isArray(data?.vehicles) ? data.vehicles[0]?.id || data.vehicles[0]?.carId : null,
    Array.isArray(data?.results) ? data.results[0]?.id || data.results[0]?.carId : null,
    Array.isArray(data?.cars) ? data.cars[0]?.id || data.cars[0]?.carId : null,
  ];
  for (const v of direct) {
    if (v !== null && v !== undefined && v !== '') return String(v);
  }
  return null;
}

// Wyciąga descriptive vehicle info (brand/model/year/...) z różnych shape'ów IC response.
function extractVehicleInfo(data: any): any {
  if (!data) return null;
  const v = data.vehicle
    || (Array.isArray(data) ? data[0] : null)
    || (Array.isArray(data?.items) ? data.items[0] : null)
    || (Array.isArray(data?.vehicles) ? data.vehicles[0] : null)
    || (Array.isArray(data?.results) ? data.results[0] : null)
    || (Array.isArray(data?.cars) ? data.cars[0] : null)
    || data.data
    || data;
  if (!v || typeof v !== 'object') return null;
  return {
    brand: v.brand || v.make || v.manufacturer || v.brandName || null,
    model: v.model || v.modelName || null,
    year: v.year || v.productionYear || v.modelYear || null,
    bodyType: v.bodyType || v.body || null,
    engineType: v.engine || v.engineType || v.engineCode || null,
    fuelType: v.fuelType || v.fuel || null,
    powerKw: v.powerKw || v.enginePowerKw || null,
    capacityCm3: v.capacityCm3 || v.engineCapacityCm3 || v.engineCapacity || null,
    raw: v, // dla debug, jeśli powyższe nie wykryły — admin zobaczy całość w _debug
  };
}

// Sprawdza czy user ma rolę admin — używane do warunkowego dołączenia _debug w response
async function isAdminUser(supabase: any, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

async function resolvePartsQuery(query: string, params: any, candidateCategories?: Array<{ category_id: string; full_path: string }>): Promise<ResolvedQuery> {
  const vehicle = params?.vehicle || {};
  const vin = params?.vin || '';

  // If it already looks like a catalog code, use it directly
  if (looksLikeCatalogCode(query)) {
    return {
      mode: 'code',
      originalQuery: query,
      oeNumbers: [query],
      partDescription: query,
      clarificationQuestion: null,
      confidence: 'high',
      reasoning: 'Zapytanie wygląda jak kod katalogowy',
    };
  }

  // Build vehicle context
  const vehicleCtx = [
    vehicle.brand, vehicle.model,
    vehicle.year ? `rok ${vehicle.year}` : null,
    vehicle.engineCapacityCm3 ? `${vehicle.engineCapacityCm3}cm3` : null,
    vehicle.enginePowerKw ? `${vehicle.enginePowerKw}kW` : null,
    vehicle.fuelType,
    vin ? `VIN: ${vin}` : null,
  ].filter(Boolean).join(', ');

  const ANTHROPIC_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') || '').trim();
  if (!ANTHROPIC_API_KEY) {
    return {
      mode: 'description',
      originalQuery: query,
      oeNumbers: [],
      partDescription: query,
      clarificationQuestion: 'Brak klucza AI. Podaj numer katalogowy części ręcznie.',
      confidence: 'low',
      reasoning: 'Brak ANTHROPIC_API_KEY',
    };
  }

  // Lista dostępnych IC kategorii pre-filtered po keyword match z query (max 30 najbliższych)
  const catList = (candidateCategories || []).slice(0, 30);
  const catBlock = catList.length > 0
    ? `\n\nDOSTĘPNE KATEGORIE Inter Cars (wybierz dokładnie JEDNĄ — najbardziej szczegółową dla query):\n${catList.map(c => `  ${c.category_id}  |  ${c.full_path}`).join('\n')}`
    : '\n\nUWAGA: brak dopasowanych kategorii IC dla tego query — zwróć categoryId=null.';

  const systemPrompt = `Jesteś ekspertem od części samochodowych w Polsce z dostępem do wiedzy o katalogach TecDoc, numerach OE i typowych producentach.

Twoje zadanie:
1. Sklasyfikuj zapytanie do najbardziej pasującej KATEGORII Inter Cars z listy poniżej (najlepiej liścia drzewa, np. "GenericArticle_402 = Klocki hamulcowe kpl.")
2. Wygeneruj LISTĘ 5-10 TYPOWYCH PRODUCENTÓW dla tej kategorii + tego pojazdu (np. dla BMW + klocki hamulcowe: Brembo, Textar, ATE, Ferodo, TRW, Bosch, Pagid, ZF)
3. Wygeneruj do 8 realnych numerów OE (jeśli pewny — inaczej pusta lista)
4. Wygeneruj nazwy w 3 językach (pl/en/de) do text search w hurtowniach

ZASADY:
- Jeśli opis nieprecyzyjny (brak L/P, przód/tył) → clarificationQuestion po polsku
- Jeśli brak danych pojazdu → clarificationQuestion z prośbą o markę/model
- NIE wymyślaj OE jeśli niepewny — pusta lista lepsze niż halucynacja
- expectedManufacturers to producenci CZĘŚCI (Brembo, TRW...), NIE marka pojazdu (BMW)
- categoryId MUSI być z listy poniżej (lub null gdy brak dopasowania)${catBlock}

FORMAT ODPOWIEDZI – tylko czysty JSON, zero tekstu przed/po:
{
  "categoryId": "GenericArticle_402" | null,
  "categoryPath": "Układ hamulcowy > Hamulce tarczowe > Klocki hamulcowe > Klocki hamulcowe kpl." | null,
  "expectedManufacturers": ["Brembo", "Textar", "ATE", "Ferodo", "TRW"],
  "oeNumbers": ["34116855000", "34116858652"],
  "partDescription": "precyzyjny opis części po polsku",
  "searchTermsMultiLang": {
    "pl": "klocki hamulcowe przednie",
    "en": "front brake pads",
    "de": "Bremsbeläge vorne"
  },
  "clarificationQuestion": "pytanie lub null",
  "confidence": "high|medium|low",
  "reasoning": "krótkie wyjaśnienie"
}`;

  const userMsg = `Opis części: "${query}"
Dane pojazdu: ${vehicleCtx || 'brak danych pojazdu'}`;

  try {
    const aiStart = Date.now();
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    const aiData = await aiRes.json();
    const aiTimeMs = Date.now() - aiStart;
    const rawText = aiData?.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}';
    const parsed = JSON.parse(rawText);

    const oeNumbers = Array.isArray(parsed.oeNumbers)
      ? parsed.oeNumbers.filter((n: string) => n && n.length >= 3).slice(0, 8)
      : [];

    // Parsuj searchTermsMultiLang — fallback na partDescription/query jeśli LLM nie zwrócił
    const mlRaw = parsed.searchTermsMultiLang;
    const searchTermsMultiLang = (mlRaw && typeof mlRaw === 'object')
      ? {
          pl: String(mlRaw.pl || parsed.partDescription || query).trim(),
          en: String(mlRaw.en || '').trim(),
          de: String(mlRaw.de || '').trim(),
        }
      : undefined;

    // Parsuj nowe pola (Plan A+B)
    const categoryId = typeof parsed.categoryId === 'string' && parsed.categoryId.trim()
      ? parsed.categoryId.trim() : null;
    const categoryPath = typeof parsed.categoryPath === 'string' && parsed.categoryPath.trim()
      ? parsed.categoryPath.trim() : null;
    const expectedManufacturers = Array.isArray(parsed.expectedManufacturers)
      ? parsed.expectedManufacturers
          .filter((m: any) => typeof m === 'string' && m.length >= 2)
          .map((m: string) => m.trim())
          .slice(0, 10)
      : [];

    return {
      mode: 'description',
      originalQuery: query,
      oeNumbers,
      partDescription: parsed.partDescription || query,
      searchTermsMultiLang,
      categoryId,
      categoryPath,
      expectedManufacturers,
      clarificationQuestion: typeof parsed.clarificationQuestion === 'string' && parsed.clarificationQuestion.trim()
        ? parsed.clarificationQuestion.trim()
        : null,
      confidence: parsed.confidence || 'medium',
      reasoning: parsed.reasoning || '',
      _aiRaw: {
        prompt: `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${userMsg}`,
        response: rawText,
        timeMs: aiTimeMs,
      },
    };
  } catch (err) {
    console.error('[AI] resolvePartsQuery error:', err);
    return {
      mode: 'description',
      originalQuery: query,
      oeNumbers: [],
      partDescription: query,
      clarificationQuestion: 'Nie udało się przetworzyć zapytania. Podaj numer katalogowy części.',
      confidence: 'low',
      reasoning: String(err),
    };
  }
}

// ==================== Multilang search terms helper ====================
// Zwraca listę unikalnych terminów do wyszukiwania tekstowego — pl/en/de jeśli AI je zwróciło,
// inaczej fallback na partDescription + originalQuery (deduplikacja po lowercase).
// Plan A+B: jeśli vehicle podany → DOpisuje brand+model+year do każdego terminu
// (np. "klocki hamulcowe BMW X5 2023") — daje hurtowni kontekst pojazdu w text search.
function buildSearchTerms(resolved: ResolvedQuery, query: string, vehicle?: any): string[] {
  const candidates: string[] = [];
  const ml = resolved.searchTermsMultiLang;
  if (ml) {
    if (ml.pl) candidates.push(ml.pl);
    if (ml.en) candidates.push(ml.en);
    if (ml.de) candidates.push(ml.de);
  }
  if (candidates.length === 0) {
    candidates.push(resolved.partDescription || query);
  }
  // Optional vehicle suffix — dla każdego terminu osobno (Hart/AP/IC text search lepiej zawęży)
  const vehSuffix = vehicle
    ? [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ').trim()
    : '';
  const withVehicle = vehSuffix
    ? candidates.flatMap(t => [`${t} ${vehSuffix}`, t]) // wersja z pojazdem + bez (fallback)
    : candidates;
  // Dedupe (case-insensitive) + odfiltruj zbyt krótkie
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of withVehicle) {
    const k = t.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim());
  }
  return out.slice(0, 6); // max 6 terms (3 lang × 2 wariants = 6)
}

// ==================== Pre-resolved helper (centralized AI call) ====================
// Gdy frontend wywołał `resolve_query` raz i przekazuje wynik do każdej hurtowni jako
// params.preResolvedQuery — pomijamy ponowny call do Claude.
function getPreResolved(params: any, query: string): ResolvedQuery | null {
  const pre = params?.preResolvedQuery;
  if (!pre || !Array.isArray(pre.oeNumbers)) return null;
  const ml = pre.searchTermsMultiLang;
  return {
    mode: 'description',
    originalQuery: query,
    oeNumbers: pre.oeNumbers.filter((n: any) => typeof n === 'string' && n.length >= 3).slice(0, 8),
    partDescription: pre.partDescription || query,
    searchTermsMultiLang: (ml && typeof ml === 'object')
      ? { pl: String(ml.pl || ''), en: String(ml.en || ''), de: String(ml.de || '') }
      : undefined,
    categoryId: pre.categoryId || null,
    categoryPath: pre.categoryPath || null,
    expectedManufacturers: Array.isArray(pre.expectedManufacturers)
      ? pre.expectedManufacturers.filter((m: any) => typeof m === 'string').slice(0, 10)
      : [],
    clarificationQuestion: pre.clarificationQuestion || null,
    confidence: pre.confidence || 'medium',
    reasoning: 'Pre-resolved (centralized AI call from frontend)',
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    // Service role bypass — pozwala wywołać funkcję z service_role key (admin)
    // bez user JWT. Używane do diagnostyki/testów z terminala.
    const isServiceRoleCall = authHeader === `Bearer ${supabaseServiceKey}`;

    let user: any = null;
    if (!isServiceRoleCall) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const result = await userClient.auth.getUser();
      if (result.error || !result.data?.user) throw new Error("Unauthorized");
      user = result.data.user;
    }

    const body = await req.json();
    const { action, provider_id, supplier_code = "hart", params = {} } = body;

    // Sprawdź czy user to admin — używamy do warunkowego dołączenia _debug w response.
    // Service role calls (bez user context) traktujemy jako admin.
    const isUserAdmin = isServiceRoleCall ? true : await isAdminUser(supabase, user?.id || null);

    // ─────────────────────────────────────────────────────────────────────────
    // Sync IC catalog category tree — rekurencyjny BFS od top-45 do leaves.
    // Wywołaj raz (lub cron raz/tydz). Buduje globalną tabelę ic_category_tree.
    // Daniel uruchamia z service_role: action='sync_ic_categories', params:{maxLevel: 4}
    if (action === "sync_ic_categories") {
      if (!provider_id) return json({ error: 'Brak provider_id' }, 400);
      const { data: icInt } = await supabase
        .from('workshop_parts_integrations')
        .select('id, api_extra_json')
        .eq('provider_id', provider_id)
        .eq('supplier_code', 'inter_cars')
        .eq('is_enabled', true)
        .maybeSingle();
      if (!icInt) return json({ error: 'IC nie skonfigurowane' }, 400);

      const exIc = icInt.api_extra_json || {};
      const tokIc = await getICToken(supabase, icInt.id, exIc.clientId, exIc.clientSecret);
      const hdrIc = {
        'Authorization': `Bearer ${tokIc}`,
        'Accept': 'application/json',
        'Accept-Language': 'pl',
        'User-Agent': 'GetRido/1.0',
      };

      const maxLevel = Math.max(1, Math.min(6, Number(params?.maxLevel) || 3));
      const batchSize = Math.max(1, Math.min(20, Number(params?.batchSize) || 8));
      const startMs = Date.now();
      const counter = { count: 0, requests: 0 };

      // Krok 1: top-45 (parentId=null) — daje set "root" do detekcji "no children = same as root"
      console.log(`[sync_ic_cat] Fetching root level...`);
      const rootRes = await fetch(`${IC_BASE_URL}/ic/catalog/category`, { headers: hdrIc });
      counter.requests++;
      const rootData = await rootRes.json();
      if (!Array.isArray(rootData)) {
        return json({ error: 'Root not array', body: rootData }, 500);
      }
      const rootIds = new Set<string>();
      for (const c of rootData) if (c.categoryId) rootIds.add(c.categoryId);

      // Save root
      for (const c of rootData) {
        if (!c.categoryId || !c.label) continue;
        await supabase.from('ic_category_tree').upsert({
          category_id: c.categoryId, parent_id: null, label: c.label,
          level: 1, full_path: c.label, has_children: false,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'category_id' });
        counter.count++;
      }

      // Rekurencyjny BFS z PARALLEL BATCHES per level (żeby zmieścić się w timeout 60s)
      async function syncChildren(parentId: string, parentPath: string, parentLevel: number): Promise<boolean> {
        if (parentLevel >= maxLevel) return false;
        const r = await fetch(`${IC_BASE_URL}/ic/catalog/category?categoryId=${encodeURIComponent(parentId)}`, { headers: hdrIc });
        counter.requests++;
        if (!r.ok) return false;
        const d = await r.json();
        if (!Array.isArray(d) || d.length === 0) return false;
        // Detect "no real children" = response = same set as root
        if (d.length === rootIds.size && d.every((c: any) => rootIds.has(c.categoryId))) {
          return false;
        }
        // Step 1: Insert wszystkie children (sequential, ale tylko DB writes — szybkie)
        const toRecurse: Array<{ cid: string; fullPath: string; lvl: number }> = [];
        for (const child of d) {
          if (!child.categoryId || !child.label || child.categoryId === parentId) continue;
          const fullPath = `${parentPath} > ${child.label}`;
          const lvl = parentLevel + 1;
          await supabase.from('ic_category_tree').upsert({
            category_id: child.categoryId, parent_id: parentId, label: child.label,
            level: lvl, full_path: fullPath, has_children: false,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'category_id' });
          counter.count++;
          toRecurse.push({ cid: child.categoryId, fullPath, lvl });
        }
        // Step 2: Recurse children w PARALLEL BATCHES (po batchSize naraz)
        for (let i = 0; i < toRecurse.length; i += batchSize) {
          const batch = toRecurse.slice(i, i + batchSize);
          const results = await Promise.all(batch.map(c => syncChildren(c.cid, c.fullPath, c.lvl)));
          // Update has_children flags
          for (let j = 0; j < batch.length; j++) {
            if (results[j]) {
              await supabase.from('ic_category_tree').update({ has_children: true }).eq('category_id', batch[j].cid);
            }
          }
        }
        return toRecurse.length > 0;
      }

      // Recurse from each root w PARALLEL BATCHES
      console.log(`[sync_ic_cat] Recursing ${rootIds.size} roots (batchSize=${batchSize}, maxLevel=${maxLevel})...`);
      const rootArr = Array.from(rootIds);
      let rootsProcessed = 0;
      for (let i = 0; i < rootArr.length; i += batchSize) {
        const batch = rootArr.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (rootId) => {
          const rootRow = rootData.find((c: any) => c.categoryId === rootId);
          if (!rootRow) return false;
          return syncChildren(rootId, rootRow.label, 1);
        }));
        for (let j = 0; j < batch.length; j++) {
          if (results[j]) {
            await supabase.from('ic_category_tree').update({ has_children: true }).eq('category_id', batch[j]);
          }
          rootsProcessed++;
        }
        console.log(`[sync_ic_cat] Batch ${Math.floor(i/batchSize)+1}: ${rootsProcessed}/${rootArr.length} roots done, ${counter.count} categories total`);
      }

      const timeMs = Date.now() - startMs;
      console.log(`[sync_ic_cat] Done: ${counter.count} categories from ${counter.requests} requests in ${timeMs}ms`);
      return json({
        success: true,
        totalCategories: counter.count,
        rootsProcessed,
        maxLevelReached: maxLevel,
        apiRequests: counter.requests,
        timeMs,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEMPORARY discovery — wywołaj dowolny IC endpoint i zwróć raw response.
    // Dostępne tylko z service_role (bypass auth → isServiceRoleCall=true).
    // Usuń po zakończeniu discovery faz.
    if (action === "ic_raw_get") {
      if (!isServiceRoleCall) return json({ error: 'service_role only' }, 403);
      const path = String(params?.path || "");
      if (!path.startsWith('/')) return json({ error: 'path must start with /' }, 400);
      if (!provider_id) return json({ error: 'Brak provider_id' }, 400);
      const { data: ic } = await supabase.from('workshop_parts_integrations').select('id, api_extra_json').eq('provider_id', provider_id).eq('supplier_code', 'inter_cars').eq('is_enabled', true).maybeSingle();
      if (!ic) return json({ error: 'IC niesconfigurowane' }, 400);
      const ex = ic.api_extra_json || {};
      const tok = await getICToken(supabase, ic.id, ex.clientId, ex.clientSecret);
      const r = await fetch(`${IC_BASE_URL}${path}`, {
        headers: { 'Authorization': `Bearer ${tok}`, 'Accept': 'application/json', 'Accept-Language': 'pl', 'User-Agent': 'GetRido/1.0' }
      });
      const txt = await r.text();
      let body: any = null;
      try { body = JSON.parse(txt); } catch { body = txt; }
      return json({ status: r.status, url: `${IC_BASE_URL}${path}`, body });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIN decode via Inter Cars — probe-first with caching
    // IC docs są za partner login'em, więc próbujemy 12 kandydat URL'i.
    // Pierwszy 200 OK z extractable carId/vehicleId/linkageId = używamy + cache.
    // Cache:
    //   - vehicle_vin_cache (per VIN+provider, 15d TTL) — pełne decode result
    //   - ic_vin_endpoint_cache (per provider) — discovered URL template
    // Edge case: jeśli wszystkie 12 fail → {success:false, fallbackToOEFlow:true}
    if (action === "decode_vin") {
      const vin = String(params?.vin || "").trim();
      if (!vin || vin.length < 11) {
        return json({ error: "Brak lub niepoprawny VIN (min 11 znaków)" }, 400);
      }
      if (!provider_id) return json({ error: "Brak provider_id" }, 400);

      // 1) Cache check — per-VIN
      const { data: cachedVin } = await supabase
        .from('vehicle_vin_cache')
        .select('ic_car_id, vehicle_info, endpoint_used')
        .eq('vin', vin)
        .eq('provider_id', provider_id)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cachedVin?.ic_car_id) {
        console.log(`[VIN-probe] Cache HIT vin=${vin} carId=${cachedVin.ic_car_id} endpoint=${cachedVin.endpoint_used}`);
        return json({
          success: true,
          carId: cachedVin.ic_car_id,
          vehicleInfo: cachedVin.vehicle_info,
          cached: true,
          endpointUsed: cachedVin.endpoint_used,
        });
      }

      // 2) Get IC integration
      const { data: icIntegration } = await supabase
        .from('workshop_parts_integrations')
        .select('id, api_extra_json')
        .eq('provider_id', provider_id)
        .eq('supplier_code', 'inter_cars')
        .eq('is_enabled', true)
        .maybeSingle();

      if (!icIntegration) {
        return json({ success: false, error: 'IC nie skonfigurowane', fallbackToOEFlow: true });
      }

      const icExtra = icIntegration.api_extra_json || {};
      const icClientId = icExtra.clientId;
      const icClientSecret = icExtra.clientSecret;
      if (!icClientId || !icClientSecret) {
        return json({ success: false, error: 'IC credentials niepełne (clientId/clientSecret)', fallbackToOEFlow: true });
      }

      // 3) IC OAuth token
      let icToken: string;
      try {
        icToken = await getICToken(supabase, icIntegration.id, icClientId, icClientSecret);
      } catch (e: any) {
        console.error(`[VIN-probe] IC OAuth failed:`, e?.message);
        return json({ success: false, error: `IC OAuth failed: ${e?.message}`, fallbackToOEFlow: true });
      }

      const icHeaders = {
        "Authorization": `Bearer ${icToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Language": "pl",
        "User-Agent": "GetRido/1.0",
      };

      // 4) Check endpoint template cache (per provider)
      const { data: tplCache } = await supabase
        .from('ic_vin_endpoint_cache')
        .select('endpoint_method, endpoint_template, endpoint_body_template')
        .eq('provider_id', provider_id)
        .maybeSingle();

      // 5) Build candidate list — 20 kandydatów + cached template (jeśli jest) na początku
      const allCandidates: Array<{ method: 'GET' | 'POST'; template: string; bodyTpl?: string; absolute?: string }> = [
        // — Round 1 (typowe wzorce)
        { method: 'GET',  template: `/ic/catalog/vehicles?vin={VIN}` },
        { method: 'GET',  template: `/ic/catalog/vehicles/by-vin/{VIN}` },
        { method: 'GET',  template: `/ic/catalog/vin/{VIN}` },
        { method: 'GET',  template: `/ic/catalog/vehicles/identify?vin={VIN}` },
        { method: 'POST', template: `/ic/catalog/vehicles/decode`, bodyTpl: `{"vin":"{VIN}"}` },
        { method: 'GET',  template: `/ic/catalog/vehicleByVin/{VIN}` },
        { method: 'GET',  template: `/ic/vehicles?vin={VIN}` },
        { method: 'GET',  template: `/ic/catalog/vin-decoder/{VIN}` },
        { method: 'GET',  template: `/ic/catalog/decode-vin?vin={VIN}` },
        { method: 'GET',  template: `/ic/catalog/cars?vin={VIN}` },
        { method: 'GET',  template: `/ic/tecdoc/vin/{VIN}` },
        { method: 'POST', template: `/ic/catalog/vin/decode`, bodyTpl: `{"vin":"{VIN}"}` },
        // — Round 2 (alternatywne ścieżki — single resource, alternative spelling)
        { method: 'GET',  template: `/ic/catalog/vehicle?vin={VIN}` },                       // singular
        { method: 'GET',  template: `/ic/catalog/vehicles/{VIN}` },                          // VIN jako path ID
        { method: 'GET',  template: `/ic/catalog/vehicleByCriteria?vin={VIN}` },
        { method: 'GET',  template: `/ic/catalog/searchVehicle?vin={VIN}` },
        { method: 'GET',  template: `/ic/catalog/lookup-vehicle?vin={VIN}` },
        { method: 'GET',  template: `/ic/catalog/getVehicleByVin?vin={VIN}` },               // TecDoc-style
        { method: 'POST', template: `/ic/catalog/vehicleSearch`, bodyTpl: `{"vin":"{VIN}"}` },
        // — Round 3 (bez /ic/ prefix lub inny namespace)
        { method: 'GET',  template: `/catalog/vehicles?vin={VIN}` },
        { method: 'GET',  template: `/ic/tecalliance/vehicles?vin={VIN}` },
        { method: 'GET',  template: `/ic/catalog/tecdoc/vehicles?vin={VIN}` },
        // — Round 4 (alternative host — webapi bez api. subdomain)
        { method: 'GET',  template: ``, absolute: `https://webapi.intercars.eu/ic/catalog/vehicles?vin={VIN}` },
      ];

      // Cached template jako PIERWSZY kandydat (skraca latency dla znanego providera)
      const orderedCandidates: typeof allCandidates = [];
      if (tplCache) {
        orderedCandidates.push({
          method: tplCache.endpoint_method as 'GET' | 'POST',
          template: tplCache.endpoint_template,
          bodyTpl: tplCache.endpoint_body_template || undefined,
        });
      }
      for (const c of allCandidates) {
        const dup = tplCache && tplCache.endpoint_method === c.method && tplCache.endpoint_template === c.template;
        if (!dup) orderedCandidates.push(c);
      }

      // 6) Probe loop
      const attemptLog: any[] = [];
      let attempts = 0;
      for (const c of orderedCandidates) {
        attempts++;
        const path = c.template ? c.template.replace(/\{VIN\}/g, encodeURIComponent(vin)) : '';
        const url = c.absolute
          ? c.absolute.replace(/\{VIN\}/g, encodeURIComponent(vin))
          : `${IC_BASE_URL}${path}`;
        const isCached = tplCache && tplCache.endpoint_method === c.method && tplCache.endpoint_template === c.template;
        console.log(`[VIN-probe] Trying #${attempts}: ${c.method} ${url}${isCached ? ' (cached)' : ''}`);

        try {
          const opts: RequestInit = { method: c.method, headers: icHeaders };
          if (c.method === 'POST' && c.bodyTpl) {
            opts.body = c.bodyTpl.replace(/\{VIN\}/g, vin);
          }
          const res = await fetch(url, opts);
          const text = await res.text();
          let body: any = null;
          try { body = JSON.parse(text); } catch { body = text; }

          const bodyPreview = typeof body === 'string'
            ? body.substring(0, 200)
            : JSON.stringify(body).substring(0, 300);
          console.log(`[VIN-probe] Response #${attempts}: HTTP ${res.status} ${bodyPreview}`);

          attemptLog.push({
            attempt: attempts,
            method: c.method,
            path,
            status: res.status,
            bodyPreview,
            isCached: !!isCached,
          });

          if (!res.ok) continue;
          if (typeof body !== 'object' || body === null) continue;

          const carId = extractCarId(body);
          if (!carId) {
            console.log(`[VIN-probe] #${attempts} 200 OK ale brak carId/vehicleId — kolejny kandydat`);
            continue;
          }

          const vehicleInfo = extractVehicleInfo(body);
          const endpointUsed = `${c.method} ${path}`;
          console.log(`[VIN-probe] SUCCESS #${attempts}: ${endpointUsed} → carId=${carId}`);

          // Save endpoint template cache
          if (!isCached) {
            await supabase.from('ic_vin_endpoint_cache').upsert({
              provider_id,
              endpoint_method: c.method,
              endpoint_template: c.template,
              endpoint_body_template: c.bodyTpl || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'provider_id' });
          }

          // Save VIN→carId cache (15d TTL)
          await supabase.from('vehicle_vin_cache').upsert({
            vin,
            provider_id,
            ic_car_id: carId,
            vehicle_info: vehicleInfo,
            endpoint_used: endpointUsed,
            expires_at: new Date(Date.now() + 15 * 86400 * 1000).toISOString(),
          }, { onConflict: 'vin,provider_id' });

          return json({
            success: true,
            carId,
            vehicleInfo,
            cached: false,
            endpointUsed,
            probeAttempts: attempts,
          });
        } catch (err: any) {
          console.warn(`[VIN-probe] Exception #${attempts} ${c.method} ${url}:`, err?.message);
          attemptLog.push({
            attempt: attempts,
            method: c.method,
            path,
            status: 'EXCEPTION',
            bodyPreview: err?.message || String(err),
            isCached: !!isCached,
          });
        }
      }

      console.error(`[VIN-probe] ALL ${orderedCandidates.length} candidates FAILED for VIN ${vin}`);
      return json({
        success: false,
        error: `IC API nie wspiera VIN decode dla tego konta — żaden z ${orderedCandidates.length} kandydatów nie zadziałał`,
        fallbackToOEFlow: true,
        candidatesAttempted: orderedCandidates.length,
        attempts: attemptLog,
      });
    }

    // Cross-supplier lookup — szukamy TEJ SAMEJ części (po productCode + manufacturer)
    // w pozostałych hurtowniach (oprócz excludeSupplier). Reużywa handleHart/AP/IC
    // z preResolvedQuery=[productCode], dzięki czemu pomija Claude i idzie prosto do
    // Strategy A (OE numbers) — szybki, deterministyczny lookup.
    if (action === "find_in_other_wholesalers") {
      const { productCode, manufacturer, excludeSupplier } = params;
      if (!productCode) return json({ error: "Brak productCode" }, 400);

      const { data: allIntegrations } = await supabase
        .from('workshop_parts_integrations')
        .select('*')
        .eq('provider_id', provider_id)
        .eq('is_enabled', true);

      const integrationsToQuery = (allIntegrations || []).filter(
        (i: any) => isIntegrationConfigured(i) && i.supplier_code !== excludeSupplier
      );

      if (integrationsToQuery.length === 0) {
        return json({
          results: [],
          productCode,
          manufacturer,
          excludeSupplier,
          message: 'Brak innych skonfigurowanych hurtowni',
        });
      }

      // Mock-resolved query — productCode jako OE number, pomija Claude (chunk 1)
      const crossParams = {
        query: productCode,
        preResolvedQuery: {
          oeNumbers: [productCode],
          partDescription: manufacturer ? `${manufacturer} ${productCode}` : productCode,
          confidence: 'high',
        },
      };

      const results = await Promise.all(
        integrationsToQuery.map(async (integration: any) => {
          try {
            let response: Response;
            if (integration.supplier_code === 'auto_partner') {
              response = await handleAutoPartner(supabase, integration, 'search', crossParams, isUserAdmin);
            } else if (integration.supplier_code === 'inter_cars') {
              response = await handleInterCars(supabase, integration, 'search', crossParams, isUserAdmin);
            } else if (integration.supplier_code === 'hart') {
              const baseUrl = integration.environment === 'production' ? HART_PROD_URL : HART_SANDBOX_URL;
              response = await handleHart(supabase, baseUrl, integration, 'search', crossParams, isUserAdmin);
            } else {
              return {
                supplier: integration.supplier_code,
                supplierName: integration.supplier_name || integration.supplier_code,
                items: [],
                status: 'unsupported',
              };
            }

            const data = await response.json();
            const items: any[] = Array.isArray(data?.results) ? data.results : [];

            // Filtruj po producencie (case-insensitive substring match w obie strony)
            const matching = manufacturer
              ? items.filter((r: any) => {
                  const mfg = String(r.manufacturer || r.producer || '').toLowerCase().trim();
                  const target = String(manufacturer).toLowerCase().trim();
                  if (!mfg || !target) return false;
                  return mfg.includes(target) || target.includes(mfg);
                })
              : items;

            return {
              supplier: integration.supplier_code,
              supplierName: integration.supplier_name || integration.supplier_code,
              items: matching,
              status: 'ok',
              totalUnfiltered: items.length,
            };
          } catch (err: any) {
            console.error(`[find_in_other_wholesalers] ${integration.supplier_code} failed:`, err?.message);
            return {
              supplier: integration.supplier_code,
              supplierName: integration.supplier_name || integration.supplier_code,
              items: [],
              status: 'error',
              error: err?.message || 'Nieznany błąd',
            };
          }
        })
      );

      return json({ results, productCode, manufacturer, excludeSupplier });
    }

    // Centralized AI query resolution — jeden call zamiast 3 (per hurtownia).
    // Frontend wywołuje to RAZ, potem przekazuje wynik jako params.preResolvedQuery
    // do każdego search'a per hurtownia.
    if (action === "resolve_query") {
      const query = String(params?.query || "").trim();
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);
      const startMs = Date.now();
      // Pre-filter candidate categories z drzewa IC żeby Claude miał kontekst
      const candidateCategories = await getCandidateCategoriesForAI(supabase, query);
      const resolved = await resolvePartsQuery(query, params, candidateCategories);
      const timeMs = Date.now() - startMs;
      const baseResponse: any = {
        oeNumbers: resolved.oeNumbers,
        partDescription: resolved.partDescription,
        searchTermsMultiLang: resolved.searchTermsMultiLang,
        categoryId: resolved.categoryId,
        categoryPath: resolved.categoryPath,
        expectedManufacturers: resolved.expectedManufacturers,
        clarificationQuestion: resolved.clarificationQuestion,
        confidence: resolved.confidence,
        reasoning: resolved.reasoning,
        mode: resolved.mode,
        timeMs,
        candidateCategoriesCount: candidateCategories.length,
      };
      if (isUserAdmin && resolved._aiRaw) {
        baseResponse._debug = {
          aiPrompt: resolved._aiRaw.prompt,
          aiResponse: resolved._aiRaw.response,
          aiTimeMs: resolved._aiRaw.timeMs,
          aiModel: ANTHROPIC_MODEL,
        };
      }
      return json(baseResponse);
    }

    const { data: integration } = await supabase
      .from("workshop_parts_integrations")
      .select("*")
      .eq("provider_id", provider_id)
      .eq("supplier_code", supplier_code)
      .maybeSingle();

    if (action === "check_config") {
      const hasCredentials = isIntegrationConfigured(integration);
      return json({ configured: hasCredentials });
    }

    if (!integration) {
      return json({ error: "Integracja nie została skonfigurowana. Włącz hurtownię i zapisz dane." }, 400);
    }

    if (!integration.is_enabled) {
      return json({ error: "Integracja hurtowni jest wyłączona." }, 400);
    }

    if (supplier_code === "auto_partner") {
      return await handleAutoPartner(supabase, integration, action, params, isUserAdmin);
    }

    if (supplier_code === "inter_cars") {
      return await handleInterCars(supabase, integration, action, params, isUserAdmin);
    }

    if (supplier_code === "hart" || !supplier_code) {
      const baseUrl = integration.environment === "production" ? HART_PROD_URL : HART_SANDBOX_URL;
      return await handleHart(supabase, baseUrl, integration, action, params, isUserAdmin);
    }

    return json({ error: "Nieobsługiwany dostawca: " + supplier_code }, 400);
  } catch (err) {
    console.error("workshop-parts-api error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ==================== AUTO PARTNER (REST/JSON) ====================
async function handleAutoPartner(supabase: any, integration: any, action: string, params: any, isUserAdmin = false) {
  const extra = integration.api_extra_json || {};
  const clientCode = extra.clientCode;
  const wsPassword = extra.wsPassword;
  const clientPassword = extra.clientPassword;

  if (!clientCode || !wsPassword || !clientPassword) {
    return json({ error: "Brak danych AP. Uzupełnij ClientCode, WS Password i Client Password." }, 400);
  }

  const isSandbox = integration.environment !== "production";
  const baseUrl = isSandbox ? AP_SANDBOX_URL : AP_PROD_URL;
  const creds = { clientCode, wsPassword, clientPassword };

  switch (action) {
    case "test_connection": {
      try {
        const res = await fetch(`${baseUrl}/Logistic`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(creds),
        });
        const text = await res.text();
        console.log("AP test status:", res.status, "body:", text);

        let data: any;
        try { data = JSON.parse(text); } catch { data = null; }

        const result = data?.RestLogisticResult || data;

        if (result?.ErrorCode === "02" || result?.ErrorCode === 2) {
          await updateConnectionStatus(supabase, integration.id, "error");
          return json({ error: "Błąd autoryzacji Auto Partner. Sprawdź Client Code, WS Password i Client Password." }, 400);
        }

        if (res.ok && data?.RestLogisticResult && (!result?.ErrorCode || result.ErrorCode === "" || result.ErrorCode === null)) {
          await updateConnectionStatus(supabase, integration.id, "ok", baseUrl);
          return json({ success: true, message: `Połączono z Auto Partner (${isSandbox ? "Sandbox" : "Produkcja"})` });
        }

        await updateConnectionStatus(supabase, integration.id, "error");
        return json({ error: `Nie można połączyć z Auto Partner: HTTP ${res.status} — ${text.substring(0, 300)}` }, 400);
      } catch (e) {
        console.error("AP test error:", e);
        await updateConnectionStatus(supabase, integration.id, "error");
        return json({ error: `Nie można połączyć z Auto Partner: ${e.message}` }, 500);
      }
    }

    case "search": {
      const query = String(params?.query || "").trim();
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);

      // KROK 1: Rozwiąż przez AI (lub użyj pre-resolved z frontu)
      const pre = getPreResolved(params, query);
      const resolved = pre || await resolvePartsQuery(query, params);
      console.log(`[AP] ${pre ? 'preResolved' : 'resolvePartsQuery'}:`, JSON.stringify({
        oeNumbers: resolved.oeNumbers,
        clarification: resolved.clarificationQuestion,
        confidence: resolved.confidence,
      }));

      const usedTextFallback = resolved.oeNumbers.length === 0;
      if (usedTextFallback) {
        console.log(`[AP] AI nie zwróciło OE — używam Strategy B (text search) z surowym query`);
      }

      // KROK 2: Szukaj w Auto Partner — najpierw po OE, potem tekst
      try {
        let availability: any[] = [];
        let textSearchTermsUsed: string[] | null = null;

        // Strategy A: Search by OE numbers (pomijamy gdy brak OE)
        if (!usedTextFallback) {
          const products = resolved.oeNumbers.slice(0, 10).map(code => ({
            productCode: code,
            quantity: 1,
          }));

          const endpoint = products.length === 1 ? "ProductAvailabilityV2" : "ProductsAvailabilityV2";
          const body = products.length === 1
            ? { ...creds, product: products[0], onlySite: false }
            : { ...creds, products, onlySite: false };

          const res = await fetch(`${baseUrl}/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (res.ok) {
            const data = await res.json();
            const result = endpoint === "ProductAvailabilityV2"
              ? data?.RestProductAvailabilityV2Result || data?.RestProductAvailabilityTecDocResult || data
              : data?.RestProductsAvailabilityV2Result || data;

            const errorCode = String(result?.ErrorCode || "").trim();
            if (errorCode && errorCode !== "03/38") {
              console.warn(`[AP] Strategy A ErrorCode: ${errorCode}`);
            }

            availability = Array.isArray(result?.Availability)
              ? result.Availability
              : result?.Availability ? [result.Availability] : [];
            console.log(`[AP] Strategy A (OE) found ${availability.length} items`);
          } else {
            const errText = await res.text();
            console.warn(`[AP] Strategy A failed: HTTP ${res.status} ${errText.substring(0, 200)}`);
          }
        }

        // Strategy B: Text search via SearchByPhrase — multilang (pl/en/de) parallel
        if (availability.length === 0) {
          const terms = buildSearchTerms(resolved, query, params?.vehicle);
          textSearchTermsUsed = terms;
          console.log(`[AP] Strategy B — szukam w ${terms.length} językach:`, terms);

          const perLangPromises = terms.map(async (term) => {
            for (const searchEndpoint of ["SearchByPhrase", "ProductsSearchV2", "SearchProducts"]) {
              try {
                const searchBody = { ...creds, phrase: term, searchText: term, maxResults: 30 };
                const searchRes = await fetch(`${baseUrl}/${searchEndpoint}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(searchBody),
                });
                if (searchRes.ok) {
                  const searchData = await searchRes.json();
                  const searchResult = Object.values(searchData)?.[0] as any;
                  const products2 = searchResult?.Products || searchResult?.Availability || searchResult?.Items || [];
                  if (Array.isArray(products2) && products2.length > 0) {
                    console.log(`[AP] Strategy B (${searchEndpoint}, "${term}") found ${products2.length}`);
                    return products2;
                  }
                } else {
                  await searchRes.text();
                }
              } catch (e: any) {
                console.warn(`[AP] Strategy B (${searchEndpoint}, "${term}") failed:`, e.message);
              }
            }
            return [];
          });

          const perLangResults = await Promise.all(perLangPromises);
          const seenAp = new Set<string>();
          const merged: any[] = [];
          for (const list of perLangResults) {
            for (const item of list) {
              const key = item.ProductCode || item.Code || JSON.stringify(item).substring(0, 50);
              if (seenAp.has(key)) continue;
              seenAp.add(key);
              merged.push(item);
            }
          }
          availability = merged;
          console.log(`[AP] Strategy B merged ${availability.length} unique items from ${terms.length} languages`);
        }

        const mapped = availability.map((item: any) => {
          const states = Array.isArray(item?.States) ? item.States : [];
          const totalStock = states.reduce((sum: number, s: any) => sum + Number(s?.InStock || 0), 0);
          const warehouses = states
            .map((s: any) => s.DepartamentCode || s.DepartmentCode || s.BranchCode || s.Name)
            .filter(Boolean)
            .join(", ");

          return {
            partNumber: item.ProductCode || item.Code || "",
            productCode: item.ProductCode || item.Code || "",
            name: item.ProductName || item.Name || item.Description || resolved.partDescription || item.ProductCode || query,
            manufacturer: item.ProducerName || item.ManufacturerName || item.BrandName || item.Brand || "",
            price: Number(item.Price || item.NetPrice || item.WholesalePrice || 0),
            retailPrice: Number(item.Pr || 0),
            availability: totalStock,
            warehouse: warehouses,
            producer: item.ProducerName || item.ManufacturerName || item.BrandName || item.Brand || "",
            waitingTime: totalStock > 0 ? "Dziś" : "Zapytaj",
            imageUrl: item.ImageUrl || item.PhotoUrl || null,
            currency: item.CurrencyCode || "PLN",
            isBlocked: item.IsBlocked || false,
          };
        });

        const deduped = dedupeResults(mapped, (item) => `${item.partNumber || item.productCode}-${item.manufacturer || item.producer}`);

        const clarificationQuestion = deduped.length === 0
          ? (resolved.clarificationQuestion || (usedTextFallback
              ? `Auto Partner nie znalazł niczego pasującego do opisu. Podaj numer OE lub uściślij opis.`
              : `Auto Partner nie znalazł części. Spróbuj bardziej precyzyjnego opisu.`))
          : null;

        const apResp: any = {
          results: deduped,
          clarificationQuestion,
          searchedTerms: resolved.oeNumbers,
          aiResolved: true,
          partDescription: resolved.partDescription,
          confidence: resolved.confidence,
          usedTextFallback,
        };
        if (isUserAdmin) {
          apResp._debug = {
            supplier: 'auto_partner',
            preResolved: !!pre,
            aiOeNumbers: resolved.oeNumbers,
            aiPartDescription: resolved.partDescription,
            aiSearchTermsMultiLang: resolved.searchTermsMultiLang,
            aiConfidence: resolved.confidence,
            aiReasoning: resolved.reasoning,
            usedTextFallback,
            textSearchTermsUsed,
            finalItemCount: deduped.length,
            baseUrl,
          };
        }
        return json(apResp);
      } catch (e) {
        return json({ error: `Błąd wyszukiwania AP: ${e.message}` }, 500);
      }
    }

    case "availability": {
      const codes = params?.codes;
      if (!codes?.length) return json({ error: "Brak kodów produktów" }, 400);

      try {
        const products = codes.slice(0, 50).map((c: string) => ({ productCode: c, quantity: 1 }));
        const res = await fetch(`${baseUrl}/ProductsAvailabilityV2`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...creds, products, onlySite: false }),
        });
        if (!res.ok) return json({ error: `Dostępność AP: HTTP ${res.status}` }, res.status);
        const data = await res.json();
        return json({ availability: data?.RestProductsAvailabilityV2Result?.Availability || [] });
      } catch (e) {
        return json({ error: `Błąd dostępności AP: ${e.message}` }, 500);
      }
    }

    default:
      return json({ error: `Nieznana akcja: ${action}` }, 400);
  }
}

// ==================== HART (REST/JWT) — per doc v1.5 ====================
async function handleHart(supabase: any, baseUrl: string, integration: any, action: string, params: any, isUserAdmin = false) {
  if (!integration?.api_username || !integration?.api_password) {
    return json({ error: "Uzupełnij login i hasło API HART." }, 400);
  }

  // Step 1: Authenticate — POST /v1/auth
  const authBody = JSON.stringify({ username: integration.api_username, password: integration.api_password });
  console.log(`[HART] Authenticating at ${baseUrl}/v1/auth`);

  const authRes = await fetch(`${baseUrl}/v1/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: authBody,
  });

  if (!authRes.ok) {
    const authErrText = await authRes.text();
    console.error(`[HART] Auth failed: HTTP ${authRes.status}`, authErrText);
    await updateConnectionStatus(supabase, integration.id, "error", baseUrl);
    if (authRes.status === 401) return json({ error: "Błąd autoryzacji Hart. Sprawdź login i hasło API." }, 401);
    return json({ error: `Hart auth failed: HTTP ${authRes.status}` }, authRes.status);
  }

  const authData = await authRes.json();
  const token = authData.access_token;
  if (!token) {
    console.error("[HART] No access_token in auth response:", JSON.stringify(authData));
    await updateConnectionStatus(supabase, integration.id, "error", baseUrl);
    return json({ error: "Nie otrzymano tokenu z Hart API" }, 500);
  }

  console.log(`[HART] Auth OK, token expires in ${authData.expires_in}s`);

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (integration.default_branch_id) {
    headers["BranchId"] = String(integration.default_branch_id);
  }

  switch (action) {
    case "test_connection": {
      await updateConnectionStatus(supabase, integration.id, "ok", baseUrl);
      return json({
        success: true,
        message: `Połączono z Hart API (${baseUrl.includes("sandbox") ? "Sandbox" : "Produkcja"})`,
        expiresIn: authData.expires_in,
      });
    }

    case "search": {
      const query = String(params?.query || "").trim();
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);

      // KROK 1: Rozwiąż zapytanie przez AI (lub użyj pre-resolved z frontu)
      const pre = getPreResolved(params, query);
      const resolved = pre || await resolvePartsQuery(query, params);
      console.log(`[HART] ${pre ? 'preResolved' : 'resolvePartsQuery'} result:`, JSON.stringify({
        mode: resolved.mode,
        oeNumbers: resolved.oeNumbers,
        clarification: resolved.clarificationQuestion,
        confidence: resolved.confidence,
        reasoning: resolved.reasoning,
      }));

      // KROK 2: Track czy AI nie ma OE → włączamy text-only fallback (Strategy C)
      const usedTextFallback = resolved.oeNumbers.length === 0;
      if (usedTextFallback) {
        console.log(`[HART] AI nie zwróciło OE — używam Strategy C (text search) z surowym query`);
      }

      // KROK 3: Szukaj w Hart — spróbuj OE cross-reference, potem opis
      let data: any = {};
      let items: any[] = [];
      let textSearchTermsUsed: string[] | null = null; // wypełniane gdy Strategy C uruchomione

      // Strategy A: Search by OE numbers using OriginalNumbers parameter (pomijamy gdy brak OE)
      if (!usedTextFallback) {
        const oeParams = new URLSearchParams();
        resolved.oeNumbers.slice(0, 10).forEach(code => oeParams.append('OriginalNumbers', code));
        oeParams.set('Availability', 'true');
        oeParams.set('Size', '50');

        const oeUrl = `${baseUrl}/v1/products?${oeParams.toString()}`;
        console.log(`[HART] Strategy A (OE cross-ref): ${oeUrl}`);

        const oeRes = await fetch(oeUrl, { headers });
        if (oeRes.ok) {
          const oeText = await oeRes.text();
          try {
            data = JSON.parse(oeText);
            items = (data.items || [])
              .filter((i: any) => i.isSuccess && i.value && !i.value.withdrawn);
            console.log(`[HART] Strategy A found ${items.length} items`);
          } catch { /* ignore parse errors */ }
        } else {
          const errText = await oeRes.text();
          console.warn(`[HART] Strategy A failed: HTTP ${oeRes.status} ${errText.substring(0, 200)}`);
        }
      }

      // Strategy B: HartCodes — pomijamy gdy brak OE
      if (!usedTextFallback && items.length === 0) {
        const hcParams = new URLSearchParams();
        resolved.oeNumbers.slice(0, 10).forEach(code => hcParams.append('HartCodes', code));
        hcParams.set('Availability', 'true');
        hcParams.set('Size', '50');

        const hcUrl = `${baseUrl}/v1/products?${hcParams.toString()}`;
        console.log(`[HART] Strategy B (HartCodes): ${hcUrl}`);

        const hcRes = await fetch(hcUrl, { headers });
        if (hcRes.ok) {
          const hcText = await hcRes.text();
          try {
            data = JSON.parse(hcText);
            items = (data.items || [])
              .filter((i: any) => i.isSuccess && i.value && !i.value.withdrawn);
            console.log(`[HART] Strategy B found ${items.length} items`);
          } catch { /* ignore */ }
        } else {
          await hcRes.text(); // consume body
        }
      }

      // Strategy C: Text/description search — multilang (pl/en/de) parallel
      if (items.length === 0) {
        const terms = buildSearchTerms(resolved, query, params?.vehicle);
        textSearchTermsUsed = terms;
        console.log(`[HART] Strategy C — szukam w ${terms.length} językach:`, terms);

        const perLangPromises = terms.map(async (term) => {
          const txtParams = new URLSearchParams();
          txtParams.set('SearchText', term);
          txtParams.set('Availability', 'true');
          txtParams.set('Size', '30');
          const txtUrl = `${baseUrl}/v1/products?${txtParams.toString()}`;
          try {
            const txtRes = await fetch(txtUrl, { headers });
            if (txtRes.ok) {
              const txtText = await txtRes.text();
              const dat = JSON.parse(txtText);
              const langItems = (dat.items || [])
                .filter((i: any) => i.isSuccess && i.value && !i.value.withdrawn);
              console.log(`[HART] Strategy C lang "${term}" → ${langItems.length} items`);
              return { items: langItems, data: dat };
            } else {
              const errText = await txtRes.text();
              console.warn(`[HART] Strategy C lang "${term}" failed: HTTP ${txtRes.status} ${errText.substring(0, 200)}`);
            }
          } catch (err: any) {
            console.warn(`[HART] Strategy C lang "${term}" exception:`, err?.message);
          }
          return { items: [], data: null };
        });

        const perLangResults = await Promise.all(perLangPromises);
        // Merge + dedupe by hartCode
        const seenC = new Set<string>();
        const merged: any[] = [];
        for (const r of perLangResults) {
          if (r.data && !data?.total_pages) data = r.data; // first non-empty for pagination context
          for (const i of r.items) {
            const key = i.value?.hartCode || i.value?.partNumber || JSON.stringify(i.value).substring(0, 50);
            if (seenC.has(key)) continue;
            seenC.add(key);
            merged.push(i);
          }
        }
        items = merged;
        console.log(`[HART] Strategy C merged ${items.length} unique items from ${terms.length} languages`);
      }

      // KROK 4: Parsuj wyniki
      const mappedItems = items.map((i: any) => {
          const v = i.value;
          // Image URL — Hart REST API różnie nazywa pole obrazka.
          // Sprawdzamy wszystkie spotykane warianty + fallback do TecAlliance (jak w Inter Cars).
          const hartTecdoc = v.tecdocId || v.tecDocId || v.tecdocNumber || v.tecdoc || null;
          const hartImageUrl =
            v.imageUrl ||
            v.pictureUrl ||
            v.thumbnailUrl ||
            v.photoUrl ||
            v.image ||
            v.photo ||
            (Array.isArray(v.pictures) && v.pictures.length > 0 ? v.pictures[0] : null) ||
            (Array.isArray(v.images) && v.images.length > 0 ? v.images[0] : null) ||
            (hartTecdoc ? `https://webservice.tecalliance.services/pegasus-3-0/img/A/${encodeURIComponent(String(hartTecdoc))}` : null);

          return {
            partNumber: v.hartCode || "",
            name: v.name || resolved.partDescription,
            supplier: v.supplier || "",
            supplierCode: v.supplierCode || "",
            price: Number(v.sellingPrice || 0),
            availability: Number(v.quantity ?? 0),
            waitingTime: v.waitingTime || "",
            warehouse: "HART",
            producer: v.supplier || "",
            currency: v.currency || "PLN",
            taxRate: v.taxRate || 23,
            onOrder: v.onOrder || false,
            unit: v.unit || "szt",
            isPatent: v.isPatent || false,
            isPriceForManyPieces: v.isPriceForManyPieces || false,
            numberOfPiecesInPrice: v.numberOfPiecesInPrice || 1,
            imageUrl: hartImageUrl,
            tecdocId: hartTecdoc,
          };
        });

      console.log(`[HART] Total ${mappedItems.length} products for query: "${query}" (textFallback: ${usedTextFallback})`);

      // KROK 5: Zwróć wyniki + ewentualnie clarification obok
      const clarificationQuestion = mappedItems.length === 0
        ? (resolved.clarificationQuestion || (usedTextFallback
            ? 'Hart nie znalazł niczego pasującego do opisu. Podaj numer OE lub uściślij opis (marka, model, strona).'
            : `Nie znaleziono w Hart. Sprawdź numer OE lub spróbuj innego opisu.`))
        : null;

      const baseResp: any = {
        results: mappedItems,
        clarificationQuestion,
        searchedTerms: resolved.oeNumbers,
        aiResolved: true,
        partDescription: resolved.partDescription,
        confidence: resolved.confidence,
        usedTextFallback,
        pagination: {
          totalPages: data.total_pages,
          currentPage: data.current_page,
          totalItems: data.total_items_count,
        },
      };
      if (isUserAdmin) {
        baseResp._debug = {
          supplier: 'hart',
          preResolved: !!pre,
          aiOeNumbers: resolved.oeNumbers,
          aiPartDescription: resolved.partDescription,
          aiSearchTermsMultiLang: resolved.searchTermsMultiLang,
          aiConfidence: resolved.confidence,
          aiReasoning: resolved.reasoning,
          usedTextFallback,
          textSearchTermsUsed,
          finalItemCount: mappedItems.length,
          baseUrl,
        };
      }
      return json(baseResp);
    }

    case "availability": {
      const codes = params?.codes;
      if (!codes?.length) return json({ error: "Brak kodów" }, 400);

      const queryParams = new URLSearchParams();
      codes.slice(0, 50).forEach((c: string) => queryParams.append("HartCodes", c));

      const url = `${baseUrl}/v1/products/availability?${queryParams.toString()}`;
      console.log(`[HART] GET availability: ${url}`);

      const avRes = await fetch(url, { headers });
      const avText = await avRes.text();

      if (!avRes.ok) {
        console.error(`[HART] Availability error: HTTP ${avRes.status}`, avText.substring(0, 500));
        return json({ error: `Dostępność Hart: HTTP ${avRes.status}` }, avRes.status);
      }

      let avData: any;
      try { avData = JSON.parse(avText); } catch {
        return json({ error: "Nieprawidłowa odpowiedź z Hart API (availability)" }, 500);
      }

      const availability = (avData.items || [])
        .filter((i: any) => i.isSuccess && i.value)
        .map((i: any) => ({
          hartCode: i.value.hartCode,
          branches: (i.value.availabilityPerBranch || []).map((b: any) => ({
            branchId: b.branchId,
            branchCode: b.branchCode,
            quantity: b.quantity,
            waitingTime: b.waitingTime,
            priority: b.priority,
            description: b.description,
          })),
        }));

      return json({ availability });
    }

    case "add_to_basket": {
      const positions = params?.positions;
      if (!positions?.length) return json({ error: "Brak pozycji" }, 400);

      const orderPositions = positions.map((p: any) => ({
        hartCode: String(p.hartCode || p.partNumber || p.productCode || ""),
        quantity: Number(p.quantity || 1),
      }));

      console.log(`[HART] POST /v1/basket with ${orderPositions.length} positions:`, JSON.stringify(orderPositions));

      const basketRes = await fetch(`${baseUrl}/v1/basket`, {
        method: "POST",
        headers,
        body: JSON.stringify({ orderPositions }),
      });

      const basketText = await basketRes.text();
      console.log(`[HART] Basket response: HTTP ${basketRes.status}`, basketText.substring(0, 500));

      if (!basketRes.ok) return json({ error: `Koszyk Hart: HTTP ${basketRes.status} — ${basketText.substring(0, 200)}` }, basketRes.status);

      let bData: any;
      try { bData = JSON.parse(basketText); } catch {
        return json({ error: "Nieprawidłowa odpowiedź z Hart (basket)" }, 500);
      }

      if (bData.isSuccess === false) {
        return json({ error: bData.errorMessage || "Błąd dodawania do koszyka Hart" }, 400);
      }

      const successfulOrders = bData.value?.successfulOrders || [];
      const basketPositionIds = successfulOrders.map((item: any) => Number(item.orderBufferPositionId));

      console.log(`[HART] Basket OK: ${basketPositionIds.length} positions added, IDs: [${basketPositionIds.join(", ")}]`);

      return json({
        basket: {
          ...bData.value,
          basketPositionIds,
        },
      });
    }

    case "place_order": {
      const basketPositionIds = params?.basketPositionIds;
      if (!basketPositionIds?.length) return json({ error: "Brak pozycji koszyka" }, 400);

      const numericIds = basketPositionIds.map((id: any) => Number(id));

      console.log(`[HART] POST /v1/orders with basketPositionIds: [${numericIds.join(", ")}]`);

      const orderRes = await fetch(`${baseUrl}/v1/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify({ basketPositionIds: numericIds }),
      });

      const orderText = await orderRes.text();
      console.log(`[HART] Order response: HTTP ${orderRes.status}`, orderText.substring(0, 500));

      if (!orderRes.ok) return json({ error: `Zamówienie Hart: HTTP ${orderRes.status} — ${orderText.substring(0, 200)}` }, orderRes.status);

      let oData: any;
      try { oData = JSON.parse(orderText); } catch {
        return json({ error: "Nieprawidłowa odpowiedź z Hart (orders)" }, 500);
      }

      if (oData.isSuccess === false) {
        return json({ error: oData.errorMessage || "Błąd składania zamówienia Hart" }, 400);
      }

      const orders = oData.value || [];
      console.log(`[HART] Order placed: ${orders.length} items, orderIds: [${orders.map((o: any) => o.orderId).join(", ")}]`);

      return json({
        order: {
          orderId: orders[0]?.orderId || "",
          items: orders,
        },
      });
    }

    case "get_orders": {
      const page = params?.page || 1;
      const size = params?.size || 20;
      const url = `${baseUrl}/v1/orders?Page=${page}&Size=${size}&SortDirection=DESC`;
      console.log(`[HART] GET ${url}`);

      const ordersRes = await fetch(url, { headers });
      if (!ordersRes.ok) {
        const errText = await ordersRes.text();
        return json({ error: `Lista zamówień Hart: HTTP ${ordersRes.status}` }, ordersRes.status);
      }
      const ordData = await ordersRes.json();
      return json({ orders: ordData.items || [], pagination: { totalPages: ordData.total_pages, currentPage: ordData.current_page, totalItems: ordData.total_items_count } });
    }

    case "get_invoices": {
      const { dateFrom, dateTo } = params || {};
      if (!dateFrom || !dateTo) return json({ error: "Podaj dateFrom i dateTo" }, 400);

      const url = `${baseUrl}/v1/documents/invoices?DateFrom=${dateFrom}&DateTo=${dateTo}`;
      console.log(`[HART] GET ${url}`);

      const invRes = await fetch(url, { headers });
      if (!invRes.ok) {
        const errText = await invRes.text();
        console.error(`[HART] Invoices error: HTTP ${invRes.status}`, errText.substring(0, 500));
        return json({ error: `Faktury Hart: HTTP ${invRes.status}` }, invRes.status);
      }
      return json({ invoices: await invRes.json() });
    }

    case "get_corrections": {
      const { dateFrom, dateTo } = params || {};
      if (!dateFrom || !dateTo) return json({ error: "Podaj dateFrom i dateTo" }, 400);

      const url = `${baseUrl}/v1/documents/invoice-corrections?DateFrom=${dateFrom}&DateTo=${dateTo}`;
      console.log(`[HART] GET ${url}`);

      const corrRes = await fetch(url, { headers });
      if (!corrRes.ok) {
        const errText = await corrRes.text();
        return json({ error: `Korekty Hart: HTTP ${corrRes.status}` }, corrRes.status);
      }
      return json({ corrections: await corrRes.json() });
    }

    case "get_delivery_notes": {
      const { dateFrom, dateTo } = params || {};
      if (!dateFrom || !dateTo) return json({ error: "Podaj dateFrom i dateTo" }, 400);

      const url = `${baseUrl}/v1/documents/delivery-notes?DateFrom=${dateFrom}&DateTo=${dateTo}`;
      console.log(`[HART] GET ${url}`);

      const dnRes = await fetch(url, { headers });
      if (!dnRes.ok) {
        const errText = await dnRes.text();
        return json({ error: `Dokumenty WZ Hart: HTTP ${dnRes.status}` }, dnRes.status);
      }
      return json({ deliveryNotes: await dnRes.json() });
    }

    case "get_basket": {
      const url = `${baseUrl}/v1/basket`;
      console.log(`[HART] GET ${url}`);

      const bRes = await fetch(url, { headers });
      if (!bRes.ok) {
        const errText = await bRes.text();
        return json({ error: `Koszyk Hart: HTTP ${bRes.status}` }, bRes.status);
      }
      const bkData = await bRes.json();
      return json({ basket: bkData.value || bkData });
    }

    case "delete_basket_position": {
      const positionId = params?.positionId;
      if (!positionId) return json({ error: "Brak positionId" }, 400);

      const delRes = await fetch(`${baseUrl}/v1/basket/${positionId}`, { method: "DELETE", headers });
      if (!delRes.ok) {
        const errText = await delRes.text();
        return json({ error: `Usuwanie z koszyka Hart: HTTP ${delRes.status}` }, delRes.status);
      }
      return json({ success: true });
    }

    case "update_basket_position": {
      const positionId = params?.positionId;
      const quantity = params?.quantity;
      if (!positionId || !quantity) return json({ error: "Brak positionId lub quantity" }, 400);

      const patchRes = await fetch(`${baseUrl}/v1/basket/${positionId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ quantity: Number(quantity) }),
      });
      if (!patchRes.ok) {
        const errText = await patchRes.text();
        return json({ error: `Aktualizacja koszyka Hart: HTTP ${patchRes.status}` }, patchRes.status);
      }
      return json({ success: true });
    }

    case "delete_order": {
      const orderId = params?.orderId;
      if (!orderId) return json({ error: "Brak orderId" }, 400);

      const delRes = await fetch(`${baseUrl}/v1/orders/${orderId}`, { method: "DELETE", headers });
      if (!delRes.ok) {
        const errText = await delRes.text();
        return json({ error: `Usuwanie zamówienia Hart: HTTP ${delRes.status}` }, delRes.status);
      }
      return json({ success: true });
    }

    default:
      return json({ error: `Nieznana akcja Hart: ${action}` }, 400);
  }
}

// ==================== INTER CARS (OAuth2 REST) ====================
const IC_BASE_URL = "https://api.webapi.intercars.eu";
const IC_TOKEN_URL = "https://api.webapi.intercars.eu/oauth2/token";

async function getICToken(supabase: any, integrationId: string, clientId: string, clientSecret: string): Promise<string> {
  // Check cache
  const { data: cached } = await supabase
    .from("intercars_token_cache")
    .select("access_token, expires_at")
    .eq("integration_id", integrationId)
    .single();

  if (cached && new Date(cached.expires_at) > new Date(Date.now() + 60000)) {
    return cached.access_token;
  }

  // Get new token — WSO2 API Manager: credentials in Basic Auth header
  const basicAuth = btoa(clientId + ":" + clientSecret);
  console.log(`[IC] Requesting token from ${IC_TOKEN_URL} with Basic Auth (clientId length: ${clientId.length})`);
  
  const tokenRes = await fetch(IC_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + basicAuth,
      "User-Agent": "GetRido/1.0",
      "Accept": "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "default" }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error(`[IC] Token error: HTTP ${tokenRes.status}`, errText.substring(0, 300));
    throw new Error(`Inter Cars token error: HTTP ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  const expiresAt = new Date(Date.now() + (tokenData.expires_in - 120) * 1000);

  await supabase.from("intercars_token_cache").upsert({
    integration_id: integrationId,
    access_token: tokenData.access_token,
    expires_at: expiresAt.toISOString(),
  });

  return tokenData.access_token;
}

async function handleInterCars(supabase: any, integration: any, action: string, params: any, isUserAdmin = false) {
  const extra = integration.api_extra_json || {};
  const clientId = extra.clientId;
  const clientSecret = extra.clientSecret;
  const customerNumber = extra.customerNumber;

  if (!clientId || !clientSecret || !customerNumber) {
    return json({ error: "Brak danych Inter Cars. Uzupełnij Client ID, Client Secret i Nr odbiorcy." }, 400);
  }

  switch (action) {
    case "test_connection": {
      try {
        const token = await getICToken(supabase, integration.id, clientId, clientSecret);
        // Token OK = połączenie działa. Nie testuj dalszych endpointów.
        console.log(`[IC] Auth OK — token obtained, connection verified for customer: ${customerNumber}`);
        await updateConnectionStatus(supabase, integration.id, "ok");
        return json({ 
          success: true, 
          message: `Połączono z Inter Cars API (klient: ${customerNumber})` 
        });
      } catch (e) {
        console.error("[IC] Test connection error:", e);
        await updateConnectionStatus(supabase, integration.id, "error");
        return json({ error: `Nie można połączyć z Inter Cars: ${e.message}` }, 400);
      }
    }

    case "search": {
      const query = String(params?.query || "").trim();
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);

      // Step 1: AI resolve OE numbers (lub użyj pre-resolved z frontu)
      const pre = getPreResolved(params, query);
      const resolved = pre || await resolvePartsQuery(query, params);
      console.log(`[IC] ${pre ? 'preResolved' : 'resolvePartsQuery'}:`, JSON.stringify({
        oeNumbers: resolved.oeNumbers,
        clarification: resolved.clarificationQuestion,
        confidence: resolved.confidence,
      }));

      const usedTextFallback = resolved.oeNumbers.length === 0;
      if (usedTextFallback) {
        console.log(`[IC] AI nie zwróciło OE — używam Strategy C (text search) z surowym query`);
      }

      try {
        const token = await getICToken(supabase, integration.id, clientId, clientSecret);
        const icHeaders = {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Language": "pl",
          "User-Agent": "GetRido/1.0",
        };

        // Step 2: Search catalog — try multiple strategies
        const skus = resolved.oeNumbers.slice(0, 30);
        let products: any[] = [];
        let textSearchTermsUsed: string[] | null = null;

        // Strategy A: Search by index (OE numbers) — pomijamy gdy brak OE
        if (!usedTextFallback) {
          const catalogRes = await fetch(
            `${IC_BASE_URL}/ic/catalog/products?index=${skus.join(",")}`,
            { headers: icHeaders }
          );

          if (catalogRes.ok) {
            const catalogData = await catalogRes.json();
            products = Array.isArray(catalogData) ? catalogData : catalogData?.items || catalogData?.products || [];
            console.log(`[IC] Strategy A (index) found ${products.length} products`);
          } else {
            const errText = await catalogRes.text();
            console.warn(`[IC] Strategy A failed: HTTP ${catalogRes.status} ${errText.substring(0, 200)}`);
          }
        }

        // Strategy B: Try OE cross-reference search — pomijamy gdy brak OE
        if (!usedTextFallback && products.length === 0) {
          for (const oe of skus.slice(0, 5)) {
            for (const param of ["oeNumber", "oe", "originalNumber", "crossReference"]) {
              try {
                const oeUrl = `${IC_BASE_URL}/ic/catalog/products?${param}=${encodeURIComponent(oe)}`;
                const oeRes = await fetch(oeUrl, { headers: icHeaders });
                if (oeRes.ok) {
                  const oeData = await oeRes.json();
                  const oeProducts = Array.isArray(oeData) ? oeData : oeData?.items || oeData?.products || [];
                  if (oeProducts.length > 0) {
                    products.push(...oeProducts);
                    console.log(`[IC] Strategy B (${param}=${oe}) found ${oeProducts.length} products`);
                    break;
                  }
                } else {
                  await oeRes.text(); // consume
                }
              } catch { /* continue */ }
            }
            if (products.length > 0) break;
          }
        }

        // Strategy V_Cat — per-manufacturer parallel calls (Daniel's suggestion)
        // IC API REQUIRES categoryId/sku/index. Loop: dla każdego expectedManufacturer
        // ?categoryId=X&brand=MFG&pageSize=10 — Promise.all, merge results.
        if (products.length < 5 && resolved.categoryId && (resolved.expectedManufacturers || []).length > 0) {
          textSearchTermsUsed = [`category:${resolved.categoryId}`];
          const mfgs = (resolved.expectedManufacturers || []).slice(0, 10);
          const vehBrand = String(params?.vehicle?.brand || '').toLowerCase().trim();
          const vehModelTokens = String(params?.vehicle?.model || '').toLowerCase().split(/\s+/).filter(s => s.length > 1);
          console.log(`[IC] V_Cat per-mfg: categoryId=${resolved.categoryId}, mfgs=[${mfgs.join(',')}]`);

          // Promise.all dla każdego producent — ?categoryId=X&brand=MFG
          const perMfgResults = await Promise.all(mfgs.map(async (mfg) => {
            const url = `${IC_BASE_URL}/ic/catalog/products?categoryId=${encodeURIComponent(resolved.categoryId)}&brand=${encodeURIComponent(mfg)}&pageSize=10`;
            try {
              const r = await fetch(url, { headers: icHeaders });
              if (!r.ok) return { mfg, items: [], status: r.status };
              const d = await r.json();
              const items = Array.isArray(d) ? d : (d?.products || []);
              return { mfg, items, status: 200 };
            } catch (e: any) {
              return { mfg, items: [], status: 'ERR' };
            }
          }));

          const seenSku = new Set<string>();
          const collected: any[] = [];
          for (const r of perMfgResults) {
            console.log(`[IC] V_Cat mfg "${r.mfg}": ${r.items.length} items (status: ${r.status})`);
            for (const it of r.items) {
              const sku = it.sku || it.index || it.towkod;
              if (!sku || seenSku.has(sku)) continue;
              // Optional vehicle filter — keep produkty z BMW/X5 w description, ale nie wymagaj
              const desc = `${it.shortDescription || ''} ${it.description || ''}`.toLowerCase();
              const vehMatch = !vehBrand || desc.includes(vehBrand) || vehModelTokens.some(p => desc.includes(p));
              seenSku.add(sku);
              if (vehMatch) collected.unshift(it); // priorytet
              else collected.push(it);
            }
          }
          products = [...products, ...collected];
          console.log(`[IC] V_Cat final: ${collected.length} unique products from ${mfgs.length} mfgs`);
        }

        console.log(`[IC] Total products found: ${products.length}`);

        // Step 3: Check availability
        const foundSkus = products.map((p: any) => p.sku || p.index || p.towkod).filter(Boolean);
        let availability: any[] = [];
        if (foundSkus.length > 0) {
          try {
            const availRes = await fetch(`${IC_BASE_URL}/ic/inventory/stock`, {
              method: "POST",
              headers: icHeaders,
              body: JSON.stringify({ sku: foundSkus.slice(0, 100).join(",") }),
            });
            if (availRes.ok) {
              const availData = await availRes.json();
              availability = Array.isArray(availData) ? availData : availData?.items || [];
            } else {
              const errText = await availRes.text();
              console.warn(`[IC] Availability HTTP ${availRes.status}:`, errText.substring(0, 200));
            }
          } catch (avErr) {
            console.warn("[IC] Availability check failed:", avErr);
          }
        }

        // Step 4: Map results
        const mapped = products.map((product: any) => {
          const sku = product.sku || product.index || product.towkod || "";
          const avail = availability.find((a: any) => a.sku === sku || a.index === sku);
          const qty = avail?.quantity || product.quantity || 0;

          return {
            partNumber: sku,
            productCode: sku,
            name: product.name || product.description || resolved.partDescription || sku,
            manufacturer: product.brandReference?.name || product.manufacturer || product.brand || product.producerName || "",
            price: Number(avail?.unitPriceNet || product.unitPriceNet || product.priceNet || 0),
            retailPrice: Number(avail?.unitPriceGross || product.unitPriceGross || 0),
            availability: qty > 10 ? 10 : qty,
            availabilityDisplay: qty >= 10 ? "10+" : String(qty),
            warehouse: "INTER CARS",
            producer: product.brandReference?.name || product.manufacturer || "",
            waitingTime: qty > 0 ? (avail?.deliveryDays ? `${avail.deliveryDays} dni` : "Dziś") : "Zapytaj",
            imageUrl: product.imageUrl || null,
            currency: "PLN",
            ean: product.eans?.[0] || null,
            tecdocId: product.tecdocId || null,
          };
        });

        const deduped = dedupeResults(mapped, (item) => `${item.partNumber}-${item.manufacturer}`);

        const clarificationQuestion = deduped.length === 0
          ? (resolved.clarificationQuestion || (usedTextFallback
              ? `Inter Cars nie znalazł niczego pasującego do opisu. Podaj numer OE lub uściślij opis.`
              : `Inter Cars nie znalazł dla numerów: ${resolved.oeNumbers.join(', ')}`))
          : null;

        const icResp: any = {
          results: deduped,
          clarificationQuestion,
          searchedTerms: resolved.oeNumbers,
          aiResolved: true,
          partDescription: resolved.partDescription,
          confidence: resolved.confidence,
          usedTextFallback,
        };
        if (isUserAdmin) {
          icResp._debug = {
            supplier: 'inter_cars',
            preResolved: !!pre,
            aiOeNumbers: resolved.oeNumbers,
            aiPartDescription: resolved.partDescription,
            aiSearchTermsMultiLang: resolved.searchTermsMultiLang,
            aiConfidence: resolved.confidence,
            aiReasoning: resolved.reasoning,
            usedTextFallback,
            textSearchTermsUsed,
            finalItemCount: deduped.length,
            customerNumber,
          };
        }
        return json(icResp);
      } catch (e) {
        return json({ error: `Błąd wyszukiwania Inter Cars: ${e.message}` }, 500);
      }
    }

    case "add_to_basket":
    case "place_order": {
      const lines = params?.positions || params?.lines || [];
      if (!lines.length) return json({ error: "Brak pozycji zamówienia" }, 400);

      try {
        const token = await getICToken(supabase, integration.id, clientId, clientSecret);
        const icHeaders = {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        const orderRes = await fetch(`${IC_BASE_URL}/ic/sales/requisition`, {
          method: "POST",
          headers: icHeaders,
          body: JSON.stringify({
            shipTo: customerNumber,
            lines: lines.map((l: any) => ({
              sku: l.hartCode || l.partNumber || l.productCode || l.sku,
              quantity: Number(l.quantity || 1),
            })),
          }),
        });

        if (orderRes.status === 400) {
          const errData = await orderRes.json().catch(() => ({}));
          return json({ error: "Zamówienie odrzucone przez Inter Cars — sprawdź rozliczenia z Inter Cars lub poprawność numerów części." }, 400);
        }

        if (!orderRes.ok) {
          const errText = await orderRes.text();
          return json({ error: `Zamówienie Inter Cars: HTTP ${orderRes.status}` }, orderRes.status);
        }

        const orderData = await orderRes.json();
        return json({
          order: {
            orderId: orderData.requisitionId || orderData.orderId || orderData.id || "",
            items: orderData.lines || orderData.items || [orderData],
          },
        });
      } catch (e) {
        return json({ error: `Błąd zamówienia Inter Cars: ${e.message}` }, 500);
      }
    }

    case "availability": {
      const codes = params?.codes;
      if (!codes?.length) return json({ error: "Brak kodów produktów" }, 400);

      try {
        const token = await getICToken(supabase, integration.id, clientId, clientSecret);
        const availRes = await fetch(`${IC_BASE_URL}/ic/inventory/stock`, {
          method: "POST",
          body: JSON.stringify({ sku: codes.slice(0, 100).join(",") }),
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept": "application/json",
              "User-Agent": "GetRido/1.0",
            },
          }
        );
        if (!availRes.ok) return json({ error: `Dostępność IC: HTTP ${availRes.status}` }, availRes.status);
        const data = await availRes.json();
        return json({ availability: Array.isArray(data) ? data : data?.items || [] });
      } catch (e) {
        return json({ error: `Błąd dostępności IC: ${e.message}` }, 500);
      }
    }

    case "pricing": {
      const pricingLines = params?.lines || params?.codes?.map((c: string) => ({ sku: c, quantity: 1 }));
      if (!pricingLines?.length) return json({ error: "Brak pozycji do wyceny" }, 400);

      try {
        const token = await getICToken(supabase, integration.id, clientId, clientSecret);
        const priceRes = await fetch(`${IC_BASE_URL}/ic/pricing/quote`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "GetRido/1.0",
          },
          body: JSON.stringify({ lines: pricingLines.slice(0, 100) }),
        });
        if (!priceRes.ok) return json({ error: `Wycena IC: HTTP ${priceRes.status}` }, priceRes.status);
        const data = await priceRes.json();
        return json({ pricing: data });
      } catch (e) {
        return json({ error: `Błąd wyceny IC: ${e.message}` }, 500);
      }
    }

    case "order_status": {
      const requisitionId = params?.requisitionId || params?.orderId;
      if (!requisitionId) return json({ error: "Brak requisitionId" }, 400);

      try {
        const token = await getICToken(supabase, integration.id, clientId, clientSecret);
        const statusRes = await fetch(`${IC_BASE_URL}/ic/sales/requisition/${requisitionId}`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json",
            "User-Agent": "GetRido/1.0",
          },
        });
        if (!statusRes.ok) return json({ error: `Status zamówienia IC: HTTP ${statusRes.status}` }, statusRes.status);
        const data = await statusRes.json();
        return json({ order: data });
      } catch (e) {
        return json({ error: `Błąd statusu IC: ${e.message}` }, 500);
      }
    }

    default:
      return json({ error: `Nieznana akcja Inter Cars: ${action}` }, 400);
  }
}

// ==================== HELPERS ====================
async function updateConnectionStatus(supabase: any, integrationId: string, status: string, apiUrl?: string) {
  const update: any = { last_connection_status: status, last_connection_at: new Date().toISOString() };
  if (apiUrl) update.api_url = apiUrl;
  await supabase.from("workshop_parts_integrations").update(update).eq("id", integrationId);
}

function isIntegrationConfigured(integration: any) {
  if (!integration?.is_enabled) return false;

  if (integration?.supplier_code === "auto_partner") {
    const extra = integration?.api_extra_json || {};
    return !!extra.clientCode && !!extra.wsPassword && !!extra.clientPassword;
  }

  if (integration?.supplier_code === "inter_cars") {
    const extra = integration?.api_extra_json || {};
    return !!extra.clientId && !!extra.clientSecret && !!extra.customerNumber;
  }

  return !!integration?.api_username && !!integration?.api_password;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function dedupeResults<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }
  return [...map.values()];
}

function looksLikeCatalogCode(query: string) {
  const value = String(query || "").trim();
  if (value.length < 3) return false;
  if (!/\d/.test(value)) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9\s\-./]{2,}$/.test(value)) return false;

  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length > 3 && tokens.some((token) => /^[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}$/.test(token))) {
    return false;
  }

  return true;
}

function json(data: any, _status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
