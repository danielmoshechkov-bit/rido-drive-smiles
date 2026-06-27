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

// ---- Opłaty cykliczne (workshop_recurring_costs) — Pack 3 ----
export type RecurringFrequency = 'weekly' | 'monthly';

// Reminder color like the OC/przegląd pattern: red ≤3 days (or overdue), yellow ≤7.
export function recurringReminderLevel(nextDueDate?: string | null): 'red' | 'yellow' | 'none' {
  if (!nextDueDate) return 'none';
  const due = new Date(nextDueDate + 'T00:00:00');
  const now = new Date();
  const days = Math.ceil((due.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  if (days <= 3) return 'red';
  if (days <= 7) return 'yellow';
  return 'none';
}

export function advanceDueDate(date: string, frequency: RecurringFrequency): string {
  const d = new Date(date + 'T00:00:00');
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function useWorkshopRecurringCosts(providerId?: string) {
  return useQuery({
    queryKey: ['workshop-recurring-costs', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_recurring_costs')
        .select('*')
        .eq('provider_id', providerId)
        .order('next_due_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateRecurringCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: any) => {
      const { data, error } = await (supabase as any).from('workshop_recurring_costs').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workshop-recurring-costs'] }); toast.success('Opłata cykliczna zapisana'); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateRecurringCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await (supabase as any).from('workshop_recurring_costs').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workshop-recurring-costs'] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteRecurringCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('workshop_recurring_costs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workshop-recurring-costs'] }),
    onError: (e: any) => toast.error(e.message),
  });
}
