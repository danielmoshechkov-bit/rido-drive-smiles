import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secretStatus } from "../_shared/aiSecrets.ts";
import {
  publicVoiceRoutingPayload,
  validateVoiceRouting,
  VOICE_ANALYSIS_AGENT_ID,
  VOICE_FUNCTION_KEY,
  voiceProviderKeys,
  voiceSecretKeys,
  type VoiceProviderConfig,
  type VoiceRoutingRecord,
} from "../_shared/voiceAiRouting.ts";

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
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminRole, error: roleError } = await admin.from("user_roles")
      .select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (roleError) throw roleError;
    if (!adminRole) return json({ success: false, error: "Brak uprawnień administratora" }, 403);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "get";

    const [mappingResult, providerResult, analysisResult] = await Promise.all([
      admin.from("ai_function_mapping")
        .select("id,function_key,function_name,function_description,category,provider_key,model_override,backup_provider_key,backup_model_override,allow_fallback,is_enabled,model_timeout_ms,max_tool_rounds,max_output_tokens,updated_at")
        .eq("function_key", VOICE_FUNCTION_KEY).single(),
      admin.from("ai_providers")
        .select("provider_key,display_name,is_enabled,default_model,timeout_seconds")
        .in("provider_key", voiceProviderKeys()),
      admin.from("ai_agents_config").select("model,updated_at")
        .eq("agent_id", VOICE_ANALYSIS_AGENT_ID).maybeSingle(),
    ]);
    if (mappingResult.error) throw mappingResult.error;
    if (providerResult.error) throw providerResult.error;
    if (analysisResult.error) throw analysisResult.error;

    const providers = (providerResult.data || []) as VoiceProviderConfig[];
    const secretKeys = voiceSecretKeys();
    const statuses = await Promise.all(secretKeys.map((key) => secretStatus(admin, key)));
    const secretConfigured = Object.fromEntries(
      statuses.map((status) => [status.key, status.is_set && status.is_readable]),
    );

    if (action === "get") {
      return json({
        success: true,
        ...publicVoiceRoutingPayload(mappingResult.data as VoiceRoutingRecord, providers, secretConfigured),
        analysis_model: analysisResult.data?.model || null,
      });
    }

    if (action === "save") {
      const source = body?.routing || body;
      const current = mappingResult.data as VoiceRoutingRecord;
      const next: VoiceRoutingRecord = {
        ...current,
        provider_key: source.provider_key ?? null,
        model_override: source.model_override ?? null,
        backup_provider_key: source.backup_provider_key ?? null,
        backup_model_override: source.backup_model_override ?? null,
        allow_fallback: source.allow_fallback === true,
        is_enabled: source.is_enabled !== false,
        model_timeout_ms: Number(source.model_timeout_ms),
        max_tool_rounds: Number(source.max_tool_rounds),
        max_output_tokens: Number(source.max_output_tokens),
      };
      const errors = validateVoiceRouting(next, providers, secretConfigured);
      if (errors.length) return json({ success: false, error: errors[0], errors }, 400);

      const { data, error } = await admin.from("ai_function_mapping").update({
        provider_key: next.provider_key,
        model_override: next.model_override,
        backup_provider_key: next.backup_provider_key,
        backup_model_override: next.backup_model_override,
        allow_fallback: next.allow_fallback,
        is_enabled: next.is_enabled,
        model_timeout_ms: next.model_timeout_ms,
        max_tool_rounds: next.max_tool_rounds,
        max_output_tokens: next.max_output_tokens,
        updated_at: new Date().toISOString(),
      }).eq("function_key", VOICE_FUNCTION_KEY).select().single();
      if (error) throw error;
      return json({ success: true, routing: data });
    }

    return json({ success: false, error: "Nieznana akcja" }, 400);
  } catch (error) {
    console.error("[admin-voice-ai-routing] failed", (error as { code?: string })?.code || (error as Error)?.name || "error");
    return json({ success: false, error: "Nie udało się obsłużyć routingu modelu głosowego" }, 500);
  }
});
