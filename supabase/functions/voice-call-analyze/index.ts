// ============================================================================
// voice-call-analyze — WARSTWA UCZENIA. Po rozmowie analizuje cały przebieg,
// wyciąga wynik + wnioski + BŁĘDY agenta i destyluje REGUŁY na przyszłość.
// Zapisuje: voice_calls + voice_transcripts + voice_call_outcomes, a w trybie
// per_call dopisuje reguły do voice_agent_knowledge (agent uczy się z każdej rozmowy).
//
// Mózg: agent voice_call_analyzer (Haiku) przez resolveAgent. Klucz ANTHROPIC z
// secure store. Auth: user-owner providera lub service-role (telefonia).
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";
import { resolveAgent } from "../_shared/translationProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

const SYSTEM = `Jesteś trenerem agenta głosowego. Otrzymujesz transkrypt rozmowy telefonicznej (agent AI <-> klient). Przeanalizuj CAŁOŚĆ i zwróć WYŁĄCZNIE JSON:
{
 "outcome": "booked|sold|refused|callback|no_interest|info_only|other",
 "summary": "krótkie podsumowanie w 2-4 punktach (każdy od myślnika)",
 "objections": [{"type":"...","customer_quote":"...","agent_response":"...","resolved":true|false}],
 "winning_phrases": ["sformułowania agenta które zadziałały"],
 "mistakes": ["KONKRETNE błędy agenta w tej rozmowie (np. zła forma gramatyczna, niezrozumienie, zbędne pytania, sztuczny ton)"],
 "lessons": [{"category":"opening|qualifying|objection_handling|closing|scheduling|style|other","situation":"kiedy stosować","recommended_response":"co agent ma robić następnym razem, konkretnie","rationale":"dlaczego"}],
 "customer_data": {"name":"","phone":"","vehicle":"","service":""},
 "next_step": "..."
}
Bądź konkretny. "lessons" to reguły, które realnie poprawią kolejne rozmowy (zwłaszcza naprawa błędów z "mistakes"). Bez tekstu poza JSON.`;

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
    const transcript = Array.isArray(body?.messages) ? body.messages : [];
    if (transcript.length < 2) return json({ ok: false, error: "Za krótka rozmowa do analizy" }, 400);

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

    // tryb uczenia z konfiguracji
    const { data: cfg } = await admin.from("voice_agent_configs")
      .select("learning_mode, contribute_to_global").eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    const learningMode = cfg?.learning_mode || "per_call";
    if (learningMode === "off") return json({ ok: true, skipped: "learning off" });

    let apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, error: "Brak klucza Anthropic" }, 400);
    apiKey = cleanKey(apiKey);

    const agent = await resolveAgent(admin, "voice_call_analyzer", "claude-haiku-4-5-20251001");
    const model = (agent?.model && agent.model.startsWith("claude")) ? agent.model : "claude-haiku-4-5-20251001";

    const convoText = transcript.map((m: any) => `${m.role === "assistant" ? "AGENT" : "KLIENT"}: ${m.content}`).join("\n");
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1400, temperature: 0.2, system: SYSTEM, messages: [{ role: "user", content: convoText }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text().catch(() => ""); return json({ ok: false, error: `Anthropic ${aiRes.status}: ${t.slice(0, 150)}` }, 400); }
    const raw = (await aiRes.json())?.content?.[0]?.text || "";
    let a: any = {};
    try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); a = JSON.parse(raw.slice(s, e + 1)); } catch (_) { a = {}; }

    // 1) voice_calls
    const { data: call } = await admin.from("voice_calls").insert({
      provider_id: providerId, persona_key: personaKey, direction: "inbound", status: "completed",
      contact_name: a?.customer_data?.name || null, summary: a?.summary || null, outcome: a?.outcome || null,
    }).select("id").maybeSingle();
    const callId = call?.id || null;

    // 2) voice_transcripts
    if (callId) {
      await admin.from("voice_transcripts").insert({
        call_id: callId, provider_id: providerId, turns: transcript, full_text: convoText, summary: a?.summary || null,
      });
      // 3) voice_call_outcomes
      await admin.from("voice_call_outcomes").insert({
        call_id: callId, provider_id: providerId, persona_key: personaKey,
        outcome: a?.outcome || null, objections: a?.objections || [], winning_phrases: a?.winning_phrases || [],
        losing_signals: a?.mistakes || [], next_step: a?.next_step || null, customer_data: a?.customer_data || {},
        analysis_model: model, analyzed_at: new Date().toISOString(),
      });
    }

    // 4) per_call -> dopisz reguły do bazy wiedzy (dedup po situation)
    let learned = 0;
    if (learningMode === "per_call" && Array.isArray(a?.lessons)) {
      for (const L of a.lessons.slice(0, 8)) {
        if (!L?.situation || !L?.recommended_response) continue;
        const { data: ex } = await admin.from("voice_agent_knowledge")
          .select("id, evidence_count").eq("persona_key", personaKey).eq("provider_id", providerId)
          .ilike("situation", L.situation).maybeSingle();
        if (ex) {
          await admin.from("voice_agent_knowledge").update({
            evidence_count: (ex.evidence_count || 0) + 1, recommended_response: L.recommended_response,
            last_reinforced_at: new Date().toISOString(),
          }).eq("id", ex.id);
        } else {
          await admin.from("voice_agent_knowledge").insert({
            persona_key: personaKey, provider_id: providerId, scope: "tenant",
            category: L.category || "other", situation: L.situation, recommended_response: L.recommended_response,
            rationale: L.rationale || null, source: "distilled", evidence_count: 1, is_active: true,
          });
        }
        learned++;
      }
    }

    return json({ ok: true, call_id: callId, outcome: a?.outcome || null, lessons_learned: learned, mistakes: a?.mistakes || [] });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
