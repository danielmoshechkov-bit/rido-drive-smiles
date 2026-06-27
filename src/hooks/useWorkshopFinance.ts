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

// ---- Wydatki (workshop_expenses) — Pack 2 ----
export type ExpenseCategory = 'zakup' | 'oplata' | 'wyplata';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'zakup', label: 'Zakupy' },
  { value: 'oplata', label: 'Opłaty' },
  { value: 'wyplata', label: 'Wypłaty' },
];

export function useWorkshopExpenses(providerId?: string, filters?: { category?: ExpenseCategory | 'all'; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['workshop-expenses', providerId, filters],
    enabled: !!providerId,
    queryFn: async () => {
      let q = (supabase as any)
        .from('workshop_expenses')
        .select('*, employee:workshop_employees(id, name)')
        .eq('provider_id', providerId)
        .order('expense_date', { ascending: false });
      if (filters?.category && filters.category !== 'all') q = q.eq('category', filters.category);
      if (filters?.from) q = q.gte('expense_date', filters.from);
      if (filters?.to) q = q.lte('expense_date', filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateWorkshopExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (expense: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_expenses')
        .insert(expense)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-expenses'] });
      toast.success('Wydatek zapisany');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteWorkshopExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('workshop_expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workshop-expenses'] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// Załącznik dokumentu (faktura/paragon) → bucket 'documents'.
export async function uploadExpenseDocument(providerId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `workshop-expenses/${providerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await (supabase as any).storage.from('documents').upload(path, file, { upsert: false });
  if (error) { toast.error('Błąd uploadu dokumentu: ' + error.message); return null; }
  const { data } = (supabase as any).storage.from('documents').getPublicUrl(path);
  return data?.publicUrl || null;
}
