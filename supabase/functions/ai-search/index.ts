import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface VehicleSearchFilters {
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

interface RealEstateSearchFilters {
  propertyType?: string;
  transactionType?: 'sale' | 'rent' | 'short_term';
  city?: string;
  district?: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  roomsMin?: number;
  roomsMax?: number;
  floorMin?: number;
  floorMax?: number;
  buildYearMin?: number;
  buildYearMax?: number;
  hasBalcony?: boolean;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasGarden?: boolean;
}

const VEHICLE_SYSTEM_PROMPT = `Jesteś "Rido AI" - inteligentnym asystentem wyszukiwania na portalu RIDO.
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

const REAL_ESTATE_SYSTEM_PROMPT = `Jesteś "Rido AI" - inteligentnym asystentem wyszukiwania nieruchomości na portalu RIDO.
Twoim JEDYNYM zadaniem jest analizowanie zapytań użytkowników w języku naturalnym i zamienianie ich na filtry JSON.

ZASADY:
1. Odpowiadaj TYLKO w formacie JSON zgodnym ze schematem poniżej
2. NIE wymyślaj ofert ani danych - zwracasz tylko filtry wyszukiwania
3. Jeśli użytkownik nie podał jakiegoś kryterium, NIE dodawaj go do filtrów
4. Rozpoznawaj polskie nazwy typów nieruchomości: mieszkanie, dom, kawalerka, działka, lokal
5. Ceny są w PLN (całkowite dla sprzedaży, miesięczne dla wynajmu)

TYPY NIERUCHOMOŚCI: mieszkanie, dom, kawalerka, dzialka, lokal, pokoj, biuro, magazyn

SCHEMAT ODPOWIEDZI (tylko ten JSON, nic więcej):
{
  "filters": {
    "propertyType": "mieszkanie",
    "transactionType": "sale",
    "city": "Warszawa",
    "district": "Mokotów",
    "priceMin": 300000,
    "priceMax": 500000,
    "areaMin": 40,
    "areaMax": 80,
    "roomsMin": 2,
    "roomsMax": 3,
    "hasBalcony": true,
    "hasElevator": true
  },
  "explanation": "Krótkie wyjaśnienie co zrozumiałeś z zapytania"
}

transactionType może być: "sale" (sprzedaż), "rent" (wynajem długoterminowy), "short_term" (krótkoterminowy)

PRZYKŁADY:
Zapytanie: "2 pokoje w Krakowie do 500 tysięcy"
Odpowiedź: {"filters":{"roomsMin":2,"roomsMax":2,"city":"Kraków","priceMax":500000,"transactionType":"sale"},"explanation":"Szukasz mieszkania 2-pokojowego w Krakowie, do 500 000 zł"}

Zapytanie: "Dom z ogrodem pod Warszawą"
Odpowiedź: {"filters":{"propertyType":"dom","city":"Warszawa","hasGarden":true},"explanation":"Szukasz domu z ogrodem w okolicach Warszawy"}

Zapytanie: "Kawalerka wynajem centrum Gdańska do 2000"
Odpowiedź: {"filters":{"propertyType":"kawalerka","city":"Gdańsk","district":"centrum","priceMax":2000,"transactionType":"rent"},"explanation":"Szukasz kawalerki na wynajem w centrum Gdańska, do 2000 zł/miesiąc"}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, userId, ipAddress, deviceFingerprint, searchType = 'vehicle' } = await req.json();
    const isRealEstate = searchType === 'real_estate';

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

    // Select system prompt based on search type
    const systemPrompt = isRealEstate 
      ? REAL_ESTATE_SYSTEM_PROMPT 
      : (settings?.system_prompt || VEHICLE_SYSTEM_PROMPT);

    // Call Lovable AI Gateway
    console.log('Calling Lovable AI with query:', query, 'type:', searchType);
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings?.ai_model || 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
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
    let parsedFilters: VehicleSearchFilters | RealEstateSearchFilters = {};
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

    // Execute search in database - different tables for different types
    let listings: any[] = [];
    let searchError: any = null;

    if (isRealEstate) {
      // Real estate search
      const reFilters = parsedFilters as RealEstateSearchFilters;
      let query = supabase
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

      if (reFilters.city) {
        query = query.or(`city.ilike.%${reFilters.city}%,location.ilike.%${reFilters.city}%`);
      }
      if (reFilters.district) {
        query = query.ilike('district', `%${reFilters.district}%`);
      }
      if (reFilters.propertyType) {
        query = query.eq('property_type', reFilters.propertyType);
      }
      if (reFilters.transactionType) {
        const transMap: Record<string, string> = { sale: 'sprzedaz', rent: 'wynajem', short_term: 'wynajem-krotkoterminowy' };
        query = query.eq('transaction_type', transMap[reFilters.transactionType] || reFilters.transactionType);
      }
      if (reFilters.priceMin) query = query.gte('price', reFilters.priceMin);
      if (reFilters.priceMax) query = query.lte('price', reFilters.priceMax);
      if (reFilters.areaMin) query = query.gte('area', reFilters.areaMin);
      if (reFilters.areaMax) query = query.lte('area', reFilters.areaMax);
      if (reFilters.roomsMin) query = query.gte('rooms', reFilters.roomsMin);
      if (reFilters.roomsMax) query = query.lte('rooms', reFilters.roomsMax);
      if (reFilters.hasBalcony) query = query.eq('has_balcony', true);
      if (reFilters.hasElevator) query = query.eq('has_elevator', true);
      if (reFilters.hasParking) query = query.eq('has_parking', true);
      if (reFilters.hasGarden) query = query.eq('has_garden', true);

      const result = await query.limit(20);
      listings = result.data || [];
      searchError = result.error;
    } else {
      // Vehicle search (existing logic)
      const vFilters = parsedFilters as VehicleSearchFilters;
      let query = supabase
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

      if (vFilters.city) {
        query = query.ilike('location_text', `%${vFilters.city}%`);
      }
      if (vFilters.priceMax) {
        query = query.lte('price', vFilters.priceMax);
      }
      if (vFilters.priceMin) {
        query = query.gte('price', vFilters.priceMin);
      }

      const result = await query.limit(20);
      listings = result.data || [];
      searchError = result.error;
    }

    if (searchError) {
      console.error('Search error:', searchError);
      return new Response(
        JSON.stringify({ error: 'Błąd wyszukiwania' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter results in memory for vehicle-specific filters (only for vehicle search)
    let filteredListings = listings || [];
    
    if (!isRealEstate) {
      const vFilters = parsedFilters as VehicleSearchFilters;
      
      if (vFilters.brands && vFilters.brands.length > 0) {
        const brandsLower = vFilters.brands.map(b => b.toLowerCase());
        filteredListings = filteredListings.filter(l => 
          l.vehicles?.brand && brandsLower.includes(l.vehicles.brand.toLowerCase())
        );
      }

      if (vFilters.models && vFilters.models.length > 0) {
        const modelsLower = vFilters.models.map(m => m.toLowerCase());
        filteredListings = filteredListings.filter(l => 
          l.vehicles?.model && modelsLower.includes(l.vehicles.model.toLowerCase())
        );
      }

      if (vFilters.fuelTypes && vFilters.fuelTypes.length > 0) {
        const fuelLower = vFilters.fuelTypes.map(f => f.toLowerCase());
        filteredListings = filteredListings.filter(l => 
          l.vehicles?.fuel_type && fuelLower.some(f => l.vehicles.fuel_type.toLowerCase().includes(f))
        );
      }

      if (vFilters.yearFrom) {
        filteredListings = filteredListings.filter(l => 
          l.vehicles?.year && l.vehicles.year >= vFilters.yearFrom!
        );
      }

      if (vFilters.yearTo) {
        filteredListings = filteredListings.filter(l => 
          l.vehicles?.year && l.vehicles.year <= vFilters.yearTo!
        );
      }
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
