// ============================================================================
// provider-services-extract — z opowieści usługodawcy („czym się zajmujecie")
// robi gotową listę usług: nazwa, kategoria, widełki cen, czas.
// Usługodawca opowiada (klawiatura albo mikrofon), a nie wypełnia formularza
// pozycja po pozycji. Ceny, których nie podał, zostawiamy puste — dopisze je
// jednym kliknięciem w panelu.
//
// Mózg = nasz Claude (ANTHROPIC_API_KEY z secure store). Dostęp: zalogowany.
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

const SYSTEM = `Zamieniasz swobodną wypowiedź właściciela firmy usługowej na listę konkretnych usług do cennika.

ZASADY:
- Każda usługa to osobna pozycja z krótką, zrozumiałą dla klienta nazwą (np. „Wymiana klocków hamulcowych", nie „hamulce").
- Kategoria to rodzaj działalności, do której należy usługa (np. Warsztat, Myjnia, Detailing, Opony, Lakiernictwo). Jeśli użytkownik podał własne kategorie — używaj DOKŁADNIE ich nazw. Nowe kategorie twórz tylko, gdy usługa naprawdę nie pasuje do żadnej istniejącej.
- Ceny: price_from i price_to w złotych, liczby bez waluty. Podaj TYLKO jeśli wynikają z wypowiedzi. Jeśli padła jedna kwota — wpisz ją w price_from, a price_to zostaw null. Jeśli cen nie było — oba null. NIGDY nie zgaduj cen.
- duration_minutes tylko jeśli użytkownik powiedział, ile to trwa. Inaczej null.
- short_description: jedno krótkie zdanie, tylko jeśli wypowiedź daje na to materiał. Inaczej pusty string.
- Nie powielaj usług, które użytkownik już ma (dostaniesz ich listę) — pomiń je.
- Nie dodawaj nic od siebie: jeśli o czymś nie mówił, tego nie ma.

ODPOWIADASZ WYŁĄCZNIE JSON-em (bez markdown, bez tekstu poza JSON):
{"services":[{"name":"...","category":"...","price_from":null,"price_to":null,"duration_minutes":null,"short_description":""}],"note":"<jedno zdanie po polsku: co zrozumiałeś / czego zabrakło>"}`;

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
    const text = String(body?.text || "").trim();
    if (text.length < 10) return json({ success: false, error: "Opowiedz coś więcej o swoich usługach" }, 400);
    const categories: string[] = Array.isArray(body?.categories) ? body.categories.filter((c: unknown) => typeof c === "string") : [];
    const existing: string[] = Array.isArray(body?.existing_services) ? body.existing_services.filter((s: unknown) => typeof s === "string") : [];

    const agent = await resolveAgent(admin, "provider_services_extract", "claude-haiku-4-5-20251001");
    const model = (agent?.model && agent.model.startsWith("claude")) ? agent.model : "claude-haiku-4-5-20251001";

    let system = SYSTEM;
    if (categories.length) system += `\n\nKATEGORIE UŻYTKOWNIKA (używaj tych nazw): ${categories.join(", ")}`;
    if (existing.length) system += `\n\nUSŁUGI, KTÓRE JUŻ MA (nie powtarzaj): ${existing.join(", ")}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 2000, temperature: 0.2, system,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      return json({ success: false, error: `Anthropic błąd ${aiRes.status}: ${t.slice(0, 200)}` }, 400);
    }
    const aiData = await aiRes.json();
    const raw = aiData?.content?.[0]?.text || "";

    let parsed: any = null;
    try {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      parsed = JSON.parse(s >= 0 && e >= 0 ? raw.slice(s, e + 1) : raw);
    } catch (_) {
      return json({ success: false, error: "Nie udało się odczytać odpowiedzi AI" }, 400);
    }

    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const services = (Array.isArray(parsed?.services) ? parsed.services : [])
      .map((s: any) => ({
        name: String(s?.name || "").trim().slice(0, 120),
        category: String(s?.category || "").trim().slice(0, 60),
        price_from: num(s?.price_from),
        price_to: num(s?.price_to),
        duration_minutes: num(s?.duration_minutes),
        short_description: String(s?.short_description || "").trim().slice(0, 200),
      }))
      .filter((s: any) => s.name);

    return json({ success: true, services, note: String(parsed?.note || ""), model });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
