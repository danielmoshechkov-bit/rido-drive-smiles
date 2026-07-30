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
  type BridgePrinter,
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

      // Ścieżka lokalna: drukuje mostek na tym komputerze. Log prowadzi edge function
      // (rezerwuj → drukuj → zatwierdź), żeby blokada podwójnej fiskalizacji i
      // niemodyfikowalność logu działały tak samo jak w ścieżce chmurowej.
      const totalGrosze = computeReceiptTotalGrosze(input.items);
      const payments = input.payments?.length
        ? input.payments
        : [{ name: 'GOTOWKA', amount: totalGrosze / 100 }];
      const bridgePrinter: BridgePrinter = bridgePrinterOf(printer);

      // Licznik paragonów sprzed wydruku — pozwala rozstrzygnąć rezerwację,
      // gdyby przeglądarka padła między wydrukiem a zatwierdzeniem.
      let printerNumberBefore: number | undefined;
      try {
        const status = await bridgeTest(bridge, bridgePrinter);
        printerNumberBefore = status.lastReceiptNumber ?? undefined;
      } catch (error) {
        throw toFiscalError(error, bridge);
      }

      const reservation = await invokeFiscal<{ ok: true; receiptId: string }>('fiscal-receipt-session', {
        action: 'reserve',
        providerId: printer.provider_id,
        printerId: printer.id,
        documentType: input.documentType || 'external',
        documentId: input.documentId,
        paymentRef: input.paymentRef,
        items: input.items,
        payments,
        vatMap: printer.vat_map,
        buyerNip: input.buyerNip,
        totalGrosze,
        printerMode: printer.mode,
        printerNumberBefore,
      });

      try {
        const result = await bridgePrint(bridge, bridgePrinter, {
          items: input.items,
          payments,
          buyerNip: input.buyerNip,
          vatMap: printer.vat_map,
          codepage: printer.codepage,
          itemNameLength: printer.item_name_length,
        });

        await invokeFiscal('fiscal-receipt-session', {
          action: 'finalize',
          receiptId: reservation.receiptId,
          ok: true,
          receiptNumber: result.receiptNumber,
          trace: result.trace,
        });

        return {
          ok: true,
          receiptId: reservation.receiptId,
          receiptNumber: result.receiptNumber,
          totalGrosze: result.totalGrosze ?? totalGrosze,
          total: (result.totalGrosze ?? totalGrosze) / 100,
          printerMode: printer.mode,
          status: 'printed',
        };
      } catch (error) {
        const fiscalError = toFiscalError(error, bridge);
        // Zwolnienie rezerwacji: 'failed' nie wchodzi do indeksu, więc można ponowić.
        await invokeFiscal('fiscal-receipt-session', {
          action: 'finalize',
          receiptId: reservation.receiptId,
          ok: false,
          errorCode: fiscalError.code,
          errorMessage: fiscalError.message,
        }).catch(() => {});
        throw fiscalError;
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-receipts', providerId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-printer', providerId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-document-state'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents-printed', providerId] });
    },
  });
}

/**
 * Stan fiskalizacji konkretnego dokumentu.
 * Blokują wyłącznie 'printed' (paragon wyszedł) i 'printing' (trwa rezerwacja);
 * 'failed'/'cancelled' oznaczają, że obrót nie został zarejestrowany — wolno ponowić.
 */
export interface DocumentFiscalState {
  blocking: FiscalReceiptRow | null;
  lastFailed: FiscalReceiptRow | null;
  isPrinted: boolean;
  isInProgress: boolean;
  isStuck: boolean;
}

export const STALE_PRINTING_MINUTES = 5;

export function useDocumentFiscalState(providerId?: string, documentType = 'workshop_order', documentId?: string) {
  return useQuery({
    queryKey: ['fiscal-document-state', providerId, documentType, documentId],
    enabled: Boolean(providerId && documentId),
    queryFn: async (): Promise<DocumentFiscalState> => {
      const { data, error } = await (supabase as any)
        .from('fiscal_receipts')
        .select('*')
        .eq('provider_id', providerId)
        .eq('document_type', documentType)
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data as FiscalReceiptRow[]) ?? [];
      const blocking = rows.find((r) => r.status === 'printed' || r.status === 'printing') ?? null;
      const stuck =
        blocking?.status === 'printing' &&
        Date.now() - new Date(blocking.created_at).getTime() > STALE_PRINTING_MINUTES * 60_000;
      return {
        blocking,
        lastFailed: rows.find((r) => r.status === 'failed' || r.status === 'cancelled') ?? null,
        isPrinted: blocking?.status === 'printed',
        isInProgress: blocking?.status === 'printing' && !stuck,
        isStuck: Boolean(stuck),
      };
    },
  });
}

/** Identyfikatory dokumentów, które mają już paragon — do wyszarzenia opcji na liście. */
export function useFiscalizedDocumentIds(providerId?: string, documentType = 'workshop_order') {
  return useQuery({
    queryKey: ['fiscal-documents-printed', providerId, documentType],
    enabled: Boolean(providerId),
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from('fiscal_receipts')
        .select('document_id, status')
        .eq('provider_id', providerId)
        .eq('document_type', documentType)
        .in('status', ['printing', 'printed']);
      if (error) throw error;
      return new Set(((data as Array<{ document_id: string | null }>) ?? []).map((r) => r.document_id).filter(Boolean) as string[]);
    },
  });
}

/** Rozstrzyga wpis, który utknął w stanie 'printing'. */
export function useResolveStuckReceipt(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { receiptId: string; printer?: FiscalPrinter | null; decision?: 'printed' | 'failed' }) => {
      let currentPrinterNumber: number | undefined;
      const bridge = getBridgeConfig(providerId);
      // Najpierw próba automatyczna: licznik paragonów z drukarki.
      if (bridge.enabled && input.printer) {
        try {
          const status = await bridgeTest(bridge, bridgePrinterOf(input.printer));
          currentPrinterNumber = status.lastReceiptNumber ?? undefined;
        } catch {
          // brak połączenia — zostaje decyzja użytkownika
        }
      }
      return invokeFiscal<{ ok: true; status: string; resolvedBy: string }>('fiscal-receipt-session', {
        action: 'resolve',
        receiptId: input.receiptId,
        currentPrinterNumber,
        decision: input.decision,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-document-state'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-receipts', providerId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents-printed', providerId] });
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
