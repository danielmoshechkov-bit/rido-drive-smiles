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

// ==================== HART (REST/JWT) — per doc v1.5 ====================
// Auth: POST /v1/auth → { access_token, expires_in }
// Products: GET /v1/products?HartCodes=X&Availability=true → { items: [{ value: {...}, isSuccess, errorMessage }] }
// Availability: GET /v1/products/availability?HartCodes=X → { items: [{ value: { hartCode, availabilityPerBranch: [...] }, isSuccess }] }
// Basket add: POST /v1/basket body: { orderPositions: [{ hartCode, quantity }] } → { value: { successfulOrders: [{ orderBufferPositionId }] }, isSuccess }
// Place order: POST /v1/orders body: { basketPositionIds: [number] } → { value: [{ orderId, ... }], isSuccess }
// Invoices: GET /v1/documents/invoices?DateFrom=X&DateTo=Y
// Corrections: GET /v1/documents/invoice-corrections?DateFrom=X&DateTo=Y
// Delivery notes: GET /v1/documents/delivery-notes?DateFrom=X&DateTo=Y

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

  // Build headers per doc: Authorization: Bearer <token>, optional BranchId
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  // BranchId header (optional) — ID from HART warehouse table (1=Opole, 16=Warszawa, 29=Gdańsk etc.)
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

      // Use AI to generate search variants
      const searchIntent = await buildSearchIntent(query, params);

      // Hart API only accepts HartCodes — filter to valid-looking codes
      // Hart codes format: "563 728", "ATE1234", "NGK-BKR6E" etc.
      const allTerms = uniqueStrings([query, ...searchIntent.queryVariants]);
      const hartCodes = allTerms.filter(looksLikeHartCode).slice(0, 10);

      console.log(`[HART] Search query="${query}", hartCodes=[${hartCodes.join(", ")}], allTerms=[${allTerms.join(", ")}]`);

      if (hartCodes.length === 0) {
        return json({
          results: [],
          clarificationQuestion: searchIntent.clarificationQuestion || "Dla HART podaj numer katalogowy produktu (np. '563 728') lub numer OE części.",
          searchedTerms: allTerms,
        });
      }

      // GET /v1/products?HartCodes=X&HartCodes=Y&Availability=true
      const queryParams = new URLSearchParams();
      hartCodes.forEach((code) => queryParams.append("HartCodes", code));
      queryParams.set("Availability", "true");

      const url = `${baseUrl}/v1/products?${queryParams.toString()}`;
      console.log(`[HART] GET ${url}`);

      const searchRes = await fetch(url, { headers });
      const searchText = await searchRes.text();
      console.log(`[HART] Search response: HTTP ${searchRes.status}, body length: ${searchText.length}`);

      if (searchRes.status === 429) return json({ error: "Limit zapytań Hart (50/min). Poczekaj chwilę." }, 429);
      if (searchRes.status === 404) {
        console.log("[HART] 404 — products not found");
        return json({ results: [], clarificationQuestion: searchIntent.clarificationQuestion, searchedTerms: hartCodes });
      }
      if (!searchRes.ok) {
        console.error(`[HART] Search error: HTTP ${searchRes.status}`, searchText.substring(0, 500));
        return json({ error: `Wyszukiwanie Hart: HTTP ${searchRes.status}` }, searchRes.status);
      }

      let data: any;
      try { data = JSON.parse(searchText); } catch (e) {
        console.error("[HART] Failed to parse search response:", searchText.substring(0, 500));
        return json({ error: "Nieprawidłowa odpowiedź z Hart API" }, 500);
      }

      // Parse items per doc v1.5:
      // items[].value.{ hartCode, name, supplierCode, unit, supplier, taxRate, onOrder, withdrawn, 
      //                  quantity, waitingTime, isPatent, isPriceForManyPieces, numberOfPiecesInPrice, sellingPrice, currency }
      // items[].isSuccess, items[].errorMessage
      const items = (data.items || [])
        .filter((i: any) => i.isSuccess && i.value && !i.value.withdrawn)
        .map((i: any) => {
          const v = i.value;
          return {
            partNumber: v.hartCode || "",
            name: v.name || "",
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

      console.log(`[HART] Found ${items.length} products from ${(data.items || []).length} raw items`);

      return json({
        results: items,
        clarificationQuestion: items.length === 0 ? searchIntent.clarificationQuestion : null,
        searchedTerms: hartCodes,
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

      // GET /v1/products/availability?HartCodes=X&HartCodes=Y
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

      let data: any;
      try { data = JSON.parse(avText); } catch {
        return json({ error: "Nieprawidłowa odpowiedź z Hart API (availability)" }, 500);
      }

      // Per doc: items[].value.{ hartCode, availabilityPerBranch: [{ branchId, branchCode, quantity, waitingTime, priority, description }] }
      const availability = (data.items || [])
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

      // POST /v1/basket body: { orderPositions: [{ hartCode: "string", quantity: number }] }
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

      let data: any;
      try { data = JSON.parse(basketText); } catch {
        return json({ error: "Nieprawidłowa odpowiedź z Hart (basket)" }, 500);
      }

      // Response per doc: { value: { successfulOrders: [{ orderBufferPositionId: number, orderedQuantity, availabilityInformation, isExchangeCost }], 
      //   expirationDate, productCode, productName, branchId, information }, isSuccess, errorMessage }
      if (data.isSuccess === false) {
        return json({ error: data.errorMessage || "Błąd dodawania do koszyka Hart" }, 400);
      }

      const successfulOrders = data.value?.successfulOrders || [];
      // orderBufferPositionId is a NUMBER per doc — ensure we keep it as number
      const basketPositionIds = successfulOrders.map((item: any) => Number(item.orderBufferPositionId));

      console.log(`[HART] Basket OK: ${basketPositionIds.length} positions added, IDs: [${basketPositionIds.join(", ")}]`);

      return json({
        basket: {
          ...data.value,
          basketPositionIds,
        },
      });
    }

    case "place_order": {
      const basketPositionIds = params?.basketPositionIds;
      if (!basketPositionIds?.length) return json({ error: "Brak pozycji koszyka" }, 400);

      // POST /v1/orders body: { basketPositionIds: [number] }
      // Ensure all IDs are numbers
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

      let data: any;
      try { data = JSON.parse(orderText); } catch {
        return json({ error: "Nieprawidłowa odpowiedź z Hart (orders)" }, 500);
      }

      // Response per doc: { value: [{ orderId, branchName, branchId, quantity, orderType, productId, hartCode, price, currency, message, replacementCosts, isSuccess }], isSuccess, errorMessage }
      if (data.isSuccess === false) {
        return json({ error: data.errorMessage || "Błąd składania zamówienia Hart" }, 400);
      }

      const orders = data.value || [];
      console.log(`[HART] Order placed: ${orders.length} items, orderIds: [${orders.map((o: any) => o.orderId).join(", ")}]`);

      return json({
        order: {
          orderId: orders[0]?.orderId || "",
          items: orders,
        },
      });
    }

    case "get_orders": {
      // GET /v1/orders with optional Page, Size, SortDirection
      const page = params?.page || 1;
      const size = params?.size || 20;
      const url = `${baseUrl}/v1/orders?Page=${page}&Size=${size}&SortDirection=DESC`;
      console.log(`[HART] GET ${url}`);

      const ordersRes = await fetch(url, { headers });
      if (!ordersRes.ok) {
        const errText = await ordersRes.text();
        return json({ error: `Lista zamówień Hart: HTTP ${ordersRes.status}` }, ordersRes.status);
      }
      const data = await ordersRes.json();
      return json({ orders: data.items || [], pagination: { totalPages: data.total_pages, currentPage: data.current_page, totalItems: data.total_items_count } });
    }

    case "get_invoices": {
      // GET /v1/documents/invoices?DateFrom=yyyy-MM-dd&DateTo=yyyy-MM-dd
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
      // GET /v1/documents/invoice-corrections?DateFrom=yyyy-MM-dd&DateTo=yyyy-MM-dd
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
      // GET /v1/documents/delivery-notes?DateFrom=yyyy-MM-dd&DateTo=yyyy-MM-dd
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
      // GET /v1/basket
      const url = `${baseUrl}/v1/basket`;
      console.log(`[HART] GET ${url}`);

      const bRes = await fetch(url, { headers });
      if (!bRes.ok) {
        const errText = await bRes.text();
        return json({ error: `Koszyk Hart: HTTP ${bRes.status}` }, bRes.status);
      }
      const data = await bRes.json();
      // Response: { value: { basketPositions: { items: [...], total_pages, ... }, basketSummary: { totalNetSellingPrice, totalGrossSellingPrice, basketCurrency, totalQuantity } }, isSuccess }
      return json({ basket: data.value || data });
    }

    case "delete_basket_position": {
      // DELETE /v1/basket/{PositionId}
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
      // PATCH /v1/basket/{PositionId} body: { quantity: number }
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
      // DELETE /v1/orders/{OrderId}
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

// Hart codes: "563 728", "ATE1234", "NGK-BKR6E", "000 001" etc.
// Must have at least one digit and be at least 3 chars. Can contain letters, digits, spaces, dashes, dots, slashes.
function looksLikeHartCode(query: string) {
  const value = String(query || "").trim();
  if (value.length < 3) return false;
  // Must contain at least one digit
  if (!/\d/.test(value)) return false;
  // Must look like a code (alphanumeric with optional separators), not a sentence
  // Reject if it has more than 2 consecutive lowercase letters (likely a word/description)
  if (/[a-ząćęłńóśźż]{3,}/i.test(value) && !/^[A-Z0-9]/.test(value)) return false;
  // Accept patterns like: "563 728", "ATE-1234", "NGK.BKR6E", "06A 115 561 B"
  if (/^[A-Za-z0-9][A-Za-z0-9\s\-./]{2,}$/.test(value)) return true;
  return false;
}

function getDefaultClarificationQuestion(query: string, params: any) {
  const value = String(query || "").toLowerCase();
  const vehicle = params?.vehicle || {};
  const needsSide = /(wahacz|amortyzator|spr[eę]żyn|dr[aą]żek|końc[oó]wk|zacisk|lampa|błotnik|piasta|p[oó]łoś|łożysk)/.test(value) && !/(lewy|prawy|lewa|prawa)/.test(value);
  const needsAxle = /(wahacz|amortyzator|spr[eę]żyn|dr[aą]żek|końc[oó]wk|tarcza|klock|piasta|łożysk)/.test(value) && !/(prz[oó]d|przedni|przednia|tył|tylny|tylna)/.test(value);

  if (needsSide && needsAxle) return "Doprecyzuj proszę, czy chodzi o lewą czy prawą stronę oraz przód czy tył auta.";
  if (needsSide) return "Doprecyzuj proszę, czy chodzi o lewą czy prawą stronę auta.";
  if (needsAxle) return "Doprecyzuj proszę, czy chodzi o przód czy tył auta.";
  if (!vehicle?.brand || !vehicle?.model) return "Dodaj markę i model pojazdu albo numer OE / katalogowy, żeby zawęzić wyszukiwanie części.";
  return null;
}

async function buildSearchIntent(query: string, params: any) {
  const normalizedQuery = String(query || "").trim();
  const fallbackClarification = getDefaultClarificationQuestion(normalizedQuery, params);

  if (!normalizedQuery) {
    return { queryVariants: [], clarificationQuestion: fallbackClarification };
  }

  if (looksLikeHartCode(normalizedQuery)) {
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

function json(data: any, _status = 200) {
  // Always return 200 to avoid supabase.functions.invoke throwing on non-2xx
  // Error info is in the response body (data.error field)
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
