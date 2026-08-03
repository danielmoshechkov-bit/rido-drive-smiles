// ============================================================================
// voice-call-postprocess — POST-CALL WEBHOOK z ElevenLabs (po zakończonej rozmowie).
// Bierze transkrypt z payloadu, trwale zapisuje i koreluje rozmowę przed
// opcjonalnym wywołaniem voice-call-analyze (wzbogacenie i UCZENIE).
//
// URL (w ustawieniach agenta ElevenLabs jako Post-call webhook):
//   .../functions/v1/voice-call-postprocess?provider_id=<UUID>&persona_key=workshop_secretary
//
// Auth: podpis HMAC ElevenLabs (nagłówek elevenlabs-signature: "t=...,v0=..."),
// sekret ELEVENLABS_WEBHOOK_SECRET (ai_secret_store / Supabase Secrets), fail-closed.
// Bez ważnego podpisu payload NIE trafia do warstwy uczenia (ochrona przed
// zatruciem voice_agent_knowledge fałszywym transkryptem).
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";
import {
  normalizePhone,
  parseElevenLabsWebhook,
  persistVoiceConversation,
  type VoiceConversationRepository,
} from "../_shared/voiceConversation.ts";
import { resolveVoiceProductionCanary } from "../_shared/voiceProductionCanary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, elevenlabs-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const tenc = new TextEncoder();
function timingSafeEqual(a: string, b: string): boolean {
  const ab = tenc.encode(a), bb = tenc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// Podpis ElevenLabs: v0 == HMAC-SHA256(secret, `${t}.${rawBody}`) hex; t nie starszy niż 30 min.
async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const seg of header.split(",")) {
    const i = seg.indexOf("=");
    if (i > 0) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  }
  const t = parts["t"], v0 = parts["v0"];
  if (!t || !v0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 1800) return false;
  const key = await crypto.subtle.importKey("raw", tenc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, tenc.encode(`${t}.${rawBody}`)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, v0);
}

const logTiming = (stage: string, startedAt: number, extra: Record<string, unknown> = {}) => {
  console.info("[voice-call-postprocess]", JSON.stringify({
    event: "stage_timing",
    stage,
    duration_ms: Math.round(performance.now() - startedAt),
    ...extra,
  }));
};

function createRepository(admin: any): VoiceConversationRepository {
  return {
    async findOrder(providerId, refs) {
      const { data: conversationOrder, error: conversationOrderError } = await admin.from("workshop_orders")
        .select("id, provider_id").eq("provider_id", providerId)
        .eq("voice_conversation_id", refs.conversationId).maybeSingle();
      if (conversationOrderError) throw conversationOrderError;
      if (conversationOrder) return { id: conversationOrder.id, providerId: conversationOrder.provider_id };
      if (refs.orderId) {
        const { data, error } = await admin.from("workshop_orders")
          .select("id, provider_id").eq("id", refs.orderId).eq("provider_id", providerId).maybeSingle();
        if (error) throw error;
        if (data) return { id: data.id, providerId: data.provider_id };
      }
      if (refs.bookingId) {
        const { data, error } = await admin.from("workshop_orders")
          .select("id, provider_id").eq("booking_id", refs.bookingId).eq("provider_id", providerId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        if (data) return { id: data.id, providerId: data.provider_id };
      }
      const phone9 = normalizePhone(refs.phone);
      if (!phone9) return null;
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: orders, error: ordersError } = await admin.from("workshop_orders")
        .select("id, provider_id, client_id, created_at").eq("provider_id", providerId)
        .gte("created_at", since).order("created_at", { ascending: false }).limit(30);
      if (ordersError) throw ordersError;
      const clientIds = [...new Set((orders || []).map((order: any) => order.client_id).filter(Boolean))];
      if (!clientIds.length) return null;
      const { data: clients, error: clientsError } = await admin.from("workshop_clients")
        .select("id, phone").eq("provider_id", providerId).in("id", clientIds);
      if (clientsError) throw clientsError;
      const matchingClients = new Set((clients || [])
        .filter((client: any) => normalizePhone(client.phone) === phone9)
        .map((client: any) => client.id));
      const order = (orders || []).find((candidate: any) => matchingClients.has(candidate.client_id));
      return order ? { id: order.id, providerId: order.provider_id } : null;
    },

    async upsertCall({ providerId, personaKey, parsed, linkedOrderId }) {
      const { data: existing, error: existingError } = await admin.from("voice_calls")
        .select("id, provider_id, elevenlabs_conversation_id, linked_entity_type, linked_entity_id")
        .eq("provider_id", providerId).eq("elevenlabs_conversation_id", parsed.conversationId).maybeSingle();
      if (existingError) throw existingError;
      const row = {
        provider_id: providerId,
        persona_key: personaKey,
        direction: parsed.direction,
        elevenlabs_conversation_id: parsed.conversationId,
        status: "completed",
        ended_at: parsed.endedAt || new Date().toISOString(),
        ...(parsed.callSid ? { twilio_call_sid: parsed.callSid } : {}),
        ...(parsed.fromNumber ? { from_number: parsed.fromNumber } : {}),
        ...(parsed.toNumber ? { to_number: parsed.toNumber } : {}),
        ...(parsed.language ? { language_detected: parsed.language } : {}),
        ...(parsed.startedAt ? { started_at: parsed.startedAt } : {}),
        ...(parsed.durationSeconds ? { duration_seconds: parsed.durationSeconds } : {}),
        ...(parsed.summary ? { summary: parsed.summary } : {}),
        ...(parsed.outcome ? { outcome: parsed.outcome } : {}),
        ...(linkedOrderId ? { linked_entity_type: "workshop_order", linked_entity_id: linkedOrderId } : {}),
      };
      if (existing) {
        const { data, error } = await admin.from("voice_calls").update(row).eq("id", existing.id)
          .eq("provider_id", providerId).select("id, provider_id, elevenlabs_conversation_id, linked_entity_type, linked_entity_id").single();
        if (error) throw error;
        return {
          id: data.id,
          providerId: data.provider_id,
          conversationId: data.elevenlabs_conversation_id,
          linkedOrderId: data.linked_entity_type === "workshop_order" ? data.linked_entity_id : null,
        };
      }
      const { data, error } = await admin.from("voice_calls").insert(row)
        .select("id, provider_id, elevenlabs_conversation_id, linked_entity_type, linked_entity_id").single();
      if (error) {
        // Równoległe ponowienie może wygrać unikalność conversation_id.
        if (error.code === "23505") {
          const { data: raced, error: racedError } = await admin.from("voice_calls")
            .select("id")
            .eq("provider_id", providerId).eq("elevenlabs_conversation_id", parsed.conversationId).single();
          if (racedError) throw racedError;
          const { data: updated, error: updateError } = await admin.from("voice_calls").update(row)
            .eq("id", raced.id).eq("provider_id", providerId)
            .select("id, provider_id, elevenlabs_conversation_id, linked_entity_type, linked_entity_id").single();
          if (updateError) throw updateError;
          return {
            id: updated.id,
            providerId: updated.provider_id,
            conversationId: updated.elevenlabs_conversation_id,
            linkedOrderId: updated.linked_entity_type === "workshop_order" ? updated.linked_entity_id : null,
          };
        }
        throw error;
      }
      return {
        id: data.id,
        providerId: data.provider_id,
        conversationId: data.elevenlabs_conversation_id,
        linkedOrderId: data.linked_entity_type === "workshop_order" ? data.linked_entity_id : null,
      };
    },

    async upsertTranscript(input) {
      const { error } = await admin.from("voice_transcripts").upsert({
        call_id: input.callId,
        provider_id: input.providerId,
        turns: input.messages,
        full_text: input.fullText,
        ...(input.summary ? { summary: input.summary } : {}),
      }, { onConflict: "call_id" });
      if (error) throw error;
    },

    async findCallByConversation(providerId, conversationId) {
      const { data, error } = await admin.from("voice_calls")
        .select("id, provider_id, elevenlabs_conversation_id, linked_entity_type, linked_entity_id")
        .eq("provider_id", providerId).eq("elevenlabs_conversation_id", conversationId).maybeSingle();
      if (error) throw error;
      return data ? {
        id: data.id,
        providerId: data.provider_id,
        conversationId: data.elevenlabs_conversation_id,
        linkedOrderId: data.linked_entity_type === "workshop_order" ? data.linked_entity_id : null,
      } : null;
    },

    async findRecentUnlinkedCallByPhone(providerId, phone) {
      const phone9 = normalizePhone(phone);
      if (!phone9) return null;
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin.from("voice_calls")
        .select("id, provider_id, elevenlabs_conversation_id, linked_entity_type, linked_entity_id, from_number, to_number")
        .eq("provider_id", providerId).is("linked_entity_id", null).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      const call = (data || []).find((candidate: any) =>
        normalizePhone(candidate.from_number) === phone9 || normalizePhone(candidate.to_number) === phone9
      );
      return call ? {
        id: call.id,
        providerId: call.provider_id,
        conversationId: call.elevenlabs_conversation_id,
        linkedOrderId: null,
      } : null;
    },

    async orderBelongsToProvider(providerId, orderId) {
      const { data, error } = await admin.from("workshop_orders").select("id")
        .eq("id", orderId).eq("provider_id", providerId).maybeSingle();
      if (error) throw error;
      return !!data;
    },

    async linkCallToOrder(providerId, callId, orderId) {
      const { data, error } = await admin.from("voice_calls").update({
        linked_entity_type: "workshop_order",
        linked_entity_id: orderId,
      }).eq("id", callId).eq("provider_id", providerId).select("id").maybeSingle();
      if (error) throw error;
      return !!data;
    },
  };
}

async function runLegacyPostprocess(
  adminUrl: string,
  serviceRoleKey: string,
  providerId: string,
  personaKey: string,
  payload: any,
): Promise<Response> {
  const rawTranscript = payload?.data?.transcript || payload?.transcript || payload?.conversation?.transcript || [];
  const messages = (Array.isArray(rawTranscript) ? rawTranscript : [])
    .map((turn: any) => ({
      role: (turn?.role === "agent" || turn?.role === "assistant") ? "assistant" : "user",
      content: turn?.message || turn?.text || turn?.content || "",
    }))
    .filter((message: any) => message.content);
  if (messages.length < 2) return json({ ok: true, skipped: "brak transkryptu" });

  const response = await fetch(`${adminUrl}/functions/v1/voice-call-analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
    body: JSON.stringify({ provider_id: providerId, persona_key: personaKey, messages, is_test: false }),
  });
  const result = await response.json().catch(() => ({}));
  return json({
    ok: true,
    analyzed: result?.ok || false,
    call_id: result?.call_id || null,
    lessons: result?.lessons_learned || 0,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const totalStarted = performance.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const providerId = url.searchParams.get("provider_id") || "";
    const personaKey = url.searchParams.get("persona_key") || "workshop_secretary";
    if (!providerId) return json({ ok: false, error: "Brak provider_id" }, 400);

    // Weryfikacja podpisu NA SUROWYM body (przed parsowaniem JSON), fail-closed.
    const rawBody = await req.text();
    const authStarted = performance.now();
    const webhookSecret = await getSecret(admin, "ELEVENLABS_WEBHOOK_SECRET");
    if (!webhookSecret) return json({ ok: false, error: "ELEVENLABS_WEBHOOK_SECRET nie skonfigurowany — webhook zablokowany" }, 503);
    if (!(await verifySignature(rawBody, req.headers.get("elevenlabs-signature"), webhookSecret))) {
      return json({ ok: false, error: "invalid signature" }, 401);
    }
    logTiming("signature", authStarted);

    let payload: any = {};
    try { payload = JSON.parse(rawBody); } catch (_) { return json({ ok: false, error: "Niepoprawny JSON" }, 400); }
    const parsed = parseElevenLabsWebhook(payload);
    const requestedCanary = resolveVoiceProductionCanary(providerId, parsed.agentId);
    if (!requestedCanary.enabled) {
      // Dokładna ścieżka sprzed finalizacji: pozostali agenci nadal przekazują
      // transkrypt do analizatora i nie używają nowych relacji ani UPSERT-ów.
      return await runLegacyPostprocess(supabaseUrl, serviceRoleKey, providerId, personaKey, payload);
    }
    if (parsed.eventType !== "post_call_transcription") {
      return json({ ok: true, skipped: `nieobsługiwany typ: ${parsed.eventType}` });
    }
    if (!parsed.conversationId) return json({ ok: false, error: "Brak conversation_id" }, 400);
    if (!/^[A-Za-z0-9_-]{6,255}$/.test(parsed.conversationId)) {
      return json({ ok: false, error: "Niepoprawny conversation_id" }, 400);
    }
    if (!parsed.messages.length) return json({ ok: true, skipped: "brak transkryptu", conversation_id_present: true });

    const { data: cfg, error: cfgError } = await admin.from("voice_agent_configs")
      .select("elevenlabs_agent_id").eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    if (cfgError) throw cfgError;
    if (!cfg?.elevenlabs_agent_id) {
      return json({ ok: false, error: "Firma nie ma przypisanego ElevenLabs Agent ID" }, 503);
    }
    if (cfg.elevenlabs_agent_id !== parsed.agentId) {
      return json({ ok: false, error: "Webhook pochodzi od innego agenta ElevenLabs" }, 403);
    }
    const verifiedCanary = resolveVoiceProductionCanary(providerId, cfg.elevenlabs_agent_id);
    if (!verifiedCanary.enabled) {
      return json({ ok: false, error: "Konfiguracja canary nie jest spójna" }, 503);
    }

    const persistStarted = performance.now();
    const persisted = await persistVoiceConversation(createRepository(admin), { providerId, personaKey, parsed });
    logTiming("persist", persistStarted, { linked_to_order: !!persisted.orderId });

    // Uczenie i bogatsza analiza są poza krytyczną ścieżką. Surowa rozmowa jest już trwale zapisana.
    const analysisRequest = fetch(`${supabaseUrl}/functions/v1/voice-call-analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id: providerId,
        persona_key: personaKey,
        messages: parsed.messages,
        call_id: persisted.callId,
        conversation_id: parsed.conversationId,
        order_id: persisted.orderId,
        existing_summary: parsed.summary,
        is_test: false,
      }),
      signal: AbortSignal.timeout(20_000),
    }).then(async (response) => {
      if (!response.ok) console.warn("[voice-call-postprocess] analysis_failed", response.status);
    }).catch((error) => console.warn("[voice-call-postprocess] analysis_failed", error?.name || "error"));
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(analysisRequest);
    logTiming("total", totalStarted, { linked_to_order: !!persisted.orderId });
    return json({ ok: true, stored: true, call_id: persisted.callId, linked_order_id: persisted.orderId });
  } catch (e) {
    console.error("[voice-call-postprocess] persistence_failed", (e as any)?.code || (e as Error)?.name || "error");
    return json({ ok: false, error: "Nie udało się zapisać zakończonej rozmowy" }, 500);
  }
});
