import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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
      return json({ configured: !!integration && !!integration.api_username && integration.is_enabled });
    }

    if (!integration || !integration.api_username) {
      return json({ error: "Integration not configured" }, 400);
    }

    const baseUrl = integration.environment === "production" ? HART_PROD_URL : HART_SANDBOX_URL;

    if (supplier_code === "hart" || !supplier_code) {
      return await handleHart(supabase, baseUrl, integration, action, params, provider_id);
    }

    return json({ error: "Unsupported supplier" }, 400);
  } catch (err) {
    console.error("workshop-parts-api error:", err);
    return json({ error: err.message }, 500);
  }
});

async function handleHart(
  supabase: any,
  baseUrl: string,
  integration: any,
  action: string,
  params: any,
  providerId: string
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
    if (status === 401) return json({ error: "Błąd autoryzacji. Sprawdź dane API w ustawieniach." }, 401);
    return json({ error: `Hart auth failed: ${status}` }, status);
  }

  const authData = await authRes.json();
  const token = authData.access_token || authData.token;
  if (!token) return json({ error: "No token received from Hart" }, 500);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (integration.default_branch_id) {
    headers["BranchId"] = integration.default_branch_id;
  }

  switch (action) {
    case "test_connection": {
      // Update connection status
      await supabase
        .from("workshop_parts_integrations")
        .update({ last_connection_status: "ok", last_connection_at: new Date().toISOString() })
        .eq("id", integration.id);
      return json({ success: true, message: "Połączono z Hart API" });
    }

    case "search": {
      const query = params?.query;
      if (!query) return json({ error: "Missing search query" }, 400);
      
      const searchRes = await fetch(
        `${baseUrl}/v1/products/search?SearchPhrase=${encodeURIComponent(query)}&PageSize=50`,
        { headers }
      );
      if (!searchRes.ok) {
        if (searchRes.status === 429) return json({ error: "Przekroczono limit zapytań (50/min). Spróbuj za chwilę." }, 429);
        return json({ error: `Search failed: ${searchRes.status}` }, searchRes.status);
      }
      const data = await searchRes.json();
      return json({ results: data });
    }

    case "availability": {
      const codes = params?.codes;
      if (!codes?.length) return json({ error: "Missing product codes" }, 400);

      const queryStr = codes.map((c: string) => `HartCodes=${encodeURIComponent(c)}`).join("&");
      const avRes = await fetch(`${baseUrl}/v1/products/availability?${queryStr}`, { headers });
      if (!avRes.ok) return json({ error: `Availability check failed: ${avRes.status}` }, avRes.status);
      const data = await avRes.json();
      return json({ availability: data });
    }

    case "add_to_basket": {
      const positions = params?.positions;
      if (!positions?.length) return json({ error: "Missing positions" }, 400);

      const basketRes = await fetch(`${baseUrl}/v1/basket`, {
        method: "POST",
        headers,
        body: JSON.stringify({ orderPositions: positions }),
      });
      if (!basketRes.ok) return json({ error: `Add to basket failed: ${basketRes.status}` }, basketRes.status);
      const data = await basketRes.json();
      return json({ basket: data });
    }

    case "place_order": {
      const basketPositionIds = params?.basketPositionIds;
      if (!basketPositionIds?.length) return json({ error: "Missing basket position IDs" }, 400);

      const orderRes = await fetch(`${baseUrl}/v1/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify({ basketPositionIds }),
      });
      if (!orderRes.ok) return json({ error: `Order failed: ${orderRes.status}` }, orderRes.status);
      const data = await orderRes.json();
      return json({ order: data });
    }

    case "get_invoices": {
      const dateFrom = params?.dateFrom;
      const dateTo = params?.dateTo;
      const invRes = await fetch(
        `${baseUrl}/v1/documents/invoices?DateFrom=${dateFrom}&DateTo=${dateTo}`,
        { headers }
      );
      if (!invRes.ok) return json({ error: `Invoices fetch failed: ${invRes.status}` }, invRes.status);
      const data = await invRes.json();
      return json({ invoices: data });
    }

    default:
      return json({ error: `Unknown action: ${action}` }, 400);
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
