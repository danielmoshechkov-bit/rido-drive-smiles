/**
 * fiscal-printer-test — healthcheck drukarki pod przycisk „Testuj połączenie".
 *
 * Używa odczytu zegara (Esc 35H): to jedyna sekwencja, która na Zeta Online zawsze
 * odpowiada ACK. Identyfikacja (Esc F6H) zwraca NAK na tym firmware, więc jej nie używamy.
 * Nic nie drukuje.
 *
 * POST { providerId?, printerId? }
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

  const body = await req.json().catch(() => ({})) as { providerId?: string; printerId?: string };
  const admin = adminClient();

  const provider = await resolveProviderId(admin, caller, body.providerId);
  if ('error' in provider) return provider.error;

  const printerResult = await loadPrinter(admin, provider.providerId, body.printerId);
  if ('error' in printerResult) return printerResult.error;
  const printer = printerResult.printer;

  const started = Date.now();
  let client;
  try {
    client = await connectPrinter({
      host: printer.host,
      port: printer.port,
      commandTimeoutMs: Math.min(printer.command_timeout_ms, 8000),
      connectTimeoutMs: 6000,
    });
    await client.drain();

    const clock = await client.getClock();
    const status = await client.readStatusSafe();
    const lastReceipt = await client.getLastReceiptNumber();

    await updatePrinterStatus(admin, printer.id, { status: 'online', message: null, clock: clock.iso });

    // Rozjazd zegara drukarki bywa powodem odrzucenia raportu dobowego — pokazujemy go w UI.
    const driftMinutes = Math.round(Math.abs(Date.now() - new Date(clock.iso).getTime()) / 60000);

    return json({
      ok: true,
      status: 'online',
      message: `Połączono z drukarką ${printer.host}:${printer.port} w ${Date.now() - started} ms.`,
      clock: clock.iso,
      clockDriftMinutes: driftMinutes,
      lastReceiptNumber: lastReceipt.value ?? null,
      printerMode: printer.mode,
      statusBytes: status,
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
