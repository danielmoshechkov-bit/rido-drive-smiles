// Custom LLM bridge for ElevenLabs. Live traffic is accepted only with a
// short-lived capability bound to one provider/config/persona/call. The old
// deterministic provider token is intentionally unsupported.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  SecurityError,
  corsHeaders,
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  readJsonBody,
  writeAuditEvent,
} from "../_shared/security.ts";
import {
  consumeAiRateLimit,
  issueAiCapabilityToken,
  requireAiLiveRuntimeEnabled,
  verifyAiCapabilityToken,
} from "../_shared/aiSecurity.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERSONA_PATTERN = /^[a-z0-9_-]{1,64}$/i;
const CALL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

function normalizeMessages(value: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(value)) return [];
  const messages = value.slice(-60).flatMap((item: any) => {
    if (item?.role !== "user" && item?.role !== "assistant") return [];
    const content = typeof item.content === "string"
      ? item.content
      : Array.isArray(item.content)
      ? item.content.map((part: any) => typeof part?.text === "string" ? part.text : "").join(" ")
      : "";
    const clean = content.trim().slice(0, 4000);
    return clean ? [{ role: item.role as "user" | "assistant", content: clean }] : [];
  });
  if (messages.reduce((sum, message) => sum + message.content.length, 0) > 100_000) {
    throw new SecurityError(413, "conversation_too_large", "Rozmowa jest zbyt duża");
  }
  return messages;
}

function readCapabilityBearer(req: Request): string {
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+([^\s]+)$/i)?.[1] || "";
  if (!bearer) throw new SecurityError(401, "ai_capability_required", "Wymagane jest capability rozmowy AI");
  return bearer;
}

function readCallId(req: Request, body: any): string {
  const candidates = [
    req.headers.get("x-rido-call-id"),
    body?.conversation_id,
    body?.metadata?.conversation_id,
  ];
  const value = candidates.find((candidate) => typeof candidate === "string" && CALL_ID_PATTERN.test(candidate));
  if (!value) throw new SecurityError(401, "call_capability_required", "Brak bezpiecznego kontekstu rozmowy");
  return value;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method_not_allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !anonKey) {
      throw new SecurityError(503, "security_not_configured", "Usługa nie jest bezpiecznie skonfigurowana");
    }

    const url = new URL(req.url);
    if (url.searchParams.has("token")) {
      throw new SecurityError(400, "token_in_url_forbidden", "Token nie może znajdować się w adresie URL");
    }
    const providerId = url.searchParams.get("provider_id") || "";
    const personaKey = (url.searchParams.get("persona_key") || "workshop_secretary").slice(0, 64);
    if (!UUID_PATTERN.test(providerId) || !PERSONA_PATTERN.test(personaKey)) {
      throw new SecurityError(401, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI");
    }

    const requestBody = await readJsonBody(req, 1_000_000);
    const callId = readCallId(req, requestBody);
    const admin = createServiceClient();
    requireAiLiveRuntimeEnabled(Deno.env.get("AI_VOICE_LIVE_EXECUTION_ENABLED"));
    const [{ data: provider, error: providerError }, { data: config, error: configError }] = await Promise.all([
      admin.from("service_providers").select("id, company_id").eq("id", providerId).maybeSingle(),
      admin.from("voice_agent_configs")
        .select("id, provider_id, is_active, privacy_confirmed, kill_switch_enabled, dry_run_tools, max_concurrent_calls, daily_tool_call_limit, conversation_cost_limit_microusd, daily_cost_limit_microusd")
        .eq("provider_id", providerId)
        .eq("persona_key", personaKey)
        .maybeSingle(),
    ]);
    if (providerError || configError || !provider || !config) {
      throw new SecurityError(401, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI");
    }

    const signingSecret = Deno.env.get("AI_CAPABILITY_SIGNING_SECRET") || "";
    const capability = await verifyAiCapabilityToken(readCapabilityBearer(req), signingSecret, {
      binding: {
        providerId,
        configId: config.id,
        callId,
        personaKey,
        scope: "voice.llm",
      },
    });

    const [{ data: feature, error: featureError }, { data: runtime, error: runtimeError }] = await Promise.all([
      admin.from("ai_feature_flags").select("is_enabled").eq("flag_key", "ai_agents_enabled").maybeSingle(),
      admin.from("ai_global_runtime_control").select("kill_switch_enabled").eq("control_key", "global").maybeSingle(),
    ]);
    if (featureError || runtimeError
      || feature?.is_enabled !== true
      || runtime?.kill_switch_enabled !== false
      || config.kill_switch_enabled !== false
      || config.dry_run_tools !== false
      || config.is_active !== true
      || config.privacy_confirmed !== true
      || Number(config.max_concurrent_calls) <= 0
      || Number(config.daily_tool_call_limit) <= 0
      || Number(config.conversation_cost_limit_microusd) <= 0
      || Number(config.daily_cost_limit_microusd) <= 0) {
      throw new SecurityError(503, "voice_agent_disabled", "Agent głosowy jest wyłączony");
    }

    await consumeAiRateLimit(admin, {
      scope: "ai.voice.llm.config",
      subjectId: config.id,
      limit: 120,
      windowSeconds: 60,
    });
    await consumeAiRateLimit(admin, {
      scope: "ai.voice.llm.provider.daily",
      subjectId: providerId,
      limit: 2_000,
      windowSeconds: 86_400,
    });

    const messages = normalizeMessages(requestBody?.messages);
    const stream = requestBody?.stream !== false;
    const correlationId = crypto.randomUUID();
    await writeAuditEvent(admin, {
      actorId: null,
      tenantId: provider.company_id,
      action: "ai.voice.llm_turn",
      resourceType: "voice_agent_config",
      resourceId: config.id,
      result: "attempted",
      correlationId,
      metadata: { persona_key: personaKey, call_id: callId, message_count: messages.length },
    });

    const chatCapability = await issueAiCapabilityToken(signingSecret, {
      providerId,
      configId: config.id,
      callId: capability.call_id,
      personaKey,
      scope: "voice.chat",
      ttlSeconds: 90,
    });
    const response = await fetch(`${supabaseUrl}/functions/v1/voice-agent-chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        "Content-Type": "application/json",
        "x-correlation-id": correlationId,
        "x-rido-ai-capability": chatCapability,
      },
      body: JSON.stringify({
        provider_id: providerId,
        config_id: config.id,
        call_id: callId,
        persona_key: personaKey,
        messages,
      }),
    });
    const responseData = await response.json().catch(() => ({}));
    const reply = response.ok && typeof responseData?.reply === "string"
      ? responseData.reply.slice(0, 12_000)
      : "Przepraszam, wystąpił chwilowy problem techniczny. Proszę skontaktować się z pracownikiem.";

    await writeAuditEvent(admin, {
      actorId: null,
      tenantId: provider.company_id,
      action: "ai.voice.llm_turn",
      resourceType: "voice_agent_config",
      resourceId: config.id,
      result: response.ok ? "succeeded" : "failed",
      correlationId,
      metadata: { persona_key: personaKey, call_id: callId, fallback_used: !response.ok },
    });

    const id = `chatcmpl-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const model = "rido-voice";
    if (stream) {
      const chunk = { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant", content: reply }, finish_reason: null }] };
      const done = { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
      const sse = `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
      return new Response(sse, {
        status: 200,
        headers: { ...corsHeaders(req), "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
      });
    }

    return jsonResponse(req, 200, {
      id,
      object: "chat.completion",
      created,
      model,
      choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
