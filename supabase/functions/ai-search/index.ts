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

interface ServicesSearchFilters {
  category?: string;
  city?: string;
  keywords?: string[];
  priceMax?: number;
}

interface UniversalSearchFilters {
  vehicle?: VehicleSearchFilters;
  realEstate?: RealEstateSearchFilters;
  services?: ServicesSearchFilters;
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
6. PIĘTRO - interpretuj frazy związane z piętrem:
   - "wysokie piętro", "wysoko" = floorMin: 5
   - "bardzo wysokie piętro", "wieżowiec" = floorMin: 10
   - "niskie piętro", "nisko" = floorMax: 3
   - "parter" = floorMin: 0, floorMax: 0
   - "ostatnie piętro", "poddasze" = floorMin: 8
   - konkretne piętro np. "10 piętro" = floorMin: 10, floorMax: 10

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
    "floorMin": 5,
    "floorMax": 15,
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
Odpowiedź: {"filters":{"propertyType":"kawalerka","city":"Gdańsk","district":"centrum","priceMax":2000,"transactionType":"rent"},"explanation":"Szukasz kawalerki na wynajem w centrum Gdańska, do 2000 zł/miesiąc"}

Zapytanie: "mieszkanie w Krakowie wysokie piętro"
Odpowiedź: {"filters":{"propertyType":"mieszkanie","city":"Kraków","floorMin":5},"explanation":"Szukasz mieszkania w Krakowie na wysokim piętrze (5+)"}

Zapytanie: "apartament na parterze z ogrodem Warszawa"
Odpowiedź: {"filters":{"propertyType":"mieszkanie","city":"Warszawa","floorMin":0,"floorMax":0,"hasGarden":true},"explanation":"Szukasz mieszkania na parterze z ogrodem w Warszawie"}`;

const SERVICES_SYSTEM_PROMPT = `Jesteś "Rido AI" - inteligentnym asystentem wyszukiwania usług na portalu RIDO.
Twoim JEDYNYM zadaniem jest analizowanie zapytań użytkowników w języku naturalnym i zamienianie ich na filtry JSON.

ZASADY:
1. Odpowiadaj TYLKO w formacie JSON zgodnym ze schematem poniżej
2. NIE wymyślaj ofert ani danych - zwracasz tylko filtry wyszukiwania
3. Jeśli użytkownik nie podał jakiegoś kryterium, NIE dodawaj go do filtrów

KATEGORIE USŁUG (slug): sprzatanie, warsztat, detailing, zlota-raczka, hydraulik, elektryk, ogrodnik, przeprowadzki

SCHEMAT ODPOWIEDZI (tylko ten JSON, nic więcej):
{
  "filters": {
    "category": "sprzatanie",
    "city": "Warszawa",
    "keywords": ["mieszkanie", "biuro"],
    "priceMax": 200
  },
  "explanation": "Krótkie wyjaśnienie co zrozumiałeś z zapytania"
}

PRZYKŁADY:
Zapytanie: "Szukam kogoś do sprzątania mieszkania w Warszawie"
Odpowiedź: {"filters":{"category":"sprzatanie","city":"Warszawa","keywords":["mieszkanie"]},"explanation":"Szukasz usługi sprzątania mieszkania w Warszawie"}

Zapytanie: "Hydraulik Kraków pilnie"
Odpowiedź: {"filters":{"category":"hydraulik","city":"Kraków"},"explanation":"Szukasz hydraulika w Krakowie"}

Zapytanie: "Przeprowadzka z Warszawy do Krakowa"
Odpowiedź: {"filters":{"category":"przeprowadzki","city":"Warszawa","keywords":["Kraków"]},"explanation":"Szukasz usługi przeprowadzki z Warszawy do Krakowa"}`;

const UNIVERSAL_SYSTEM_PROMPT = `Jesteś "Rido AI" - inteligentnym asystentem wyszukiwania na portalu RIDO.
Analizujesz zapytanie użytkownika i zwracasz filtry dla WSZYSTKICH pasujących kategorii.

KATEGORIE:
1. vehicle - pojazdy (auto, samochód, motocykl, rower)
2. realEstate - nieruchomości (mieszkanie, dom, kawalerka, działka, pokój, biuro)
3. services - usługi (sprzątanie, przeprowadzka, hydraulik, elektryk, złota rączka, warsztat, detailing, ogrodnik)

ZASADY:
1. Jeśli zapytanie dotyczy auta → wypełnij "vehicle"
2. Jeśli zapytanie dotyczy nieruchomości → wypełnij "realEstate"  
3. Jeśli zapytanie dotyczy usługi → wypełnij "services"
4. Jeśli zapytanie dotyczy kilku kategorii → wypełnij wszystkie pasujące
5. Jeśli użytkownik podał budżet ogólny → rozdziel proporcjonalnie

SCHEMAT ODPOWIEDZI:
{
  "vehicle": {
    "filters": { "brands": [], "fuelTypes": [], "priceMax": null, "city": "" },
    "explanation": ""
  },
  "realEstate": {
    "filters": { "propertyType": "", "transactionType": "", "priceMax": null, "city": "" },
    "explanation": ""
  },
  "services": {
    "filters": { "category": "", "city": "", "keywords": [] },
    "explanation": ""
  },
  "overallExplanation": "Ogólne wyjaśnienie całego zapytania"
}

Wypełniaj TYLKO te sekcje, które pasują do zapytania. Puste sekcje = null.

PRZYKŁADY:
Zapytanie: "Szukam auta miejskiego i małego mieszkania do wynajęcia w Warszawie"
Odpowiedź: {
  "vehicle": {"filters":{"city":"Warszawa"},"explanation":"Auto miejskie w Warszawie"},
  "realEstate": {"filters":{"transactionType":"rent","city":"Warszawa","areaMax":50},"explanation":"Małe mieszkanie na wynajem w Warszawie"},
  "services": null,
  "overallExplanation": "Szukasz auta i mieszkania na wynajem w Warszawie"
}

Zapytanie: "Przeprowadzka z Krakowa do Warszawy i mieszkanie 2-pokojowe"
Odpowiedź: {
  "vehicle": null,
  "realEstate": {"filters":{"roomsMin":2,"roomsMax":2,"city":"Warszawa"},"explanation":"Mieszkanie 2-pokojowe w Warszawie"},
  "services": {"filters":{"category":"przeprowadzki","city":"Kraków","keywords":["Warszawa"]},"explanation":"Przeprowadzka z Krakowa do Warszawy"},
  "overallExplanation": "Szukasz usługi przeprowadzki z Krakowa do Warszawy oraz mieszkania 2-pokojowego w Warszawie"
}`;

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

    // Select system prompt and tool based on search type
    let systemPrompt: string;
    let searchTool: any;
    const isUniversal = searchType === 'universal';
    const isServices = searchType === 'services';
    const isRealEstate = searchType === 'real_estate';

    if (isUniversal) {
      systemPrompt = UNIVERSAL_SYSTEM_PROMPT;
      searchTool = {
        type: "function",
        function: {
          name: "search_universal",
          description: "Wyszukaj w wielu kategoriach na raz",
          parameters: {
            type: "object",
            properties: {
              vehicle: {
                type: "object",
                properties: {
                  filters: { type: "object" },
                  explanation: { type: "string" }
                }
              },
              realEstate: {
                type: "object", 
                properties: {
                  filters: { type: "object" },
                  explanation: { type: "string" }
                }
              },
              services: {
                type: "object",
                properties: {
                  filters: { type: "object" },
                  explanation: { type: "string" }
                }
              },
              overallExplanation: { type: "string" }
            }
          }
        }
      };
    } else if (isServices) {
      systemPrompt = SERVICES_SYSTEM_PROMPT;
      searchTool = {
        type: "function",
        function: {
          name: "search_services",
          description: "Wyszukaj usługi według kryteriów",
          parameters: {
            type: "object",
            properties: {
              filters: {
                type: "object",
                properties: {
                  category: { type: "string", description: "Slug kategorii: sprzatanie, warsztat, detailing, zlota-raczka, hydraulik, elektryk, ogrodnik, przeprowadzki" },
                  city: { type: "string" },
                  keywords: { type: "array", items: { type: "string" } },
                  priceMax: { type: "number" }
                }
              },
              explanation: { type: "string" }
            },
            required: ["filters", "explanation"]
          }
        }
      };
    } else if (isRealEstate) {
      systemPrompt = REAL_ESTATE_SYSTEM_PROMPT;
      searchTool = {
        type: "function",
        function: {
          name: "search_real_estate",
          description: "Wyszukaj nieruchomości według kryteriów użytkownika",
          parameters: {
            type: "object",
            properties: {
              filters: {
                type: "object",
                properties: {
                  propertyType: { type: "string" },
                  transactionType: { type: "string", enum: ["sale", "rent", "short_term"] },
                  city: { type: "string" },
                  district: { type: "string" },
                  priceMin: { type: "number" },
                  priceMax: { type: "number" },
                  areaMin: { type: "number" },
                  areaMax: { type: "number" },
                  roomsMin: { type: "number" },
                  roomsMax: { type: "number" },
                  floorMin: { type: "number" },
                  floorMax: { type: "number" },
                  hasBalcony: { type: "boolean" },
                  hasElevator: { type: "boolean" },
                  hasParking: { type: "boolean" },
                  hasGarden: { type: "boolean" }
                }
              },
              explanation: { type: "string" }
            },
            required: ["filters", "explanation"]
          }
        }
      };
    } else {
      systemPrompt = settings?.system_prompt || VEHICLE_SYSTEM_PROMPT;
      searchTool = {
        type: "function",
        function: {
          name: "search_vehicles",
          description: "Wyszukaj pojazdy według kryteriów użytkownika",
          parameters: {
            type: "object",
            properties: {
              filters: {
                type: "object",
                properties: {
                  brands: { type: "array", items: { type: "string" } },
                  models: { type: "array", items: { type: "string" } },
                  fuelTypes: { type: "array", items: { type: "string" } },
                  yearFrom: { type: "number" },
                  yearTo: { type: "number" },
                  priceMin: { type: "number" },
                  priceMax: { type: "number" },
                  city: { type: "string" },
                  transactionType: { type: "string", enum: ["rent", "buy", "all"] }
                }
              },
              explanation: { type: "string" }
            },
            required: ["filters", "explanation"]
          }
        }
      };
    }

    // Call Lovable AI Gateway
    console.log('Calling Lovable AI with query:', query, 'type:', searchType);
    const toolName = isUniversal ? "search_universal" : isServices ? "search_services" : isRealEstate ? "search_real_estate" : "search_vehicles";
    
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
        tools: [searchTool],
        tool_choice: { type: "function", function: { name: toolName } }
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
    console.log('AI Response data:', JSON.stringify(aiData));

    // Parse AI response
    let parsedData: any = {};
    let explanation = '';
    
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        parsedData = JSON.parse(toolCall.function.arguments);
      } else {
        const aiContent = aiData.choices?.[0]?.message?.content || '';
        let jsonStr = aiContent;
        const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }
        parsedData = JSON.parse(jsonStr.trim());
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      explanation = 'Nie udało się zinterpretować zapytania. Spróbuj inaczej sformułować.';
    }

    // Execute search based on type
    let results: any = {};

    // Helper to extract city from explanation text
    const extractCityFromText = (text: string): string | null => {
      const cityPatterns = ['Warszaw', 'Krak', 'Gdań', 'Gdyni', 'Poznań', 'Wrocław', 'Łód', 'Szczecin', 'Lublin', 'Katowic', 'Bydgoszcz', 'Białystok'];
      for (const pattern of cityPatterns) {
        if (text.includes(pattern)) {
          // Return proper city name
          if (pattern === 'Warszaw') return 'Warszawa';
          if (pattern === 'Krak') return 'Kraków';
          if (pattern === 'Gdań') return 'Gdańsk';
          if (pattern === 'Gdyni') return 'Gdynia';
          if (pattern === 'Łód') return 'Łódź';
          if (pattern === 'Katowic') return 'Katowice';
          return pattern;
        }
      }
      return null;
    };

    if (isUniversal) {
      // Universal search - query all relevant tables
      let vehicleFilters = parsedData.vehicle?.filters || {};
      let realEstateFilters = parsedData.realEstate?.filters || {};
      let servicesFilters = parsedData.services?.filters || {};
      
      // Check if AI identified categories even without filters
      const hasVehicle = parsedData.vehicle !== null && parsedData.vehicle !== undefined;
      const hasRealEstate = parsedData.realEstate !== null && parsedData.realEstate !== undefined;
      const hasServices = parsedData.services !== null && parsedData.services !== undefined;

      // Try to extract city from explanations if missing in filters
      if (hasVehicle && !vehicleFilters.city && parsedData.vehicle?.explanation) {
        const city = extractCityFromText(parsedData.vehicle.explanation);
        if (city) vehicleFilters = { ...vehicleFilters, city };
      }
      if (hasRealEstate && !realEstateFilters.city && parsedData.realEstate?.explanation) {
        const city = extractCityFromText(parsedData.realEstate.explanation);
        if (city) realEstateFilters = { ...realEstateFilters, city };
      }
      if (hasServices && !servicesFilters.city && parsedData.services?.explanation) {
        const city = extractCityFromText(parsedData.services.explanation);
        if (city) servicesFilters = { ...servicesFilters, city };
      }

      // Also try to extract from original query
      const queryCity = extractCityFromText(query);
      if (queryCity) {
        if (hasVehicle && !vehicleFilters.city) vehicleFilters = { ...vehicleFilters, city: queryCity };
        if (hasRealEstate && !realEstateFilters.city) realEstateFilters = { ...realEstateFilters, city: queryCity };
        if (hasServices && !servicesFilters.city) servicesFilters = { ...servicesFilters, city: queryCity };
      }

      // Parallel queries - execute if category was identified (even with empty filters)
      const promises: Promise<any>[] = [];

      if (hasVehicle) {
        promises.push(searchVehicles(supabase, vehicleFilters).then(r => ({ type: 'vehicles', data: r, filters: vehicleFilters })));
      }
      if (hasRealEstate) {
        promises.push(searchRealEstate(supabase, realEstateFilters).then(r => ({ type: 'realEstate', data: r, filters: realEstateFilters })));
      }
      if (hasServices) {
        promises.push(searchServices(supabase, servicesFilters).then(r => ({ type: 'services', data: r, filters: servicesFilters })));
      }

      const searchResults = await Promise.all(promises);
      
      for (const result of searchResults) {
        results[result.type] = {
          items: result.data,
          count: result.data.length,
          filters: result.filters,
          explanation: parsedData[result.type === 'vehicles' ? 'vehicle' : result.type]?.explanation || ''
        };
      }

      explanation = parsedData.overallExplanation || '';
    } else if (isServices) {
      const filters = parsedData.filters as ServicesSearchFilters || {};
      const items = await searchServices(supabase, filters);
      results = items;
      explanation = parsedData.explanation || '';
    } else if (isRealEstate) {
      const filters = parsedData.filters as RealEstateSearchFilters || {};
      const items = await searchRealEstate(supabase, filters);
      results = items;
      explanation = parsedData.explanation || '';
    } else {
      const filters = parsedData.filters as VehicleSearchFilters || {};
      const items = await searchVehicles(supabase, filters);
      results = items;
      explanation = parsedData.explanation || '';
    }

    // Update usage tracking
    await updateUsageTracking(supabase, userId, ipAddress, deviceFingerprint, query, settings);

    return new Response(
      JSON.stringify({
        success: true,
        searchType,
        filters: isUniversal ? { vehicle: parsedData.vehicle?.filters, realEstate: parsedData.realEstate?.filters, services: parsedData.services?.filters } : parsedData.filters,
        explanation,
        results: isUniversal ? results : results,
        totalResults: isUniversal 
          ? Object.values(results).reduce((sum: number, r: any) => sum + (r?.count || 0), 0)
          : (Array.isArray(results) ? results.length : 0)
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

// Helper functions for searching
async function searchVehicles(supabase: any, filters: VehicleSearchFilters): Promise<any[]> {
  let query = supabase
    .from('marketplace_listings')
    .select(`
      id, title, description, price, price_type, photos, location_text, is_featured, created_at,
      vehicle_id, fleet_id, driver_id,
      fleets:fleet_id (name, contact_phone_for_drivers),
      vehicles:vehicle_id (brand, model, year, fuel_type, plate)
    `)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (filters.city) {
    query = query.ilike('location_text', `%${filters.city}%`);
  }
  if (filters.priceMax) {
    query = query.lte('price', filters.priceMax);
  }
  if (filters.priceMin) {
    query = query.gte('price', filters.priceMin);
  }

  const { data, error } = await query.limit(20);
  if (error) {
    console.error('Vehicle search error:', error);
    return [];
  }

  let result = data || [];

  // Filter in memory
  if (filters.brands?.length) {
    const brandsLower = filters.brands.map(b => b.toLowerCase());
    result = result.filter((l: any) => l.vehicles?.brand && brandsLower.includes(l.vehicles.brand.toLowerCase()));
  }
  if (filters.models?.length) {
    const modelsLower = filters.models.map(m => m.toLowerCase());
    result = result.filter((l: any) => l.vehicles?.model && modelsLower.includes(l.vehicles.model.toLowerCase()));
  }
  if (filters.fuelTypes?.length) {
    const fuelLower = filters.fuelTypes.map(f => f.toLowerCase());
    result = result.filter((l: any) => l.vehicles?.fuel_type && fuelLower.some(f => l.vehicles.fuel_type.toLowerCase().includes(f)));
  }
  if (filters.yearFrom) {
    result = result.filter((l: any) => l.vehicles?.year && l.vehicles.year >= filters.yearFrom!);
  }
  if (filters.yearTo) {
    result = result.filter((l: any) => l.vehicles?.year && l.vehicles.year <= filters.yearTo!);
  }

  return result;
}

async function searchRealEstate(supabase: any, filters: RealEstateSearchFilters): Promise<any[]> {
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

  if (filters.city) {
    query = query.or(`city.ilike.%${filters.city}%,location.ilike.%${filters.city}%`);
  }
  if (filters.district) {
    query = query.ilike('district', `%${filters.district}%`);
  }
  if (filters.propertyType) {
    query = query.eq('property_type', filters.propertyType);
  }
  if (filters.transactionType) {
    const transMap: Record<string, string> = { sale: 'sprzedaz', rent: 'wynajem', short_term: 'wynajem-krotkoterminowy' };
    query = query.eq('transaction_type', transMap[filters.transactionType] || filters.transactionType);
  }
  if (filters.priceMin) query = query.gte('price', filters.priceMin);
  if (filters.priceMax) query = query.lte('price', filters.priceMax);
  if (filters.areaMin) query = query.gte('area', filters.areaMin);
  if (filters.areaMax) query = query.lte('area', filters.areaMax);
  if (filters.roomsMin) query = query.gte('rooms', filters.roomsMin);
  if (filters.roomsMax) query = query.lte('rooms', filters.roomsMax);
  if (filters.floorMin !== undefined) query = query.gte('floor', filters.floorMin);
  if (filters.floorMax !== undefined) query = query.lte('floor', filters.floorMax);
  if (filters.hasBalcony) query = query.eq('has_balcony', true);
  if (filters.hasElevator) query = query.eq('has_elevator', true);
  if (filters.hasParking) query = query.eq('has_parking', true);
  if (filters.hasGarden) query = query.eq('has_garden', true);

  const { data, error } = await query.limit(20);
  if (error) {
    console.error('Real estate search error:', error);
    return [];
  }
  return data || [];
}

async function searchServices(supabase: any, filters: ServicesSearchFilters): Promise<any[]> {
  let query = supabase
    .from('service_providers')
    .select(`
      id, company_name, company_city, company_address, company_phone, company_email,
      description, logo_url, cover_image_url, rating_avg, rating_count, category_id, is_active,
      category:service_categories!category_id(id, name, slug),
      services:provider_services(id, name, price, price_type)
    `)
    .eq('is_active', true);

  if (filters.city) {
    query = query.ilike('company_city', `%${filters.city}%`);
  }

  const { data, error } = await query.limit(30);
  if (error) {
    console.error('Services search error:', error);
    return [];
  }

  let result = data || [];

  // Filter by category
  if (filters.category) {
    result = result.filter((p: any) => p.category?.slug === filters.category);
  }

  // Filter by keywords in description or service names
  if (filters.keywords?.length) {
    const keywordsLower = filters.keywords.map(k => k.toLowerCase());
    result = result.filter((p: any) => {
      const desc = (p.description || '').toLowerCase();
      const companyName = (p.company_name || '').toLowerCase();
      const serviceNames = (p.services || []).map((s: any) => (s.name || '').toLowerCase()).join(' ');
      return keywordsLower.some(k => desc.includes(k) || companyName.includes(k) || serviceNames.includes(k));
    });
  }

  // Filter by price
  if (filters.priceMax) {
    result = result.filter((p: any) => {
      const minPrice = Math.min(...(p.services || []).map((s: any) => s.price || Infinity));
      return minPrice <= filters.priceMax!;
    });
  }

  return result;
}

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
