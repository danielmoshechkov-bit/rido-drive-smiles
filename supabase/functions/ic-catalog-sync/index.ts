import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const IC_TOKEN_URL = "https://api.webapi.intercars.eu/oauth2/token";
const IC_CATALOG_BASE = "https://api.webapi.intercars.eu";
const IC_LIVE_SEARCH_PARAMS = ["phrase", "searchText", "text", "query", "name"] as const;

type CatalogResult = {
  ic_sku: string;
  ic_index: string | null;
  ic_tecdoc_id: string | null;
  name: string;
  manufacturer: string | null;
  oe_number: string | null;
  category_label: string | null;
  image_url?: string | null;
};

function normalizeSearchQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bwachzae\b/g, "wahacz")
    .replace(/\bwachacz\b/g, "wahacz")
    .replace(/\bwachacze\b/g, "wahacz")
    .replace(/\bwahacze\b/g, "wahacz")
    .replace(/\bwachlacz\b/g, "wahacz")
    .replace(/\brpzednie\b/g, "przedni")
    .replace(/\brpzedni\b/g, "przedni")
    .replace(/\bprzednie\b/g, "przedni")
    .replace(/\btylnie\b/g, "tylny")
    .replace(/\blewe\b/g, "lewy")
    .replace(/\bprawe\b/g, "prawy");
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function buildTecdocImageUrl(tecdocId: string | null | undefined) {
  return tecdocId
    ? `https://webservice.tecalliance.services/pegasus-3-0/img/A/${encodeURIComponent(tecdocId)}`
    : null;
}

function sanitizeIlikeToken(token: string) {
  return String(token || "")
    .trim()
    .toLowerCase()
    .replace(/[%_,']/g, "")
    .replace(/\s+/g, " ");
}

function getSearchTokens(query: string) {
  return normalizeSearchQuery(query)
    .split(/\s+/)
    .map(sanitizeIlikeToken)
    .filter((token) => token.length >= 3);
}

function scoreCatalogRow(row: Partial<CatalogResult>, query: string) {
  const normalizedQuery = normalizeSearchQuery(query);
  const tokens = getSearchTokens(query);
  const haystack = [row.name, row.manufacturer, row.category_label, row.ic_index, row.oe_number]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;

  if (normalizedQuery && row.name?.toLowerCase().includes(normalizedQuery)) score += 20;
  if (normalizedQuery && haystack.includes(normalizedQuery)) score += 12;

  for (const token of tokens) {
    if (row.name?.toLowerCase().includes(token)) score += 8;
    if (row.manufacturer?.toLowerCase().includes(token)) score += 3;
    if (row.category_label?.toLowerCase().includes(token)) score += 2;
    if (row.ic_index?.toLowerCase().includes(token)) score += 10;
    if (row.oe_number?.toLowerCase().includes(token)) score += 10;
  }

  if (row.ic_tecdoc_id) score += 1;
  return score;
}

function rankCatalogRows(rows: CatalogResult[], query: string) {
  const deduped = new Map<string, CatalogResult>();

  for (const row of rows) {
    const key = row.ic_sku || row.ic_index || row.oe_number || row.name;
    if (!key || deduped.has(key)) continue;
    deduped.set(key, {
      ...row,
      image_url: row.image_url || buildTecdocImageUrl(row.ic_tecdoc_id),
    });
  }

  const ranked = [...deduped.values()]
    .map((row) => ({ row, score: scoreCatalogRow(row, query) }))
    .filter(({ row, score }) => row.name || score > 0)
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name, "pl"))
    .slice(0, 30)
    .map(({ row }) => row);

  return ranked;
}

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

  const { data: wholesalerIntegration, error: wholesalerError } = await supabase
    .from("workshop_parts_integrations")
    .select("*")
    .eq("provider_id", provider_id)
    .eq("supplier_code", "inter_cars")
    .maybeSingle();

  if (wholesalerError) return json({ error: wholesalerError.message }, 500);
  if (!integration && action !== "search_catalog") return json({ error: "IC integration not configured for this provider" }, 400);

  // Token management
  async function getToken(): Promise<string> {
    const clientId = integration?.ic_client_id || wholesalerIntegration?.api_extra_json?.clientId;
    const clientSecret = integration?.ic_client_secret || wholesalerIntegration?.api_extra_json?.clientSecret;

    if (!clientId || !clientSecret) {
      throw new Error("Brak danych dostępowych Inter Cars");
    }

    // Check cached token
    if (integration?.ic_access_token && integration?.ic_token_expires_at) {
      const expiresAt = new Date(integration.ic_token_expires_at);
      if (expiresAt > new Date(Date.now() + 60000)) {
        return integration.ic_access_token;
      }
    }

    const tokenRes = await fetch(IC_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + btoa(clientId + ":" + clientSecret),
        "Accept": "application/json",
        "User-Agent": "GetRido/1.0",
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
    if (integration) {
      await supabase.from("ic_catalog_integrations").update({
        ic_access_token: tokenData.access_token,
        ic_token_expires_at: expiresAt.toISOString(),
      }).eq("provider_id", provider_id);

      integration.ic_access_token = tokenData.access_token;
      integration.ic_token_expires_at = expiresAt.toISOString();
    }

    return tokenData.access_token;
  }

  async function searchLocalCatalog(query: string): Promise<CatalogResult[]> {
    const normalizedQuery = normalizeSearchQuery(query);
    const searchQueries = uniqueStrings([query, normalizedQuery]);
    const localResults: CatalogResult[] = [];

    for (const searchTerm of searchQueries) {
      const { data, error: searchErr } = await supabase
        .from("ic_parts_catalog")
        .select("ic_sku, ic_index, ic_tecdoc_id, name, manufacturer, oe_number, category_label")
        .eq("provider_id", provider_id)
        .textSearch("search_vector", searchTerm, { type: "websearch" })
        .limit(30);

      if (searchErr) throw searchErr;
      if (data?.length) localResults.push(...data);
    }

    if (localResults.length > 0) {
      return rankCatalogRows(localResults, query);
    }

    const tokens = getSearchTokens(query);
    const primaryToken = tokens.find((token) => !["lewy", "prawy", "przedni", "tylny", "dolny", "gorny", "górny"].includes(token)) || tokens[0];
    if (!primaryToken) return [];

    const { data: fallbackData, error: fallbackErr } = await supabase
      .from("ic_parts_catalog")
      .select("ic_sku, ic_index, ic_tecdoc_id, name, manufacturer, oe_number, category_label")
      .eq("provider_id", provider_id)
      .or(`name.ilike.%${primaryToken}%,manufacturer.ilike.%${primaryToken}%,category_label.ilike.%${primaryToken}%,ic_index.ilike.%${primaryToken}%,oe_number.ilike.%${primaryToken}%`)
      .limit(80);

    if (fallbackErr) throw fallbackErr;
    return rankCatalogRows((fallbackData || []) as CatalogResult[], query);
  }

  async function searchLiveCatalog(query: string): Promise<CatalogResult[]> {
    if (!integration && !wholesalerIntegration) return [];

    const token = await getToken();
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept-Language": "pl",
      "Accept": "application/json",
      "User-Agent": "GetRido/1.0",
    };

    const liveRows: CatalogResult[] = [];
    const terms = uniqueStrings([query, normalizeSearchQuery(query)]);

    outer: for (const term of terms) {
      for (const param of IC_LIVE_SEARCH_PARAMS) {
        const url = new URL(`${IC_CATALOG_BASE}/ic/catalog/products`);
        url.searchParams.set(param, term);
        url.searchParams.set("pageSize", "24");
        url.searchParams.set("pageNumber", "0");

        const response = await fetch(url.toString(), { headers });
        if (!response.ok) continue;

        const data = await response.json();
        const products = Array.isArray(data) ? data : data?.items || data?.products || [];
        if (!products.length) continue;

        liveRows.push(...products.map((product: any) => {
          const tecdocId = product.tecDocId || product.tecdocId || product.tecdocIdentifier || null;
          return {
            ic_sku: product.sku || product.SKU || product.index || product.towkod || "",
            ic_index: product.index || null,
            ic_tecdoc_id: tecdocId,
            name: product.name || product.description || product.shortDescription || "",
            manufacturer: product.brandReference?.name || product.manufacturer || product.brand || product.producerName || null,
            oe_number: product.oeNumber || product.oe || (Array.isArray(product.oeNumbers) ? product.oeNumbers[0] : null),
            category_label: product.category?.label || product.categoryLabel || product.groupName || null,
            image_url: product.imageUrl || buildTecdocImageUrl(tecdocId),
          } satisfies CatalogResult;
        }).filter((row: CatalogResult) => row.ic_sku || row.name));

        if (liveRows.length >= 12) break outer;
      }
    }

    return rankCatalogRows(liveRows, query);
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

    try {
      const queries = uniqueStrings([q, normalizeSearchQuery(q)]);
      let results: CatalogResult[] = [];

      for (const searchTerm of queries) {
        const localResults = await searchLocalCatalog(searchTerm);
        results.push(...localResults);
        if (results.length >= 8) break;
      }

      results = rankCatalogRows(results, q);

      if (results.length === 0) {
        for (const searchTerm of queries) {
          const liveResults = await searchLiveCatalog(searchTerm);
          results.push(...liveResults);
          if (results.length >= 8) break;
        }
        results = rankCatalogRows(results, q);
      }

      return json({ results });
    } catch (err: any) {
      return json({ error: err.message || "IC catalog search failed" }, 500);
    }
  }

  return json({ error: "Unknown action: " + action }, 400);
});
