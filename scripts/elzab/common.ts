/**
 * Wspólne utilsy skryptów testowych (Node).
 * Konfiguracja przez ENV: ELZAB_HOST, ELZAB_PORT (domyślnie 192.168.0.114:9100).
 */

import { ElzabClient } from '../../supabase/functions/_shared/elzab/client.ts';
import { createNodeTransport } from './transport-node.ts';

export const HOST = process.env.ELZAB_HOST ?? '192.168.0.114';
export const PORT = Number(process.env.ELZAB_PORT ?? 9100);

export async function connect(options: { verbose?: boolean } = {}): Promise<ElzabClient> {
  const transport = await createNodeTransport({ host: HOST, port: PORT, connectTimeoutMs: 8000 });
  return new ElzabClient(transport, {
    commandTimeoutMs: 10_000,
    printTimeoutMs: 30_000,
    logger: options.verbose === false ? undefined : (m) => console.log(`   ${dim(m)}`),
  });
}

export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

export function header(title: string) {
  console.log(`\n${bold(title)}`);
  console.log(dim(`   drukarka ${HOST}:${PORT}`));
}

export function ok(message: string) {
  console.log(`${green('✓')} ${message}`);
}

export function fail(message: string) {
  console.log(`${red('✗')} ${message}`);
}

export function warn(message: string) {
  console.log(`${yellow('!')} ${message}`);
}
