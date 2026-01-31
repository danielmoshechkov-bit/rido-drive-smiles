import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AIAgentCall {
  id: string;
  config_id: string;
  lead_id: string | null;
  call_status: string;
  call_sid: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  outcome: string | null;
  booking_slot_id: string | null;
  transcript: string | null;
  ai_summary: string | null;
  sentiment: string | null;
  cost_minutes: number;
  tokens_used: number;
  created_at: string;
  lead?: {
    company_name: string;
    phone: string;
  };
}

export interface AIAgentCallStats {
  total_calls: number;
  completed_calls: number;
  booked_meetings: number;
  total_minutes: number;
  avg_duration: number;
  conversion_rate: number;
}

export function useAIAgentCalls(configId?: string) {
  return useQuery({
    queryKey: ["ai-agent-calls", configId],
    queryFn: async () => {
      if (!configId) return [];

      const { data, error } = await supabase
        .from("ai_agent_calls")
        .select(`
          *,
          lead:sales_leads(company_name, phone)
        `)
        .eq("config_id", configId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as AIAgentCall[];
    },
    enabled: !!configId,
  });
}

export function useAIAgentCallStats(configId?: string) {
  return useQuery({
    queryKey: ["ai-agent-call-stats", configId],
    queryFn: async () => {
      if (!configId) return null;

      const { data, error } = await supabase
        .from("ai_agent_calls")
        .select("*")
        .eq("config_id", configId);

      if (error) throw error;

      const calls = data || [];
      const completedCalls = calls.filter(c => c.call_status === "completed");
      const bookedMeetings = calls.filter(c => c.outcome === "booked");
      const totalMinutes = calls.reduce((sum, c) => sum + (c.cost_minutes || 0), 0);
      const totalDuration = completedCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);

      return {
        total_calls: calls.length,
        completed_calls: completedCalls.length,
        booked_meetings: bookedMeetings.length,
        total_minutes: totalMinutes,
        avg_duration: completedCalls.length > 0 ? totalDuration / completedCalls.length : 0,
        conversion_rate: completedCalls.length > 0 ? (bookedMeetings.length / completedCalls.length) * 100 : 0,
      } as AIAgentCallStats;
    },
    enabled: !!configId,
  });
}

export function useCreateAIAgentCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (call: Partial<AIAgentCall>) => {
      const { data, error } = await supabase
        .from("ai_agent_calls")
        .insert({
          config_id: call.config_id,
          lead_id: call.lead_id,
          call_status: call.call_status || "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-calls", data.config_id] });
      toast.success("Połączenie AI zainicjowane");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateAIAgentCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIAgentCall> & { id: string }) => {
      const { data, error } = await supabase
        .from("ai_agent_calls")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-calls", data.config_id] });
      queryClient.invalidateQueries({ queryKey: ["ai-agent-call-stats", data.config_id] });
    },
  });
}
