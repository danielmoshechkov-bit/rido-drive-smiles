import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Handle test-connection action (no credits needed)
    if (action === "test-connection") {
      return await handleTestConnection(supabaseAdmin);
    }

    // Handle action: check-registration or check-vin
    if (action === "check-registration" && registrationNumber) {
      return await handleCheckRegistration(supabase, supabaseAdmin, user.id, registrationNumber.trim().toUpperCase());
    } else if (action === "check-vin" && vin) {
      return await handleCheckVin(supabase, supabaseAdmin, user.id, vin.trim().toUpperCase());
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

async function checkCredits(supabaseAdmin: any, userId: string): Promise<{ hasCredits: boolean; remaining: number }> {
  const { data } = await supabaseAdmin
    .from("vehicle_lookup_credits")
    .select("remaining_credits")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return { hasCredits: false, remaining: 0 };
  return { hasCredits: data.remaining_credits > 0, remaining: data.remaining_credits };
}

async function deductCredit(supabaseAdmin: any, userId: string, regNum: string | null, vin: string | null, sourceType: string) {
  // Deduct 1 credit
  await supabaseAdmin.rpc("deduct_vehicle_lookup_credit", { p_user_id: userId });

  // Log usage
  await supabaseAdmin.from("vehicle_lookup_usage").insert({
    user_id: userId,
    registration_number: regNum,
    vin: vin,
    source_type: sourceType,
    credits_used: 1,
  });

  // Log transaction
  await supabaseAdmin.from("vehicle_lookup_credit_transactions").insert({
    user_id: userId,
    type: "usage",
    credits: -1,
    source: "system",
    note: regNum ? `Sprawdzenie: ${regNum}` : `Sprawdzenie VIN: ${vin}`,
  });
}

async function handleCheckRegistration(supabase: any, supabaseAdmin: any, userId: string, regNumber: string) {
  // Step 1: Check credits
  const { hasCredits } = await checkCredits(supabaseAdmin, userId);
  if (!hasCredits) {
    return new Response(JSON.stringify({ error: "NO_CREDITS", message: "Brak kredytów. Kup pakiet kredytów." }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 2: Check portal's own vehicle database (workshop_vehicles from ALL providers)
  const portalVehicle = await findInPortalDb(supabaseAdmin, regNumber, null);
  if (portalVehicle) {
    await deductCredit(supabaseAdmin, userId, regNumber, portalVehicle.vin, "portal_db");
    await logIntegration(supabaseAdmin, userId, regNumber, portalVehicle.vin, "registration", "portal_db_hit", null, null);
    return new Response(JSON.stringify({ data: portalVehicle, source: "portal_db" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 3: Check integration is enabled
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

  // Step 4: Check global cache
  const { data: cached } = await supabaseAdmin
    .from("vehicle_registry_cache")
    .select("*")
    .ilike("registration_number", regNumber)
    .limit(1)
    .maybeSingle();

  if (cached) {
    await deductCredit(supabaseAdmin, userId, regNumber, null, "cache");
    await logIntegration(supabaseAdmin, userId, regNumber, null, "registration", "cache_hit", null, null);
    return new Response(JSON.stringify({ data: cached, source: "cache" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 4: Call external API
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

    // Parse XML response - extract JSON from XML wrapper
    const jsonMatch = xmlText.match(/<vehicleJson>([\s\S]*?)<\/vehicleJson>/);
    let vehicleData: any = null;

    if (jsonMatch && jsonMatch[1]) {
      try {
        vehicleData = JSON.parse(jsonMatch[1]);
      } catch {
        // Try direct JSON
        const directMatch = xmlText.match(/<string[^>]*>([\s\S]*?)<\/string>/);
        if (directMatch && directMatch[1]) {
          try {
            vehicleData = JSON.parse(directMatch[1]);
          } catch {
            vehicleData = null;
          }
        }
      }
    }

    if (!vehicleData) {
      // Try to parse as direct JSON response
      try {
        vehicleData = JSON.parse(xmlText);
      } catch {
        await logIntegration(supabaseAdmin, userId, regNumber, null, "registration", "no_data", { raw: xmlText.substring(0, 2000) }, "Nie udało się sparsować odpowiedzi");
        return new Response(JSON.stringify({ error: "NO_DATA", message: "Nie znaleziono danych dla podanego numeru rejestracyjnego" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Map API response to our schema using documented field names
    const descriptionRaw = extractValue(vehicleData, "Description") || "";
    
    // EngineSize and Power are top-level numeric fields per API docs
    const engineSizeNum = vehicleData?.EngineSize ?? null;
    const powerNum = vehicleData?.Power ?? null;
    const mileageNum = vehicleData?.Mileage ?? null;

    const mapped = {
      registration_number: regNumber,
      vin: vehicleData?.VehicleIdentificationNumber || extractValue(vehicleData, "Vin") || null,
      make: extractCurrentText(vehicleData, "CarMake") || null,
      model: extractCurrentText(vehicleData, "CarModel") || extractValue(vehicleData, "CarModel") || null,
      body_style: extractCurrentText(vehicleData, "BodyStyle") || extractValue(vehicleData, "BodyStyle") || null,
      color: extractCurrentText(vehicleData, "Colour") || extractValue(vehicleData, "Colour") || null,
      registration_year: vehicleData?.ManufacturingYear || parseInt(extractValue(vehicleData, "RegistrationYear")) || null,
      fuel_type: vehicleData?.FuelType || extractCurrentText(vehicleData, "FuelType") || null,
      engine_size: engineSizeNum !== null ? String(engineSizeNum) : null,
      engine_power_kw: powerNum !== null ? String(powerNum) : null,
      mileage: mileageNum !== null ? String(mileageNum) : null,
      transmission: extractCurrentText(vehicleData, "Transmission") || null,
      number_of_doors: extractCurrentText(vehicleData, "NumberOfDoors") || null,
      number_of_seats: extractCurrentText(vehicleData, "NumberOfSeats") || null,
      description: descriptionRaw || null,
      source: "regcheck",
      source_payload: vehicleData,
    };

    // Save to cache
    await supabaseAdmin.from("vehicle_registry_cache").insert(mapped);

    // Deduct credit
    await deductCredit(supabaseAdmin, userId, regNumber, mapped.vin, "external_api");
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

async function handleCheckVin(supabase: any, supabaseAdmin: any, userId: string, vinNumber: string) {
  // Step 1: Check credits
  const { hasCredits } = await checkCredits(supabaseAdmin, userId);
  if (!hasCredits) {
    return new Response(JSON.stringify({ error: "NO_CREDITS", message: "Brak kredytów. Kup pakiet kredytów." }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 2: Check portal's own vehicle database (workshop_vehicles from ALL providers)
  const portalVehicle = await findInPortalDb(supabaseAdmin, null, vinNumber);
  if (portalVehicle) {
    await deductCredit(supabaseAdmin, userId, null, vinNumber, "portal_db");
    await logIntegration(supabaseAdmin, userId, null, vinNumber, "vin", "portal_db_hit", null, null);
    return new Response(JSON.stringify({ data: portalVehicle, source: "portal_db" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 3: Search global cache by VIN
  const { data: cached } = await supabaseAdmin
    .from("vehicle_registry_cache")
    .select("*")
    .ilike("vin", vinNumber)
    .limit(1)
    .maybeSingle();

  if (cached) {
    await deductCredit(supabaseAdmin, userId, null, vinNumber, "cache_vin");
    await logIntegration(supabaseAdmin, userId, null, vinNumber, "vin", "cache_hit", null, null);
    return new Response(JSON.stringify({ data: cached, source: "cache_vin" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // No external VIN API yet
  return new Response(JSON.stringify({ error: "NOT_FOUND", message: "Nie znaleziono pojazdu po numerze VIN w bazie systemu" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
