import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const loadSupabase = async () => (await import("@/integrations/supabase/client")).supabase;

export interface VoiceRoutingProviderOption {
  provider_key: string;
  display_name: string;
  default_model: string;
  timeout_seconds: number | null;
  key_configured: boolean;
  adapter_key: string;
}

export interface VoiceRoutingForm {
  id: string;
  function_key: "voice_agent";
  function_name: string;
  function_description: string | null;
  category: string;
  provider_key: string | null;
  model_override: string | null;
  backup_provider_key: string | null;
  backup_model_override: string | null;
  allow_fallback: boolean;
  is_enabled: boolean;
  model_timeout_ms: number;
  max_tool_rounds: number;
  max_output_tokens: number;
  updated_at: string | null;
}

export interface VoiceRoutingResponse {
  success: boolean;
  routing: VoiceRoutingForm;
  providers: VoiceRoutingProviderOption[];
  analysis_model: string | null;
}

export const VOICE_ROUTING_QUERY_KEY = ["admin-voice-ai-routing"] as const;

export function useVoiceAiRouting(enabled = true) {
  return useQuery({
    queryKey: VOICE_ROUTING_QUERY_KEY,
    queryFn: async () => {
      const supabase = await loadSupabase();
      const { data, error } = await supabase.functions.invoke("admin-voice-ai-routing", {
        body: { action: "get" },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Błąd odczytu routingu");
      return data as VoiceRoutingResponse;
    },
    staleTime: 0,
    enabled,
  });
}

export function useSaveVoiceAiRouting(enabled = true) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (routing: VoiceRoutingForm) => {
      if (!enabled) throw new Error("Zapis jest wyłączony w podglądzie lokalnym");
      const supabase = await loadSupabase();
      const { data, error } = await supabase.functions.invoke("admin-voice-ai-routing", {
        body: { action: "save", routing },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Błąd zapisu routingu");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VOICE_ROUTING_QUERY_KEY });
    },
  });
}
