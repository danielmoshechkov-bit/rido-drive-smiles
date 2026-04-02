import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Hart API URLs
const HART_PROD_URL = "https://restapi.hartphp.com.pl";
const HART_SANDBOX_URL = "https://sandbox.restapi.hartphp.com.pl";

// Auto Partner REST API URLs
const AP_PROD_URL = "https://customerapi.autopartner.dev/CustomerAPI.svc/rest";
const AP_SANDBOX_URL = "https://customerapitest.autopartner.dev/CustomerAPI.svc/rest";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

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

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action, provider_id, supplier_code = "hart", params = {} } = body;

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
      return await handleAutoPartner(supabase, integration, action, params);
    }

    if (supplier_code === "hart" || !supplier_code) {
      const baseUrl = integration.environment === "production" ? HART_PROD_URL : HART_SANDBOX_URL;
      return await handleHart(supabase, baseUrl, integration, action, params);
    }

    return json({ error: "Nieobsługiwany dostawca: " + supplier_code }, 400);
  } catch (err) {
    console.error("workshop-parts-api error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ==================== AUTO PARTNER (REST/JSON) ====================
async function handleAutoPartner(supabase: any, integration: any, action: string, params: any) {
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

      try {
        const searchIntent = await buildSearchIntent(query, params);
        const searchTerms = uniqueStrings([query, ...searchIntent.queryVariants]).slice(0, 5);

        const res = await fetch(`${baseUrl}/ProductsAvailabilityV2`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...creds,
            products: searchTerms.map((term) => ({ productCode: term, quantity: 1 })),
            onlySite: false,
          }),
        });
        if (res.status === 404) {
          return json({ results: [], clarificationQuestion: searchIntent.clarificationQuestion, searchedTerms: searchTerms });
        }
        if (!res.ok) return json({ error: `Wyszukiwanie Auto Partner: HTTP ${res.status}` }, res.status);

        const data = await res.json();
        const availability = data?.RestProductsAvailabilityV2Result?.Availability || [];
        const mapped = availability.map((item: any) => {
          const totalStock = (item.States || []).reduce((sum: number, s: any) => sum + (s.InStock || 0), 0);
          const warehouses = (item.States || []).map((s: any) => s.DepartmentCode || s.BranchCode || s.Name).filter(Boolean).join(", ");
          return {
            partNumber: item.ProductCode || item.Code || "",
            productCode: item.ProductCode || item.Code || "",
            name: item.ProductName || item.Name || item.Description || item.ProductCode || "",
            manufacturer: item.ProducerName || item.ManufacturerName || item.BrandName || item.Brand || "",
            price: Number(item.Price || item.NetPrice || item.WholesalePrice || 0),
            retailPrice: item.Pr || 0,
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
        return json({
          results: deduped,
          clarificationQuestion: deduped.length === 0 ? searchIntent.clarificationQuestion : null,
          searchedTerms: searchTerms,
        });
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

// ==================== HART (REST/JWT) ====================
async function handleHart(supabase: any, baseUrl: string, integration: any, action: string, params: any) {
  if (!integration?.api_username || !integration?.api_password) {
    return json({ error: "Uzupełnij login i hasło API HART." }, 400);
  }

  const authRes = await fetch(`${baseUrl}/v1/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: integration.api_username, password: integration.api_password }),
  });

  if (!authRes.ok) {
    await updateConnectionStatus(supabase, integration.id, "error", baseUrl);
    if (authRes.status === 401) return json({ error: "Błąd autoryzacji Hart. Sprawdź login i hasło." }, 400);
    return json({ error: `Hart auth: HTTP ${authRes.status}` }, authRes.status);
  }

  const authData = await authRes.json();
  const token = authData.access_token || authData.token;
  if (!token) {
    await updateConnectionStatus(supabase, integration.id, "error", baseUrl);
    return json({ error: "Nie otrzymano tokenu z Hart API" }, 500);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (integration.default_branch_id) {
    headers["BranchId"] = integration.default_branch_id;
  }

  switch (action) {
    case "test_connection": {
      await updateConnectionStatus(supabase, integration.id, "ok", baseUrl);
      return json({ success: true, message: "Połączono z Hart API" });
    }

    case "search": {
      const query = String(params?.query || "").trim();
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);

      const searchIntent = await buildSearchIntent(query, params);
      const hartCodes = uniqueStrings([query, ...searchIntent.queryVariants].filter(looksLikePartCode)).slice(0, 10);

      if (hartCodes.length === 0) {
        return json({
          results: [],
          clarificationQuestion: searchIntent.clarificationQuestion || "Dla HART podaj numer OE, numer katalogowy albo doprecyzuj dokładnie część.",
        });
      }

      const queryParams = new URLSearchParams();
      hartCodes.forEach((code) => queryParams.append("HartCodes", code));
      queryParams.set("Availability", "true");

      const searchRes = await fetch(
        `${baseUrl}/v1/products?${queryParams.toString()}`,
        { headers }
      );
      if (searchRes.status === 429) return json({ error: "Limit zapytań Hart (50/min). Poczekaj chwilę." }, 429);
      if (searchRes.status === 404) {
        return json({ results: [], clarificationQuestion: searchIntent.clarificationQuestion, searchedTerms: hartCodes });
      }
      if (!searchRes.ok) return json({ error: `Wyszukiwanie Hart: HTTP ${searchRes.status}` }, searchRes.status);

      const data = await searchRes.json();
      const items = (data.items || [])
        .filter((i: any) => i.isSuccess && !i.value?.withdrawn)
        .map((i: any) => ({
          partNumber: i.value?.hartCode || "",
          name: i.value?.name || "",
          price: Number(i.value?.sellingPrice || 0),
          availability: Number(i.value?.quantity ?? 0),
          waitingTime: i.value?.waitingTime || "",
          warehouse: "HART",
          producer: i.value?.supplier || "",
          currency: i.value?.currency || "PLN",
        }));
      return json({
        results: items,
        clarificationQuestion: items.length === 0 ? searchIntent.clarificationQuestion : null,
        searchedTerms: hartCodes,
      });
    }

    case "availability": {
      const codes = params?.codes;
      if (!codes?.length) return json({ error: "Brak kodów" }, 400);
      const queryStr = codes.map((c: string) => `HartCodes=${encodeURIComponent(c)}`).join("&");
      const avRes = await fetch(`${baseUrl}/v1/products/availability?${queryStr}`, { headers });
      if (!avRes.ok) return json({ error: `Dostępność Hart: HTTP ${avRes.status}` }, avRes.status);
      const data = await avRes.json();
      return json({ availability: (data.items || []).filter((i: any) => i.isSuccess).map((i: any) => i.value) });
    }

    case "add_to_basket": {
      const positions = params?.positions;
      if (!positions?.length) return json({ error: "Brak pozycji" }, 400);
      const basketRes = await fetch(`${baseUrl}/v1/basket`, {
        method: "POST", headers,
        body: JSON.stringify({ orderPositions: positions }),
      });
      if (!basketRes.ok) return json({ error: `Koszyk Hart: HTTP ${basketRes.status}` }, basketRes.status);
      const data = await basketRes.json();
      if (data.isSuccess === false) return json({ error: data.errorMessage || "Błąd dodawania do koszyka" }, 400);
      return json({
        basket: {
          ...data.value,
          basketPositionIds: (data.value?.successfulOrders || []).map((item: any) => item.orderBufferPositionId),
        },
      });
    }

    case "place_order": {
      const basketPositionIds = params?.basketPositionIds;
      if (!basketPositionIds?.length) return json({ error: "Brak pozycji koszyka" }, 400);
      const orderRes = await fetch(`${baseUrl}/v1/orders`, {
        method: "POST", headers,
        body: JSON.stringify({ basketPositionIds }),
      });
      if (!orderRes.ok) return json({ error: `Zamówienie Hart: HTTP ${orderRes.status}` }, orderRes.status);
      const data = await orderRes.json();
      if (data.isSuccess === false) return json({ error: data.errorMessage || "Błąd składania zamówienia" }, 400);
      return json({ order: { orderId: data.value?.[0]?.orderId || "", items: data.value || [] } });
    }

    case "get_invoices": {
      const { dateFrom, dateTo } = params || {};
      const invRes = await fetch(`${baseUrl}/v1/documents/invoices?DateFrom=${dateFrom}&DateTo=${dateTo}`, { headers });
      if (!invRes.ok) return json({ error: `Faktury Hart: HTTP ${invRes.status}` }, invRes.status);
      return json({ invoices: await invRes.json() });
    }

    default:
      return json({ error: `Nieznana akcja: ${action}` }, 400);
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

function looksLikePartCode(query: string) {
  const value = String(query || "").trim();
  if (!value) return false;
  if (/\d/.test(value) && /[a-zA-Z]/.test(value)) return true;
  return /^[A-Z0-9][A-Z0-9\s\-./]{4,}$/.test(value) && /\d/.test(value);
}

function getDefaultClarificationQuestion(query: string, params: any) {
  const value = String(query || "").toLowerCase();
  const vehicle = params?.vehicle || {};
  const needsSide = /(wahacz|amortyzator|spr[eę]żyn|dr[aą]żek|końc[oó]wk|zacisk|lampa|błotnik|piasta|p[oó]łoś|łożysk)/.test(value) && !/(lewy|prawy|lewa|prawa)/.test(value);
  const needsAxle = /(wahacz|amortyzator|spr[eę]żyn|dr[aą]żek|końc[oó]wk|tarcza|klock|piasta|łożysk)/.test(value) && !/(prz[oó]d|przedni|przednia|tył|tylny|tylna)/.test(value);

  if (needsSide && needsAxle) {
    return "Doprecyzuj proszę, czy chodzi o lewą czy prawą stronę oraz przód czy tył auta.";
  }

  if (needsSide) {
    return "Doprecyzuj proszę, czy chodzi o lewą czy prawą stronę auta.";
  }

  if (needsAxle) {
    return "Doprecyzuj proszę, czy chodzi o przód czy tył auta.";
  }

  if (!vehicle?.brand || !vehicle?.model) {
    return "Dodaj markę i model pojazdu albo numer OE / katalogowy, żeby zawęzić wyszukiwanie części.";
  }

  return null;
}

async function buildSearchIntent(query: string, params: any) {
  const normalizedQuery = String(query || "").trim();
  const fallbackClarification = getDefaultClarificationQuestion(normalizedQuery, params);

  if (!normalizedQuery) {
    return { queryVariants: [], clarificationQuestion: fallbackClarification };
  }

  if (looksLikePartCode(normalizedQuery)) {
    return { queryVariants: [normalizedQuery], clarificationQuestion: null };
  }

  const ANTHROPIC_API_KEY = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!ANTHROPIC_API_KEY) {
    return { queryVariants: [normalizedQuery], clarificationQuestion: fallbackClarification };
  }

  const vehicle = params?.vehicle || {};
  const vehicleContext = [
    vehicle.brand,
    vehicle.model,
    vehicle.year ? `rok ${vehicle.year}` : null,
    vehicle.engineCapacityCm3 ? `${vehicle.engineCapacityCm3}cc` : null,
    vehicle.enginePowerKw ? `${vehicle.enginePowerKw}kW` : null,
    vehicle.fuelType,
    params?.vin ? `VIN ${params.vin}` : null,
  ].filter(Boolean).join(", ");

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 250,
        system: "Jesteś asystentem doboru części samochodowych w warsztacie. Zwróć wyłącznie czysty JSON w formacie {\"queryVariants\":[\"...\"],\"clarificationQuestion\":\"... lub null\"}. Nie wymyślaj numerów katalogowych. Jeśli zapytanie jest nieprecyzyjne, ustaw clarificationQuestion po polsku. Jeśli można szukać, podaj do 5 krótkich wariantów zapytania.",
        messages: [{
          role: "user",
          content: `Zapytanie klienta: ${normalizedQuery}\nDane auta: ${vehicleContext || "brak"}`,
        }],
      }),
    });

    const aiData = await aiRes.json();
    const raw = aiData?.content?.[0]?.text?.replace(/```json|```/g, "").trim();
    const parsed = raw ? JSON.parse(raw) : {};
    const queryVariants = uniqueStrings([normalizedQuery, ...(Array.isArray(parsed?.queryVariants) ? parsed.queryVariants : [])]).slice(0, 5);
    const clarificationQuestion = typeof parsed?.clarificationQuestion === "string" && parsed.clarificationQuestion.trim()
      ? parsed.clarificationQuestion.trim()
      : fallbackClarification;

    return {
      queryVariants: queryVariants.length > 0 ? queryVariants : [normalizedQuery],
      clarificationQuestion,
    };
  } catch (error) {
    console.error("buildSearchIntent error:", error);
    return { queryVariants: [normalizedQuery], clarificationQuestion: fallbackClarification };
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
