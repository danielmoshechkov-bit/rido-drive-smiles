// ============================================================================
// voice-call-postprocess — podpisany webhook po rozmowie ElevenLabs.
// Tenant/persona są mapowane po podpisanym agent_id; parametry URL są ignorowane.
// conversation_id zapewnia ochronę replay przez atomowy klucz
// (provider, external_event_id) w security_webhook_events.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getSecret } from "../_shared/aiSecrets.ts";
import {
  SecurityError,
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  writeAuditEvent,
} from "../_shared/security.ts";
import {
  consumeAiRateLimit,
  issueAiCapabilityToken,
  requireAiLiveRuntimeEnabled,
} from "../_shared/aiSecurity.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

const encoder = new TextEncoder();
const safeId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(value) ? value : "";

function timingSafeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left.toLowerCase());
  const b = encoder.encode(right.toLowerCase());
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || secret.length < 32) return false;
  const parts: Record<string, string> = {};
  for (const segment of header.split(",")) {
    const separator = segment.indexOf("=");
    if (separator > 0) parts[segment.slice(0, separator).trim()] = segment.slice(separator + 1).trim();
  }
  if (!/^\d{10,13}$/.test(parts.t || "")) return false;
  const timestamp = Number(parts.t);
  const signature = parts.v0 || "";
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || now - timestamp > 600 || timestamp - now > 60 || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${parts.t}.${rawBody}`)));
  const expected = Array.from(mac).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature);
}

function firstId(...values: unknown[]): string {
  for (const value of values) {
    const id = safeId(value);
    if (id) return id;
  }
  return "";
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method_not_allowed" });

  let claimedEvent: { admin: ServiceClient; externalEventId: string; correlationId: string } | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !anonKey) {
      throw new SecurityError(503, "security_not_configured", "Webhook nie jest bezpiecznie skonfigurowany");
    }
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
      throw new SecurityError(413, "payload_too_large", "Payload webhooka jest zbyt duży");
    }

    const admin = createServiceClient();
    requireAiLiveRuntimeEnabled(Deno.env.get("AI_VOICE_LIVE_EXECUTION_ENABLED"));
    const rawBody = await req.text();
    if (rawBody.length > 2_000_000) throw new SecurityError(413, "payload_too_large", "Payload webhooka jest zbyt duży");
    const webhookSecret = await getSecret(admin, "ELEVENLABS_WEBHOOK_SECRET");
    if (!webhookSecret) throw new SecurityError(503, "security_not_configured", "Webhook nie jest bezpiecznie skonfigurowany");
    if (!(await verifySignature(rawBody, req.headers.get("elevenlabs-signature"), webhookSecret))) {
      throw new SecurityError(401, "invalid_signature", "Nieprawidłowy podpis webhooka");
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new SecurityError(400, "invalid_json", "Nieprawidłowy payload webhooka");
    }

    const agentId = firstId(payload?.data?.agent_id, payload?.agent_id, payload?.conversation?.agent_id);
    const conversationId = firstId(
      payload?.data?.conversation_id,
      payload?.conversation_id,
      payload?.conversation?.conversation_id,
      payload?.conversation?.id,
    );
    if (!agentId) throw new SecurityError(400, "missing_agent_id", "Brak identyfikatora agenta");
    if (!conversationId) throw new SecurityError(400, "missing_conversation_id", "Brak identyfikatora rozmowy");

    const { data: configs, error: configError } = await admin.from("voice_agent_configs")
      .select("id, provider_id, persona_key, is_active, privacy_confirmed, kill_switch_enabled, daily_tool_call_limit, conversation_cost_limit_microusd, daily_cost_limit_microusd")
      .eq("elevenlabs_agent_id", agentId)
      .limit(2);
    if (configError || !configs || configs.length !== 1) {
      throw new SecurityError(403, "agent_mapping_invalid", "Nie można jednoznacznie przypisać agenta");
    }
    const config = configs[0];
    const [{ data: feature, error: featureError }, { data: runtime, error: runtimeError }] = await Promise.all([
      admin.from("ai_feature_flags").select("is_enabled").eq("flag_key", "ai_agents_enabled").maybeSingle(),
      admin.from("ai_global_runtime_control").select("kill_switch_enabled").eq("control_key", "global").maybeSingle(),
    ]);
    if (featureError || runtimeError
      || feature?.is_enabled !== true
      || runtime?.kill_switch_enabled !== false
      || config.kill_switch_enabled !== false
      || config.is_active !== true
      || config.privacy_confirmed !== true
      || Number(config.daily_tool_call_limit) <= 0
      || Number(config.conversation_cost_limit_microusd) <= 0
      || Number(config.daily_cost_limit_microusd) <= 0) {
      throw new SecurityError(503, "voice_agent_disabled", "Agent głosowy jest wyłączony");
    }
    const { data: provider, error: providerError } = await admin.from("service_providers")
      .select("id, company_id")
      .eq("id", config.provider_id)
      .maybeSingle();
    if (providerError || !provider) throw new SecurityError(403, "provider_access_denied", "Brak przypisanego usługodawcy");
    const correlationId = crypto.randomUUID();

    await consumeAiRateLimit(admin, {
      scope: "ai.voice.postprocess.config",
      subjectId: config.id,
      limit: 120,
      windowSeconds: 60,
    });
    await consumeAiRateLimit(admin, {
      scope: "ai.voice.postprocess.provider.daily",
      subjectId: provider.id,
      limit: 2_000,
      windowSeconds: 86_400,
    });

    // Atomowy INSERT na PK (provider, external_event_id) jest właściwą blokadą
    // równoległego replay. Po failed nie ma automatycznego retry — zdarzenie
    // wymaga jawnego, audytowanego wznowienia przez operatora.
    const { error: claimError } = await admin.from("security_webhook_events").insert({
      provider: "elevenlabs",
      external_event_id: conversationId,
      tenant_id: provider.company_id,
      status: "processing",
      correlation_id: correlationId,
    });
    if (claimError?.code === "23505") {
      const { data: prior } = await admin.from("security_webhook_events")
        .select("status")
        .eq("provider", "elevenlabs")
        .eq("external_event_id", conversationId)
        .maybeSingle();
      await writeAuditEvent(admin, {
        actorId: null,
        tenantId: provider.company_id,
        action: "webhook.elevenlabs.post_call",
        resourceType: "webhook_event",
        resourceId: conversationId,
        result: "denied",
        correlationId,
        metadata: { reason: "duplicate_event", prior_status: prior?.status || "unknown", agent_id: agentId },
      });
      return jsonResponse(req, 200, { ok: true, duplicate: true, event_status: prior?.status || "unknown" });
    }
    if (claimError) throw new SecurityError(503, "idempotency_unavailable", "Nie można bezpiecznie zarejestrować webhooka");
    claimedEvent = { admin, externalEventId: conversationId, correlationId };

    // Dodatkowa zgodność z rekordami sprzed wdrożenia atomowego claimu.
    const { data: existing, error: replayError } = await admin.from("voice_calls")
      .select("id")
      .eq("elevenlabs_conversation_id", conversationId)
      .limit(1)
      .maybeSingle();
    if (replayError) throw new SecurityError(503, "idempotency_unavailable", "Nie można sprawdzić powtórzenia webhooka");
    if (existing) {
      const [transcriptState, outcomeState] = await Promise.all([
        admin.from("voice_transcripts").select("id", { count: "exact", head: true }).eq("call_id", existing.id).eq("provider_id", provider.id),
        admin.from("voice_call_outcomes").select("id", { count: "exact", head: true }).eq("call_id", existing.id).eq("provider_id", provider.id),
      ]);
      if (transcriptState.error || outcomeState.error
        || transcriptState.count !== 1 || outcomeState.count !== 1) {
        throw new SecurityError(
          503,
          "voice_call_requires_manual_reconciliation",
          "Istniejąca rozmowa wymaga ręcznego uzgodnienia przed ponowieniem",
        );
      }
      await writeAuditEvent(admin, {
        actorId: null,
        tenantId: provider.company_id,
        action: "webhook.elevenlabs.post_call",
        resourceType: "voice_call",
        resourceId: existing.id,
        result: "denied",
        correlationId,
        metadata: { reason: "duplicate_event", agent_id: agentId, external_event_id: conversationId },
      });
      const { error: completionError } = await admin.from("security_webhook_events").update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        last_error_code: null,
      }).eq("provider", "elevenlabs").eq("external_event_id", conversationId).eq("status", "processing");
      if (completionError) throw new SecurityError(503, "idempotency_unavailable", "Nie można zakończyć obsługi webhooka");
      claimedEvent = null;
      return jsonResponse(req, 200, { ok: true, duplicate: true, call_id: existing.id });
    }

    const rawTranscript = payload?.data?.transcript || payload?.transcript || payload?.conversation?.transcript;
    if (!Array.isArray(rawTranscript)) throw new SecurityError(400, "missing_transcript", "Brak transkryptu rozmowy");
    const messages = rawTranscript.slice(-100).flatMap((turn: any) => {
      const sourceRole = String(turn?.role || "").toLowerCase();
      if (!["agent", "assistant", "user", "customer"].includes(sourceRole)) return [];
      const content = String(turn?.message || turn?.text || turn?.content || "").trim().slice(0, 4000);
      if (!content) return [];
      return [{ role: sourceRole === "agent" || sourceRole === "assistant" ? "assistant" : "user", content }];
    });
    if (messages.length < 2) throw new SecurityError(400, "transcript_too_short", "Rozmowa jest zbyt krótka do analizy");
    if (messages.reduce((sum: number, message: { content: string }) => sum + message.content.length, 0) > 100_000) {
      throw new SecurityError(413, "transcript_too_large", "Transkrypt jest zbyt duży");
    }

    const analysisCapability = await issueAiCapabilityToken(
      Deno.env.get("AI_CAPABILITY_SIGNING_SECRET") || "",
      {
        providerId: provider.id,
        configId: config.id,
        callId: conversationId,
        personaKey: config.persona_key,
        scope: "voice.call.analyze",
        ttlSeconds: 120,
      },
    );
    const response = await fetch(`${supabaseUrl}/functions/v1/voice-call-analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "x-rido-ai-capability": analysisCapability,
        apikey: anonKey,
        "Content-Type": "application/json",
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({
        provider_id: provider.id,
        config_id: config.id,
        call_id: conversationId,
        persona_key: config.persona_key,
        messages,
        is_test: false,
        elevenlabs_conversation_id: conversationId,
        direction: payload?.data?.direction === "outbound" ? "outbound" : "inbound",
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true) {
      throw new SecurityError(502, "analysis_failed", "Nie udało się przetworzyć rozmowy");
    }

    const { error: completionError } = await admin.from("security_webhook_events").update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
      last_error_code: null,
    }).eq("provider", "elevenlabs").eq("external_event_id", conversationId).eq("status", "processing");
    if (completionError) throw new SecurityError(503, "idempotency_unavailable", "Nie można zakończyć obsługi webhooka");
    claimedEvent = null;

    return jsonResponse(req, 200, {
      ok: true,
      analyzed: true,
      duplicate: result?.duplicate === true,
      call_id: result?.call_id || null,
      lessons_proposed: Number(result?.lessons_proposed || 0),
      lessons_published: 0,
    });
  } catch (error) {
    if (claimedEvent) {
      const errorCode = error instanceof SecurityError ? error.code : "internal_error";
      await claimedEvent.admin.from("security_webhook_events").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        last_error_code: errorCode,
      }).eq("provider", "elevenlabs")
        .eq("external_event_id", claimedEvent.externalEventId)
        .eq("status", "processing");
    }
    return errorResponse(req, error);
  }
});
