// ============================================================================
// voice-agent-llm — CUSTOM LLM dla ElevenLabs Conversational AI.
// ElevenLabs wysyła żądanie w formacie OpenAI (/v1/chat/completions, SSE).
// My w środku wołamy NASZ mózg (voice-agent-chat) z personą + danymi firmy +
// wiedzą + narzędziami (rezerwacja/zlecenie). Inteligencja i dane zostają u nas.
//
// URL (per tenant, w ustawieniach agenta ElevenLabs jako "Custom LLM"):
//   .../functions/v1/voice-agent-llm?provider_id=<UUID>&persona_key=workshop_secretary
//
// Auth: token VOICE_LLM_TOKEN (ai_secret_store / Supabase Secrets), fail-closed.
//   W ElevenLabs token podaje się w polu "API key" konfiguracji Custom LLM
//   (trafia jako Authorization: Bearer) albo jako ?token= w URL.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";
import { resolveVoiceProductionCanary } from "../_shared/voiceProductionCanary.ts";
import { resolveVoiceLlmRoute } from "../_shared/voicePhase1Route.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
};
const legacySseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
};

const tenc = new TextEncoder();
type VoiceAgentConfig = {
  business_context?: Record<string, unknown>;
  display_name?: string;
  languages?: string[];
  calendar_access?: boolean;
  orders_access?: boolean;
  voice_id?: string;
  elevenlabs_agent_id?: string;
};
type LlmInputMessage = { role?: unknown; content?: unknown };
type LlmContentPart = { text?: unknown };
function timingSafeEqual(a: string, b: string): boolean {
  const ab = tenc.encode(a), bb = tenc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
const logTiming = (stage: string, startedAt: number, extra: Record<string, unknown> = {}) => {
  console.info("[voice-agent-llm]", JSON.stringify({
    event: "stage_timing", stage,
    duration_ms: Math.round(performance.now() - startedAt),
    ...extra,
  }));
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response(JSON.stringify({ ok: true, service: "voice-agent-llm" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const totalStarted = performance.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const { providerId, personaKey } = resolveVoiceLlmRoute(url);

  // Bez skonfigurowanego VOICE_LLM_TOKEN endpoint jest ZABLOKOWANY (fail-closed) —
  // otwarty Custom-LLM to darmowy Claude dla każdego, kto zna provider_id.
  const authStarted = performance.now();
  const expectedToken = await getPhase1Secret(admin, "VOICE_LLM_TOKEN");
  if (!expectedToken) {
    return new Response(JSON.stringify({ error: "VOICE_LLM_TOKEN nie skonfigurowany — endpoint zablokowany" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const providedToken = url.searchParams.get("token") || bearer;
  if (!providedToken || !timingSafeEqual(providedToken, expectedToken)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  logTiming("auth", authStarted);

  const configStarted = performance.now();
  let cfg: VoiceAgentConfig | null = null;
  if (providerId) {
    const { data, error } = await admin.from("voice_agent_configs")
      .select("business_context, display_name, languages, calendar_access, orders_access, voice_id, elevenlabs_agent_id")
      .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    if (error) {
      console.warn("[voice-agent-llm] config_lookup_failed", { code: error.code });
    }
    cfg = data;
  }
  logTiming("config", configStarted);

  const reqBody = await req.json().catch(() => ({}));
  const stream = reqBody?.stream !== false;
  const model = reqBody?.model || "rido-claude";
  const inMessages: LlmInputMessage[] = Array.isArray(reqBody?.messages) ? reqBody.messages : [];
  const canary = resolveVoiceProductionCanary(providerId, cfg?.elevenlabs_agent_id);

  // Wyciągnij rozmowę (user/assistant); system od ElevenLabs ignorujemy — mózg buduje własny.
  const convo = inMessages
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
        ? (m.content as LlmContentPart[]).map((part) => typeof part.text === "string" ? part.text : "").join(" ")
        : "",
    }))
    .filter((m) => m.content);

  // Wywołaj nasz mózg (service-role)
  let reply = "Przepraszam, chwilowy problem techniczny.";
  try {
    const chatStarted = performance.now();
    const r = await fetch(`${supabaseUrl}/functions/v1/voice-agent-chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id: providerId, persona_key: personaKey, test_mode: false,
        response_stream: canary.enabled && stream,
        production_canary: canary.enabled,
        // Wewnętrzne, uwierzytelnione service-role przekazanie wyłącznie do
        // ponownej walidacji pary canary w voice-agent-chat.
        ...(canary.enabled ? { elevenlabs_agent_id: cfg?.elevenlabs_agent_id } : {}),
        messages: convo,
        business_context: cfg?.business_context || {}, display_name: cfg?.display_name || "",
        languages: cfg?.languages || ["pl"], calendar_access: !!cfg?.calendar_access, orders_access: !!cfg?.orders_access,
      }),
      // Timeout proxy dotyczy wyłącznie Phase 1. Legacy nie otrzymuje nowego
      // limitu i zachowuje poprzedni kontrakt wykonania.
      ...(canary.enabled ? {
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(stream ? 45_000 : 18_000)]),
      } : {}),
    });
    if (stream && r.ok && r.body && (r.headers.get("content-type") || "").includes("text/event-stream")) {
      logTiming("chat_headers", chatStarted, { ok: true, production_canary: true });
      const measured = r.body.pipeThrough(new TransformStream({
        transform(chunk, controller) { controller.enqueue(chunk); },
        flush() { logTiming("total", totalStarted, { stream: true, production_canary: true }); },
      }));
      return new Response(measured, {
        headers: sseHeaders,
      });
    }
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.reply) reply = data.reply;
    else console.warn("[voice-agent-llm] chat_failed", r.status);
    logTiming("chat", chatStarted, { ok: r.ok });
  } catch (error) {
    console.warn("[voice-agent-llm] chat_failed", (error as Error)?.name || "error");
  }

  const id = "chatcmpl-" + Math.random().toString(36).slice(2);
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    const chunk = { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant", content: reply }, finish_reason: null }] };
    const done = { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
    const sse = `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
    logTiming("total", totalStarted, { stream: true, production_canary: canary.enabled });
    return new Response(sse, { headers: canary.enabled ? sseHeaders : legacySseHeaders });
  }

  const completion = { id, object: "chat.completion", created, model, choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  logTiming("total", totalStarted, { stream: false, production_canary: canary.enabled });
  return new Response(JSON.stringify(completion), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
