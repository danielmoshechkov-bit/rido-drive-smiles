import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Auto Partner REST API URLs
const AP_SANDBOX_URL = "https://customerapitest.autopartner.dev/CustomerAPI.svc/rest";
const AP_PROD_URL = "https://customerapi.autopartner.dev/CustomerAPI.svc/rest";

// Hart API URLs
const HART_SANDBOX_URL = "https://sandbox.restapi.hartphp.com.pl";
const HART_PROD_URL = "https://restapi.hartphp.com.pl";

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
    const { action, provider_id, supplier_code, params } = body;

    const { data: integration, error: intErr } = await supabase
      .from("workshop_parts_integrations")
      .select("*")
      .eq("provider_id", provider_id)
      .eq("supplier_code", supplier_code || "hart")
      .single();

    if (action === "check_config") {
      let hasCredentials = false;
      if (supplier_code === "auto_partner") {
        const extra = integration?.api_extra_json || {};
        hasCredentials = !!extra.clientCode && !!extra.wsPassword && !!extra.clientPassword && integration?.is_enabled;
      } else {
        hasCredentials = !!integration?.api_username && integration?.is_enabled;
      }
      return json({ configured: hasCredentials });
    }

    if (!integration) {
      return json({ error: "Integracja nie została skonfigurowana. Włącz hurtownię i zapisz dane." }, 400);
    }

    if (supplier_code === "auto_partner") {
      return await handleAutoPartner(supabase, integration, action, params);
    }

    if (supplier_code === "hart" || !supplier_code) {
      const baseUrl = integration.environment === "production" ? HART_PROD_URL : HART_SANDBOX_URL;
      return await handleHart(supabase, baseUrl, integration, action, params);
    }

    // Generic supplier
    if (action === "test_connection" && integration.api_url) {
      try {
        const testRes = await fetch(integration.api_url, { method: "GET" });
        await supabase
          .from("workshop_parts_integrations")
          .update({ last_connection_status: testRes.ok ? "ok" : "error", last_connection_at: new Date().toISOString() })
          .eq("id", integration.id);
        if (testRes.ok) return json({ success: true, message: `Połączono z ${supplier_code}` });
        return json({ error: `${supplier_code} returned ${testRes.status}` }, testRes.status);
      } catch (e) {
        await supabase
          .from("workshop_parts_integrations")
          .update({ last_connection_status: "error", last_connection_at: new Date().toISOString() })
          .eq("id", integration.id);
        return json({ error: `Nie można połączyć: ${e.message}` }, 500);
      }
    }

    return json({ error: "Nieobsługiwany dostawca: " + supplier_code }, 400);
  } catch (err) {
    console.error("workshop-parts-api error:", err);
    return json({ error: err.message }, 500);
  }
});

// ==================== AUTO PARTNER (REST/JSON) ====================
async function handleAutoPartner(
  supabase: any,
  integration: any,
  action: string,
  params: any,
) {
  const extra = integration.api_extra_json || {};
  const clientCode = extra.clientCode;
  const wsPassword = extra.wsPassword;
  const clientPassword = extra.clientPassword;

  if (!clientCode || !wsPassword || !clientPassword) {
    return json({ error: "Brak danych AP. Uzupełnij ClientCode, WS Password i Client Password." }, 400);
  }

  const isSandbox = integration.environment !== "production";
  const baseUrl = isSandbox ? AP_SANDBOX_URL : AP_PROD_URL;

  const credentials = { clientCode, wsPassword, clientPassword };

  switch (action) {
    case "test_connection": {
      try {
        const res = await fetch(`${baseUrl}/Logistic`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });

        const responseText = await res.text();
        console.log("AP REST test response status:", res.status);
        console.log("AP REST test response body:", responseText);

        let data: any;
        try { data = JSON.parse(responseText); } catch { data = null; }

        // Check for auth error (ErrorCode "02")
        const result = data?.RestLogisticResult || data;
        if (result?.ErrorCode === "02" || result?.ErrorCode === 2) {
          await supabase
            .from("workshop_parts_integrations")
            .update({ last_connection_status: "error", last_connection_at: new Date().toISOString() })
            .eq("id", integration.id);
          return json({ error: "Błąd autoryzacji Auto Partner. Sprawdź ClientCode, WS Password i Client Password." }, 400);
        }

        if (res.ok && data?.RestLogisticResult && (!result?.ErrorCode || result?.ErrorCode === "" || result?.ErrorCode === null)) {
          await supabase
            .from("workshop_parts_integrations")
            .update({
              last_connection_status: "ok",
              last_connection_at: new Date().toISOString(),
              api_url: baseUrl,
            })
            .eq("id", integration.id);
          return json({ success: true, message: `Połączono z Auto Partner (${isSandbox ? "Sandbox" : "Produkcja"})` });
        }

        await supabase
          .from("workshop_parts_integrations")
          .update({ last_connection_status: "error", last_connection_at: new Date().toISOString() })
          .eq("id", integration.id);
        return json({ error: `Auto Partner HTTP ${res.status}: ${responseText.substring(0, 300)}` }, 400);
      } catch (e) {
        console.error("AP REST test error:", e);
        await supabase
          .from("workshop_parts_integrations")
          .update({ last_connection_status: "error", last_connection_at: new Date().toISOString() })
          .eq("id", integration.id);
        return json({ error: `Nie można połączyć z Auto Partner: ${e.message}` }, 500);
      }
    }

    case "search": {
      const query = params?.query;
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);

      try {
        const res = await fetch(`${baseUrl}/ProductsAvailabilityV2`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...credentials,
            products: [{ productCode: query, quantity: 1 }],
            onlySite: false,
          }),
        });

        const responseText = await res.text();
        console.log("AP search response status:", res.status);

        if (!res.ok) {
          return json({ error: `Wyszukiwanie Auto Partner: HTTP ${res.status}` }, res.status);
        }

        let data: any;
        try { data = JSON.parse(responseText); } catch { return json({ results: [] }); }

        const availability = data?.RestProductsAvailabilityV2Result?.Availability || [];
        const results = availability.map((item: any) => {
          const totalStock = (item.States || []).reduce((sum: number, s: any) => sum + (s.InStock || 0), 0);
          const warehouses = (item.States || []).map((s: any) => s.WarehouseType || "").filter(Boolean).join(", ");
          return {
            partNumber: item.ProductCode || "",
            name: item.ProductCode || "",
            price: item.Price || 0,
            retailPrice: item.Pr || 0,
            availability: totalStock,
            warehouse: warehouses,
            producer: "",
            currency: item.CurrencyCode || "PLN",
            isBlocked: item.IsBlocked || false,
          };
        });

        return json({ results });
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
          body: JSON.stringify({
            ...credentials,
            products,
            onlySite: false,
          }),
        });

        if (!res.ok) {
          return json({ error: `Dostępność AP: HTTP ${res.status}` }, res.status);
        }

        const data = await res.json();
        const availability = data?.RestProductsAvailabilityV2Result?.Availability || [];
        return json({ availability });
      } catch (e) {
        return json({ error: `Błąd dostępności AP: ${e.message}` }, 500);
      }
    }

    default:
      return json({ error: `Nieznana akcja: ${action}` }, 400);
  }
}

// ==================== HART ====================
async function handleHart(
  supabase: any,
  baseUrl: string,
  integration: any,
  action: string,
  params: any,
) {
  const authRes = await fetch(`${baseUrl}/v1/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: integration.api_username,
      password: integration.api_password,
    }),
  });

  if (!authRes.ok) {
    const status = authRes.status;
    if (status === 401) return json({ error: "Błąd autoryzacji Hart. Sprawdź login i hasło." }, 401);
    return json({ error: `Hart auth: ${status}` }, status);
  }

  const authData = await authRes.json();
  const token = authData.access_token || authData.token;
  if (!token) return json({ error: "Nie otrzymano tokenu z Hart API" }, 500);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (integration.default_branch_id) {
    headers["BranchId"] = integration.default_branch_id;
  }

  switch (action) {
    case "test_connection": {
      await supabase
        .from("workshop_parts_integrations")
        .update({ last_connection_status: "ok", last_connection_at: new Date().toISOString() })
        .eq("id", integration.id);
      return json({ success: true, message: "Połączono z Hart API" });
    }

    case "search": {
      const query = params?.query;
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);
      const searchRes = await fetch(
        `${baseUrl}/v1/products/search?SearchPhrase=${encodeURIComponent(query)}&PageSize=50`,
        { headers }
      );
      if (!searchRes.ok) {
        if (searchRes.status === 429) return json({ error: "Limit zapytań (50/min). Spróbuj za chwilę." }, 429);
        return json({ error: `Wyszukiwanie: ${searchRes.status}` }, searchRes.status);
      }
      return json({ results: await searchRes.json() });
    }

    case "availability": {
      const codes = params?.codes;
      if (!codes?.length) return json({ error: "Brak kodów" }, 400);
      const queryStr = codes.map((c: string) => `HartCodes=${encodeURIComponent(c)}`).join("&");
      const avRes = await fetch(`${baseUrl}/v1/products/availability?${queryStr}`, { headers });
      if (!avRes.ok) return json({ error: `Dostępność: ${avRes.status}` }, avRes.status);
      return json({ availability: await avRes.json() });
    }

    case "add_to_basket": {
      const positions = params?.positions;
      if (!positions?.length) return json({ error: "Brak pozycji" }, 400);
      const basketRes = await fetch(`${baseUrl}/v1/basket`, {
        method: "POST", headers,
        body: JSON.stringify({ orderPositions: positions }),
      });
      if (!basketRes.ok) return json({ error: `Koszyk: ${basketRes.status}` }, basketRes.status);
      return json({ basket: await basketRes.json() });
    }

    case "place_order": {
      const basketPositionIds = params?.basketPositionIds;
      if (!basketPositionIds?.length) return json({ error: "Brak pozycji koszyka" }, 400);
      const orderRes = await fetch(`${baseUrl}/v1/orders`, {
        method: "POST", headers,
        body: JSON.stringify({ basketPositionIds }),
      });
      if (!orderRes.ok) return json({ error: `Zamówienie: ${orderRes.status}` }, orderRes.status);
      return json({ order: await orderRes.json() });
    }

    case "get_invoices": {
      const { dateFrom, dateTo } = params || {};
      const invRes = await fetch(`${baseUrl}/v1/documents/invoices?DateFrom=${dateFrom}&DateTo=${dateTo}`, { headers });
      if (!invRes.ok) return json({ error: `Faktury: ${invRes.status}` }, invRes.status);
      return json({ invoices: await invRes.json() });
    }

    default:
      return json({ error: `Nieznana akcja: ${action}` }, 400);
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
