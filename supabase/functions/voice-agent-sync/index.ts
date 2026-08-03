import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";
import { resolveVoiceProductionCanary } from "../_shared/voiceProductionCanary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = performance.now();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Brak autoryzacji" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ ok: false, error: "Brak autoryzacji" }, 401);

    const body = await req.json().catch(() => ({}));
    const providerId = String(body?.provider_id || "");
    const personaKey = String(body?.persona_key || "workshop_secretary");
    if (!providerId) return json({ ok: false, error: "Brak provider_id" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: provider }, { data: adminRole }] = await Promise.all([
      admin.from("service_providers").select("id").eq("id", providerId).eq("user_id", user.id).maybeSingle(),
      admin.from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!provider && !adminRole) return json({ ok: false, error: "Brak dostępu do firmy" }, 403);

    const { data: cfg, error: cfgError } = await admin.from("voice_agent_configs")
      .select("elevenlabs_agent_id, turn_timeout_seconds, silence_end_call_timeout_seconds, soft_timeout_seconds")
      .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    if (cfgError) throw cfgError;
    const agentId = String(cfg?.elevenlabs_agent_id || "").trim();
    if (!/^[A-Za-z0-9_-]{6,255}$/.test(agentId)) {
      return json({ ok: false, error: "Brak poprawnego ElevenLabs Agent ID w konfiguracji" }, 400);
    }
    if (!resolveVoiceProductionCanary(providerId, agentId).enabled) {
      return json({ ok: false, error: "Synchronizacja jest ograniczona do aktywnego production canary" }, 409);
    }
    const apiKey = await getSecret(admin, "ELEVENLABS_API_KEY");
    if (!apiKey) return json({ ok: false, error: "Brak klucza ElevenLabs" }, 400);

    const headers = { "xi-api-key": apiKey, "Content-Type": "application/json" };
    const currentResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!currentResponse.ok) {
      console.warn("[voice-agent-sync] get_failed", currentResponse.status);
      return json({ ok: false, error: `Nie udało się odczytać agenta ElevenLabs (${currentResponse.status})` }, 502);
    }
    const current = await currentResponse.json();
    const currentTurn = current?.conversation_config?.turn || {};
    const turn = {
      ...currentTurn,
      turn_timeout: Number(cfg?.turn_timeout_seconds) || 7,
      silence_end_call_timeout: Number(cfg?.silence_end_call_timeout_seconds) || 60,
      soft_timeout_config: {
        ...(currentTurn?.soft_timeout_config || {}),
        timeout_seconds: Number(cfg?.soft_timeout_seconds) || 3,
        message: "Już sprawdzam…",
      },
    };
    const updateResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ conversation_config: { turn } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!updateResponse.ok) {
      console.warn("[voice-agent-sync] patch_failed", updateResponse.status);
      return json({ ok: false, error: `ElevenLabs odrzucił konfigurację (${updateResponse.status})` }, 502);
    }
    console.info("[voice-agent-sync]", JSON.stringify({
      event: "sync_timing",
      duration_ms: Math.round(performance.now() - startedAt),
    }));
    return json({
      ok: true,
      turn_timeout_seconds: turn.turn_timeout,
      silence_end_call_timeout_seconds: turn.silence_end_call_timeout,
      soft_timeout_seconds: turn.soft_timeout_config.timeout_seconds,
    });
  } catch (error) {
    console.error("[voice-agent-sync] failed", (error as Error)?.name || "error");
    return json({ ok: false, error: (error as Error)?.name === "TimeoutError" ? "ElevenLabs nie odpowiedział w limicie czasu" : "Nie udało się zsynchronizować konfiguracji" }, 500);
  }
});
