import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callClaude(apiKey: string, prompt: string, maxTokens = 400): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Claude error:", res.status, err);
    throw new Error(`Claude API error: ${res.status}`);
  }

  const data = await res.json();
  return (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results = { titles_audited: 0, descriptions_generated: 0, errors: [] as string[] };

    // STEP 1: Audit titles
    const { data: titlesToAudit } = await supabase
      .from("agent_listings")
      .select("id, title, property_type, area_total, rooms_count, price, status")
      .is("ai_title_audit", null)
      .eq("status", "active")
      .limit(20);

    for (const listing of titlesToAudit || []) {
      try {
        const prompt = `Oceń tytuł ogłoszenia nieruchomości pod kątem SEO i zaproponuj lepszy.
Tytuł: "${listing.title}"
Parametry: ${listing.property_type || "mieszkanie"}, ${listing.area_total || "?"}m², ${listing.rooms_count || "?"} pokoi, ${listing.price || "?"}zł
Odpowiedz TYLKO JSON (bez markdown):
{
  "score": <1-10>,
  "issues": ["lista problemów"],
  "suggested_title": "nowy tytuł (40-60 znaków, zawiera typ+lokalizację+kluczowy parametr)",
  "reason": "krótkie uzasadnienie"
}`;

        const response = await callClaude(ANTHROPIC_API_KEY, prompt, 300);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const audit = JSON.parse(jsonMatch[0]);

        await supabase.from("seo_audit_results").insert({
          listing_id: listing.id,
          audit_type: "title",
          issue: (audit.issues || []).join("; "),
          suggestion: audit.suggested_title,
          score: audit.score,
          status: "pending",
        });

        await supabase
          .from("agent_listings")
          .update({ ai_title_audit: audit })
          .eq("id", listing.id);

        results.titles_audited++;
        // Rate limit
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        results.errors.push(`Title audit ${listing.id}: ${e.message}`);
      }
    }

    // STEP 2: Generate descriptions for listings without or with short descriptions
    const { data: needDesc } = await supabase
      .from("agent_listings")
      .select("id, title, property_type, area_total, rooms_count, floor, price, description, status")
      .eq("status", "active")
      .is("ai_seo_description", null)
      .limit(15);

    const shortDesc = (needDesc || []).filter(
      (l) => !l.description || l.description.split(/\s+/).length < 80
    );

    for (const listing of shortDesc) {
      try {
        const prompt = `Napisz opis SEO ogłoszenia nieruchomości (150-200 słów, po polsku).
Wymagania:
- Naturalny język, nie keyword-stuffing
- Zacznij od najważniejszego (typ + metraż)
- Zawrzyj: ${listing.property_type || "mieszkanie"}, ${listing.area_total || "?"}m², ${listing.rooms_count || "?"} pokoi
- Wymień atuty (przestronność, układ, standard)
- Zakończ call-to-action
Tytuł: ${listing.title}
Istniejący opis: ${listing.description || "brak"}
Odpowiedz TYLKO opisem, bez markdown, bez nagłówków.`;

        const desc = await callClaude(ANTHROPIC_API_KEY, prompt, 500);

        await supabase.from("seo_audit_results").insert({
          listing_id: listing.id,
          audit_type: "description",
          suggestion: desc.trim(),
          status: "pending",
        });

        results.descriptions_generated++;
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        results.errors.push(`Desc gen ${listing.id}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seo-agent error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
