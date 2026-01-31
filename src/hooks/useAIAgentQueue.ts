import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AIAgentQueueItem {
  id: string;
  config_id: string;
  lead_id: string;
  priority: number;
  scheduled_at: string | null;
  status: string;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  processing_started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  lead?: {
    id: string;
    company_name: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
}

export function useAIAgentQueue(configId?: string) {
  return useQuery({
    queryKey: ["ai-agent-queue", configId],
    queryFn: async () => {
      if (!configId) return [];

      const { data, error } = await supabase
        .from("ai_agent_call_queue" as any)
        .select(`
          *,
          lead:sales_leads(id, company_name, first_name, last_name, phone, email)
        `)
        .eq("config_id", configId)
        .order("priority", { ascending: true })
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as AIAgentQueueItem[];
    },
    enabled: !!configId,
  });
}

export function useAddToQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      configId, 
      leadId, 
      priority = 5, 
      scheduledAt 
    }: { 
      configId: string; 
      leadId: string; 
      priority?: number; 
      scheduledAt?: string;
    }) => {
      const { data, error } = await supabase
        .from("ai_agent_call_queue" as any)
        .insert([{
          config_id: configId,
          lead_id: leadId,
          priority,
          scheduled_at: scheduledAt,
          status: "pending"
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-queue"] });
      toast.success("Lead dodany do kolejki połączeń");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useRemoveFromQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (queueItemId: string) => {
      const { error } = await supabase
        .from("ai_agent_call_queue" as any)
        .delete()
        .eq("id", queueItemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-queue"] });
      toast.success("Lead usunięty z kolejki");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateQueueItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      ...updates 
    }: Partial<AIAgentQueueItem> & { id: string }) => {
      const { data, error } = await supabase
        .from("ai_agent_call_queue" as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-queue"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
