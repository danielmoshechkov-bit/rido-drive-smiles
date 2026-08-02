/**
 * Powiązanie sprzedaży fiskalnej z kasą gotówkową.
 *
 * Forma płatności wybrana na paragonie steruje przepływem pieniędzy:
 *   paragon → wpłata (workshop_payments)
 *   zwrot   → wypłata (workshop_expenses, kategoria 'wyplata')
 *   pomyłka → STORNO wpłaty (voided) — przy błędnym nabiciu pieniądze nigdy nie wpłynęły
 *             w tej wysokości, więc wydatek byłby nieprawdą w kasie
 *
 * Reguła anty-dublująca: zlecenie już opłacone nie dostaje drugiej wpłaty, a zaliczka
 * jest uzupełniana tylko o różnicę. W bazie pilnuje tego dodatkowo unikalny indeks
 * na (fiscal_receipt_id) dla nieanulowanych wpłat.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ReceiptPaymentMethod = 'cash' | 'card' | 'blik' | 'transfer';
export type CashMethod = 'gotowka' | 'karta' | 'blik' | 'przelew';

/** Forma płatności z paragonu → forma w kasie. */
export const CASH_METHOD_BY_RECEIPT: Record<ReceiptPaymentMethod, CashMethod> = {
  cash: 'gotowka',
  card: 'karta',
  blik: 'blik',
  transfer: 'przelew',
};

export const CASH_METHOD_LABELS: Record<CashMethod, string> = {
  gotowka: 'gotówka',
  karta: 'karta',
  blik: 'BLIK',
  przelew: 'przelew',
};

/** Suma nieanulowanych wpłat do zlecenia — podstawa reguły anty-dublującej. */
export function useOrderPaidGrosze(providerId?: string, orderId?: string) {
  return useQuery({
    queryKey: ['order-paid-grosze', providerId, orderId],
    enabled: Boolean(providerId && orderId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await (supabase as any)
        .from('workshop_payments')
        .select('amount, voided')
        .eq('provider_id', providerId)
        .eq('order_id', orderId);
      if (error) throw error;
      return ((data as any[]) ?? [])
        .filter((row) => row.voided !== true)
        .reduce((sum, row) => sum + Math.round((Number(row.amount) || 0) * 100), 0);
    },
  });
}

export interface RegisterReceiptPaymentInput {
  receiptId: string;
  /** Zlecenie źródłowe — brak oznacza sprzedaż od ręki (szybki paragon). */
  orderId?: string | null;
  amountGrosze: number;
  method: ReceiptPaymentMethod;
  createdByName?: string;
}

export interface RegisterReceiptPaymentResult {
  created: boolean;
  amountGrosze: number;
  reason?: 'already_paid';
}

/** Wpłata do kasy po udanej fiskalizacji. */
export function useRegisterReceiptPayment(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterReceiptPaymentInput): Promise<RegisterReceiptPaymentResult> => {
      if (!providerId) throw new Error('Brak firmy dla wpłaty.');

      let amountGrosze = input.amountGrosze;

      // Zlecenie mogło być opłacone wcześniej (zaliczka albo pełna wpłata przy odbiorze).
      if (input.orderId) {
        const { data } = await (supabase as any)
          .from('workshop_payments')
          .select('amount, voided')
          .eq('provider_id', providerId)
          .eq('order_id', input.orderId);
        const paid = ((data as any[]) ?? [])
          .filter((row) => row.voided !== true)
          .reduce((sum, row) => sum + Math.round((Number(row.amount) || 0) * 100), 0);
        amountGrosze = input.amountGrosze - paid;
        if (amountGrosze <= 0) {
          return { created: false, amountGrosze: 0, reason: 'already_paid' };
        }
      }

      const { error } = await (supabase as any).from('workshop_payments').insert({
        provider_id: providerId,
        order_id: input.orderId ?? null,
        method: CASH_METHOD_BY_RECEIPT[input.method],
        amount: amountGrosze / 100,
        fiscal_receipt_id: input.receiptId,
        created_by_name: input.createdByName ?? null,
      });
      // Wyścig przechwycony przez unikalny indeks — wpłata już istnieje, nie dublujemy.
      if (error && (error as any).code === '23505') {
        return { created: false, amountGrosze: 0, reason: 'already_paid' };
      }
      if (error) throw error;

      return { created: true, amountGrosze };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-cash-data'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-payments'] });
      queryClient.invalidateQueries({ queryKey: ['order-paid-grosze'] });
    },
  });
}

export interface RegisterReturnExpenseInput {
  returnId: string;
  returnNumber: string;
  receiptNumber?: number | null;
  amountGrosze: number;
  method: CashMethod;
}

/** Wypłata z kasy po zarejestrowaniu zwrotu — realne oddanie pieniędzy klientowi. */
export function useRegisterReturnExpense(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterReturnExpenseInput) => {
      if (!providerId) throw new Error('Brak firmy dla wypłaty.');
      const { error } = await (supabase as any).from('workshop_expenses').insert({
        provider_id: providerId,
        category: 'wyplata',
        subcategory: 'zwrot',
        description: `Zwrot ${input.returnNumber}${input.receiptNumber ? ` do paragonu nr ${input.receiptNumber}` : ''}`,
        amount: input.amountGrosze / 100,
        method: input.method,
        expense_date: new Date().toISOString().slice(0, 10),
        fiscal_return_id: input.returnId,
      });
      if (error && (error as any).code === '23505') return { created: false };
      if (error) throw error;
      return { created: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-cash-data'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-expenses'] });
    },
  });
}

/**
 * Storno wpłaty po korekcie oczywistej pomyłki.
 * Nie tworzymy wydatku — te pieniądze nigdy nie wpłynęły w błędnej wysokości.
 */
export function useVoidReceiptPayment(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { receiptId: string; correctionNumber: string }) => {
      const { data, error } = await (supabase as any)
        .from('workshop_payments')
        .update({
          voided: true,
          voided_at: new Date().toISOString(),
          void_reason: `Korekta oczywistej pomyłki ${input.correctionNumber}`,
        })
        .eq('fiscal_receipt_id', input.receiptId)
        .neq('voided', true)
        .select('id');
      if (error) throw error;
      return { voided: ((data as any[]) ?? []).length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-cash-data'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-payments'] });
      queryClient.invalidateQueries({ queryKey: ['order-paid-grosze'] });
    },
  });
}

/**
 * Ile zapłacono do każdego zlecenia — do kolumny „Płatność" na liście zleceń.
 *
 * PO CO: status zlecenia mówi, czy auto jest gotowe, ale nie mówi, czy klient zapłacił.
 * Bez tego trzeba było wchodzić w każde zlecenie po kolei albo szukać w Operacjach kasy.
 * Jedno zapytanie dla całej listy zamiast jednego na wiersz.
 */
export function useOrdersPaidMap(providerId?: string) {
  return useQuery({
    queryKey: ['workshop-orders-paid-map', providerId],
    enabled: Boolean(providerId),
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, { paid: number; methods: string[]; lastDate: string | null }>> => {
      const { data, error } = await (supabase as any)
        .from('workshop_payments')
        .select('order_id, amount, method, voided, paid_at')
        .eq('provider_id', providerId)
        .not('order_id', 'is', null);
      if (error) throw error;

      const map: Record<string, { paid: number; methods: string[]; lastDate: string | null }> = {};
      for (const row of ((data as any[]) ?? []).filter((r) => r.voided !== true)) {
        const entry = (map[row.order_id] ||= { paid: 0, methods: [], lastDate: null });
        entry.paid += Number(row.amount) || 0;
        if (row.method && !entry.methods.includes(row.method)) entry.methods.push(row.method);
        const date = row.paid_at ? String(row.paid_at).slice(0, 10) : null;
        if (date && (!entry.lastDate || date > entry.lastDate)) entry.lastDate = date;
      }
      return map;
    },
  });
}
