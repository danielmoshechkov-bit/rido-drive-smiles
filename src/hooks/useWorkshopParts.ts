import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ---- Integration config ----
export function usePartsIntegrations(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-parts-integrations', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_parts_integrations')
        .select('*')
        .eq('provider_id', providerId);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpsertPartsIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (integration: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_parts_integrations')
        .upsert(integration, { onConflict: 'provider_id,supplier_code' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-parts-integrations'] });
      toast.success('Integracja zapisana');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Parts API calls ----
export function usePartsApi() {
  return useMutation({
    mutationFn: async (payload: {
      action: string;
      provider_id: string;
      supplier_code?: string;
      params?: any;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await supabase.functions.invoke('workshop-parts-api', {
        body: payload,
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
  });
}

// ---- Parts orders ----
export function usePartsOrders(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-parts-orders', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_parts_orders')
        .select('*, items:workshop_parts_order_items(*)')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreatePartsOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ order, items }: { order: any; items: any[] }) => {
      const { data: orderData, error: orderErr } = await (supabase as any)
        .from('workshop_parts_orders')
        .insert(order)
        .select()
        .single();
      if (orderErr) throw orderErr;

      if (items.length > 0) {
        const itemsWithOrderId = items.map(item => ({
          ...item,
          parts_order_id: orderData.id,
        }));
        const { error: itemsErr } = await (supabase as any)
          .from('workshop_parts_order_items')
          .insert(itemsWithOrderId);
        if (itemsErr) throw itemsErr;
      }

      return orderData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-parts-orders'] });
      toast.success('Zamówienie złożone pomyślnie!');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
