import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// GetRido — automatyczna mapa strony (sitemap.xml) dla całego portalu.
// Zawiera strony statyczne + wszystkie aktywne ogłoszenia i usługodawców.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE = "https://getrido.pl";

const STATIC_PATHS = [
  "/", "/uslugi", "/mapa", "/gielda", "/nieruchomosci", "/marketplace",
  "/warsztat", "/faktury", "/flota", "/kierowca-info", "/cennik", "/kontakt",
];

function urlEntry(loc: string, changefreq: string, priority: string, lastmod?: string | null) {
  return `  <url>\n    <loc>${BASE}${loc}</loc>\n${lastmod ? `    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>\n` : ""}    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const parts: string[] = STATIC_PATHS.map((p) => urlEntry(p, "daily", p === "/" ? "1.0" : "0.8"));

    const [providers, vehicles, realEstate] = await Promise.all([
      supabase.from("service_providers").select("id, updated_at").eq("status", "active").limit(5000),
      supabase.from("vehicle_listings").select("id, updated_at").eq("status", "active").limit(5000),
      supabase.from("real_estate_listings").select("id, updated_at").eq("status", "active").limit(5000),
    ]);

    for (const p of providers.data || []) {
      parts.push(urlEntry(`/uslugi/uslugodawca/${p.id}`, "weekly", "0.9", p.updated_at));
    }
    for (const v of vehicles.data || []) {
      parts.push(urlEntry(`/gielda/ogloszenie/${v.id}`, "weekly", "0.7", v.updated_at));
    }
    for (const r of realEstate.data || []) {
      parts.push(urlEntry(`/nieruchomosci/ogloszenie/${r.id}`, "weekly", "0.7", r.updated_at));
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join("\n")}\n</urlset>`;

    return new Response(xml, {
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    console.error("[sitemap]", e);
    return new Response(String(e), { status: 500, headers: corsHeaders });
  }
});
