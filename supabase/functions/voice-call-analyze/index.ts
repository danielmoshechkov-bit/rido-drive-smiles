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
const logTiming = (stage: string, startedAt: number, extra: Record<string, unknown> = {}) => {
  console.info("[voice-call-analyze]", JSON.stringify({
    event: "stage_timing", stage,
    duration_ms: Math.round(performance.now() - startedAt),
    ...extra,
  }));
};

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
    const totalStarted = performance.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    let providerId = String(body?.provider_id || "");
    const personaKey = String(body?.persona_key || "workshop_secretary");
    const transcript = Array.isArray(body?.messages) ? body.messages : [];
    const orderId = body?.order_id || null;
    const bookingId = body?.booking_id || null;
    const requestedCallId = body?.call_id || null;
    const conversationId = String(body?.conversation_id || "").trim() || null;
    const existingSummary = String(body?.existing_summary || "").trim() || null;
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
      } else {
        const [{ data: provider }, { data: adminRole }] = await Promise.all([
          admin.from("service_providers").select("id").eq("id", providerId).eq("user_id", user.id).maybeSingle(),
          admin.from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
        ]);
        if (!provider && !adminRole) return json({ ok: false, error: "Brak dostępu do firmy" }, 403);
      }
    }
    if (!providerId) return json({ ok: false, error: "Brak provider_id" }, 400);

    let existingCall: any = null;
    if (requestedCallId) {
      const { data, error } = await admin.from("voice_calls").select("id, provider_id, linked_entity_type, linked_entity_id")
        .eq("id", requestedCallId).eq("provider_id", providerId).maybeSingle();
      if (error) throw error;
      if (!data) return json({ ok: false, error: "Rozmowa nie należy do wskazanej firmy" }, 403);
      existingCall = data;
    } else if (conversationId) {
      const { data, error } = await admin.from("voice_calls").select("id, provider_id, linked_entity_type, linked_entity_id")
        .eq("provider_id", providerId).eq("elevenlabs_conversation_id", conversationId).maybeSingle();
      if (error) throw error;
      existingCall = data;
    }

    // tryb uczenia z konfiguracji
    const { data: cfg } = await admin.from("voice_agent_configs")
      .select("learning_mode, contribute_to_global").eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    const learningMode = cfg?.learning_mode || "per_call";
    if (learningMode === "off") return json({ ok: true, call_id: existingCall?.id || requestedCallId, skipped: "learning off" });

    let apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, error: "Brak klucza Anthropic" }, 400);
    apiKey = cleanKey(apiKey);

    const agent = await resolveAgent(admin, "voice_call_analyzer", "claude-haiku-4-5-20251001");
    const model = (agent?.model && agent.model.startsWith("claude")) ? agent.model : "claude-haiku-4-5-20251001";

    const convoText = transcript.map((m: any) => `${m.role === "assistant" ? "AGENT" : "KLIENT"}: ${m.content}`).join("\n");
    const modelStarted = performance.now();
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1400, temperature: 0.2, system: SYSTEM, messages: [{ role: "user", content: convoText }] }),
      signal: AbortSignal.timeout(15_000),
    });
    logTiming("model", modelStarted, { status: aiRes.status });
    if (!aiRes.ok) {
      console.warn("[voice-call-analyze] model_failed", aiRes.status);
      return json({ ok: false, error: "Model analizy nie zwrócił poprawnej odpowiedzi" }, 502);
    }
    const raw = (await aiRes.json())?.content?.[0]?.text || "";
    let a: any = {};
    try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); a = JSON.parse(raw.slice(s, e + 1)); } catch (_) { a = {}; }

    // Powiązanie ze zleceniem: order_id z body LUB fallback po telefonie (telefonia)
    let linkedOrderId: string | null = null;
    if (orderId) {
      const { data: verifiedOrder, error: orderError } = await admin.from("workshop_orders").select("id")
        .eq("id", orderId).eq("provider_id", providerId).maybeSingle();
      if (orderError) throw orderError;
      if (!verifiedOrder) return json({ ok: false, error: "Zlecenie nie należy do wskazanej firmy" }, 403);
      linkedOrderId = verifiedOrder.id;
    } else if (existingCall?.linked_entity_type === "workshop_order") {
      linkedOrderId = existingCall.linked_entity_id;
    } else if (bookingId) {
      const { data: bookingOrder } = await admin.from("workshop_orders").select("id")
        .eq("provider_id", providerId).eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      linkedOrderId = bookingOrder?.id || null;
    }
    const phone = a?.customer_data?.phone;
    if (!linkedOrderId && phone) {
      const norm9 = (p: string) => (p || "").replace(/\D/g, "").slice(-9);
      const sinceISO = new Date(Date.now() - 60 * 60000).toISOString();
      const { data: recentOrders } = await admin.from("workshop_orders")
        .select("id, client_id, created_at").eq("provider_id", providerId)
        .gte("created_at", sinceISO).order("created_at", { ascending: false }).limit(20);
      const ids = [...new Set((recentOrders || []).map((o: any) => o.client_id).filter(Boolean))];
      if (ids.length) {
        const { data: clients } = await admin.from("workshop_clients").select("id, phone")
          .eq("provider_id", providerId).in("id", ids);
        const match = new Set((clients || []).filter((c: any) => norm9(c.phone || "") === norm9(phone)).map((c: any) => c.id));
        const ord = (recentOrders || []).find((o: any) => match.has(o.client_id));
        if (ord) linkedOrderId = ord.id;
      }
    }

    const persistStarted = performance.now();
    // 1) voice_calls
    const analyzedSummary = String(a?.summary || "").trim() || existingSummary;
    const callPatch = {
      provider_id: providerId, persona_key: personaKey, status: "completed",
      ...(!existingCall ? { direction: "inbound" } : {}),
      ...(a?.customer_data?.name ? { contact_name: a.customer_data.name } : {}),
      ...(analyzedSummary ? { summary: analyzedSummary } : {}),
      ...(a?.outcome ? { outcome: a.outcome } : {}),
      ...(conversationId ? { elevenlabs_conversation_id: conversationId } : {}),
      ...(linkedOrderId ? { linked_entity_type: "workshop_order", linked_entity_id: linkedOrderId } : {}),
    };
    let callId = existingCall?.id || null;
    if (callId) {
      const { error } = await admin.from("voice_calls").update(callPatch).eq("id", callId).eq("provider_id", providerId);
      if (error) throw error;
    } else {
      const { data: call, error } = await admin.from("voice_calls").insert(callPatch).select("id").single();
      if (error) throw error;
      callId = call.id;
    }

    // 2) voice_transcripts
    if (callId) {
      const transcriptPatch = {
        call_id: callId, provider_id: providerId, turns: transcript, full_text: convoText,
        ...(analyzedSummary ? { summary: analyzedSummary } : {}),
      };
      const { error: transcriptError } = await admin.from("voice_transcripts").upsert(transcriptPatch, { onConflict: "call_id" });
      if (transcriptError) throw transcriptError;
      // 3) voice_call_outcomes
      const { error: outcomeError } = await admin.from("voice_call_outcomes").upsert({
        call_id: callId, provider_id: providerId, persona_key: personaKey,
        outcome: a?.outcome || null, objections: a?.objections || [], winning_phrases: a?.winning_phrases || [],
        losing_signals: a?.mistakes || [], next_step: a?.next_step || null, customer_data: a?.customer_data || {},
        analysis_model: model, analyzed_at: new Date().toISOString(),
      }, { onConflict: "call_id" });
      if (outcomeError) throw outcomeError;
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

    logTiming("persist_and_learn", persistStarted, { lessons: learned });
    logTiming("total", totalStarted);
    return json({ ok: true, call_id: callId, outcome: a?.outcome || null, lessons_learned: learned, mistakes: a?.mistakes || [] });
  } catch (e) {
    console.error("[voice-call-analyze] analysis_failed", (e as any)?.code || (e as Error)?.name || "error");
    return json({ ok: false, error: "Nie udało się przeprowadzić dodatkowej analizy rozmowy" }, 500);
  }
});
