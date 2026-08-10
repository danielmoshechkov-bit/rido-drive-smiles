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
import { redactPersonalData, shouldDistill } from "../_shared/voiceLearningGate.ts";
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
    const orderId = body?.order_id || null;
    const bookingId = body?.booking_id || null;
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

    // POWIĄZANIE ZE ZLECENIEM ROBI TERAZ voice-call-commit, po conversation_id.
    //
    // Stała tu heurystyka: zamówienia z ostatnich 60 MINUT dopasowywane po telefonie
    // klienta. To było PIĄTE miejsce z zasady 16 (tożsamość po kliencie i czasie
    // zamiast po rozmowie) i najszersze z całej piątki — przy dwóch rozmowach tego
    // samego klienta w godzinę przypinała transkrypt do NIEWŁAŚCIWEJ rozmowy.
    // Myliła się w około 60% rozmów.
    //
    // Skoro commit ma conversation_id i wiąże rozmowę sam, heurystyka przestała być
    // potrzebna i została wyłącznie ryzykiem. Analyze zajmuje się teraz WYŁĄCZNIE
    // uczeniem: wnioski, błędy i destylacja reguł.
    const linkedOrderId = orderId;

    // 1) voice_calls
    // Identyfikator rozmowy z ElevenLabs. Bez niego wiersz voice_calls nie ma tozsamosci,
    // wiec transkrypt nie da sie powiazac ze zleceniem, a powtorzony webhook tworzy duplikat.
    const conversationId = String(body?.conversation_id || "");

    // Idempotencja po conversation_id: powtorzenie webhooka aktualizuje istniejacy wiersz
    // zamiast tworzyc drugi. Bez identyfikatora zachowanie jak dotad.
    let callId: string | null = null;
    if (conversationId) {
      const { data: existing } = await admin.from("voice_calls")
        .select("id").eq("provider_id", providerId)
        .eq("elevenlabs_conversation_id", conversationId).maybeSingle();
      if (existing?.id) callId = existing.id;
    }
    if (callId) {
      await admin.from("voice_calls").update({
        status: "completed",
        contact_name: a?.customer_data?.name || null, summary: a?.summary || null, outcome: a?.outcome || null,
        ...(linkedOrderId ? { linked_entity_type: "workshop_order", linked_entity_id: linkedOrderId } : {}),
      }).eq("id", callId);
    } else {
      const { data: call } = await admin.from("voice_calls").insert({
        provider_id: providerId, persona_key: personaKey, direction: "inbound", status: "completed",
        ...(conversationId ? { elevenlabs_conversation_id: conversationId } : {}),
        contact_name: a?.customer_data?.name || null, summary: a?.summary || null, outcome: a?.outcome || null,
        linked_entity_type: linkedOrderId ? "workshop_order" : null, linked_entity_id: linkedOrderId || null,
      }).select("id").maybeSingle();
      callId = call?.id || null;
    }

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
    //
    // BRAMKA UCZENIA (10.08). Uczymy się z rozmów UDANYCH. Rozmowa nieudana nie
    // jest wzorcem do naśladowania — jest materiałem do przeglądu przez człowieka.
    // Skąd: qrgbn9cy skończyła się rozłączeniem klientki bez żadnego zapisu,
    // a destylator zrobił z niej trzy zalecenia, w tym obietnicę przełączenia
    // do kolegi mówiącego po ukraińsku. Nieudana rozmowa stała się wzorcem.
    const agentMessages = transcript
      .filter((m: any) => m?.role === "assistant")
      .map((m: any) => String(m?.content || ""));
    const bramka = shouldDistill({
      hasOrder: !!linkedOrderId,
      durationSeconds: Number(body?.duration_seconds) || 0,
      hadTruncation: agentMessages.some((m: string) =>
        /nie zdążyłem dokończyć|muszę się streścić/i.test(m)),
      agentMessages,
    });
    if (!bramka.allow) {
      console.info("[voice-call-analyze]", JSON.stringify({
        event: "distill_skipped", conversation: conversationId.slice(-8),
        reasons: bramka.reasons, flag_for_review: bramka.flagForReview,
      }));
      if (bramka.flagForReview && callId) {
        await admin.from("voice_calls").update({ status: "needs_review" }).eq("id", callId);
      }
    }

    let learned = 0;
    if (bramka.allow && learningMode === "per_call" && Array.isArray(a?.lessons)) {
      for (const L of a.lessons.slice(0, 8)) {
        if (!L?.situation || !L?.recommended_response) continue;
        // ZASADA 22 + dane osobowe: przykład ma pokazywać FORMĘ, nie treść.
        // Bez tego do promptu KAŻDEJ rozmowy trafiały tablica rejestracyjna,
        // fragment numeru telefonu i imię prawdziwego klienta, a przykład
        // „Mamy dostępne 9:00, 11:00 lub 14:00" agent recytował jako fakt.
        const situation = redactPersonalData(String(L.situation));
        const response = redactPersonalData(String(L.recommended_response));
        const { data: ex } = await admin.from("voice_agent_knowledge")
          .select("id, evidence_count, is_active").eq("persona_key", personaKey).eq("provider_id", providerId)
          .ilike("situation", situation).limit(1);
        const istniejacy = ex?.[0];
        if (istniejacy) {
          // AKTYWNEJ reguły nie przepisujemy po cichu. Gwarancja „nowa reguła czeka
          // na akceptację człowieka" obejmowała tylko wstawienie; aktualizacja
          // podmieniała treść aktywnego wpisu bez niczyjej zgody.
          if (istniejacy.is_active) {
            console.info("[voice-call-analyze]", JSON.stringify({
              event: "active_rule_not_overwritten", rule: String(istniejacy.id).slice(0, 8),
            }));
            continue;
          }
          await admin.from("voice_agent_knowledge").update({
            evidence_count: (istniejacy.evidence_count || 0) + 1, recommended_response: response,
            last_reinforced_at: new Date().toISOString(),
          }).eq("id", istniejacy.id);
        } else {
          await admin.from("voice_agent_knowledge").insert({
            persona_key: personaKey, provider_id: providerId, scope: "tenant",
            category: L.category || "other", situation, recommended_response: response,
            // Nowa reguła czeka na akceptację człowieka. Automatyczna aktywacja
            // doprowadziła do tego, że agent uczył się zachowań, które właściciel
            // dopiero co kazał usunąć: powtarzania numeru telefonu, pytań
            // diagnostycznych, obiecywania cen i pełnych podsumowań. Sześć takich
            // reguł powstało w jeden dzień, żadnej nikt nie zatwierdził.
            // Włączenie reguły jest teraz świadomą decyzją:
            //   UPDATE voice_agent_knowledge SET is_active = true WHERE id = '...'
            rationale: L.rationale || null, source: "distilled", evidence_count: 1, is_active: false,
          });
        }
        learned++;
      }
    }

    return json({ ok: true, call_id: callId, outcome: a?.outcome || null, lessons_learned: learned,
      distill_skipped: bramka.allow ? null : bramka.reasons, mistakes: a?.mistakes || [] });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
