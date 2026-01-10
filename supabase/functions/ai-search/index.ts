import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface SearchFilters {
  brands?: string[];
  models?: string[];
  fuelTypes?: string[];
  yearFrom?: number;
  yearTo?: number;
  priceMin?: number;
  priceMax?: number;
  city?: string;
  transactionType?: 'rent' | 'buy' | 'all';
}

const SYSTEM_PROMPT = `Jesteś "Rido AI" - inteligentnym asystentem wyszukiwania na portalu RIDO.
Twoim JEDYNYM zadaniem jest analizowanie zapytań użytkowników w języku naturalnym i zamienianie ich na filtry JSON.

ZASADY:
1. Odpowiadaj TYLKO w formacie JSON zgodnym ze schematem poniżej
2. NIE wymyślaj ofert ani danych - zwracasz tylko filtry wyszukiwania
3. Jeśli użytkownik nie podał jakiegoś kryterium, NIE dodawaj go do filtrów
4. Rozpoznawaj polskie nazwy paliw: benzyna, diesel, gaz/LPG, hybryda, elektryczny
5. Rozpoznawaj polskie nazwy marek i modeli samochodów
6. Ceny są w PLN za tydzień (wynajem) lub całkowite (zakup)

SCHEMAT ODPOWIEDZI (tylko ten JSON, nic więcej):
{
  "filters": {
    "brands": ["Toyota", "BMW"],
    "models": ["Corolla"],
    "fuelTypes": ["hybryda", "benzyna"],
    "yearFrom": 2018,
    "yearTo": 2024,
    "priceMin": 300,
    "priceMax": 500,
    "city": "Warszawa",
    "transactionType": "rent"
  },
  "explanation": "Krótkie wyjaśnienie co zrozumiałeś z zapytania"
}

transactionType może być: "rent" (wynajem), "buy" (zakup), "all" (wszystko)
fuelTypes może zawierać: "benzyna", "diesel", "lpg", "hybryda", "elektryczny"

PRZYKŁADY:
Zapytanie: "Szukam hybrydy od 2020 roku do 400 zł tygodniowo"
Odpowiedź: {"filters":{"fuelTypes":["hybryda"],"yearFrom":2020,"priceMax":400,"transactionType":"rent"},"explanation":"Szukasz hybrydy z 2020 roku lub nowszej, do 400 zł/tydzień wynajmu"}

Zapytanie: "Toyota albo Honda, Warszawa"
Odpowiedź: {"filters":{"brands":["Toyota","Honda"],"city":"Warszawa"},"explanation":"Szukasz Toyoty lub Hondy w Warszawie"}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, userId, ipAddress, deviceFingerprint } = await req.json();

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
      // Logged in user - check credits
      const { data: credits } = await supabase
        .from('ai_user_credits')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // Reset monthly free if new month
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

      // Check if user has free queries left or credits
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
      // Guest user - check IP limits
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

    // Call Lovable AI Gateway
    console.log('Calling Lovable AI with query:', query);
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings?.ai_model || 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: settings?.system_prompt || SYSTEM_PROMPT },
          { role: 'user', content: query }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Zbyt wiele zapytań. Spróbuj ponownie za chwilę.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Błąd serwera AI. Spróbuj ponownie.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('AI Response:', aiContent);

    // Parse AI response
    let parsedFilters: SearchFilters = {};
    let explanation = '';
    
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      
      const parsed = JSON.parse(jsonStr.trim());
      parsedFilters = parsed.filters || {};
      explanation = parsed.explanation || '';
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Return empty filters with explanation
      explanation = 'Nie udało się zinterpretować zapytania. Spróbuj inaczej sformułować.';
    }

    // Execute search in database
    let searchQuery = supabase
      .from('marketplace_listings')
      .select(`
        id,
        title,
        description,
        price,
        price_type,
        photos,
        location_text,
        is_featured,
        created_at,
        vehicle_id,
        fleet_id,
        driver_id,
        fleets:fleet_id (name, contact_phone_for_drivers),
        vehicles:vehicle_id (brand, model, year, fuel_type, plate)
      `)
      .eq('is_active', true)
      .is('deleted_at', null);

    // Apply filters from AI
    if (parsedFilters.city) {
      searchQuery = searchQuery.ilike('location_text', `%${parsedFilters.city}%`);
    }

    if (parsedFilters.priceMax) {
      searchQuery = searchQuery.lte('price', parsedFilters.priceMax);
    }

    if (parsedFilters.priceMin) {
      searchQuery = searchQuery.gte('price', parsedFilters.priceMin);
    }

    const { data: listings, error: searchError } = await searchQuery.limit(20);

    if (searchError) {
      console.error('Search error:', searchError);
      return new Response(
        JSON.stringify({ error: 'Błąd wyszukiwania' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter results in memory for vehicle-specific filters
    let filteredListings = listings || [];
    
    if (parsedFilters.brands && parsedFilters.brands.length > 0) {
      const brandsLower = parsedFilters.brands.map(b => b.toLowerCase());
      filteredListings = filteredListings.filter(l => 
        l.vehicles?.brand && brandsLower.includes(l.vehicles.brand.toLowerCase())
      );
    }

    if (parsedFilters.models && parsedFilters.models.length > 0) {
      const modelsLower = parsedFilters.models.map(m => m.toLowerCase());
      filteredListings = filteredListings.filter(l => 
        l.vehicles?.model && modelsLower.includes(l.vehicles.model.toLowerCase())
      );
    }

    if (parsedFilters.fuelTypes && parsedFilters.fuelTypes.length > 0) {
      const fuelLower = parsedFilters.fuelTypes.map(f => f.toLowerCase());
      filteredListings = filteredListings.filter(l => 
        l.vehicles?.fuel_type && fuelLower.some(f => l.vehicles.fuel_type.toLowerCase().includes(f))
      );
    }

    if (parsedFilters.yearFrom) {
      filteredListings = filteredListings.filter(l => 
        l.vehicles?.year && l.vehicles.year >= parsedFilters.yearFrom!
      );
    }

    if (parsedFilters.yearTo) {
      filteredListings = filteredListings.filter(l => 
        l.vehicles?.year && l.vehicles.year <= parsedFilters.yearTo!
      );
    }

    // Update usage tracking
    if (userId) {
      // Check if user has credits record
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

        // Log usage
        await supabase.from('ai_credit_history').insert({
          user_id: userId,
          query_type: 'search',
          credits_used: wasFree ? 0 : 1,
          query_summary: query.substring(0, 100),
          was_free: wasFree
        });
      } else {
        // Create new credits record
        await supabase.from('ai_user_credits').insert({
          user_id: userId,
          credits_balance: 0,
          monthly_free_used: 1
        });
      }
    } else {
      // Update guest usage
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('ai_guest_usage').upsert({
        ip_address: ipAddress || 'unknown',
        device_fingerprint: deviceFingerprint || null,
        usage_date: today,
        query_count: 1
      }, {
        onConflict: 'ip_address,device_fingerprint,usage_date'
      });

      // Increment if exists
      await supabase.rpc('increment_guest_usage', {
        p_ip: ipAddress || 'unknown',
        p_fingerprint: deviceFingerprint || null,
        p_date: today
      }).catch(() => {
        // RPC might not exist, that's ok - upsert handles it
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        filters: parsedFilters,
        explanation,
        results: filteredListings,
        totalResults: filteredListings.length
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
