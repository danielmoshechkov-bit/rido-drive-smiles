// ============================================================================
// voice-company-interview — czat onboardingowy: wyciąga dane firmy z opisu lub
// strony WWW, dopytuje o braki, zwraca strukturalne pola business_context.
//
// Mózg = nasz Claude (ANTHROPIC_API_KEY z secure store/env, getSecret).
// Dostęp: zalogowany usługodawca. verify_jwt=false + getUser.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";
import { resolveAgent } from "../_shared/translationProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

// Pobierz tekst ze strony WWW (best-effort, z timeoutem). Zwraca skrócony tekst.
async function fetchSiteText(url: string): Promise<string | null> {
  try {
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(u, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 GetRidoBot" } });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 8000);
  } catch (_) {
    return null;
  }
}

const SYSTEM = `Jesteś przyjaznym asystentem, który pomaga właścicielowi firmy skonfigurować telefonicznego agenta głosowego AI. Twoim zadaniem jest zebrać dane o firmie do profilu agenta, prowadząc krótką, naturalną rozmowę po polsku (jak w komunikatorze).

Zbierasz te pola:
- company_name (nazwa firmy)
- description (czym się zajmuje)
- hours (godziny pracy)
- location (lokalizacja / adres)
- services (oferowane usługi — KAŻDA W NOWEJ LINII)
- agent_intro (jak agent ma się przedstawiać i w jakim celu dzwoni/odbiera)
- purpose (cel rozmów agenta)
- extra_info (dodatkowe: ceny orientacyjne, promocje, zasady)

ZASADY:
- Jeśli dostaniesz treść strony WWW lub długi opis — wyciągnij z nich ile się da i UZUPEŁNIJ pola.
- Dopytuj TYLKO o istotne braki, po jednym–dwa pytania na raz, krótko i konkretnie.
- Gdy masz komplet sensownych danych (przynajmniej nazwa, opis, usługi, cel) — ustaw "done": true i napisz krótkie podsumowanie z prośbą o sprawdzenie/edycję pól poniżej.
- NIE zmyślaj danych (godzin, adresu, cen). Jeśli czegoś nie wiesz — zapytaj albo zostaw puste.

ODPOWIADASZ WYŁĄCZNIE JSON-em (bez markdown, bez tekstu poza JSON):
{"reply": "<wiadomość do użytkownika po polsku>", "fields": {<tylko pola które ustaliłeś/zmieniłeś>}, "done": <true|false>}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Brak konfiguracji Supabase");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    let apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ success: false, error: "Brak klucza Anthropic (ANTHROPIC_API_KEY)" }, 400);
    apiKey = cleanKey(apiKey);

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const websiteUrl = typeof body?.website_url === "string" ? body.website_url : "";
    const currentContext = body?.current_context && typeof body.current_context === "object" ? body.current_context : null;

    // Model przełączalny w panelu (agent_id voice_company_interview); fallback Haiku.
    const agent = await resolveAgent(admin, "voice_company_interview", "claude-haiku-4-5-20251001");
    const model = (agent?.model && agent.model.startsWith("claude")) ? agent.model : "claude-haiku-4-5-20251001";

    let system = SYSTEM;
    if (currentContext && Object.values(currentContext).some((v) => typeof v === "string" && v.trim())) {
      system += `\n\n=== AKTUALNY PROFIL FIRMY (już zapamiętany) ===\n${JSON.stringify(currentContext)}\n` +
        `To jest pamięć firmy. UZUPEŁNIAJ i AKTUALIZUJ ją na podstawie tego, co pisze użytkownik — także późniejszych dodatków (promocje, akcje, zmiany godzin). ` +
        `Dla promocji/akcji czasowych DOPISUJ do pola extra_info wraz z terminami (od–do), NIE kasując wcześniejszych informacji (w "fields.extra_info" zwróć CAŁOŚĆ: dotychczasowe + nowe). ` +
        `Jeśli coś się zmienia (np. godziny) — zaktualizuj właściwe pole. Zwracaj w "fields" tylko pola, które faktycznie ustaliłeś lub zmieniłeś.`;
    }
    let siteFetched = false;
    if (websiteUrl) {
      const siteText = await fetchSiteText(websiteUrl);
      if (siteText && siteText.length > 50) {
        siteFetched = true;
        system += `\n\nTREŚĆ STRONY FIRMY (${websiteUrl}) — przeanalizuj ją i wyciągnij dane, a w "reply" napisz krótko co z niej wyczytałeś:\n${siteText}`;
      } else {
        system += `\n\n(Nie udało się pobrać treści ze strony ${websiteUrl} — napisz to użytkownikowi i poproś o krótki opis firmy.)`;
      }
    }

    // Anthropic wymaga, by historia zaczynała się od 'user'.
    const chat = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content }));
    while (chat.length && chat[0].role !== "user") chat.shift();
    if (chat.length === 0) chat.push({ role: "user", content: "Zacznijmy konfigurację mojego agenta." });

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1200, temperature: 0.3, system, messages: chat }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      return json({ success: false, error: `Anthropic błąd ${aiRes.status}: ${t.slice(0, 200)}` }, 400);
    }
    const aiData = await aiRes.json();
    const raw = aiData?.content?.[0]?.text || "";

    // Tolerancyjny parse JSON (wytnij od pierwszego { do ostatniego }).
    let parsed: any = null;
    try {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      parsed = JSON.parse(s >= 0 && e >= 0 ? raw.slice(s, e + 1) : raw);
    } catch (_) {
      parsed = { reply: raw || "Przepraszam, spróbuj jeszcze raz.", fields: {}, done: false };
    }

    const allowed = ["company_name", "description", "hours", "location", "services", "agent_intro", "purpose", "extra_info"];
    const fields: Record<string, string> = {};
    if (parsed?.fields && typeof parsed.fields === "object") {
      for (const k of allowed) if (typeof parsed.fields[k] === "string" && parsed.fields[k].trim()) fields[k] = parsed.fields[k];
    }

    return json({
      success: true,
      reply: String(parsed?.reply || ""),
      fields,
      done: !!parsed?.done,
      site_fetched: siteFetched,
      site_url: websiteUrl || null,
    });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
