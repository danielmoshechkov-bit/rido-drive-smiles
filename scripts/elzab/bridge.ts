/**
 * Mostek fiskalny GetRido — lokalny serwer drukowania.
 *
 * PO CO: edge function działa w chmurze Supabase i nie ma jak wejść do sieci lokalnej
 * klienta, a przeglądarka nie potrafi otworzyć surowego gniazda TCP. Mostek zamyka tę lukę:
 * działa na komputerze w warsztacie, przyjmuje HTTP z przeglądarki i gada z drukarką
 * dokładnie tą samą biblioteką ElzabESC co edge function.
 *
 * Uruchomienie:
 *   npm run fiscal:bridge
 *   FISCAL_BRIDGE_PORT=9110 FISCAL_BRIDGE_TOKEN=tajne npm run fiscal:bridge
 *
 * BEZPIECZEŃSTWO
 *  • nasłuchuje wyłącznie na 127.0.0.1 — z sieci nikt się nie dobije,
 *  • CORS tylko dla znanych adresów GetRido (dowolna strona w internecie nie wydrukuje),
 *  • opcjonalny token (FISCAL_BRIDGE_TOKEN) wymagany w nagłówku X-Fiscal-Token.
 */

import http from 'node:http';
import { ElzabClient } from '../../supabase/functions/_shared/elzab/client.ts';
import { toUserMessage, ElzabError } from '../../supabase/functions/_shared/elzab/errors.ts';
import type { ReceiptRequest } from '../../supabase/functions/_shared/elzab/types.ts';
import { createNodeTransport } from './transport-node.ts';

const PORT = Number(process.env.FISCAL_BRIDGE_PORT ?? 9110);
const TOKEN = process.env.FISCAL_BRIDGE_TOKEN ?? '';
const VERSION = '1.0.0';

const ALLOWED_ORIGINS = [
  'https://getrido.pl',
  'https://www.getrido.pl',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  ...(process.env.FISCAL_BRIDGE_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
];

interface PrinterConfig {
  host: string;
  port?: number;
  codepage?: string;
  itemNameLength?: 28 | 40;
  commandTimeoutMs?: number;
}

const log = (message: string) => console.log(`[${new Date().toLocaleTimeString('pl-PL')}] ${message}`);

function corsHeaders(origin?: string): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'content-type, x-fiscal-token',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function send(res: http.ServerResponse, status: number, body: unknown, origin?: string) {
  res.writeHead(status, { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function withPrinter<T>(printer: PrinterConfig, action: (client: ElzabClient) => Promise<T>): Promise<T> {
  const transport = await createNodeTransport({
    host: printer.host,
    port: printer.port ?? 9100,
    connectTimeoutMs: 8000,
  });
  const client = new ElzabClient(transport, {
    commandTimeoutMs: printer.commandTimeoutMs ?? 10_000,
    printTimeoutMs: 30_000,
  });
  try {
    await client.drain();
    return await action(client);
  } finally {
    await client.close().catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin as string | undefined;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  const url = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && (url === '/health' || url === '/')) {
    send(res, 200, { ok: true, name: 'rido-fiscal-bridge', version: VERSION, tokenRequired: Boolean(TOKEN) }, origin);
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { ok: false, code: 'METHOD', message: 'Dozwolona jest wyłącznie metoda POST.' }, origin);
    return;
  }

  if (TOKEN && req.headers['x-fiscal-token'] !== TOKEN) {
    send(res, 401, { ok: false, code: 'UNAUTHORIZED', message: 'Nieprawidłowy token mostka.' }, origin);
    return;
  }

  let body: any;
  try {
    body = await readBody(req);
  } catch {
    send(res, 400, { ok: false, code: 'BAD_JSON', message: 'Nieprawidłowe dane żądania.' }, origin);
    return;
  }

  const printer: PrinterConfig = body?.printer ?? {};
  if (!printer.host) {
    send(res, 400, { ok: false, code: 'NO_PRINTER', message: 'Brak adresu drukarki w żądaniu.' }, origin);
    return;
  }

  try {
    if (url === '/print') {
      const receipt = body.receipt as ReceiptRequest;
      log(`drukowanie: ${receipt?.items?.length ?? 0} pozycji → ${printer.host}:${printer.port ?? 9100}`);
      const result = await withPrinter(printer, (client) =>
        client.printReceipt({
          ...receipt,
          codepage: (printer.codepage as ReceiptRequest['codepage']) ?? receipt.codepage,
          itemNameLength: printer.itemNameLength ?? receipt.itemNameLength,
        }),
      );
      log(`wydrukowano paragon nr ${result.receiptNumber ?? '?'} (${(result.totalGrosze / 100).toFixed(2)} zł)`);
      send(res, 200, {
        ok: true,
        receiptNumber: result.receiptNumber ?? null,
        totalGrosze: result.totalGrosze,
        trace: result.trace,
      }, origin);
      return;
    }

    if (url === '/test') {
      const result = await withPrinter(printer, async (client) => {
        const clock = await client.getClock();
        const lastReceipt = await client.getLastReceiptNumber();
        return { clock: clock.iso, lastReceiptNumber: lastReceipt.value ?? null };
      });
      log(`test połączenia OK — zegar ${result.clock}`);
      send(res, 200, { ok: true, ...result, message: `Mostek połączył się z drukarką ${printer.host}.` }, origin);
      return;
    }

    if (url === '/day-report') {
      await withPrinter(printer, (client) => client.printDayReport());
      log('raport dobowy wykonany');
      send(res, 200, { ok: true, message: 'Raport dobowy wykonany.' }, origin);
      return;
    }

    send(res, 404, { ok: false, code: 'NOT_FOUND', message: 'Nieznany endpoint mostka.' }, origin);
  } catch (error) {
    const code = error instanceof ElzabError ? error.code : 'UNKNOWN';
    const message = toUserMessage(error);
    log(`BŁĄD [${code}] ${message}`);
    send(res, 502, {
      ok: false,
      code,
      message,
      trace: (error as ElzabError & { trace?: string[] }).trace,
    }, origin);
  }
});

// Wyłącznie pętla zwrotna: mostek jest widoczny tylko dla przeglądarki na tym komputerze.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Mostek fiskalny GetRido ${VERSION}`);
  console.log(`  nasłuchuje na http://127.0.0.1:${PORT}  (tylko ten komputer)`);
  console.log(`  token: ${TOKEN ? 'wymagany' : 'wyłączony'}`);
  console.log(`  dozwolone adresy: ${ALLOWED_ORIGINS.join(', ')}\n`);
});
