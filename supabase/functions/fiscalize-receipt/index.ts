/**
 * fiscalize-receipt — drukuje paragon fiskalny na drukarce tenanta.
 *
 * Moduł jest branżowo neutralny: na wejściu dostaje wyłącznie pozycje, formy płatności
 * i luźny identyfikator dokumentu źródłowego. Nie wie i nie sprawdza, skąd te pozycje
 * pochodzą (zlecenie warsztatowe, dźwig, faktura, POS).
 *
 * Kolejność: płatność jest już potwierdzona po stronie wywołującego → fiskalizacja.
 * Sumy walidujemy lokalnie PRZED wysyłką, bo drukarka zgłasza niezgodność dopiero
 * na Esc 24H i unieważnia cały paragon.
 *
 * POST {
 *   providerId?, printerId?,
 *   documentType?, documentId?, paymentRef?,
 *   items:    [{ name, quantity, unit?, unitPrice, vatRate, total? }],
 *   payments?:[{ name, amount }],
 *   buyerNip?
 * }
 */

import {
  adminClient,
  fail,
  json,
  loadPrinter,
  preflight,
  resolveCaller,
  resolveProviderId,
  updatePrinterStatus,
} from '../_shared/fiscal-access.ts';
import {
  connectPrinter,
  ElzabError,
  prepareReceipt,
  toUserMessage,
  type ReceiptItem,
  type ReceiptPayment,
} from '../_shared/elzab/index.ts';

interface Body {
  providerId?: string;
  printerId?: string;
  documentType?: string;
  documentId?: string;
  paymentRef?: string;
  items?: ReceiptItem[];
  payments?: ReceiptPayment[];
  buyerNip?: string;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(405, 'METHOD', 'Dozwolona jest wyłącznie metoda POST.');

  const caller = await resolveCaller(req);
  if (!caller) return fail(401, 'UNAUTHORIZED', 'Wymagane zalogowanie.');

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'BAD_JSON', 'Nieprawidłowe dane żądania.');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return fail(400, 'NO_ITEMS', 'Paragon nie zawiera żadnych pozycji.');
  }

  const admin = adminClient();

  const provider = await resolveProviderId(admin, caller, body.providerId);
  if ('error' in provider) return provider.error;

  const printerResult = await loadPrinter(admin, provider.providerId, body.printerId);
  if ('error' in printerResult) return printerResult.error;
  const printer = printerResult.printer;

  // ── 1. Walidacja lokalna (zanim cokolwiek poleci na port 9100) ──────
  const request = {
    items: body.items,
    payments: body.payments,
    buyerNip: body.buyerNip,
    vatMap: printer.vat_map,
    codepage: printer.codepage,
    itemNameLength: printer.item_name_length,
  };

  let prepared;
  try {
    prepared = prepareReceipt(request);
  } catch (error) {
    return fail(400, error instanceof ElzabError ? error.code : 'VALIDATION', toUserMessage(error));
  }

  // ── 2. Wpis w logu (snapshot pozycji z chwili fiskalizacji) ─────────
  const snapshot = {
    provider_id: provider.providerId,
    printer_id: printer.id,
    document_type: body.documentType || 'external',
    document_id: body.documentId ?? null,
    payment_ref: body.paymentRef ?? null,
    status: 'printing',
    items: body.items as unknown as Record<string, unknown>[],
    payments: prepared.payments.map((p) => ({ name: p.name, amount: p.grosze / 100 })),
    vat_map: printer.vat_map,
    total_grosze: prepared.totalGrosze,
    buyer_nip: prepared.buyerNip ?? null,
    printer_mode: printer.mode,
    created_by: caller.userId,
  };

  const { data: receiptRow, error: insertError } = await admin
    .from('fiscal_receipts')
    .insert(snapshot)
    .select('id')
    .single();
  if (insertError) {
    return fail(500, 'DB_ERROR', `Nie udało się zapisać paragonu w logu: ${insertError.message}`);
  }
  const receiptId = receiptRow.id as string;

  // ── 3. Wydruk ──────────────────────────────────────────────────────
  const client = await connectPrinter({
    host: printer.host,
    port: printer.port,
    commandTimeoutMs: printer.command_timeout_ms,
  }).catch((error) => error as ElzabError);

  if (client instanceof Error) {
    await admin
      .from('fiscal_receipts')
      .update({
        status: 'failed',
        error_code: client instanceof ElzabError ? client.code : 'CONNECTION',
        error_message: toUserMessage(client),
      })
      .eq('id', receiptId);
    await updatePrinterStatus(admin, printer.id, { status: 'offline', message: toUserMessage(client) });
    return fail(502, 'CONNECTION', toUserMessage(client), { receiptId });
  }

  try {
    const result = await client.printReceipt(request);

    await admin
      .from('fiscal_receipts')
      .update({
        status: 'printed',
        printer_receipt_number: result.receiptNumber ?? null,
        printed_at: new Date().toISOString(),
        trace: result.trace,
      })
      .eq('id', receiptId);
    await updatePrinterStatus(admin, printer.id, { status: 'online', message: null });

    return json({
      ok: true,
      receiptId,
      receiptNumber: result.receiptNumber ?? null,
      totalGrosze: result.totalGrosze,
      total: result.totalGrosze / 100,
      printerMode: printer.mode,
      status: 'printed',
    });
  } catch (error) {
    const code = error instanceof ElzabError ? error.code : 'UNKNOWN';
    const message = toUserMessage(error);
    const trace = (error as ElzabError & { trace?: string[] }).trace ?? client.trace;

    await admin
      .from('fiscal_receipts')
      .update({ status: 'failed', error_code: code, error_message: message, trace })
      .eq('id', receiptId);
    await updatePrinterStatus(admin, printer.id, {
      status: code === 'TIMEOUT' || code === 'CONNECTION' ? 'offline' : 'error',
      message,
    });

    return fail(502, code, message, { receiptId });
  } finally {
    await client.close().catch(() => {});
  }
});
