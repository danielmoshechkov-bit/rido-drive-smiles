import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ustalKontekst, ustalZrodlo, pobierz, type Decyzja, type Kontekst } from "../_shared/vinRozliczenie.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Brak autoryzacji" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { registrationNumber, vin, action } = body;
    // Zgodę na użycie własnych kredytów zbiera interfejs — tu jest tylko jej nośnikiem.
    const uzyjWlasnych = body.uzyjWlasnych === true;

    // JEDNO DARMOWE SPRAWDZENIE W TRAKCIE WPROWADZENIA.
    //
    // Warsztat uczy się na własnym aucie i pierwsze sprawdzenie ma być za darmo
    // — inaczej pierwsze wrażenie z produktu to zużyty limit. Przysługuje RAZ
    // i decyduje o tym baza (`onboarding_pojazd_za_darmo` odhacza wykorzystanie
    // w jednej transakcji), a nie flaga z przeglądarki: tę można wysłać w kółko.
    let zaDarmo = false;
    if (body?.onboarding === true) {
      const { data: sp } = await supabaseAdmin
        .from("service_providers").select("id").eq("user_id", user.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (sp?.id) {
        const { data: wolno } = await supabaseAdmin.rpc("onboarding_pojazd_za_darmo", { p_provider: sp.id });
        zaDarmo = wolno === true;
      }
    }

    // Handle test-connection action (no credits needed)
    if (action === "test-connection") {
      return await handleTestConnection(supabaseAdmin);
    }

    // Handle action: check-registration or check-vin
    if (action === "check-registration" && registrationNumber) {
      return await handleCheckRegistration(supabase, supabaseAdmin, user.id, registrationNumber.trim().toUpperCase(), uzyjWlasnych, zaDarmo);
    } else if (action === "check-vin" && vin) {
      return await handleCheckVin(supabase, supabaseAdmin, user.id, vin.trim().toUpperCase(), uzyjWlasnych, zaDarmo);
    } else {
      return new Response(JSON.stringify({ error: "Podaj action: check-registration, check-vin lub test-connection" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("vehicle-check error:", e);
    return new Response(JSON.stringify({ error: e.message || "Błąd serwera" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleTestConnection(supabaseAdmin: any) {
  const { data: integration } = await supabaseAdmin
    .from("portal_integrations")
    .select("*")
    .eq("key", "regcheck_poland")
    .single();

  if (!integration) {
    return new Response(JSON.stringify({ error: "NO_CONFIG", message: "Integracja nie jest skonfigurowana" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const config = integration.config_json || {};
  const username = config.username || "";
  const endpoint = config.endpoint_url || "https://www.regcheck.org.uk/api/reg.asmx/CheckPoland";

  if (!username) {
    return new Response(JSON.stringify({ error: "NO_USERNAME", message: "Brak loginu do API. Wpisz username i zapisz." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Make a simple test call - use a dummy plate to check if the API responds
    const apiUrl = `${endpoint}?RegistrationNumber=TEST&username=${encodeURIComponent(username)}`;
    const apiResp = await fetch(apiUrl);
    const responseText = await apiResp.text();

    if (apiResp.ok) {
      return new Response(JSON.stringify({ status: "ok", message: "Połączenie z RegCheck Poland udane. API odpowiedziało poprawnie." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ status: "error", message: `API zwróciło status ${apiResp.status}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ status: "error", message: `Błąd połączenia: ${e.message}` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}



async function handleCheckRegistration(supabase: any, supabaseAdmin: any, userId: string, regNumber: string, uzyjWlasnych: boolean, zaDarmo = false) {
  // Step 1: Check credits
  // Z czego to opłacimy: pula warsztatu → jego paczki → własne kredyty pracownika.
  // Sprawdzenie z wprowadzenia omija rozliczenie w całości — baza odhaczyła już,
  // że warsztat wykorzystał swoje jedyne darmowe, więc nie ma czego pobierać.
  let kontekst: Kontekst = { providerId: null, jestWlascicielem: false };
  let decyzja: Decyzja = { zrodlo: null, wymagaZgody: false, wlasnePozostalo: 0, powodFirmy: null };

  if (!zaDarmo) {
    kontekst = await ustalKontekst(supabaseAdmin, userId);
    decyzja = await ustalZrodlo(supabaseAdmin, userId, kontekst, uzyjWlasnych);

    if (decyzja.wymagaZgody) {
      // Pula firmy pusta, ale pracownik ma swoje. Nie pytamy płatnego API —
      // najpierw człowiek świadomie decyduje, że dokłada z własnej kieszeni.
      return new Response(JSON.stringify({
        error: "ZGODA_WLASNE_KREDYTY",
        wymagaZgody: true,
        wlasnePozostalo: decyzja.wlasnePozostalo,
        providerId: kontekst.providerId,
        message: "Pula warsztatu wyczerpana.",
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!decyzja.zrodlo) {
      return new Response(JSON.stringify({
        error: "NO_CREDITS",
        mozeDoladowac: kontekst.jestWlascicielem || !kontekst.providerId,
        message: kontekst.providerId && !kontekst.jestWlascicielem
          ? "Pula warsztatu wyczerpana. Poproś właściciela o doładowanie."
          : "Brak sprawdzeń. Doładuj pakiet.",
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // Step 2: Always call the external API. Local workshop/cache data can be incomplete or stale,
  // so a user click on the search icon must fetch fresh data from RegCheck.
  const { data: integration } = await supabaseAdmin
    .from("portal_integrations")
    .select("*")
    .eq("key", "regcheck_poland")
    .single();

  if (!integration || !integration.is_enabled) {
    return new Response(JSON.stringify({ error: "INTEGRATION_DISABLED", message: "Integracja pojazdów nie jest aktywna" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 3: Call external API
  const config = integration.config_json || {};
  const username = config.username || "";
  const endpoint = config.endpoint_url || "https://www.regcheck.org.uk/api/reg.asmx/CheckPoland";

  if (!username) {
    return new Response(JSON.stringify({ error: "CONFIG_ERROR", message: "Brak loginu do integracji RegCheck. Skonfiguruj w panelu admina." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiUrl = `${endpoint}?RegistrationNumber=${encodeURIComponent(regNumber)}&username=${encodeURIComponent(username)}`;
    const apiResp = await fetch(apiUrl);
    const xmlText = await apiResp.text();

    if (!apiResp.ok) {
      await logIntegration(supabaseAdmin, userId, regNumber, null, "registration", "error", null, `HTTP ${apiResp.status}`);
      return new Response(JSON.stringify({ error: "API_ERROR", message: "Błąd API RegCheck" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleData = parseVehicleResponse(xmlText);
    if (!vehicleData) {
      await logIntegration(supabaseAdmin, userId, regNumber, null, "registration", "no_data", { raw: xmlText.substring(0, 2000) }, "Nie udało się sparsować odpowiedzi");
      return new Response(JSON.stringify({ error: "NO_DATA", message: "Nie znaleziono danych dla podanego numeru rejestracyjnego" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mapped = mapRegCheckVehicle(vehicleData, regNumber, null);

    // Validate that we actually got useful data — only deduct credit if vehicle was found
    if (!hasUsefulVehicleData(mapped)) {
      await logIntegration(supabaseAdmin, userId, regNumber, null, "registration", "no_data", { raw: xmlText.substring(0, 2000), parsed: vehicleData }, "API zwróciło pustą odpowiedź — brak danych pojazdu");
      return new Response(JSON.stringify({ error: "NOT_FOUND", message: "Nie znaleziono danych dla podanego numeru rejestracyjnego" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credit (only after confirmed success)
    // Sprawdzenie z wprowadzenia nie schodzi z limitu — baza już odhaczyła,
    // że warsztat wykorzystał swoje jedyne darmowe.
    if (!zaDarmo) await pobierz(supabaseAdmin, userId, kontekst, decyzja, { regNum: regNumber, vin: mapped.vin, sourceType: "external_api" });
    await logIntegration(supabaseAdmin, userId, regNumber, mapped.vin, "registration", "success", vehicleData, null);

    return new Response(JSON.stringify({ data: mapped, source: "external_api" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await logIntegration(supabaseAdmin, userId, regNumber, null, "registration", "error", null, e.message);
    return new Response(JSON.stringify({ error: "API_ERROR", message: "Błąd połączenia z API RegCheck" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

async function handleCheckVin(supabase: any, supabaseAdmin: any, userId: string, vinNumber: string, uzyjWlasnych: boolean, zaDarmo = false) {
  // Step 1: Check credits
  // Z czego to opłacimy: pula warsztatu → jego paczki → własne kredyty pracownika.
  // Sprawdzenie z wprowadzenia omija rozliczenie w całości — baza odhaczyła już,
  // że warsztat wykorzystał swoje jedyne darmowe, więc nie ma czego pobierać.
  let kontekst: Kontekst = { providerId: null, jestWlascicielem: false };
  let decyzja: Decyzja = { zrodlo: null, wymagaZgody: false, wlasnePozostalo: 0, powodFirmy: null };

  if (!zaDarmo) {
    kontekst = await ustalKontekst(supabaseAdmin, userId);
    decyzja = await ustalZrodlo(supabaseAdmin, userId, kontekst, uzyjWlasnych);

    if (decyzja.wymagaZgody) {
      // Pula firmy pusta, ale pracownik ma swoje. Nie pytamy płatnego API —
      // najpierw człowiek świadomie decyduje, że dokłada z własnej kieszeni.
      return new Response(JSON.stringify({
        error: "ZGODA_WLASNE_KREDYTY",
        wymagaZgody: true,
        wlasnePozostalo: decyzja.wlasnePozostalo,
        providerId: kontekst.providerId,
        message: "Pula warsztatu wyczerpana.",
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!decyzja.zrodlo) {
      return new Response(JSON.stringify({
        error: "NO_CREDITS",
        mozeDoladowac: kontekst.jestWlascicielem || !kontekst.providerId,
        message: kontekst.providerId && !kontekst.jestWlascicielem
          ? "Pula warsztatu wyczerpana. Poproś właściciela o doładowanie."
          : "Brak sprawdzeń. Doładuj pakiet.",
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const { data: integration } = await supabaseAdmin
    .from("portal_integrations")
    .select("*")
    .eq("key", "regcheck_poland")
    .single();

  if (!integration || !integration.is_enabled) {
    return new Response(JSON.stringify({ error: "INTEGRATION_DISABLED", message: "Integracja pojazdów nie jest aktywna" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const config = integration.config_json || {};
  const username = config.username || "";
  const baseEndpoint = config.endpoint_url || "https://www.regcheck.org.uk/api/reg.asmx/CheckPoland";
  const endpoint = baseEndpoint.replace(/\/CheckPoland\/?$/i, "/VinCheck");

  if (!username) {
    return new Response(JSON.stringify({ error: "CONFIG_ERROR", message: "Brak loginu do integracji RegCheck. Skonfiguruj w panelu admina." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiUrl = `${endpoint}?Vin=${encodeURIComponent(vinNumber)}&username=${encodeURIComponent(username)}`;
    const apiResp = await fetch(apiUrl);
    const xmlText = await apiResp.text();

    if (!apiResp.ok) {
      await logIntegration(supabaseAdmin, userId, null, vinNumber, "vin", "error", null, `HTTP ${apiResp.status}`);
      return new Response(JSON.stringify({ error: "API_ERROR", message: "Błąd API RegCheck" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleData = parseVehicleResponse(xmlText);
    if (!vehicleData) {
      await logIntegration(supabaseAdmin, userId, null, vinNumber, "vin", "no_data", { raw: xmlText.substring(0, 2000) }, "Nie udało się sparsować odpowiedzi VIN");
      return new Response(JSON.stringify({ error: "NO_DATA", message: "Nie znaleziono danych dla podanego numeru VIN" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mapped = mapRegCheckVehicle(vehicleData, null, vinNumber);
    if (!hasUsefulVehicleData(mapped)) {
      await logIntegration(supabaseAdmin, userId, null, vinNumber, "vin", "no_data", { raw: xmlText.substring(0, 2000), parsed: vehicleData }, "API zwróciło pustą odpowiedź — brak danych pojazdu");
      return new Response(JSON.stringify({ error: "NOT_FOUND", message: "Nie znaleziono danych dla podanego numeru VIN" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!zaDarmo) await pobierz(supabaseAdmin, userId, kontekst, decyzja, { regNum: mapped.registration_number, vin: vinNumber, sourceType: "external_api_vin" });
    await logIntegration(supabaseAdmin, userId, mapped.registration_number, vinNumber, "vin", "success", vehicleData, null);

    return new Response(JSON.stringify({ data: mapped, source: "external_api_vin" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await logIntegration(supabaseAdmin, userId, null, vinNumber, "vin", "error", null, e.message);
    return new Response(JSON.stringify({ error: "API_ERROR", message: "Błąd połączenia z API RegCheck" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

function parseVehicleResponse(xmlText: string) {
  const candidates = [
    xmlText.match(/<vehicleJson[^>]*>([\s\S]*?)<\/vehicleJson>/)?.[1],
    xmlText.match(/<string[^>]*>([\s\S]*?)<\/string>/)?.[1],
    xmlText,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const decoded = decodeXmlEntities(candidate.trim());
      const parsed = JSON.parse(decoded);
      return parsed?.vehicleData || parsed?.Vehicle || parsed;
    } catch (_) {
      // Try the next response shape.
    }
  }
  return null;
}

function mapRegCheckVehicle(vehicleData: any, regNumber: string | null, vinNumber: string | null) {
  const descriptionRaw = extractValue(vehicleData, "Description") || "";
  const engineSize = extractEngineNumberText(vehicleData?.EngineSize)
    || extractEngineNumberText(vehicleData?.EngineCapacity)
    || extractEngineNumberText(vehicleData?.engineCapacity)
    || extractEngineSizeFromDescription(descriptionRaw);
  // Try every known power field across RegCheck variants
  const powerRaw = extractPowerKw(vehicleData?.EnginePower)
    || extractPowerKw(vehicleData?.Power)
    || extractPowerKw(vehicleData?.PowerKW)
    || extractPowerKw(vehicleData?.PowerKw)
    || extractPowerKw(vehicleData?.MaxPower)
    || extractPowerKw(vehicleData?.MaxPowerOutput)
    || extractPowerFromDescription(descriptionRaw);
  const colorRaw = extractCurrentText(vehicleData, "Colour")
    || extractCurrentText(vehicleData, "Color")
    || extractCurrentText(vehicleData, "BodyColour")
    || extractCurrentText(vehicleData, "BodyColor")
    || extractValue(vehicleData, "Colour")
    || extractValue(vehicleData, "Color")
    || extractValue(vehicleData, "BodyColour")
    || null;

  // Fallback body_style z Description (np. "5DR Hatchback Auris")
  let bodyStyle = extractCurrentText(vehicleData, "BodyStyle") || extractValue(vehicleData, "BodyStyle") || null;
  if (!bodyStyle && descriptionRaw) {
    const m = descriptionRaw.match(/\b(Sedan|Hatchback|Kombi|Estate|SUV|Coupe|Cabrio|Convertible|Van|Pickup|MPV|Liftback)\b/i);
    if (m) bodyStyle = m[1];
  }
  // Fallback color z Description (np. "Silver Toyota Auris...")
  let colorFinal = colorRaw;
  if (!colorFinal && descriptionRaw) {
    const cm = descriptionRaw.match(/\b(Black|White|Silver|Grey|Gray|Red|Blue|Green|Yellow|Orange|Brown|Beige|Gold|Czarny|Bia[lł]y|Srebrny|Szary|Czerwony|Niebieski|Zielony|[ZŻ]ó[lł]ty|Br[aą]zowy)\b/i);
    if (cm) colorFinal = cm[1];
  }

  return {
    registration_number: regNumber || extractValue(vehicleData, "RegistrationNumber") || null,
    vin: vehicleData?.VehicleIdentificationNumber || extractValue(vehicleData, "Vin") || extractValue(vehicleData, "VIN") || vinNumber || null,
    make: extractCurrentText(vehicleData, "CarMake") || extractCurrentText(vehicleData, "Make") || null,
    model: extractCurrentText(vehicleData, "CarModel") || extractCurrentText(vehicleData, "Model") || extractValue(vehicleData, "CarModel") || null,
    body_style: bodyStyle,
    color: colorFinal,
    registration_year: parseYear(vehicleData?.ManufacturingYear || vehicleData?.ManufactureYear || extractValue(vehicleData, "RegistrationYear") || extractValue(vehicleData, "Year")),
    first_registration_date: extractValue(vehicleData, "FirstRegistrationDate") || extractValue(vehicleData, "DateFirstRegistered") || null,
    // Gdy rejestr nie poda paliwa wprost, probujemy odczytac je z opisu — tam
    // czesto stoi „PETROL" albo „HYBRID". Lepsze to niz puste pole, ktore
    // warsztat i tak musi uzupelnic recznie przy kazdym aucie.
    fuel_type: normalizeFuelType(vehicleData?.FuelType || extractCurrentText(vehicleData, "FuelType") || extractValue(vehicleData, "FuelType"))
      || paliwoZOpisu(descriptionRaw || ""),
    engine_size: engineSize || null,
    engine_power_kw: powerRaw || null,
    mileage: extractNumberText(vehicleData?.Mileage) || null,
    transmission: extractCurrentText(vehicleData, "Transmission") || null,
    number_of_doors: extractCurrentText(vehicleData, "NumberOfDoors") || extractNumberText(vehicleData?.NumberOfDoors) || null,
    number_of_seats: extractCurrentText(vehicleData, "NumberOfSeats") || extractNumberText(vehicleData?.NumberOfSeats) || null,
    description: descriptionRaw || null,
    source: "regcheck",
    source_payload: vehicleData,
  };
}

function hasUsefulVehicleData(mapped: any) {
  return !!(mapped.make || mapped.model || mapped.vin || mapped.engine_size || mapped.engine_power_kw);
}

// Search portal's own workshop_vehicles database across ALL providers
async function findInPortalDb(supabaseAdmin: any, plate: string | null, vin: string | null) {
  let query = supabaseAdmin
    .from("workshop_vehicles")
    .select("brand, model, color, vin, plate, year, fuel_type, engine_capacity_cm3, engine_power_kw, first_registration_date, description");

  if (plate) {
    query = query.ilike("plate", plate);
  } else if (vin) {
    query = query.ilike("vin", vin);
  } else {
    return null;
  }

  const { data } = await query.limit(1).maybeSingle();
  if (!data || (!data.brand && !data.model)) return null;

  // Map to the same format as cache/API response
  return {
    registration_number: data.plate || plate,
    vin: data.vin || vin,
    make: data.brand,
    model: data.model,
    color: data.color,
    registration_year: data.year,
    fuel_type: data.fuel_type,
    engine_size: data.engine_capacity_cm3 ? String(data.engine_capacity_cm3) : null,
    engine_power_kw: data.engine_power_kw ? String(data.engine_power_kw) : null,
    first_registration_date: data.first_registration_date,
    description: data.description,
    source: "portal_db",
  };
}

function extractValue(obj: any, key: string): string {
  if (!obj) return "";
  if (obj[key] !== undefined && obj[key] !== null) {
    if (typeof obj[key] === "object" && obj[key].CurrentTextValue !== undefined) {
      return obj[key].CurrentTextValue || "";
    }
    return String(obj[key]);
  }
  return "";
}

function extractCurrentText(obj: any, key: string): string {
  if (!obj) return "";
  if (obj[key] && typeof obj[key] === "object") {
    return obj[key].CurrentTextValue || "";
  }
  if (typeof obj[key] === "string") return obj[key];
  return "";
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractNumberText(value: any): string {
  if (value === null || value === undefined || value === "") return "";
  const text = typeof value === "object" ? String(value.CurrentTextValue || value.CurrentValue || "") : String(value);
  const match = text.match(/\d+(?:[.,]\d+)?/);
  return match ? String(Math.round(parseFloat(match[0].replace(",", ".")))) : "";
}

function extractEngineNumberText(value: any): string {
  if (value === null || value === undefined || value === "") return "";
  const text = typeof value === "object" ? String(value.CurrentTextValue || value.CurrentValue || "") : String(value);
  const match = text.match(/\d+(?:[.,]\d+)?/);
  if (!match) return "";
  const num = match[0].replace(",", ".");
  return num.includes(".") ? String(Math.round(parseFloat(num) * 1000)) : num;
}

/** Extract engine power and ALWAYS return value in kW.
 *  Detects units: "120 kW" → 120; "163 KM" / "163 HP" / "163 PS" → kW.
 *  If no unit specified and value > 250, assumes KM (most cars are <250 kW). */
function extractPowerKw(value: any): string {
  if (value === null || value === undefined || value === "") return "";
  const text = typeof value === "object" ? String(value.CurrentTextValue || value.CurrentValue || "") : String(value);
  if (!text) return "";
  const lower = text.toLowerCase();
  const numMatch = text.match(/\d+(?:[.,]\d+)?/);
  if (!numMatch) return "";
  const num = parseFloat(numMatch[0].replace(",", "."));
  if (!num) return "";
  if (lower.includes("kw")) return String(Math.round(num));
  if (lower.includes("km") || lower.includes("hp") || lower.includes("ps") || lower.includes("bhp")) {
    return String(Math.round(num * 0.7355));
  }
  // No unit — assume kW if reasonable, otherwise convert from HP
  if (num > 250) return String(Math.round(num * 0.7355));
  return String(Math.round(num));
}

function parseYear(value: any): number | null {
  const year = String(value || "").match(/(19|20)\d{2}/)?.[0];
  return year ? parseInt(year, 10) : null;
}

/** Paliwo wyczytane z opisu auta — ostatnia deska ratunku, tylko po jasnych slowach. */
function paliwoZOpisu(opis: string): string | null {
  const t = String(opis || "").toLowerCase();
  if (!t) return null;
  if (t.includes("hybrid") || t.includes("hybryd")) return "Hybryda";
  if (t.includes("diesel")) return "Diesel";
  if (t.includes("petrol") || t.includes("gasoline") || t.includes("benzyn")) return "Benzyna";
  if (t.includes("electric")) return "Elektryczny";
  return null;
}

function normalizeFuelType(value: any): string | null {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return null;
  // Rejestr bywa oszczedny i oddaje jedna litere: H = hybryda, D = diesel,
  // P = petrol, E = electric. Bez tego wracalo samo "H", a pole wyboru w karcie
  // pojazdu zostawalo puste, bo takiej pozycji na liscie nie ma.
  if (/^(h|hev|phev)$/.test(normalized)) return "Hybryda";
  if (/^d$/.test(normalized)) return "Diesel";
  if (/^(p|b)$/.test(normalized)) return "Benzyna";
  if (/^(e|ev|bev)$/.test(normalized)) return "Elektryczny";
  if (normalized.includes("diesel") || normalized.includes("olej")) return "Diesel";
  if (normalized.includes("petrol") || normalized.includes("benz")) return "Benzyna";
  if (normalized.includes("lpg")) return "LPG";
  if (normalized.includes("hybrid") || normalized.includes("hyb")) return "Hybryda";
  if (normalized.includes("electric") || normalized.includes("elek")) return "Elektryczny";
  if (normalized.includes("cng")) return "CNG";
  return raw;
}

function extractEngineSizeFromDescription(description: string): string {
  const match = description.match(/(?:^|\s)(\d{3,5})\s*(?:cc|cm3|cm³)\b/i) || description.match(/(?:^|\s)(\d[.,]\d)\b/);
  if (!match) return "";
  const value = match[1].replace(",", ".");
  return value.includes(".") ? String(Math.round(parseFloat(value) * 1000)) : value;
}

function extractPowerFromDescription(description: string): string {
  const kw = description.match(/(\d{2,3})\s*kW\b/i)?.[1];
  if (kw) return kw;
  const hp = description.match(/(\d{2,4})\s*(?:KM|HP|PS)\b/i)?.[1];
  return hp ? String(Math.round(parseInt(hp, 10) * 0.735499)) : "";
}

async function logIntegration(supabaseAdmin: any, userId: string, regNum: string | null, vin: string | null, reqType: string, status: string, response: any, error: string | null) {
  await supabaseAdmin.from("vehicle_integration_logs").insert({
    integration_key: "regcheck_poland",
    user_id: userId,
    registration_number: regNum,
    vin: vin,
    request_type: reqType,
    status: status,
    response_snapshot: response,
    error_message: error,
  });
}
