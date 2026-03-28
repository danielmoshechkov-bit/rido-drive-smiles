import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Auto Partner API URLs
const AP_SANDBOX_URL = "https://api.autopartner.com/api";
const AP_PROD_URL = "https://api.autopartner.com/api";

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

    // Generic supplier - just test connectivity to their API URL
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

// ==================== AUTO PARTNER ====================
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

  // Auto Partner uses SOAP-like REST API
  // Try multiple known API endpoints
  const apiUrls = [
    integration.api_url || "",
    "https://webservice.autopartner.com/CustomerAPI.svc/rest",
    "https://customerapi.autopartner.dev/CustomerAPI.svc/rest",
  ].filter(Boolean);

  const authBody = {
    clientCode: clientCode,
    wsPassword: wsPassword,
    clientPassword: clientPassword,
  };

  switch (action) {
    case "test_connection": {
      let lastError = "";
      for (const baseUrl of apiUrls) {
        try {
          console.log(`Testing Auto Partner at: ${baseUrl}/GetClientInfo`);
          
          // Try POST with JSON body (common for WCF REST)
          const testRes = await fetch(`${baseUrl}/GetClientInfo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(authBody),
          });

          const responseText = await testRes.text();
          console.log(`AP response (${testRes.status}): ${responseText.substring(0, 300)}`);

          if (testRes.ok || testRes.status === 200) {
            await supabase
              .from("workshop_parts_integrations")
              .update({ 
                last_connection_status: "ok", 
                last_connection_at: new Date().toISOString(),
                api_url: baseUrl, // Save working URL
              })
              .eq("id", integration.id);
            return json({ success: true, message: `Połączono z Auto Partner API (${baseUrl})` });
          }
          
          lastError = `HTTP ${testRes.status}: ${responseText.substring(0, 200)}`;
        } catch (e) {
          lastError = e.message;
          console.log(`AP error at ${baseUrl}: ${e.message}`);
        }
      }

      // Also try GET with query params as fallback
      for (const baseUrl of apiUrls) {
        try {
          const authParams = `clientCode=${encodeURIComponent(clientCode)}&wsPassword=${encodeURIComponent(wsPassword)}&clientPassword=${encodeURIComponent(clientPassword)}`;
          const testRes = await fetch(`${baseUrl}/GetClientInfo?${authParams}`, {
            method: "GET",
          });
          const responseText = await testRes.text();
          
          if (testRes.ok) {
            await supabase
              .from("workshop_parts_integrations")
              .update({ 
                last_connection_status: "ok", 
                last_connection_at: new Date().toISOString(),
                api_url: baseUrl,
              })
              .eq("id", integration.id);
            return json({ success: true, message: `Połączono z Auto Partner API` });
          }
          lastError = `GET ${testRes.status}: ${responseText.substring(0, 200)}`;
        } catch (e) {
          lastError = e.message;
        }
      }

      await supabase
        .from("workshop_parts_integrations")
        .update({ last_connection_status: "error", last_connection_at: new Date().toISOString() })
        .eq("id", integration.id);
      return json({ error: `Auto Partner: ${lastError}` }, 400);
    }

    case "search": {
      const query = params?.query;
      if (!query) return json({ error: "Brak frazy wyszukiwania" }, 400);

      const baseUrl = integration.api_url || apiUrls[0];
      try {
        const searchRes = await fetch(`${baseUrl}/SearchArticles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...authBody,
            searchPhrase: query,
            pageSize: 50,
            pageNumber: 1,
          }),
        });
        if (!searchRes.ok) {
          // Fallback to GET
          const authParams = `clientCode=${encodeURIComponent(clientCode)}&wsPassword=${encodeURIComponent(wsPassword)}&clientPassword=${encodeURIComponent(clientPassword)}`;
          const getRes = await fetch(
            `${baseUrl}/SearchArticles?${authParams}&searchPhrase=${encodeURIComponent(query)}&pageSize=50&pageNumber=1`
          );
          if (!getRes.ok) return json({ error: `Wyszukiwanie nie powiodło się: ${getRes.status}` }, getRes.status);
          const data = await getRes.json();
          return json({ results: data });
        }
        const data = await searchRes.json();
        return json({ results: data });
      } catch (e) {
        return json({ error: `Błąd wyszukiwania: ${e.message}` }, 500);
      }
    }

    case "availability": {
      const codes = params?.codes;
      if (!codes?.length) return json({ error: "Brak kodów produktów" }, 400);

      const baseUrl = integration.api_url || apiUrls[0];
      try {
        const avRes = await fetch(`${baseUrl}/GetArticlesAvailability`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...authBody, articleCodes: codes }),
        });
        if (!avRes.ok) return json({ error: `Dostępność: ${avRes.status}` }, avRes.status);
        const data = await avRes.json();
        return json({ availability: data });
      } catch (e) {
        return json({ error: `Błąd sprawdzania dostępności: ${e.message}` }, 500);
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
