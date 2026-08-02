/**
 * Publiczne API biblioteki ElzabESC.
 *
 * Użycie w edge function:
 *   const printer = await connectPrinter({ host, port });
 *   try { const result = await printer.printReceipt({ items, vatMap }); }
 *   finally { await printer.close(); }
 */

export * from './types.ts';
export * from './errors.ts';
export { ElzabClient, parseClock, parseCounter } from './client.ts';
export { prepareReceipt, type PreparedReceipt } from './receipt.ts';
export * as commands from './commands.ts';
export { hex, toGrosze } from './codec.ts';
export {
  encodeText,
  decodeText,
  encodeCp1250,
  decodeCp1250,
  CODEPAGES,
  DEFAULT_CODEPAGE,
  type Codepage,
} from './codepages.ts';
export type { ElzabTransport, TransportFactory, TransportOptions } from './transport.ts';

import { ElzabClient, type ElzabClientOptions } from './client.ts';
import { createDenoTransport } from './transport-deno.ts';
import type { PrinterConnectionConfig } from './types.ts';

/** Łączy się z drukarką w środowisku Deno (edge function). */
export async function connectPrinter(
  config: PrinterConnectionConfig,
  options: ElzabClientOptions = {},
): Promise<ElzabClient> {
  const transport = await createDenoTransport({
    host: config.host,
    port: config.port,
    connectTimeoutMs: config.connectTimeoutMs ?? 8000,
  });
  return new ElzabClient(transport, {
    commandTimeoutMs: config.commandTimeoutMs ?? 10_000,
    ...options,
  });
}
