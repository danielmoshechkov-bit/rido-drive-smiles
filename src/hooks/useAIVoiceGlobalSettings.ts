import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AIVoiceGlobalSettings {
  id: string;
  telephony_provider: string;
  twilio_account_sid_encrypted: string | null;
  twilio_auth_token_encrypted: string | null;
  vonage_api_key_encrypted: string | null;
  vonage_api_secret_encrypted: string | null;
  tts_provider: string;
  elevenlabs_api_key_encrypted: string | null;
  openai_tts_api_key_encrypted: string | null;
  google_tts_api_key_encrypted: string | null;
  default_voice_id: string | null;
  default_voice_name: string | null;
  stt_provider: string;
  global_max_calls_per_day: number;
  global_max_minutes_per_month: number;
  calling_hours_start: string;
  calling_hours_end: string;
  calling_timezone: string;
  is_enabled: boolean;
  auto_calling_enabled: boolean;
  booking_integration_enabled: boolean;
  sms_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function useAIVoiceGlobalSettings() {
  return useQuery({
    queryKey: ["ai-voice-global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_voice_global_settings" as any)
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as AIVoiceGlobalSettings | null;
    },
  });
}

export function useUpdateAIVoiceGlobalSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<AIVoiceGlobalSettings>) => {
      // Get existing settings ID or create new
      const { data: existing } = await supabase
        .from("ai_voice_global_settings" as any)
        .select("id")
        .limit(1)
        .maybeSingle();

      const existingData = existing as unknown as { id: string } | null;

      if (existingData?.id) {
        const { data, error } = await supabase
          .from("ai_voice_global_settings" as any)
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", existingData.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("ai_voice_global_settings" as any)
          .insert([updates])
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-voice-global-settings"] });
      toast.success("Ustawienia zapisane");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
