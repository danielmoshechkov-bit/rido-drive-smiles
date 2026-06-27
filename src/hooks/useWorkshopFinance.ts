import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ---- Płatności (workshop_payments) — Pack 1 ----
export type PaymentMethod = 'gotowka' | 'karta' | 'blik' | 'przelew';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'gotowka', label: 'Gotówka' },
  { value: 'karta', label: 'Karta' },
  { value: 'blik', label: 'BLIK' },
  { value: 'przelew', label: 'Przelew' },
];

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
}

export function useWorkshopPaymentsForOrder(orderId?: string) {
  return useQuery({
    queryKey: ['workshop-payments', 'order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_payments')
        .select('*')
        .eq('order_id', orderId)
        .order('paid_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateWorkshopPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, orderId, invoiceId, splits }: {
      providerId: string;
      orderId?: string;
      invoiceId?: string;
      splits: PaymentSplit[];
    }) => {
      const rows = splits
        .filter((s) => s.amount > 0)
        .map((s) => ({
          provider_id: providerId,
          order_id: orderId ?? null,
          invoice_id: invoiceId ?? null,
          method: s.method,
          amount: s.amount,
        }));
      if (rows.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('workshop_payments')
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-payments'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
