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
  clarificationQuestion: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

async function resolvePartsQuery(query: string, params: any): Promise<ResolvedQuery> {
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

  const systemPrompt = `Jesteś ekspertem od części samochodowych w Polsce z dostępem do wiedzy o numerach OE/katalogowych.
Twoje zadanie: na podstawie opisu części i danych pojazdu wygenerować numery OE (Original Equipment) lub katalogowe, które mechanik może wpisać do systemu hurtowni.

ZASADY:
1. Jeśli opis jest precyzyjny + masz dane pojazdu → wygeneruj do 8 realnych numerów OE popularnych producentów (Bosch, Brembo, TRW, Febi, Lemförder, ATE, Ferodo, LuK, Sachs, Monroe, Bilstein, NGK, Denso, Mann, Mahle, Valeo, Delphi, Hella, ZF, SKF, FAG)
2. Jeśli opis jest nieprecyzyjny (brak strony L/P, brak przód/tył) → ustaw clarificationQuestion po polsku
3. Jeśli brak danych pojazdu → ustaw clarificationQuestion z prośbą o markę i model
4. NIE wymyślaj numerów jeśli nie jesteś pewny – lepiej zwróć pustą listę i clarificationQuestion
5. Numery OE pisz dokładnie tak jak w katalogach (spacje, myślniki są ważne)

FORMAT ODPOWIEDZI – tylko czysty JSON, zero tekstu przed/po:
{
  "oeNumbers": ["numer1", "numer2"],
  "partDescription": "precyzyjny opis części po polsku",
  "clarificationQuestion": "pytanie do mechanika lub null",
  "confidence": "high|medium|low",
  "reasoning": "krótkie wyjaśnienie"
}`;

  const userMsg = `Opis części: "${query}"
Dane pojazdu: ${vehicleCtx || 'brak danych pojazdu'}`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    const aiData = await aiRes.json();
    const rawText = aiData?.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}';
    const parsed = JSON.parse(rawText);

    const oeNumbers = Array.isArray(parsed.oeNumbers)
      ? parsed.oeNumbers.filter((n: string) => n && n.length >= 3).slice(0, 8)
      : [];

    return {
      mode: 'description',
      originalQuery: query,
      oeNumbers,
      partDescription: parsed.partDescription || query,
      clarificationQuestion: typeof parsed.clarificationQuestion === 'string' && parsed.clarificationQuestion.trim()
        ? parsed.clarificationQuestion.trim()
        : null,
      confidence: parsed.confidence || 'medium',
      reasoning: parsed.reasoning || '',
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

    if (supplier_code === "inter_cars") {
      return await handleInterCars(supabase, integration, action, params);
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

      // KROK 1: Rozwiąż przez AI
      const resolved = await resolvePartsQuery(query, params);
      console.log(`[AP] resolvePartsQuery:`, JSON.stringify({
        oeNumbers: resolved.oeNumbers,
        clarification: resolved.clarificationQuestion,
        confidence: resolved.confidence,
      }));

      if (resolved.oeNumbers.length === 0) {
        return json({
          results: [],
          clarificationQuestion: resolved.clarificationQuestion
            || 'Podaj numer katalogowy lub OE części, albo doprecyzuj opis.',
          searchedTerms: [],
          aiResolved: true,
          partDescription: resolved.partDescription,
        });
      }

      // KROK 2: Szukaj w Auto Partner po numerach OE
      try {
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

        if (res.status === 404) {
          return json({
            results: [],
            clarificationQuestion: resolved.clarificationQuestion || `Auto Partner nie znalazł dla numerów: ${resolved.oeNumbers.join(', ')}`,
            searchedTerms: resolved.oeNumbers,
            aiResolved: true,
            partDescription: resolved.partDescription,
          });
        }
        if (!res.ok) return json({ error: `Auto Partner: HTTP ${res.status}` }, res.status);

        const data = await res.json();
        const result = endpoint === "ProductAvailabilityV2"
          ? data?.RestProductAvailabilityV2Result || data?.RestProductAvailabilityTecDocResult || data
          : data?.RestProductsAvailabilityV2Result || data;

        const errorCode = String(result?.ErrorCode || "").trim();
        if (errorCode && errorCode !== "03/38") {
          console.warn(`[AP] ErrorCode: ${errorCode}`);
        }

        const availability = Array.isArray(result?.Availability)
          ? result.Availability
          : result?.Availability
            ? [result.Availability]
            : [];

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
          ? (resolved.clarificationQuestion || `Auto Partner nie znalazł dla numerów: ${resolved.oeNumbers.join(', ')}. Sprawdź numer OE lub spróbuj innego opisu.`)
          : null;

        return json({
          results: deduped,
          clarificationQuestion,
          searchedTerms: resolved.oeNumbers,
          aiResolved: true,
          partDescription: resolved.partDescription,
          confidence: resolved.confidence,
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

// ==================== HART (REST/JWT) — per doc v1.5 ====================
async function handleHart(supabase: any, baseUrl: string, integration: any, action: string, params: any) {
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

      // KROK 1: Rozwiąż zapytanie przez AI
      const resolved = await resolvePartsQuery(query, params);
      console.log(`[HART] resolvePartsQuery result:`, JSON.stringify({
        mode: resolved.mode,
        oeNumbers: resolved.oeNumbers,
        clarification: resolved.clarificationQuestion,
        confidence: resolved.confidence,
        reasoning: resolved.reasoning,
      }));

      // KROK 2: Jeśli AI nie ma numerów OE → zapytaj mechanika
      if (resolved.oeNumbers.length === 0) {
        return json({
          results: [],
          clarificationQuestion: resolved.clarificationQuestion
            || 'Podaj numer katalogowy lub OE części, albo doprecyzuj opis (marka, model, lewa/prawa, przód/tył).',
          searchedTerms: [],
          aiResolved: true,
          partDescription: resolved.partDescription,
        });
      }

      // KROK 3: Szukaj po wszystkich numerach OE w Hart
      const queryParams = new URLSearchParams();
      resolved.oeNumbers.forEach(code => queryParams.append('HartCodes', code));
      queryParams.set('Availability', 'true');
      queryParams.set('Size', '50');

      const url = `${baseUrl}/v1/products?${queryParams.toString()}`;
      console.log(`[HART] Searching with OE numbers: ${url}`);

      const searchRes = await fetch(url, { headers });

      if (searchRes.status === 429) return json({ error: "Limit zapytań Hart (50/min). Poczekaj chwilę." }, 429);

      let data: any = {};
      try {
        const searchText = await searchRes.text();
        console.log(`[HART] Search response: HTTP ${searchRes.status}, body length: ${searchText.length}`);
        if (searchRes.status === 404) {
          return json({
            results: [],
            clarificationQuestion: resolved.clarificationQuestion || `Nie znaleziono w Hart dla numerów: ${resolved.oeNumbers.join(', ')}`,
            searchedTerms: resolved.oeNumbers,
            aiResolved: true,
            partDescription: resolved.partDescription,
          });
        }
        if (!searchRes.ok) {
          return json({ error: `Wyszukiwanie Hart: HTTP ${searchRes.status}` }, searchRes.status);
        }
        data = JSON.parse(searchText);
      } catch {
        return json({ error: "Nieprawidłowa odpowiedź z Hart API" }, 500);
      }

      // KROK 4: Parsuj wyniki
      const items = (data.items || [])
        .filter((i: any) => i.isSuccess && i.value && !i.value.withdrawn)
        .map((i: any) => {
          const v = i.value;
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
          };
        });

      console.log(`[HART] Found ${items.length} products for OE numbers: [${resolved.oeNumbers.join(', ')}]`);

      // KROK 5: Zwróć wyniki + ewentualnie clarification obok
      const clarificationQuestion = items.length === 0
        ? (resolved.clarificationQuestion || `Nie znaleziono w Hart dla numerów: ${resolved.oeNumbers.join(', ')}. Sprawdź numer OE lub spróbuj innego opisu.`)
        : null;

      return json({
        results: items,
        clarificationQuestion,
        searchedTerms: resolved.oeNumbers,
        aiResolved: true,
        partDescription: resolved.partDescription,
        confidence: resolved.confidence,
        pagination: {
          totalPages: data.total_pages,
          currentPage: data.current_page,
          totalItems: data.total_items_count,
        },
      });
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
const IC_BASE_URL = "https://webapi.intercars.eu/v1";
const IC_TOKEN_URL = "https://cp.webapi.intercars.eu/token";

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

async function handleInterCars(supabase: any, integration: any, action: string, params: any) {
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
        console.log(`[IC] Auth OK for customer ${customerNumber}`);
        await updateConnectionStatus(supabase, integration.id, "ok");
        return json({ success: true, message: `Połączono z Inter Cars API (klient: ${customerNumber})` });
      } catch (e) {
        console.error("[IC] Test connection error:", e);
        await updateConnectionStatus(supabase, integration.id, "error");
        return json({ error: `Nie można połączyć z Inter Cars: ${e.message}` }, 400);
      }
    }

    case "search": {
      const query = String(params?.query || "").trim();
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);

      // Step 1: AI resolve OE numbers
      const resolved = await resolvePartsQuery(query, params);
      console.log(`[IC] resolvePartsQuery:`, JSON.stringify({
        oeNumbers: resolved.oeNumbers,
        clarification: resolved.clarificationQuestion,
        confidence: resolved.confidence,
      }));

      if (resolved.oeNumbers.length === 0) {
        return json({
          results: [],
          clarificationQuestion: resolved.clarificationQuestion
            || 'Podaj numer katalogowy lub OE części, albo doprecyzuj opis.',
          searchedTerms: [],
          aiResolved: true,
          partDescription: resolved.partDescription,
        });
      }

      try {
        const token = await getICToken(supabase, integration.id, clientId, clientSecret);
        const icHeaders = {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        // Step 2: Search catalog - query by index (OE numbers)
        const skus = resolved.oeNumbers.slice(0, 30);
        const catalogRes = await fetch(
          `${IC_BASE_URL}/catalog/products?index=${skus.join(",")}`,
          { headers: icHeaders }
        );

        if (catalogRes.status === 404) {
          return json({
            results: [],
            clarificationQuestion: resolved.clarificationQuestion || `Inter Cars nie znalazł dla numerów: ${resolved.oeNumbers.join(', ')}`,
            searchedTerms: resolved.oeNumbers,
            aiResolved: true,
            partDescription: resolved.partDescription,
          });
        }
        if (!catalogRes.ok) {
          const errText = await catalogRes.text();
          console.error(`[IC] Catalog error: HTTP ${catalogRes.status}`, errText.substring(0, 300));
          return json({ error: `Inter Cars catalog: HTTP ${catalogRes.status}` }, catalogRes.status);
        }

        const catalogData = await catalogRes.json();
        const products = Array.isArray(catalogData) ? catalogData : catalogData?.items || catalogData?.products || [];

        // Step 3: Check availability
        const foundSkus = products.map((p: any) => p.sku || p.index || p.towkod).filter(Boolean);
        let availability: any[] = [];
        if (foundSkus.length > 0) {
          try {
            const availRes = await fetch(`${IC_BASE_URL}/availability`, {
              method: "POST",
              headers: icHeaders,
              body: JSON.stringify({ skus: foundSkus.slice(0, 30) }),
            });
            if (availRes.ok) {
              const availData = await availRes.json();
              availability = Array.isArray(availData) ? availData : availData?.items || [];
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
            manufacturer: product.brandReference?.name || product.manufacturer || product.producerName || "",
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
          ? (resolved.clarificationQuestion || `Inter Cars nie znalazł dla numerów: ${resolved.oeNumbers.join(', ')}`)
          : null;

        return json({
          results: deduped,
          clarificationQuestion,
          searchedTerms: resolved.oeNumbers,
          aiResolved: true,
          partDescription: resolved.partDescription,
          confidence: resolved.confidence,
        });
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

        const orderRes = await fetch(`${IC_BASE_URL}/orders`, {
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
            orderId: orderData.orderId || orderData.id || "",
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
        const availRes = await fetch(`${IC_BASE_URL}/availability`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ skus: codes.slice(0, 30) }),
        });
        if (!availRes.ok) return json({ error: `Dostępność IC: HTTP ${availRes.status}` }, availRes.status);
        const data = await availRes.json();
        return json({ availability: Array.isArray(data) ? data : data?.items || [] });
      } catch (e) {
        return json({ error: `Błąd dostępności IC: ${e.message}` }, 500);
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
