import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const { text, categories } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return json({ error: "Opisz swoje usługi — potrzebuję trochę więcej tekstu." }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Brak konfiguracji AI (LOVABLE_API_KEY)." }, 500);

    const catList = Array.isArray(categories)
      ? (categories as { id: string; name: string }[]).map(c => `${c.id} = ${c.name}`).join("\n")
      : "";

    const system = `Jesteś asystentem GetRido. Z opisu firmy wyciągasz pozycje cennika usług.
Zwróć WYŁĄCZNIE JSON: {"services":[{"name":string,"short_description":string,"price_mode":"fixed"|"from"|"range"|"quote","price_from":number|null,"price_to":number|null,"duration_minutes":number|null,"category_id":string|null}]}
Zasady:
- nazwy usług po polsku, krótkie i konkretne (bez cen w nazwie),
- "od 100 zł" => price_mode "from"; "100-250 zł" => "range"; jedna cena => "fixed"; brak ceny => "quote" i price_from/price_to = null,
- ceny w złotych jako liczby (bez waluty),
- duration_minutes tylko jeśli podano czas,
- category_id wybierz TYLKO z listy poniżej (id), gdy pasuje; inaczej null.
Dostępne kategorie usługodawcy (id = nazwa):
${catList || "(brak)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: text.slice(0, 8000) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) return json({ error: "Za dużo zapytań — spróbuj za chwilę." }, 429);
    if (res.status === 402) return json({ error: "Brak środków AI w projekcie." }, 402);
    if (!res.ok) {
      const t = await res.text();
      console.error("AI error", res.status, t);
      return json({ error: "Błąd AI" }, 500);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const allowed = new Set(
      Array.isArray(categories) ? (categories as { id: string }[]).map(c => c.id) : [],
    );
    const services = (Array.isArray(parsed.services) ? parsed.services : [])
      .filter((s: any) => s && typeof s.name === "string" && s.name.trim())
      .slice(0, 40)
      .map((s: any) => ({
        name: String(s.name).trim().slice(0, 120),
        short_description: s.short_description ? String(s.short_description).slice(0, 200) : "",
        price_mode: ["fixed", "from", "range", "quote"].includes(s.price_mode) ? s.price_mode : "quote",
        price_from: Number.isFinite(Number(s.price_from)) && s.price_from !== null ? Number(s.price_from) : null,
        price_to: Number.isFinite(Number(s.price_to)) && s.price_to !== null ? Number(s.price_to) : null,
        duration_minutes: Number.isFinite(Number(s.duration_minutes)) && s.duration_minutes ? Number(s.duration_minutes) : null,
        category_id: s.category_id && allowed.has(s.category_id) ? s.category_id : null,
      }));

    return json({ services });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || "Błąd serwera" }, 500);
  }
});
