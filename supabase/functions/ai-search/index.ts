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
// KROK 1: Rozumienie intencji
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function understandIntent(query: string, apiKey: string, model: string) {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'system',
        content: `Jesteś asystentem portalu RIDO. Portal ma 3 sekcje:
- real_estate: nieruchomości (mieszkania, domy, lokale, warsztaty, magazyny, garaże, biura, działki)
- vehicles: pojazdy do wynajęcia (samochody, busy)
- services: usługi (sprzątanie, hydraulik, elektryk, przeprowadzki, fryzjer, fotograf, catering, DJ, dekorator, kucharz, organizator wesela, warsztat samochodowy jako usługa)

Przeanalizuj zapytanie użytkownika i zwróć JSON:
{
  "intent": "opis co użytkownik chce zrobić jednym zdaniem",
  "categories": ["real_estate", "vehicles", "services"],
  "real_estate_hint": "słowa do szukania w tytule/opisie nieruchomości lub null",
  "vehicle_hint": "typ pojazdu lub null",
  "services_hint": "typ usługi lub null",
  "price_max": liczba lub null,
  "price_min": liczba lub null,
  "city": "miasto lub null",
  "is_complex": true/false,
  "complex_plan": "jeśli is_complex=true: lista potrzebnych elementów jako string"
}

PRZYKŁADY:
"szukam warsztatu samochodowego" → categories:["real_estate","services"], real_estate_hint:"warsztat serwis mechaniczny", services_hint:"warsztat"
"zaplanuj wesele do 50 tys" → is_complex:true, categories:["services"], complex_plan:"fotograf, kucharz/catering, DJ/muzyka, dekorator, sala weselna, organizator"
"lokal fryzjerski wynajem do 3000" → categories:["real_estate"], real_estate_hint:"fryzjer salon lokal usługowy", price_max:3000
"auto na weekend" → categories:["vehicles"], vehicle_hint:"samochód wynajem krótkoterminowy"

Odpowiedz TYLKO poprawnym JSON.`
      }, {
        role: 'user',
        content: query
      }],
    })
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    return { categories: ['real_estate', 'services'], intent: query };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KROK 2: Pobierz kandydatów szeroko
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function fetchCandidates(supabase: any, intent: any) {
  const results: any = { real_estate: [], vehicles: [], services: [] };
  const promises: Promise<void>[] = [];

  if (intent.categories?.includes('real_estate')) {
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

    if (intent.price_max) q = q.lte('price', intent.price_max * 1.2);
    if (intent.city) q = q.or(`city.ilike.%${intent.city}%,location.ilike.%${intent.city}%`);

    if (intent.real_estate_hint) {
      const words = intent.real_estate_hint.split(' ').filter(Boolean).slice(0, 3);
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

  if (intent.categories?.includes('vehicles')) {
    let q = supabase
      .from('marketplace_listings')
      .select(`
        id, title, description, price, price_type, photos, location_text, is_featured, created_at,
        vehicle_id, fleet_id, driver_id,
        fleets:fleet_id (name, contact_phone_for_drivers),
        vehicles:vehicle_id (brand, model, year, fuel_type, plate)
      `)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (intent.price_max) q = q.lte('price', intent.price_max * 1.2);
    if (intent.city) q = q.ilike('location_text', `%${intent.city}%`);

    promises.push(
      q.limit(20).then(({ data }: any) => { results.vehicles = data || []; })
    );
  }

  if (intent.categories?.includes('services')) {
    let q = supabase
      .from('service_providers')
      .select(`
        id, company_name, company_city, company_address, company_phone, company_email,
        description, logo_url, cover_image_url, rating_avg, rating_count, category_id, is_active,
        category:service_categories!category_id(id, name, slug),
        services:provider_services(id, name, price, price_type)
      `)
      .eq('is_active', true);

    if (intent.city) q = q.ilike('company_city', `%${intent.city}%`);

    promises.push(
      q.limit(40).then(({ data }: any) => { results.services = data || []; })
    );
  }

  await Promise.all(promises);
  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KROK 3: AI rankuje i wybiera najlepsze
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function rankResults(query: string, intent: any, candidates: any, apiKey: string, model: string) {
  const summary = {
    real_estate: (candidates.real_estate || []).slice(0, 20).map((l: any) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      city: l.city,
      district: l.district,
      type: l.property_type,
      area: l.area,
      rooms: l.rooms,
      desc_preview: (l.description || '').substring(0, 150)
    })),
    services: (candidates.services || []).slice(0, 20).map((s: any) => ({
      id: s.id,
      name: s.company_name,
      city: s.company_city,
      category: s.category?.name,
      rating: s.rating_avg,
      desc_preview: (s.description || '').substring(0, 100),
      services: (s.services || []).slice(0, 3).map((sv: any) => ({ name: sv.name, price: sv.price }))
    })),
    vehicles: (candidates.vehicles || []).slice(0, 10).map((v: any) => ({
      id: v.id,
      title: v.title,
      price: v.price,
      brand: v.vehicles?.brand,
      model: v.vehicles?.model
    }))
  };

  // Złożone zadanie (wesele, urodziny itp.)
  if (intent.is_complex) {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'system',
          content: `Jesteś organizatorem wydarzeń na portalu RIDO. Dostępni wykonawcy to: ${JSON.stringify(summary.services)}.
Gdy użytkownik pyta o złożone wydarzenie (wesele, urodziny, firma), stwórz plan i dobierz wykonawców z listy.
Zwróć JSON: { "plan": "opis planu", "selected_services": [id1, id2, ...], "missing": ["kategorie których brak"], "explanation": "wyjaśnienie" }`
        }, { role: 'user', content: query }]
      })
    });
    const data = await response.json();
    try {
      const parsed = JSON.parse((data.choices?.[0]?.message?.content || '{}').replace(/```json\n?|\n?```/g, '').trim());
      return { type: 'complex', ...parsed };
    } catch {
      return { type: 'complex', explanation: 'Nie udało się zaplanować', selected_services: [] };
    }
  }

  // Standardowe ranking
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'system',
        content: `Jesteś asystentem portalu RIDO. Oceń wyniki wyszukiwania i wybierz najlepiej pasujące do zapytania.
Kandydaci: ${JSON.stringify(summary)}
Zwróć JSON: {
  "real_estate_ids": [id, id, ...],
  "service_ids": [id, id, ...],
  "vehicle_ids": [id, id, ...],
  "explanation": "krótkie wyjaśnienie co znalazłeś"
}
Wybieraj TYLKO te które naprawdę pasują do zapytania. Jeśli nic nie pasuje — zwróć pustą tablicę. Max 10 nieruchomości, 10 usług, 5 pojazdów.`
      }, { role: 'user', content: `Zapytanie: "${query}"\nIntencja: ${intent.intent}` }]
    })
  });

  const data = await response.json();
  try {
    return JSON.parse((data.choices?.[0]?.message?.content || '{}').replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    return { real_estate_ids: [], service_ids: [], vehicle_ids: [], explanation: '' };
  }
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
      const monthlyLimit = settings?.user_monthly_limit || 50;

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

      const guestLimit = settings?.guest_daily_limit || 3;
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
    // NOWE PODEJŚCIE: 3 KROKI
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const model = settings?.ai_model || 'google/gemini-3-flash-preview';

    // KROK 1: Rozumienie intencji
    console.log('KROK 1 — Rozumienie intencji dla:', query, 'typ:', searchType);
    const intent = await understandIntent(query, LOVABLE_API_KEY, model);
    console.log('Intent:', JSON.stringify(intent));

    // KROK 2: Pobierz kandydatów
    console.log('KROK 2 — Pobieranie kandydatów...');
    const candidates = await fetchCandidates(supabase, intent);
    console.log('Kandydaci:', candidates.real_estate?.length, 'nieruchomości,', candidates.services?.length, 'usług,', candidates.vehicles?.length, 'pojazdów');

    // KROK 3: AI ranking
    console.log('KROK 3 — AI ranking...');
    const ranked = await rankResults(query, intent, candidates, LOVABLE_API_KEY, model);
    console.log('Ranked:', JSON.stringify(ranked));

    // Zbuduj finalne wyniki
    let finalResults: any = {};
    let explanation = ranked.explanation || intent.intent || '';

    if (ranked.type === 'complex') {
      // Złożone zadanie — zwróć plan + pasujących wykonawców
      const selectedServices = candidates.services.filter((s: any) =>
        ranked.selected_services?.includes(s.id)
      );
      finalResults = {
        plan: ranked.plan,
        missing: ranked.missing,
        services: { items: selectedServices, count: selectedServices.length }
      };
      explanation = ranked.plan || explanation;
    } else {
      // Standardowe wyniki — filtruj po wybranych ID
      const reItems = candidates.real_estate.filter((l: any) => ranked.real_estate_ids?.includes(l.id));
      const svcItems = candidates.services.filter((s: any) => ranked.service_ids?.includes(s.id));
      const vehItems = candidates.vehicles.filter((v: any) => ranked.vehicle_ids?.includes(v.id));

      if (searchType === 'real_estate') {
        finalResults = reItems;
      } else if (searchType === 'services') {
        finalResults = svcItems;
      } else if (searchType === 'universal') {
        finalResults = {
          realEstate: { items: reItems, count: reItems.length },
          services: { items: svcItems, count: svcItems.length },
          vehicles: { items: vehItems, count: vehItems.length }
        };
      } else {
        finalResults = vehItems.length ? vehItems : reItems;
      }
    }

    // Tracking
    await updateUsageTracking(supabase, userId, ipAddress, deviceFingerprint, query, settings);

    return new Response(
      JSON.stringify({
        success: true,
        searchType,
        explanation,
        results: finalResults,
        intent: intent.intent,
        is_complex: intent.is_complex || false,
        totalResults: Array.isArray(finalResults) ? finalResults.length :
          Object.values(finalResults).reduce((s: number, v: any) => s + (v?.count || 0), 0)
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
