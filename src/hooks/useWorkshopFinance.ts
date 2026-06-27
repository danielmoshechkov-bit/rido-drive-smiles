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

export function useWorkshopPaymentsRange(providerId?: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ['workshop-payments', 'range', providerId, from, to],
    enabled: !!providerId,
    queryFn: async () => {
      let q = (supabase as any)
        .from('workshop_payments').select('*').eq('provider_id', providerId);
      if (from) q = q.gte('paid_at', from);
      if (to) q = q.lte('paid_at', to + 'T23:59:59');
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

// Wszystkie operacje kasowe providera (do skumulowanego salda + feedu). MVP: pełny
// zaciąg, sumowanie po stronie klienta.
export function useWorkshopCashData(providerId?: string) {
  return useQuery({
    queryKey: ['workshop-cash-data', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const [p, e, po] = await Promise.all([
        (supabase as any).from('workshop_payments').select('*').eq('provider_id', providerId),
        (supabase as any).from('workshop_expenses').select('*').eq('provider_id', providerId),
        (supabase as any).from('workshop_employee_payouts').select('*').eq('provider_id', providerId),
      ]);
      if (p.error) throw p.error;
      if (e.error) throw e.error;
      if (po.error) throw po.error;
      return { payments: p.data || [], expenses: e.data || [], payouts: po.data || [] };
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

// ---- Grafik warsztatu (workshop_finance_settings) — Pack 4 ----
export type PayUnit = 'hour' | 'day' | 'week' | 'month';
export type PayoutType = 'zaliczka' | 'wyplata' | 'premia';

export interface FinanceSettings {
  provider_id: string;
  work_days: number[];   // ISO 1=pon … 7=niedz
  work_start: string;    // 'HH:MM'
  work_end: string;
}

const DEFAULT_SETTINGS = { work_days: [1, 2, 3, 4, 5], work_start: '08:00', work_end: '16:00' };

export function useWorkshopFinanceSettings(providerId?: string) {
  return useQuery({
    queryKey: ['workshop-finance-settings', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_finance_settings').select('*').eq('provider_id', providerId).maybeSingle();
      if (error) throw error;
      return data || { provider_id: providerId, ...DEFAULT_SETTINGS };
    },
  });
}

export function useSaveFinanceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: any) => {
      const { error } = await (supabase as any)
        .from('workshop_finance_settings')
        .upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'provider_id' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workshop-finance-settings'] }); toast.success('Grafik zapisany'); },
    onError: (e: any) => toast.error(e.message),
  });
}

// Liczba dni roboczych (wg grafiku) w przedziale [from, to].
function workingDaysInRange(from: string, to: string, workDays: number[]): number {
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  if (end < start) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const iso = d.getDay() === 0 ? 7 : d.getDay(); // JS 0=niedz → ISO 7
    if (workDays.includes(iso)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Należność bazowa za okres ze stawki + jednostki, znormalizowana przez grafik.
export function computeBaseDue(
  payRate: number | null | undefined,
  payUnit: PayUnit | null | undefined,
  settings: { work_days: number[]; work_start: string; work_end: string },
  from: string,
  to: string,
): number {
  const rate = Number(payRate) || 0;
  if (!rate || !payUnit) return 0;
  const workDays = settings.work_days?.length ? settings.work_days : DEFAULT_SETTINGS.work_days;
  const days = workingDaysInRange(from, to, workDays);
  const perWeek = workDays.length || 5;
  const perMonth = perWeek * 4.33;
  const [sh, sm] = (settings.work_start || '08:00').split(':').map(Number);
  const [eh, em] = (settings.work_end || '16:00').split(':').map(Number);
  const hoursPerDay = Math.max(0, (eh + em / 60) - (sh + sm / 60));
  switch (payUnit) {
    case 'hour':  return Math.round(rate * days * hoursPerDay * 100) / 100;
    case 'day':   return Math.round(rate * days * 100) / 100;
    case 'week':  return Math.round(rate * (days / perWeek) * 100) / 100;
    case 'month': return Math.round(rate * (days / perMonth) * 100) / 100;
    default:      return 0;
  }
}

// ---- Wypłaty / zaliczki / premie (workshop_employee_payouts) — Pack 4 ----
export function useWorkshopPayouts(providerId?: string, filters?: { employeeId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['workshop-payouts', providerId, filters],
    enabled: !!providerId,
    queryFn: async () => {
      let q = (supabase as any)
        .from('workshop_employee_payouts')
        .select('*')
        .eq('provider_id', providerId)
        .order('paid_at', { ascending: false });
      if (filters?.employeeId) q = q.eq('employee_id', filters.employeeId);
      if (filters?.from) q = q.gte('paid_at', filters.from);
      if (filters?.to) q = q.lte('paid_at', filters.to + 'T23:59:59');
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreatePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: any) => {
      const { data, error } = await (supabase as any).from('workshop_employee_payouts').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workshop-payouts'] }); toast.success('Pozycja zapisana'); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateEmployeePay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pay_rate, pay_unit }: { id: string; pay_rate: number; pay_unit: PayUnit }) => {
      const { error } = await (supabase as any)
        .from('workshop_employees').update({ pay_rate, pay_unit }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workshop-payroll-employees'] }),
    onError: (e: any) => toast.error(e.message),
  });
}
