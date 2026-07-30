/**
 * fiscal-receipt-session — cykl życia wpisu w logu paragonów: rezerwuj → zatwierdź.
 *
 * Potrzebne przy druku przez mostek lokalny: z drukarką gada przeglądarka (mostek),
 * ale log musi pozostać niemodyfikowalny z klienta — dlatego zapisy idą przez tę funkcję
 * kluczem service_role. Ścieżka chmurowa (fiscalize-receipt) robi to samo wewnętrznie.
 *
 * POST { action: 'reserve' | 'finalize' | 'resolve', ... }
 *
 *  reserve  { providerId?, printerId, documentType, documentId, items, payments, vatMap,
 *             buyerNip?, paymentRef?, totalGrosze, printerMode, printerNumberBefore? }
 *           → { ok, receiptId }  albo 409, gdy dokument już zafiskalizowany
 *
 *  finalize { receiptId, ok, receiptNumber?, trace?, errorCode?, errorMessage? }
 *           → { ok, status }
 *
 *  resolve  { receiptId, currentPrinterNumber? , decision?: 'printed' | 'failed' }
 *           → rozstrzyga wpis, który utknął w stanie 'printing'.
 *             Automatycznie: licznik drukarki wzrósł względem printer_number_before
 *             → paragon jednak wyszedł. Ręcznie: decision od użytkownika (fallback,
 *             gdy nie ma połączenia z drukarką).
 */

import {
  adminClient,
  alreadyFiscalizedResponse,
  fail,
  findBlockingReceipt,
  hasProviderAccess,
  isDuplicateReceiptError,
  json,
  preflight,
  resolveCaller,
  resolveProviderId,
} from '../_shared/fiscal-access.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(405, 'METHOD', 'Dozwolona jest wyłącznie metoda POST.');

  const caller = await resolveCaller(req);
  if (!caller) return fail(401, 'UNAUTHORIZED', 'Wymagane zalogowanie.');

  const body = await req.json().catch(() => null) as Record<string, any> | null;
  if (!body?.action) return fail(400, 'BAD_REQUEST', 'Brak akcji w żądaniu.');

  const admin = adminClient();

  // ── REZERWACJA ─────────────────────────────────────────────────────
  if (body.action === 'reserve') {
    const provider = await resolveProviderId(admin, caller, body.providerId);
    if ('error' in provider) return provider.error;

    const documentType = body.documentType || 'external';
    if (body.documentId) {
      const blocking = await findBlockingReceipt(admin, documentType, body.documentId);
      if (blocking) return alreadyFiscalizedResponse(blocking);
    }

    const { data, error } = await admin
      .from('fiscal_receipts')
      .insert({
        provider_id: provider.providerId,
        printer_id: body.printerId ?? null,
        document_type: documentType,
        document_id: body.documentId ?? null,
        payment_ref: body.paymentRef ?? null,
        status: 'printing',
        items: body.items ?? [],
        payments: body.payments ?? [],
        vat_map: body.vatMap ?? {},
        total_grosze: body.totalGrosze ?? 0,
        buyer_nip: body.buyerNip ?? null,
        printer_mode: body.printerMode ?? null,
        printer_number_before: body.printerNumberBefore ?? null,
        created_by: caller.userId,
      })
      .select('id')
      .single();

    if (error) {
      // Wyścig: drugie okno zdążyło zarezerwować pierwsze.
      if (isDuplicateReceiptError(error) && body.documentId) {
        const blocking = await findBlockingReceipt(admin, documentType, body.documentId);
        if (blocking) return alreadyFiscalizedResponse(blocking);
      }
      return fail(500, 'DB_ERROR', `Nie udało się zarezerwować paragonu: ${error.message}`);
    }

    return json({ ok: true, receiptId: data.id });
  }

  // ── ZATWIERDZENIE ──────────────────────────────────────────────────
  if (body.action === 'finalize') {
    if (!body.receiptId) return fail(400, 'BAD_REQUEST', 'Brak identyfikatora paragonu.');

    const { data: receipt } = await admin
      .from('fiscal_receipts')
      .select('id, provider_id, status, printer_id')
      .eq('id', body.receiptId)
      .maybeSingle();
    if (!receipt) return fail(404, 'NOT_FOUND', 'Nie znaleziono wpisu paragonu.');

    if (!caller.isService && !(await hasProviderAccess(admin, caller.userId!, receipt.provider_id))) {
      return fail(403, 'FORBIDDEN', 'Brak dostępu do tego paragonu.');
    }

    const update = body.ok
      ? {
          status: 'printed',
          printer_receipt_number: body.receiptNumber ?? null,
          printed_at: new Date().toISOString(),
          trace: body.trace ?? null,
        }
      : {
          status: 'failed',
          error_code: body.errorCode ?? 'UNKNOWN',
          error_message: body.errorMessage ?? 'Nieznany błąd fiskalizacji.',
          trace: body.trace ?? null,
        };

    const { error } = await admin.from('fiscal_receipts').update(update).eq('id', body.receiptId);
    if (error) return fail(500, 'DB_ERROR', `Nie udało się zapisać wyniku: ${error.message}`);

    if (receipt.printer_id) {
      await admin
        .from('fiscal_printers')
        .update(
          body.ok
            ? { last_status: 'online', last_status_message: null, last_seen_at: new Date().toISOString() }
            : { last_status: 'error', last_status_message: body.errorMessage ?? null },
        )
        .eq('id', receipt.printer_id);
    }

    return json({ ok: true, status: update.status });
  }

  // ── ROZSTRZYGNIĘCIE UTKNIĘTEJ REZERWACJI ───────────────────────────
  if (body.action === 'resolve') {
    if (!body.receiptId) return fail(400, 'BAD_REQUEST', 'Brak identyfikatora paragonu.');

    const { data: receipt } = await admin
      .from('fiscal_receipts')
      .select('id, provider_id, status, printer_number_before')
      .eq('id', body.receiptId)
      .maybeSingle();
    if (!receipt) return fail(404, 'NOT_FOUND', 'Nie znaleziono wpisu paragonu.');
    if (receipt.status !== 'printing') {
      return json({ ok: true, status: receipt.status, message: 'Ten wpis został już rozstrzygnięty.' });
    }
    if (!caller.isService && !(await hasProviderAccess(admin, caller.userId!, receipt.provider_id))) {
      return fail(403, 'FORBIDDEN', 'Brak dostępu do tego paragonu.');
    }

    // Automatycznie: licznik paragonów drukarki wzrósł → paragon jednak wyszedł.
    let printed: boolean | null = null;
    let how = 'manual';
    if (typeof body.currentPrinterNumber === 'number' && receipt.printer_number_before !== null) {
      printed = body.currentPrinterNumber > receipt.printer_number_before;
      how = 'counter';
    } else if (body.decision === 'printed' || body.decision === 'failed') {
      printed = body.decision === 'printed';
    }

    if (printed === null) {
      return fail(
        400,
        'RESOLVE_UNDECIDED',
        'Nie da się rozstrzygnąć automatycznie — brak licznika drukarki sprzed wydruku. Wskaż ręcznie, czy paragon wyszedł.',
      );
    }

    const update = printed
      ? {
          status: 'printed',
          printer_receipt_number: typeof body.currentPrinterNumber === 'number' ? body.currentPrinterNumber : null,
          printed_at: new Date().toISOString(),
          error_code: null,
          error_message:
            how === 'counter'
              ? 'Rozstrzygnięto automatycznie: licznik paragonów drukarki wzrósł, paragon wyszedł.'
              : 'Rozstrzygnięto ręcznie: użytkownik potwierdził wydruk paragonu.',
        }
      : {
          status: 'failed',
          error_code: 'NOT_PRINTED',
          error_message:
            how === 'counter'
              ? 'Rozstrzygnięto automatycznie: licznik paragonów drukarki nie wzrósł, paragon nie wyszedł.'
              : 'Rozstrzygnięto ręcznie: użytkownik potwierdził, że paragon nie wyszedł.',
        };

    const { error } = await admin.from('fiscal_receipts').update(update).eq('id', body.receiptId);
    if (error) return fail(500, 'DB_ERROR', `Nie udało się rozstrzygnąć wpisu: ${error.message}`);

    return json({ ok: true, status: update.status, resolvedBy: how });
  }

  return fail(400, 'BAD_ACTION', `Nieznana akcja: ${body.action}`);
});
