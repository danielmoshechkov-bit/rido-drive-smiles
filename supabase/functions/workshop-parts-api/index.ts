import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Auto Partner SOAP API URLs
const AP_SANDBOX_URL = "https://sandbox.apcat.eu/webservice/index.php";
const AP_PROD_URL = "https://apcat.eu/webservice/index.php";

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

    // Verify user auth
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

    // Get integration config
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
        hasCredentials = !!extra.clientCode && integration?.is_enabled;
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

// ==================== SOAP HELPERS ====================
function buildSoapEnvelope(headerXml: string, bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="https://apcat.eu/webservice/">
  <soapenv:Header>
    ${headerXml}
  </soapenv:Header>
  <soapenv:Body>
    ${bodyXml}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildAuthHeader(clientCode: string, wsPassword: string): string {
  return `<web:AuthHeader>
      <web:ClientCode>${clientCode}</web:ClientCode>
      <web:WsPassword>${wsPassword}</web:WsPassword>
    </web:AuthHeader>`;
}

async function soapCall(url: string, soapAction: string, envelope: string): Promise<{ ok: boolean; text: string; status: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": soapAction,
    },
    body: envelope,
  });
  const text = await res.text();
  return { ok: res.ok, text, status: res.status };
}

function parseXml(xmlText: string) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlText, "text/xml");
}

// ==================== AUTO PARTNER (SOAP) ====================
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
    return json({ error: "Brak danych uwierzytelniających Auto Partner. Wypełnij: Client Code, WS Password, Client Password." }, 400);
  }

  const isSandbox = integration.environment !== "production";
  const baseUrl = isSandbox ? AP_SANDBOX_URL : AP_PROD_URL;
  const authHeader = buildAuthHeader(clientCode, wsPassword);

  switch (action) {
    case "test_connection": {
      try {
        const envelope = buildSoapEnvelope(
          authHeader,
          `<web:GetWarehouses>
            <web:clientPassword>${clientPassword}</web:clientPassword>
          </web:GetWarehouses>`
        );

        console.log(`Testing Auto Partner SOAP at: ${baseUrl}`);
        const result = await soapCall(baseUrl, "https://apcat.eu/webservice/GetWarehouses", envelope);
        console.log(`AP SOAP response (${result.status}): ${result.text.substring(0, 500)}`);

        // Check for SOAP Fault
        if (result.text.includes("Fault") || result.text.includes("faultstring")) {
          const doc = parseXml(result.text);
          const faultMsg = doc?.querySelector("faultstring")?.textContent || "Nieznany błąd SOAP";
          await supabase
            .from("workshop_parts_integrations")
            .update({ last_connection_status: "error", last_connection_at: new Date().toISOString() })
            .eq("id", integration.id);
          return json({ error: `Auto Partner: ${faultMsg}` }, 400);
        }

        if (result.ok || result.status === 200) {
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
        return json({ error: `Auto Partner HTTP ${result.status}: ${result.text.substring(0, 200)}` }, 400);
      } catch (e) {
        console.error("AP SOAP test error:", e);
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
        const envelope = buildSoapEnvelope(
          authHeader,
          `<web:GetItemsByNumber>
            <web:clientPassword>${clientPassword}</web:clientPassword>
            <web:number>${escapeXml(query)}</web:number>
          </web:GetItemsByNumber>`
        );

        const result = await soapCall(baseUrl, "https://apcat.eu/webservice/GetItemsByNumber", envelope);

        if (!result.ok && !result.text.includes("GetItemsByNumberResponse")) {
          return json({ error: `Wyszukiwanie Auto Partner: HTTP ${result.status}` }, result.status);
        }

        // Parse SOAP XML response into normalized JSON
        const items = parseAutoPartnerItems(result.text);
        return json({ results: items });
      } catch (e) {
        return json({ error: `Błąd wyszukiwania AP: ${e.message}` }, 500);
      }
    }

    case "availability": {
      const codes = params?.codes;
      if (!codes?.length) return json({ error: "Brak kodów produktów" }, 400);

      try {
        // Query availability for each code
        const allItems: any[] = [];
        for (const code of codes.slice(0, 20)) {
          const envelope = buildSoapEnvelope(
            authHeader,
            `<web:GetItemsByNumber>
              <web:clientPassword>${clientPassword}</web:clientPassword>
              <web:number>${escapeXml(code)}</web:number>
            </web:GetItemsByNumber>`
          );
          const result = await soapCall(baseUrl, "https://apcat.eu/webservice/GetItemsByNumber", envelope);
          const items = parseAutoPartnerItems(result.text);
          allItems.push(...items);
        }
        return json({ availability: allItems });
      } catch (e) {
        return json({ error: `Błąd dostępności AP: ${e.message}` }, 500);
      }
    }

    default:
      return json({ error: `Nieznana akcja: ${action}` }, 400);
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function parseAutoPartnerItems(xmlText: string): any[] {
  try {
    const doc = parseXml(xmlText);
    if (!doc) return [];

    const items: any[] = [];
    // Try to find Item elements in the response
    const itemNodes = doc.querySelectorAll("Item") || [];

    for (const node of itemNodes) {
      items.push({
        partNumber: node.querySelector("Number")?.textContent || node.querySelector("Code")?.textContent || "",
        name: node.querySelector("Name")?.textContent || node.querySelector("Description")?.textContent || "",
        price: parseFloat(node.querySelector("Price")?.textContent || node.querySelector("NetPrice")?.textContent || "0"),
        availability: node.querySelector("Availability")?.textContent || node.querySelector("Stock")?.textContent || "0",
        warehouse: node.querySelector("Warehouse")?.textContent || node.querySelector("WarehouseName")?.textContent || "",
        producer: node.querySelector("Producer")?.textContent || node.querySelector("Brand")?.textContent || "",
      });
    }

    // Fallback: try generic element names if no Item elements found
    if (items.length === 0) {
      const resultNodes = doc.querySelectorAll("GetItemsByNumberResult *") || [];
      // Return raw text for debugging
      console.log("AP raw response elements count:", resultNodes.length);
    }

    return items;
  } catch (e) {
    console.error("AP XML parse error:", e);
    return [];
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
  // Auth
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
