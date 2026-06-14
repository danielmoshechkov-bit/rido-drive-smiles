// ============================================================================
// voice-agent-simulate — TRENING agenta przez symulację (self-play).
// Symulowany KLIENT (Claude) rozmawia z naszym AGENTEM (voice-agent-chat, tryb
// dry_run — bez zapisu fałszywych zleceń). Po rozmowie voice-call-analyze wyciąga
// błędy i dopisuje reguły do voice_agent_knowledge. Agent uczy się sprzedawać/umawiać.
//
// 1 symulacja na wywołanie (front pętli batch). Auth: user-owner lub service-role.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

const SCENARIOS = [
  "klient ze stukami w zawieszeniu, niezdecydowany, pyta o cenę",
  "klient po stłuczce, chce wycenę naprawy blacharskiej, trochę zdenerwowany",
  "klient chce wymianę oleju i przegląd, spieszy się",
  "klient pyta o detailing i powłokę ceramiczną, porównuje oferty",
  "klient z kontrolką silnika, nie wie co to, potrzebuje diagnostyki",
  "klient pyta czy robicie jego markę (np. Tesla), sceptyczny",
  "klient chce umówić na konkretny dzień, ale termin zajęty — trzeba zaproponować inny",
  "klient dzwoni po rosyjsku / ukraińsku, pyta o naprawę",
  "klient grzeczny ale małomówny, trzeba dopytać o szczegóły",
  "klient pyta o lawetę/pomoc drogową bo auto nie odpala",
];

async function anthropic(apiKey: string, model: string, system: string, messages: any[], maxTokens = 300) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.8, system, messages }),
  });
  if (!r.ok) return "";
  return (await r.json())?.content?.[0]?.text || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    let providerId = String(body?.provider_id || "");
    const personaKey = String(body?.persona_key || "workshop_secretary");
    const seed = Number(body?.seed) || 0;

    const isServiceCall = authHeader === `Bearer ${serviceRoleKey}`;
    if (!isServiceCall) {
      if (!authHeader) return json({ ok: false, error: "Brak autoryzacji" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: aerr } = await userClient.auth.getUser();
      if (aerr || !user) return json({ ok: false, error: "Brak autoryzacji" }, 401);
      if (!providerId) {
        const { data: sp } = await admin.from("service_providers").select("id").eq("user_id", user.id).maybeSingle();
        providerId = sp?.id || "";
      }
    }
    if (!providerId) return json({ ok: false, error: "Brak provider_id" }, 400);

    let apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, error: "Brak klucza Anthropic" }, 400);
    apiKey = cleanKey(apiKey);

    const cfg = (await admin.from("voice_agent_configs")
      .select("business_context, display_name, languages, calendar_access, orders_access")
      .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle()).data;

    const scenario = String(body?.scenario || SCENARIOS[(seed + Math.floor(Date.now() / 1000)) % SCENARIOS.length]);
    const custSystem = `Jesteś KLIENTEM dzwoniącym do firmy usługowej (warsztat/detailing). Scenariusz: ${scenario}. Mów krótko, naturalnie, po polsku (chyba że scenariusz mówi inaczej). Zachowuj się realistycznie — czasem dopytaj o cenę albo zgłoś wątpliwość. Podaj swoje dane (imię, telefon, markę/model/nr rej) dopiero gdy agent zapyta. Gdy wizyta jest umówiona i wszystko jasne, podziękuj i napisz na końcu [KONIEC].`;

    // mózg agenta (dry-run narzędzi — bez zapisu)
    const agentTurn = async (convo: any[]) => {
      const r = await fetch(`${supabaseUrl}/functions/v1/voice-agent-chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId, persona_key: personaKey, test_mode: true, dry_run_tools: true,
          messages: convo,
          business_context: cfg?.business_context || {}, display_name: cfg?.display_name || "",
          languages: cfg?.languages || ["pl"], calendar_access: !!cfg?.calendar_access, orders_access: !!cfg?.orders_access,
        }),
      });
      const d = await r.json().catch(() => ({}));
      return d?.reply || "";
    };

    const convo: any[] = [];
    const MAX = 7;
    // agent wita pierwszy
    let agentReply = await agentTurn(convo);
    if (agentReply) convo.push({ role: "assistant", content: agentReply });
    for (let i = 0; i < MAX; i++) {
      // klient odpowiada (z perspektywy klienta: agent=user)
      const custMsgs = convo.map((m) => ({ role: m.role === "assistant" ? "user" : "assistant", content: m.content }));
      const cust = await anthropic(apiKey, "claude-haiku-4-5-20251001", custSystem, custMsgs.length ? custMsgs : [{ role: "user", content: "[odbierasz telefon od agenta]" }]);
      if (!cust) break;
      const ended = /\[KONIEC\]/i.test(cust);
      convo.push({ role: "user", content: cust.replace(/\[KONIEC\]/i, "").trim() });
      if (ended) break;
      agentReply = await agentTurn(convo);
      if (!agentReply) break;
      convo.push({ role: "assistant", content: agentReply });
    }

    // analiza + nauka
    let analysis: any = {};
    try {
      const ar = await fetch(`${supabaseUrl}/functions/v1/voice-call-analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, persona_key: personaKey, messages: convo, is_test: true }),
      });
      analysis = await ar.json().catch(() => ({}));
    } catch (_) { /* ignore */ }

    return json({
      ok: true, scenario, turns: convo.length,
      outcome: analysis?.outcome || null, lessons_learned: analysis?.lessons_learned || 0,
      mistakes: analysis?.mistakes || [],
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
