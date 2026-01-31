import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
export interface AIAgentService {
  name: string;
  price: number;
  duration_minutes: number;
  description?: string;
}

export interface AIAgentFAQ {
  question: string;
  answer: string;
}

export interface WorkingHours {
  start: string;
  end: string;
}

export interface AIAgentConfig {
  id: string;
  user_id: string;
  company_name: string;
  company_description: string | null;
  services: AIAgentService[];
  working_hours: Record<string, WorkingHours>;
  service_area: string | null;
  faq: AIAgentFAQ[];
  booking_rules: Record<string, unknown>;
  voice_id: string;
  voice_gender: string;
  conversation_style: string;
  max_calls_per_day: number;
  max_minutes_per_month: number;
  max_retries_per_lead: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useAIAgentConfig() {
  return useQuery({
    queryKey: ["ai-agent-config"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("ai_agent_configs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        return {
          ...data,
          services: (data.services as unknown as AIAgentService[]) || [],
          faq: (data.faq as unknown as AIAgentFAQ[]) || [],
          working_hours: (data.working_hours as unknown as Record<string, WorkingHours>) || {},
          booking_rules: (data.booking_rules as unknown as Record<string, unknown>) || {},
        } as AIAgentConfig;
      }
      return null;
    },
  });
}

export function useCreateAIAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: Partial<AIAgentConfig>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");

      const insertData: {
        user_id: string;
        company_name: string;
        company_description?: string | null;
        services: Json;
        working_hours: Json;
        service_area?: string | null;
        faq: Json;
        booking_rules: Json;
        voice_id: string;
        voice_gender: string;
        conversation_style: string;
        max_calls_per_day: number;
        max_minutes_per_month: number;
        max_retries_per_lead: number;
        is_active: boolean;
      } = {
        user_id: user.id,
        company_name: config.company_name || "",
        company_description: config.company_description,
        services: JSON.parse(JSON.stringify(config.services || [])) as Json,
        working_hours: JSON.parse(JSON.stringify(config.working_hours || {})) as Json,
        service_area: config.service_area,
        faq: JSON.parse(JSON.stringify(config.faq || [])) as Json,
        booking_rules: JSON.parse(JSON.stringify(config.booking_rules || {})) as Json,
        voice_id: config.voice_id || "JBFqnCBsd6RMkjVDRZzb",
        voice_gender: config.voice_gender || "male",
        conversation_style: config.conversation_style || "professional",
        max_calls_per_day: config.max_calls_per_day || 20,
        max_minutes_per_month: config.max_minutes_per_month || 120,
        max_retries_per_lead: config.max_retries_per_lead || 3,
        is_active: config.is_active || false,
      };

      const { data, error } = await supabase
        .from("ai_agent_configs")
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-config"] });
      toast.success("Konfiguracja AI Agenta utworzona");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateAIAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIAgentConfig> & { id: string }) => {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.company_name !== undefined) updateData.company_name = updates.company_name;
      if (updates.company_description !== undefined) updateData.company_description = updates.company_description;
      if (updates.services !== undefined) updateData.services = updates.services as unknown as Record<string, unknown>;
      if (updates.working_hours !== undefined) updateData.working_hours = updates.working_hours as unknown as Record<string, unknown>;
      if (updates.service_area !== undefined) updateData.service_area = updates.service_area;
      if (updates.faq !== undefined) updateData.faq = updates.faq as unknown as Record<string, unknown>;
      if (updates.booking_rules !== undefined) updateData.booking_rules = updates.booking_rules as unknown as Record<string, unknown>;
      if (updates.voice_id !== undefined) updateData.voice_id = updates.voice_id;
      if (updates.voice_gender !== undefined) updateData.voice_gender = updates.voice_gender;
      if (updates.conversation_style !== undefined) updateData.conversation_style = updates.conversation_style;
      if (updates.max_calls_per_day !== undefined) updateData.max_calls_per_day = updates.max_calls_per_day;
      if (updates.max_minutes_per_month !== undefined) updateData.max_minutes_per_month = updates.max_minutes_per_month;
      if (updates.max_retries_per_lead !== undefined) updateData.max_retries_per_lead = updates.max_retries_per_lead;
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

      const { data, error } = await supabase
        .from("ai_agent_configs")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-config"] });
      toast.success("Konfiguracja zaktualizowana");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export const ELEVENLABS_VOICES = [
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", gender: "male", style: "Profesjonalny" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "male", style: "Neutralny" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male", style: "Przyjazny" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", style: "Profesjonalny" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", gender: "female", style: "Ciepły" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", style: "Neutralny" },
];
