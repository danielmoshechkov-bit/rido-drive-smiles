/**
 * fiscal-day-report — raport dobowy fiskalny (Esc 25H). DRUKUJE.
 *
 * Drukarka blokuje sprzedaż, jeśli od ostatniego raportu minęły 48 h.
 * Funkcja przyjmuje też wywołania wewnętrzne kluczem service_role — pod przyszły
 * auto-raport (TODO w README: wyzwalanie przy pierwszym logowaniu / pierwszym paragonie dnia).
 *
 * POST { providerId?, printerId?, skipIfDoneToday? }
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
import { connectPrinter, ElzabError, toUserMessage } from '../_shared/elzab/index.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(405, 'METHOD', 'Dozwolona jest wyłącznie metoda POST.');

  const caller = await resolveCaller(req);
  if (!caller) return fail(401, 'UNAUTHORIZED', 'Wymagane zalogowanie.');

  const body = await req.json().catch(() => ({})) as {
    providerId?: string;
    printerId?: string;
    skipIfDoneToday?: boolean;
  };
  const admin = adminClient();

  const provider = await resolveProviderId(admin, caller, body.providerId);
  if ('error' in provider) return provider.error;

  const printerResult = await loadPrinter(admin, provider.providerId, body.printerId);
  if ('error' in printerResult) return printerResult.error;
  const printer = printerResult.printer as typeof printerResult.printer & { last_day_report_at?: string | null };

  if (body.skipIfDoneToday && printer.last_day_report_at) {
    const last = new Date(printer.last_day_report_at);
    const today = new Date();
    const sameDay =
      last.getFullYear() === today.getFullYear() &&
      last.getMonth() === today.getMonth() &&
      last.getDate() === today.getDate();
    if (sameDay) {
      return json({ ok: true, skipped: true, message: 'Raport dobowy został już dziś wykonany.' });
    }
  }

  let client;
  try {
    client = await connectPrinter({
      host: printer.host,
      port: printer.port,
      commandTimeoutMs: printer.command_timeout_ms,
    });
    await client.drain();
    await client.printDayReport();

    const now = new Date().toISOString();
    await updatePrinterStatus(admin, printer.id, { status: 'online', message: null, dayReportAt: now });

    return json({
      ok: true,
      skipped: false,
      message:
        printer.mode === 'training'
          ? 'Raport dobowy wykonany (tryb szkoleniowy — wydruk niefiskalny).'
          : 'Raport dobowy fiskalny wykonany.',
      dayReportAt: now,
    });
  } catch (error) {
    const code = error instanceof ElzabError ? error.code : 'UNKNOWN';
    const message = toUserMessage(error);
    await updatePrinterStatus(admin, printer.id, {
      status: code === 'CONNECTION' || code === 'TIMEOUT' ? 'offline' : 'error',
      message,
    });
    return fail(502, code, message);
  } finally {
    await client?.close().catch(() => {});
  }
});
