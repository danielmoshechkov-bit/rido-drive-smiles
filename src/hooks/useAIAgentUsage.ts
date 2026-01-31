import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AIAgentUsage {
  id: string;
  config_id: string;
  month: string;
  calls_count: number;
  minutes_used: number;
  tokens_used: number;
  bookings_count: number;
  is_limit_reached: boolean;
  created_at: string;
  updated_at: string;
}

export function useAIAgentUsage(configId?: string) {
  return useQuery({
    queryKey: ["ai-agent-usage", configId],
    queryFn: async () => {
      if (!configId) return [];

      const { data, error } = await supabase
        .from("ai_agent_usage")
        .select("*")
        .eq("config_id", configId)
        .order("month", { ascending: false })
        .limit(12);

      if (error) throw error;
      return data as AIAgentUsage[];
    },
    enabled: !!configId,
  });
}

export function useCurrentMonthUsage(configId?: string) {
  return useQuery({
    queryKey: ["ai-agent-usage-current", configId],
    queryFn: async () => {
      if (!configId) return null;

      const currentMonth = new Date().toISOString().slice(0, 7) + "-01";

      const { data, error } = await supabase
        .from("ai_agent_usage")
        .select("*")
        .eq("config_id", configId)
        .eq("month", currentMonth)
        .maybeSingle();

      if (error) throw error;
      return data as AIAgentUsage | null;
    },
    enabled: !!configId,
  });
}
