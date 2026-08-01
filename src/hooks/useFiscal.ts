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

/**
 * Znaczniki dokumentów fiskalnych dla listy zleceń: co zostało wystawione do każdego
 * zlecenia. Liczone z czterech źródeł jednym zestawem zapytań, bo zwroty i korekty
 * wskazują na paragon, a nie wprost na zlecenie.
 *
 * Znaczniki są trwałe: wynikają z dokumentów, nie ze stanu zlecenia, więc zostają
 * również po jego zakończeniu.
 */
export interface DocumentBadges {
  receiptNumber: number | null;
  receiptId: string | null;
  hasReceipt: boolean;
  hasInvoice: boolean;
  hasReturn: boolean;
  hasCorrection: boolean;
}

export function useOrderDocumentBadges(providerId?: string, documentType = 'workshop_order') {
  return useQuery({
    queryKey: ['fiscal-order-badges', providerId, documentType],
    enabled: Boolean(providerId),
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, DocumentBadges>> => {
      const [receipts, invoices, returns, corrections] = await Promise.all([
        (supabase as any)
          .from('fiscal_receipts')
          .select('id, document_id, status, printer_receipt_number')
          .eq('provider_id', providerId)
          .eq('document_type', documentType)
          .in('status', ['printing', 'printed']),
        (supabase as any).from('user_invoices').select('workshop_order_id').not('workshop_order_id', 'is', null),
        (supabase as any).from('fiscal_returns').select('receipt_id').eq('provider_id', providerId),
        (supabase as any).from('fiscal_corrections').select('receipt_id').eq('provider_id', providerId),
      ]);
      if (receipts.error) throw receipts.error;

      const badges = new Map<string, DocumentBadges>();
      const receiptToDocument = new Map<string, string>();

      for (const row of ((receipts.data as any[]) ?? [])) {
        if (!row.document_id) continue;
        receiptToDocument.set(row.id, row.document_id);
        badges.set(row.document_id, {
          receiptId: row.id,
          receiptNumber: row.printer_receipt_number ?? null,
          hasReceipt: true,
          hasInvoice: false,
          hasReturn: false,
          hasCorrection: false,
        });
      }

      const ensure = (documentId: string): DocumentBadges => {
        const existing = badges.get(documentId);
        if (existing) return existing;
        const fresh: DocumentBadges = {
          receiptId: null,
          receiptNumber: null,
          hasReceipt: false,
          hasInvoice: false,
          hasReturn: false,
          hasCorrection: false,
        };
        badges.set(documentId, fresh);
        return fresh;
      };

      for (const row of ((invoices.data as any[]) ?? [])) {
        if (row.workshop_order_id) ensure(row.workshop_order_id).hasInvoice = true;
      }
      for (const row of ((returns.data as any[]) ?? [])) {
        const documentId = receiptToDocument.get(row.receipt_id);
        if (documentId) ensure(documentId).hasReturn = true;
      }
      for (const row of ((corrections.data as any[]) ?? [])) {
        const documentId = receiptToDocument.get(row.receipt_id);
        if (documentId) ensure(documentId).hasCorrection = true;
      }

      return badges;
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

/** Zapamiętuje NIP przy kliencie — kolejne dokumenty podciągną go automatycznie. */
export function useRememberClientNip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientId: string; nip: string; setCompany?: boolean }) => {
      const patch: Record<string, unknown> = { nip: input.nip };
      if (input.setCompany) patch.client_type = 'company';
      const { error } = await (supabase as any)
        .from('workshop_clients')
        .update(patch)
        .eq('id', input.clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-clients'] });
    },
  });
}

/** Trwałe nazwy fiskalne z katalogu produktów/usług: id → nazwa na paragon. */
export function useCatalogFiscalNames(productIds: string[]) {
  const key = [...new Set(productIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['fiscal-catalog-names', key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await (supabase as any)
        .from('inventory_products')
        .select('id, fiscal_name')
        .in('id', key)
        .not('fiscal_name', 'is', null);
      if (error) throw error;
      return Object.fromEntries(
        ((data as Array<{ id: string; fiscal_name: string }>) ?? []).map((row) => [row.id, row.fiscal_name]),
      );
    },
  });
}

/** Zapamiętuje nazwę fiskalną przy produkcie w katalogu — kolejne paragony użyją jej same. */
export function useRememberFiscalName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productId: string; fiscalName: string }) => {
      const { error } = await (supabase as any)
        .from('inventory_products')
        .update({ fiscal_name: input.fiscalName })
        .eq('id', input.productId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-catalog-names'] }),
  });
}

// ── Zwroty i reklamacje ─────────────────────────────────────────────
// Paragonu nie da się cofnąć — zwrot jest ODRĘBNYM dokumentem w ewidencji,
// prowadzonej poza kasą. Nic tutaj nie dotyka drukarki fiskalnej.

export interface FiscalReturnRow {
  id: string;
  receipt_id: string;
  return_number: string;
  returned_at: string;
  reason: 'zwrot_towaru' | 'reklamacja' | 'pomylka_kasjera';
  reason_note: string | null;
  items: Array<{ name: string; quantity: number; unitPrice: number; vatRate: string; amount: number }>;
  amount_grosze: number;
  vat_breakdown: Record<string, number>;
  customer_name: string | null;
  customer_document: string | null;
  created_at: string;
}

export const RETURN_REASON_LABELS: Record<string, string> = {
  zwrot_towaru: 'Zwrot towaru',
  reklamacja: 'Reklamacja',
  pomylka_kasjera: 'Pomyłka kasjera',
};

/** Zwroty wystawione do danego paragonu (albo wszystkie tenanta). */
export function useFiscalReturns(providerId?: string, receiptId?: string) {
  return useQuery({
    queryKey: ['fiscal-returns', providerId, receiptId],
    enabled: Boolean(providerId),
    queryFn: async (): Promise<FiscalReturnRow[]> => {
      let query = (supabase as any)
        .from('fiscal_returns')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (receiptId) query = query.eq('receipt_id', receiptId);
      const { data, error } = await query;
      if (error) throw error;
      return (data as FiscalReturnRow[]) ?? [];
    },
  });
}

export interface CreateReturnInput {
  receiptId: string;
  reason: FiscalReturnRow['reason'];
  reasonNote?: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; vatRate: string; amount: number }>;
  amountGrosze: number;
  vatBreakdown: Record<string, number>;
  customerName?: string;
  customerDocument?: string;
}

/** Kolejny numer w serii ZW/RRRR/NNN dla tenanta. */
async function nextReturnNumber(providerId: string): Promise<string> {
  const year = new Date().getFullYear();
  const { data } = await (supabase as any)
    .from('fiscal_returns')
    .select('return_number')
    .eq('provider_id', providerId)
    .like('return_number', `ZW/${year}/%`)
    .order('return_number', { ascending: false })
    .limit(1);
  const last = (data as Array<{ return_number: string }>)?.[0]?.return_number;
  const lastNumber = last ? Number(last.split('/').pop()) || 0 : 0;
  return `ZW/${year}/${String(lastNumber + 1).padStart(3, '0')}`;
}

export function useCreateFiscalReturn(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReturnInput): Promise<FiscalReturnRow> => {
      if (!providerId) throw new FiscalError('NO_PROVIDER', 'Brak firmy dla zwrotu.');

      // Kolizja numeru jest wyłapana przez unikalny indeks — wtedy ponawiamy raz.
      for (let attempt = 0; attempt < 2; attempt++) {
        const returnNumber = await nextReturnNumber(providerId);
        const { data: userData } = await supabase.auth.getUser();
        const { data, error } = await (supabase as any)
          .from('fiscal_returns')
          .insert({
            provider_id: providerId,
            receipt_id: input.receiptId,
            return_number: returnNumber,
            reason: input.reason,
            reason_note: input.reasonNote ?? null,
            items: input.items,
            amount_grosze: input.amountGrosze,
            vat_breakdown: input.vatBreakdown,
            customer_name: input.customerName ?? null,
            customer_document: input.customerDocument ?? null,
            created_by: userData?.user?.id ?? null,
          })
          .select('*')
          .single();

        if (!error) return data as FiscalReturnRow;
        if (error.code === '23505' && attempt === 0) continue; // zajęty numer — bierzemy kolejny
        // Komunikat z triggera kontroli sumy jest już po polsku.
        throw new FiscalError(error.code ?? 'DB_ERROR', error.message);
      }
      throw new FiscalError('DB_ERROR', 'Nie udało się nadać numeru zwrotu.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-returns', providerId] });
    },
  });
}

// ── Ewidencja oczywistych pomyłek (odrębna od zwrotów) ──────────────

export interface FiscalCorrectionRow {
  id: string;
  receipt_id: string;
  correction_number: string;
  corrected_at: string;
  sale_date: string | null;
  receipt_number: number | null;
  wrong_amount_grosze: number;
  wrong_vat_grosze: number;
  vat_breakdown: Record<string, number>;
  items: unknown[];
  reason_note: string;
  original_receipt_attached: boolean;
  report_date: string | null;
  created_at: string;
}

export function useFiscalCorrections(providerId?: string, receiptId?: string) {
  return useQuery({
    queryKey: ['fiscal-corrections', providerId, receiptId],
    enabled: Boolean(providerId),
    queryFn: async (): Promise<FiscalCorrectionRow[]> => {
      let query = (supabase as any)
        .from('fiscal_corrections')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (receiptId) query = query.eq('receipt_id', receiptId);
      const { data, error } = await query;
      if (error) throw error;
      return (data as FiscalCorrectionRow[]) ?? [];
    },
  });
}

/**
 * Rejestracja pomyłki idzie przez edge function: poza wpisem do ewidencji ustawia
 * superseded_by_correction_id, czyli odblokowuje ponowną, prawidłową fiskalizację —
 * a tego z klienta zrobić się nie da (log paragonów jest niemodyfikowalny).
 */
export function useRegisterCorrection(providerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      receiptId: string;
      reasonNote: string;
      wrongVatGrosze?: number;
      vatBreakdown?: Record<string, number>;
      originalReceiptAttached?: boolean;
    }) =>
      invokeFiscal<{ ok: true; correction: FiscalCorrectionRow }>('fiscal-receipt-session', {
        action: 'register-correction',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-corrections', providerId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-receipts', providerId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-document-state'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents-printed', providerId] });
    },
  });
}

// ── Faktury powiązane z modułem fiskalnym ───────────────────────────

export interface FiscalInvoiceRow {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  buyer_name: string | null;
  ksef_status: string | null;
  is_correction: boolean | null;
  workshop_order_id: string | null;
  fiscal_receipt_id: string | null;
}

export function useFiscalInvoices(providerId?: string) {
  return useQuery({
    queryKey: ['fiscal-invoices', providerId],
    enabled: Boolean(providerId),
    queryFn: async (): Promise<FiscalInvoiceRow[]> => {
      const { data, error } = await (supabase as any)
        .from('user_invoices')
        .select('id, invoice_number, issue_date, buyer_name, ksef_status, is_correction, workshop_order_id, fiscal_receipt_id')
        .not('workshop_order_id', 'is', null)
        .order('issue_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as FiscalInvoiceRow[]) ?? [];
    },
  });
}

// ── Podsumowanie okresu (podstawa eksportu RO do JPK_V7) ────────────

export interface FiscalPeriodSummary {
  from: string;
  to: string;
  receiptsCount: number;
  grossGrosze: number;
  returnsGrosze: number;
  correctionsGrosze: number;
  netGrosze: number;
  vatByRate: Record<string, number>;
  days: Array<{ date: string; grossGrosze: number; receipts: number }>;
}

/**
 * Sprzedaż z kasy księguje się z raportów, a nie z pojedynczych paragonów — dlatego
 * podsumowanie liczy obrót brutto i pomniejsza go o obie ewidencje, przypisując
 * korekty do daty PIERWOTNEJ sprzedaży.
 */
export function useFiscalPeriodSummary(providerId?: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ['fiscal-period-summary', providerId, from, to],
    enabled: Boolean(providerId && from && to),
    queryFn: async (): Promise<FiscalPeriodSummary> => {
      const fromIso = `${from}T00:00:00.000Z`;
      const toIso = `${to}T23:59:59.999Z`;

      const [receipts, returns, corrections] = await Promise.all([
        (supabase as any)
          .from('fiscal_receipts')
          .select('total_grosze, printed_at, created_at, items, status')
          .eq('provider_id', providerId)
          .eq('status', 'printed')
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
        (supabase as any)
          .from('fiscal_returns')
          .select('amount_grosze, vat_breakdown, sale_date, returned_at')
          .eq('provider_id', providerId)
          .gte('returned_at', from)
          .lte('returned_at', to),
        (supabase as any)
          .from('fiscal_corrections')
          .select('wrong_amount_grosze, vat_breakdown, sale_date, corrected_at')
          .eq('provider_id', providerId)
          .gte('corrected_at', from)
          .lte('corrected_at', to),
      ]);

      if (receipts.error) throw receipts.error;
      if (returns.error) throw returns.error;
      if (corrections.error) throw corrections.error;

      const days = new Map<string, { grossGrosze: number; receipts: number }>();
      const vatByRate: Record<string, number> = {};
      let grossGrosze = 0;

      for (const row of (receipts.data as any[]) ?? []) {
        grossGrosze += row.total_grosze ?? 0;
        const day = String(row.printed_at ?? row.created_at).slice(0, 10);
        const entry = days.get(day) ?? { grossGrosze: 0, receipts: 0 };
        entry.grossGrosze += row.total_grosze ?? 0;
        entry.receipts += 1;
        days.set(day, entry);
        for (const item of Array.isArray(row.items) ? row.items : []) {
          const rate = String((item as any)?.vatRate ?? '23');
          const value = Math.round((Number((item as any)?.unitPrice) || 0) * 100 * (Number((item as any)?.quantity) || 0));
          vatByRate[rate] = (vatByRate[rate] ?? 0) + value;
        }
      }

      const returnsGrosze = ((returns.data as any[]) ?? []).reduce((sum, r) => sum + (r.amount_grosze ?? 0), 0);
      const correctionsGrosze = ((corrections.data as any[]) ?? []).reduce(
        (sum, c) => sum + (c.wrong_amount_grosze ?? 0),
        0,
      );

      return {
        from: from!,
        to: to!,
        receiptsCount: ((receipts.data as any[]) ?? []).length,
        grossGrosze,
        returnsGrosze,
        correctionsGrosze,
        netGrosze: grossGrosze - returnsGrosze - correctionsGrosze,
        vatByRate,
        days: [...days.entries()]
          .map(([date, value]) => ({ date, ...value }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
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
