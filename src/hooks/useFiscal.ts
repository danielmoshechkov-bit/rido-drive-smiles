/**
 * Hooki modułu fiskalnego: konfiguracja drukarki, testy połączenia, wydruk paragonu, log.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computeReceiptTotalGrosze, type FiscalItemInput } from '@/lib/fiscal';
import {
  bridgeDayReport,
  bridgePrint,
  bridgeTest,
  bridgeUnreachableMessage,
  getBridgeConfig,
  type BridgeConfig,
} from '@/lib/fiscalBridge';

export interface FiscalPrinter {
  id: string;
  provider_id: string;
  name: string;
  model: string | null;
  host: string;
  port: number;
  mode: 'training' | 'fiscal';
  codepage: string;
  connection_mode: 'direct' | 'tunnel';
  vat_map: Record<string, string>;
  item_name_length: number;
  default_unit: string;
  command_timeout_ms: number;
  is_active: boolean;
  is_default: boolean;
  last_status: 'online' | 'offline' | 'error' | null;
  last_status_message: string | null;
  last_seen_at: string | null;
  last_clock: string | null;
  last_day_report_at: string | null;
}

export interface FiscalReceiptRow {
  id: string;
  document_type: string;
  document_id: string | null;
  status: string;
  total_grosze: number;
  printer_receipt_number: number | null;
  printer_mode: string | null;
  payments: Array<{ name: string; amount: number }>;
  items: unknown[];
  error_code: string | null;
  error_message: string | null;
  printed_at: string | null;
  created_at: string;
}

/** Błąd zwrócony przez edge function — z kodem technicznym i komunikatem po polsku. */
export class FiscalError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FiscalError';
    this.code = code;
  }
}

/**
 * Wywołanie edge function z wyciągnięciem treści błędu.
 * supabase-js przy statusie != 2xx nie parsuje ciała, a to w nim jest polski komunikat.
 */
async function invokeFiscal<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let code = 'UNKNOWN';
    let message = 'Nie udało się połączyć z modułem fiskalnym.';
    const context = (error as any)?.context;
    if (context && typeof context.json === 'function') {
      try {
        const payload = await context.json();
        code = payload?.code || code;
        message = payload?.message || message;
      } catch {
        message = error.message || message;
      }
    } else if (error.message) {
      message = error.message;
    }
    throw new FiscalError(code, message);
  }
  if (data && (data as any).ok === false) {
    throw new FiscalError((data as any).code || 'UNKNOWN', (data as any).message || 'Błąd fiskalizacji.');
  }
  return data as T;
}

/** Dane drukarki w formacie oczekiwanym przez mostek. */
function bridgePrinterOf(printer: FiscalPrinter) {
  return {
    host: printer.host,
    port: printer.port,
    codepage: printer.codepage,
    itemNameLength: printer.item_name_length,
    commandTimeoutMs: printer.command_timeout_ms,
  };
}

/** Zamienia dowolny błąd mostka na FiscalError z komunikatem po polsku. */
function toFiscalError(error: unknown, bridge: BridgeConfig): FiscalError {
  const code = (error as any)?.code;
  if (code) return new FiscalError(code, (error as Error).message);
  // TypeError z fetch = mostek nie działa albo blokuje go CORS
  return new FiscalError('BRIDGE_UNREACHABLE', bridgeUnreachableMessage(bridge.url));
}

/** Konfiguracja drukarki tenanta (domyślna, aktywna). */
export function useFiscalPrinter(providerId?: string) {
  return useQuery({
    queryKey: ['fiscal-printer', providerId],
    enabled: Boolean(providerId),
    queryFn: async (): Promise<FiscalPrinter | null> => {
      const { data, error } = await (supabase as any)
        .from('fiscal_printers')
        .select('*')
        .eq('provider_id', providerId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as FiscalPrinter) ?? null;
    },
  });
}

export function useSaveFiscalPrinter(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (printer: Partial<FiscalPrinter> & { id?: string }) => {
      const payload = { ...printer, provider_id: providerId };
      const { data, error } = printer.id
        ? await (supabase as any).from('fiscal_printers').update(payload).eq('id', printer.id).select().single()
        : await (supabase as any).from('fiscal_printers').insert(payload).select().single();
      if (error) throw error;
      return data as FiscalPrinter;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-printer', providerId] }),
  });
}

export interface PrinterTestResult {
  ok: true;
  status: 'online';
  message: string;
  clock: string;
  clockDriftMinutes: number;
  lastReceiptNumber: number | null;
  printerMode: 'training' | 'fiscal';
}

export function useTestFiscalPrinter(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (printer?: FiscalPrinter | string) => {
      const bridge = getBridgeConfig(providerId);
      // Mostek na tym komputerze ma pierwszeństwo — drukarka i tak siedzi w tej samej sieci.
      if (bridge.enabled && typeof printer === 'object' && printer) {
        try {
          const result = await bridgeTest(bridge, bridgePrinterOf(printer));
          return {
            ok: true,
            status: 'online',
            message: result.message,
            clock: result.clock,
            clockDriftMinutes: 0,
            lastReceiptNumber: result.lastReceiptNumber,
            printerMode: printer.mode,
            via: 'bridge',
          } as PrinterTestResult;
        } catch (error) {
          throw toFiscalError(error, bridge);
        }
      }
      const printerId = typeof printer === 'string' ? printer : printer?.id;
      return invokeFiscal<PrinterTestResult>('fiscal-printer-test', { providerId, printerId });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['fiscal-printer', providerId] }),
  });
}

export function useFiscalDayReport(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (printer?: FiscalPrinter | string) => {
      const bridge = getBridgeConfig(providerId);
      if (bridge.enabled && typeof printer === 'object' && printer) {
        try {
          const result = await bridgeDayReport(bridge, bridgePrinterOf(printer));
          await (supabase as any)
            .from('fiscal_printers')
            .update({ last_day_report_at: new Date().toISOString(), last_status: 'online' })
            .eq('id', printer.id);
          return { ok: true as const, skipped: false, message: result.message };
        } catch (error) {
          throw toFiscalError(error, bridge);
        }
      }
      const printerId = typeof printer === 'string' ? printer : printer?.id;
      return invokeFiscal<{ ok: true; skipped: boolean; message: string }>('fiscal-day-report', { providerId, printerId });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['fiscal-printer', providerId] }),
  });
}

export interface FiscalizeInput {
  providerId?: string;
  printerId?: string;
  /** Pełna konfiguracja drukarki — wymagana przy druku przez mostek lokalny. */
  printer?: FiscalPrinter | null;
  documentType?: string;
  documentId?: string;
  paymentRef?: string;
  items: FiscalItemInput[];
  payments?: Array<{ name: string; amount: number }>;
  buyerNip?: string;
}

export interface FiscalizeResult {
  ok: true;
  receiptId: string;
  receiptNumber: number | null;
  totalGrosze: number;
  total: number;
  printerMode: 'training' | 'fiscal';
  status: 'printed';
}

export function useFiscalizeReceipt(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FiscalizeInput): Promise<FiscalizeResult> => {
      const bridge = getBridgeConfig(providerId);
      const printer = input.printer;

      // Ścieżka chmurowa: edge function sama łączy się z drukarką i prowadzi log.
      if (!bridge.enabled || !printer) {
        const { printer: _ignored, ...payload } = input;
        return invokeFiscal<FiscalizeResult>('fiscalize-receipt', { providerId, ...payload });
      }

      // Ścieżka lokalna: drukuje mostek na tym komputerze, log zapisujemy stąd
      // (RLS dopuszcza INSERT dla członków tenanta; UPDATE/DELETE jest zablokowane).
      const totalGrosze = computeReceiptTotalGrosze(input.items);
      const payments = input.payments?.length
        ? input.payments
        : [{ name: 'GOTOWKA', amount: totalGrosze / 100 }];
      const { data: userData } = await supabase.auth.getUser();

      const logRow = {
        provider_id: printer.provider_id,
        printer_id: printer.id,
        document_type: input.documentType || 'external',
        document_id: input.documentId ?? null,
        payment_ref: input.paymentRef ?? null,
        items: input.items,
        payments,
        vat_map: printer.vat_map,
        total_grosze: totalGrosze,
        buyer_nip: input.buyerNip ?? null,
        printer_mode: printer.mode,
        created_by: userData?.user?.id ?? null,
      };

      try {
        const result = await bridgePrint(bridge, bridgePrinterOf(printer), {
          items: input.items,
          payments,
          buyerNip: input.buyerNip,
          vatMap: printer.vat_map,
          codepage: printer.codepage,
          itemNameLength: printer.item_name_length,
        });

        await (supabase as any).from('fiscal_receipts').insert({
          ...logRow,
          status: 'printed',
          printer_receipt_number: result.receiptNumber,
          printed_at: new Date().toISOString(),
          trace: result.trace ?? null,
        });
        await (supabase as any)
          .from('fiscal_printers')
          .update({ last_status: 'online', last_status_message: null, last_seen_at: new Date().toISOString() })
          .eq('id', printer.id);

        return {
          ok: true,
          receiptId: '',
          receiptNumber: result.receiptNumber,
          totalGrosze: result.totalGrosze ?? totalGrosze,
          total: (result.totalGrosze ?? totalGrosze) / 100,
          printerMode: printer.mode,
          status: 'printed',
        };
      } catch (error) {
        const fiscalError = toFiscalError(error, bridge);
        await (supabase as any).from('fiscal_receipts').insert({
          ...logRow,
          status: 'failed',
          error_code: fiscalError.code,
          error_message: fiscalError.message,
        });
        throw fiscalError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-receipts', providerId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-printer', providerId] });
    },
  });
}

/** Log paragonów tenanta (opcjonalnie zawężony do jednego dokumentu). */
export function useFiscalReceipts(providerId?: string, documentId?: string, limit = 50) {
  return useQuery({
    queryKey: ['fiscal-receipts', providerId, documentId, limit],
    enabled: Boolean(providerId),
    queryFn: async (): Promise<FiscalReceiptRow[]> => {
      let query = (supabase as any)
        .from('fiscal_receipts')
        .select(
          'id, document_type, document_id, status, total_grosze, printer_receipt_number, printer_mode, payments, items, error_code, error_message, printed_at, created_at',
        )
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (documentId) query = query.eq('document_id', documentId);
      const { data, error } = await query;
      if (error) throw error;
      return (data as FiscalReceiptRow[]) ?? [];
    },
  });
}
