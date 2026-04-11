import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const IC_TOKEN_URL = "https://api.webapi.intercars.eu/oauth2/token";
const IC_CATALOG_BASE = "https://api.webapi.intercars.eu";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { action, provider_id, query: searchQuery } = body;

  if (!provider_id) return json({ error: "provider_id required" }, 400);

  // Fetch integration credentials
  const { data: integration, error: intError } = await supabase
    .from("ic_catalog_integrations")
    .select("*")
    .eq("provider_id", provider_id)
    .maybeSingle();

  if (intError) return json({ error: intError.message }, 500);
  if (!integration) return json({ error: "IC integration not configured for this provider" }, 400);

  // Token management
  async function getToken(): Promise<string> {
    // Check cached token
    if (integration.ic_access_token && integration.ic_token_expires_at) {
      const expiresAt = new Date(integration.ic_token_expires_at);
      if (expiresAt > new Date(Date.now() + 60000)) {
        return integration.ic_access_token;
      }
    }

    const tokenRes = await fetch(IC_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + btoa(integration.ic_client_id + ":" + integration.ic_client_secret),
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "default",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`IC OAuth failed: ${tokenRes.status} - ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

    // Cache token
    await supabase.from("ic_catalog_integrations").update({
      ic_access_token: tokenData.access_token,
      ic_token_expires_at: expiresAt.toISOString(),
    }).eq("provider_id", provider_id);

    integration.ic_access_token = tokenData.access_token;
    integration.ic_token_expires_at = expiresAt.toISOString();

    return tokenData.access_token;
  }

  // ── test_connection ──
  if (action === "test_connection") {
    try {
      const token = await getToken();
      const res = await fetch(`${IC_CATALOG_BASE}/ic/catalog/category`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept-Language": "pl",
          "Accept": "application/json",
          "User-Agent": "GetRido/1.0",
        },
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`IC API HTTP ${res.status}: ${errBody}`);
      }
      const cats = await res.json();
      const catCount = Array.isArray(cats) ? cats.length : 0;

      await supabase.from("ic_catalog_integrations")
        .update({ is_enabled: true, last_sync_status: "ok", last_sync_error: null })
        .eq("provider_id", provider_id);

      return json({
        success: true,
        message: `Połączono z Inter Cars. Znaleziono ${catCount} kategorii.`,
        categories: catCount,
      });
    } catch (err: any) {
      await supabase.from("ic_catalog_integrations")
        .update({ last_sync_status: "error", last_sync_error: err.message })
        .eq("provider_id", provider_id);
      return json({ error: err.message }, 400);
    }
  }

  // ── sync_catalog ──
  if (action === "sync_catalog") {
    try {
      await supabase.from("ic_catalog_integrations")
        .update({ last_sync_status: "syncing", last_sync_error: null })
        .eq("provider_id", provider_id);

      const token = await getToken();
      const headers = {
        "Authorization": `Bearer ${token}`,
        "Accept-Language": "pl",
        "Accept": "application/json",
        "User-Agent": "GetRido/1.0",
      };

      // 1. Get categories
      const catRes = await fetch(`${IC_CATALOG_BASE}/ic/catalog/category`, { headers });
      if (!catRes.ok) throw new Error(`Categories fetch failed: HTTP ${catRes.status}`);
      const categories: Array<{ categoryId: string; label: string }> = await catRes.json();

      let totalSynced = 0;

      // 2. For each category, paginate products
      for (const cat of categories) {
        let pageNumber = 0;
        let hasMore = true;

        while (hasMore) {
          const url = new URL(`${IC_CATALOG_BASE}/ic/catalog/products`);
          url.searchParams.set("categoryId", cat.categoryId);
          url.searchParams.set("pageSize", "100");
          url.searchParams.set("pageNumber", String(pageNumber));

          const prodRes = await fetch(url.toString(), { headers });

          if (prodRes.status === 429) {
            // Rate limited — wait and retry
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          if (!prodRes.ok) break;

          const prodData = await prodRes.json();
          const products = prodData.products || [];
          hasMore = prodData.hasNextPage === true;
          pageNumber++;

          if (products.length === 0) break;

          const rows = products.map((p: any) => ({
            provider_id,
            ic_sku: p.sku || p.SKU || p.index || "",
            ic_index: p.index || null,
            ic_tecdoc_id: p.tecDocId || p.tecdocIdentifier || null,
            name: p.name || p.description || p.shortDescription || "",
            description: p.shortDescription || p.description || null,
            manufacturer: p.manufacturer || p.brand || null,
            oe_number: p.oeNumber || p.oe || null,
            ean: Array.isArray(p.eans) ? p.eans[0] : (p.ean || null),
            category_id: cat.categoryId,
            category_label: cat.label,
            synced_at: new Date().toISOString(),
          })).filter((r: any) => r.ic_sku);

          if (rows.length > 0) {
            const { error: upsertErr } = await supabase.from("ic_parts_catalog")
              .upsert(rows, { onConflict: "provider_id,ic_sku", ignoreDuplicates: false });
            if (upsertErr) console.error("Upsert error:", upsertErr.message);
            totalSynced += rows.length;
          }
        }
      }

      await supabase.from("ic_catalog_integrations").update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_sync_error: null,
        catalog_size: totalSynced,
      }).eq("provider_id", provider_id);

      return json({ success: true, synced: totalSynced });
    } catch (err: any) {
      await supabase.from("ic_catalog_integrations")
        .update({ last_sync_status: "error", last_sync_error: err.message })
        .eq("provider_id", provider_id);
      return json({ error: err.message }, 500);
    }
  }

  // ── search_catalog ──
  if (action === "search_catalog") {
    const q = (searchQuery || "").trim();
    if (!q) return json({ results: [] });

    const { data, error: searchErr } = await supabase
      .from("ic_parts_catalog")
      .select("ic_sku, ic_index, ic_tecdoc_id, name, manufacturer, oe_number, category_label")
      .eq("provider_id", provider_id)
      .textSearch("search_vector", q, { type: "websearch" })
      .limit(30);

    if (searchErr) return json({ error: searchErr.message }, 500);
    return json({ results: data || [] });
  }

  return json({ error: "Unknown action: " + action }, 400);
});
