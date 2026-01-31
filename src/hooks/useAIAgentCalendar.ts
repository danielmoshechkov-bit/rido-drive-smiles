import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AIAgentCalendarSlot {
  id: string;
  config_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
  lead_id: string | null;
  call_id: string | null;
  booking_notes: string | null;
  confirmed_at: string | null;
  reminder_sent: boolean;
  created_at: string;
  lead?: {
    company_name: string;
    phone: string;
  };
}

export function useAIAgentCalendarSlots(configId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["ai-agent-calendar-slots", configId, dateFrom, dateTo],
    queryFn: async () => {
      if (!configId) return [];

      let query = supabase
        .from("ai_agent_calendar_slots")
        .select(`
          *,
          lead:sales_leads(company_name, phone)
        `)
        .eq("config_id", configId)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (dateFrom) {
        query = query.gte("slot_date", dateFrom);
      }
      if (dateTo) {
        query = query.lte("slot_date", dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AIAgentCalendarSlot[];
    },
    enabled: !!configId,
  });
}

export function useCreateCalendarSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slot: Omit<AIAgentCalendarSlot, "id" | "created_at" | "lead">) => {
      const { data, error } = await supabase
        .from("ai_agent_calendar_slots")
        .insert({
          config_id: slot.config_id,
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          status: slot.status || "available",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-calendar-slots", data.config_id] });
      toast.success("Slot dodany do kalendarza");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateCalendarSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIAgentCalendarSlot> & { id: string }) => {
      const { data, error } = await supabase
        .from("ai_agent_calendar_slots")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-calendar-slots", data.config_id] });
      toast.success("Slot zaktualizowany");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteCalendarSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, configId }: { id: string; configId: string }) => {
      const { error } = await supabase
        .from("ai_agent_calendar_slots")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { configId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-calendar-slots", data.configId] });
      toast.success("Slot usunięty");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useBookCalendarSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      slotId, 
      leadId, 
      callId, 
      notes 
    }: { 
      slotId: string; 
      leadId: string; 
      callId?: string; 
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("ai_agent_calendar_slots")
        .update({
          status: "booked",
          lead_id: leadId,
          call_id: callId,
          booking_notes: notes,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", slotId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-calendar-slots", data.config_id] });
      toast.success("Termin zarezerwowany");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
