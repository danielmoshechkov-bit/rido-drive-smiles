import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useAISalesAgents() {
  return useQuery({
    queryKey: ['ai-sales-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_sales_agents' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    }
  });
}

export function useAISalesAgent(id: string | null) {
  return useQuery({
    queryKey: ['ai-sales-agent', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_sales_agents' as any)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as any;
    }
  });
}

export function useCreateAISalesAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agentData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie zalogowany');
      const { data, error } = await supabase
        .from('ai_sales_agents' as any)
        .insert({ ...agentData, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-sales-agents'] });
      toast.success('Agent utworzony');
    },
    onError: (e: any) => toast.error('Błąd: ' + e.message)
  });
}

export function useUpdateAISalesAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = await supabase
        .from('ai_sales_agents' as any)
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-sales-agents'] });
      toast.success('Agent zaktualizowany');
    },
    onError: (e: any) => toast.error('Błąd: ' + e.message)
  });
}

export function useDeleteAISalesAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_sales_agents' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-sales-agents'] });
      toast.success('Agent usunięty');
    },
    onError: (e: any) => toast.error('Błąd: ' + e.message)
  });
}

export function useAISalesLeads(agentId?: string) {
  return useQuery({
    queryKey: ['ai-sales-leads', agentId],
    queryFn: async () => {
      let q = supabase.from('ai_sales_leads' as any).select('*').order('created_at', { ascending: false });
      if (agentId) q = q.eq('agent_id', agentId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }
  });
}

export function useAISalesConversations(agentId?: string) {
  return useQuery({
    queryKey: ['ai-sales-conversations', agentId],
    queryFn: async () => {
      let q = supabase.from('ai_sales_conversations' as any).select('*').order('created_at', { ascending: false });
      if (agentId) q = q.eq('agent_id', agentId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }
  });
}

export function useAISalesKnowledge(agentId?: string) {
  return useQuery({
    queryKey: ['ai-sales-knowledge', agentId],
    queryFn: async () => {
      let q = supabase.from('ai_sales_knowledge' as any).select('*').order('success_rate', { ascending: false });
      if (agentId) q = q.eq('agent_id', agentId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }
  });
}

export function useAISalesQuestionnaire(agentId: string | null) {
  return useQuery({
    queryKey: ['ai-sales-questionnaire', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_sales_questionnaire' as any)
        .select('*')
        .eq('agent_id', agentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });
}

export function useUpsertQuestionnaire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agent_id, ...data }: any) => {
      const { data: existing } = await supabase
        .from('ai_sales_questionnaire' as any)
        .select('id')
        .eq('agent_id', agent_id)
        .maybeSingle();
      
      if (existing) {
        const { error } = await supabase
          .from('ai_sales_questionnaire' as any)
          .update(data)
          .eq('agent_id', agent_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ai_sales_questionnaire' as any)
          .insert({ agent_id, ...data });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-sales-questionnaire'] });
    },
    onError: (e: any) => toast.error('Błąd zapisu: ' + e.message)
  });
}
