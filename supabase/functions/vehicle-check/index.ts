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

    await deductCredit(supabaseAdmin, userId, mapped.registration_number, vinNumber, "external_api_vin");
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
  const engineSize = extractNumberText(vehicleData?.EngineSize) || extractNumberText(vehicleData?.EngineCapacity) || extractEngineSizeFromDescription(descriptionRaw);
  const power = extractNumberText(vehicleData?.Power) || extractNumberText(vehicleData?.EnginePower) || extractPowerFromDescription(descriptionRaw);

  return {
    registration_number: regNumber || extractValue(vehicleData, "RegistrationNumber") || null,
    vin: vehicleData?.VehicleIdentificationNumber || extractValue(vehicleData, "Vin") || extractValue(vehicleData, "VIN") || vinNumber || null,
    make: extractCurrentText(vehicleData, "CarMake") || extractCurrentText(vehicleData, "Make") || null,
    model: extractCurrentText(vehicleData, "CarModel") || extractCurrentText(vehicleData, "Model") || extractValue(vehicleData, "CarModel") || null,
    body_style: extractCurrentText(vehicleData, "BodyStyle") || extractValue(vehicleData, "BodyStyle") || null,
    color: extractCurrentText(vehicleData, "Colour") || extractCurrentText(vehicleData, "Color") || extractValue(vehicleData, "Colour") || null,
    registration_year: parseYear(vehicleData?.ManufacturingYear || vehicleData?.ManufactureYear || extractValue(vehicleData, "RegistrationYear") || extractValue(vehicleData, "Year")),
    first_registration_date: extractValue(vehicleData, "FirstRegistrationDate") || extractValue(vehicleData, "DateFirstRegistered") || null,
    fuel_type: normalizeFuelType(vehicleData?.FuelType || extractCurrentText(vehicleData, "FuelType") || extractValue(vehicleData, "FuelType")),
    engine_size: engineSize || null,
    engine_power_kw: power || null,
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
  if (!match) return "";
  const num = match[0].replace(",", ".");
  if (num.includes(".")) return String(Math.round(parseFloat(num) * 1000));
  return num;
}

function parseYear(value: any): number | null {
  const year = String(value || "").match(/(19|20)\d{2}/)?.[0];
  return year ? parseInt(year, 10) : null;
}

function normalizeFuelType(value: any): string | null {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return null;
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
