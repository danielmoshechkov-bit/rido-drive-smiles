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

    // Handle action: check-registration or check-vin
    if (action === "check-registration" && registrationNumber) {
      return await handleCheckRegistration(supabase, supabaseAdmin, user.id, registrationNumber.trim().toUpperCase());
    } else if (action === "check-vin" && vin) {
      return await handleCheckVin(supabase, supabaseAdmin, user.id, vin.trim().toUpperCase());
    } else {
      return new Response(JSON.stringify({ error: "Podaj action: check-registration lub check-vin" }), {
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

  // Step 2: Check integration is enabled
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

  // Step 3: Check cache
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

    // Map API response to our schema
    const mapped = {
      registration_number: regNumber,
      vin: extractValue(vehicleData, "Vin") || null,
      make: extractCurrentText(vehicleData, "CarMake") || null,
      model: extractValue(vehicleData, "CarModel") || null,
      body_style: extractCurrentText(vehicleData, "BodyStyle") || null,
      color: extractCurrentText(vehicleData, "Colour") || null,
      registration_year: parseInt(extractValue(vehicleData, "RegistrationYear")) || null,
      fuel_type: extractCurrentText(vehicleData, "FuelType") || null,
      engine_size: extractCurrentText(vehicleData, "EngineSize") || null,
      transmission: extractCurrentText(vehicleData, "Transmission") || null,
      number_of_doors: extractCurrentText(vehicleData, "NumberOfDoors") || null,
      number_of_seats: extractCurrentText(vehicleData, "NumberOfSeats") || null,
      description: extractValue(vehicleData, "Description") || null,
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

  // Step 2: Search cache by VIN
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
