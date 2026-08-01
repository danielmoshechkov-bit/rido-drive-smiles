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
import net from 'node:net';
import os from 'node:os';
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

/**
 * Adresy sieci lokalnych tego komputera (prefiksy /24).
 * Skanujemy wyłącznie maskę 255.255.255.0 — 254 adresy to sekundy, a większa sieć
 * to godziny i zachowanie nie do odróżnienia od skanera portów.
 */
function localSubnets(): string[] {
  const prefixes: string[] = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      if (address.netmask !== '255.255.255.0') continue;
      const prefix = address.address.split('.').slice(0, 3).join('.');
      if (!prefixes.includes(prefix)) prefixes.push(prefix);
    }
  }
  return prefixes;
}

/** Czy pod adresem jest otwarty port — tanie sito przed rozmową protokołem. */
function isPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

export interface FoundPrinter {
  host: string;
  port: number;
  clock: string;
  lastReceiptNumber: number | null;
}

/**
 * Szuka drukarki fiskalnej w sieci lokalnej.
 *
 * Otwarty port 9100 ma też każda zwykła drukarka sieciowa, więc kandydata potwierdzamy
 * odczytem zegara ElzabESC — to komenda tylko do odczytu, nie rusza stanu fiskalnego.
 * Znany adres sprawdzamy pierwszy: po zwykłej zmianie IP z DHCP zwykle i tak wygrywa,
 * a wtedy nie skanujemy w ogóle.
 */
async function scanForPrinters(options: {
  port: number;
  knownHost?: string;
  probeTimeoutMs: number;
}): Promise<{ devices: FoundPrinter[]; subnets: string[]; scanned: number }> {
  const { port, knownHost, probeTimeoutMs } = options;

  const identify = async (host: string): Promise<FoundPrinter | null> => {
    try {
      const result = await withPrinter({ host, port, commandTimeoutMs: 3000 }, async (client) => {
        const clock = await client.getClock();
        const counter = await client.getLastReceiptNumber().catch(() => ({ value: undefined }));
        return { clock: clock.iso, lastReceiptNumber: counter.value ?? null };
      });
      return { host, port, ...result };
    } catch {
      return null; // port otwarty, ale to nie jest drukarka fiskalna
    }
  };

  if (knownHost && (await isPortOpen(knownHost, port, probeTimeoutMs))) {
    const found = await identify(knownHost);
    if (found) return { devices: [found], subnets: [], scanned: 1 };
  }

  const subnets = localSubnets();
  const candidates: string[] = [];
  let scanned = 0;

  for (const prefix of subnets) {
    const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`).filter((h) => h !== knownHost);
    for (let i = 0; i < hosts.length; i += 64) {
      const batch = hosts.slice(i, i + 64);
      const open = await Promise.all(batch.map((host) => isPortOpen(host, port, probeTimeoutMs)));
      scanned += batch.length;
      batch.forEach((host, index) => open[index] && candidates.push(host));
    }
  }

  log(`skan sieci: ${scanned} adresów, ${candidates.length} z otwartym portem ${port}`);

  const devices: FoundPrinter[] = [];
  for (const host of candidates) {
    const found = await identify(host);
    if (found) devices.push(found);
  }
  return { devices, subnets, scanned };
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

  // Skan jako jedyny nie wymaga znanego adresu — po to właśnie jest.
  if (url === '/scan') {
    try {
      const port = Number(body?.port ?? printer.port ?? 9100);
      const result = await scanForPrinters({
        port,
        knownHost: printer.host || body?.knownHost || undefined,
        // 1500 ms zmierzone na realnej sieci: przy 400 ms drukarka gubiła się w tłumie
        // 63 równoległych prób do martwych adresów (ARP nie nadąża) i skan wracał pusty.
        probeTimeoutMs: Number(body?.probeTimeoutMs ?? 1500),
      });
      log(`skan zakończony: znaleziono ${result.devices.length} drukarek`);
      send(res, 200, { ok: true, ...result }, origin);
    } catch (error) {
      log(`BŁĄD skanu: ${(error as Error).message}`);
      send(res, 500, { ok: false, code: 'SCAN_FAILED', message: 'Nie udało się przeskanować sieci.' }, origin);
    }
    return;
  }

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
