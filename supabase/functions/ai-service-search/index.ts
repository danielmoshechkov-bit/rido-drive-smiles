import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// GetRido — AI wyszukiwarka po ofercie usługodawców.
// Klient pisze naturalnie ("wymiana rozrządu w Krakowie"), AI zamienia to na
// słowa kluczowe, a my przeszukujemy usługi wszystkich usługodawców.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

async function expandQuery(query: string): Promise<{ keywords: string[]; city: string | null; summary: string }> {
  const fallback = {
    keywords: query.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2),
    city: null as string | null,
    summary: `Wyniki dla: ${query}`,
  };
  if (!LOVABLE_API_KEY) return fallback;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Jesteś wyszukiwarką usług portalu GetRido (motoryzacja, dom, uroda, budowa, transport). " +
              'Zwróć WYŁĄCZNIE JSON: {"keywords":["..."],"city":"nazwa miasta lub null","summary":"jedno zdanie po polsku"}. ' +
              "keywords: 3-10 polskich słów/fraz (synonimy, warianty odmiany, nazwy części/usług) pasujących do zapytania.",
          },
          { role: "user", content: query },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    return {
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length ? parsed.keywords : fallback.keywords,
      city: parsed.city || null,
      summary: parsed.summary || fallback.summary,
    };
  } catch (_e) {
    return fallback;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { query, city } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ providerIds: [], services: [], summary: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { keywords, city: aiCity, summary } = await expandQuery(query.trim());
    const targetCity = city || aiCity;

    const orFilter = keywords
      .slice(0, 10)
      .map((k) => `name.ilike.%${k}%,description.ilike.%${k}%,short_description.ilike.%${k}%`)
      .join(",");

    const { data: services, error } = await supabase
      .from("provider_services")
      .select("id, provider_id, name, short_description, price_from, price_to")
      .eq("is_active", true)
      .or(orFilter)
      .limit(300);
    if (error) throw error;

    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];
    let providers: any[] = [];
    if (providerIds.length) {
      let q = supabase
        .from("service_providers")
        .select("id, company_name, short_name, company_city, latitude, longitude, rating_avg, rating_count")
        .in("id", providerIds)
        .eq("status", "active");
      if (targetCity) q = q.ilike("company_city", `%${targetCity}%`);
      const { data } = await q;
      providers = data || [];
    }

    const allowed = new Set(providers.map((p) => p.id));

    return new Response(
      JSON.stringify({
        summary,
        keywords,
        city: targetCity,
        providerIds: providers.map((p) => p.id),
        providers,
        services: (services || []).filter((s: any) => allowed.has(s.provider_id)),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ai-service-search]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
