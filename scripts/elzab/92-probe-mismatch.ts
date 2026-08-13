/**
 * Sonda — gdzie drukarka zgłasza niezgodność sumy paragonu (błąd „7").
 * Paragon zostanie unieważniony przez drukarkę (#ANULOWANY#, tryb szkoleniowy).
 *
 *   node scripts/elzab/92-probe-mismatch.ts
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { createNodeTransport } from './transport-node.ts';
import { HOST, PORT, dim, header, ok } from './common.ts';

header('ELZAB — sonda: niezgodna suma paragonu');
const transport = await createNodeTransport({ host: HOST, port: PORT, connectTimeoutMs: 8000 });

async function collect(ms: number): Promise<Uint8Array> {
  const out: number[] = [];
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const chunk = await transport.read(Math.max(1, deadline - Date.now()));
    if (chunk === null) break;
    if (chunk.length) out.push(...chunk);
  }
  return new Uint8Array(out);
}

async function step(label: string, bytes: Uint8Array, waitMs = 2000) {
  await transport.write(bytes);
  const response = await collect(waitMs);
  console.log(`${dim('→')} ${label.padEnd(30)} ${response.length ? hex(response) : dim('(cisza)')}`);
  return response;
}

try {
  await collect(300);
  await step('otwarcie (Esc 21H)', cmd.openReceipt());
  await step(
    'pozycja 10,00 zl',
    cmd.saleItem({
      name: 'Pozycja testowa bledna',
      quantity: 1,
      unit: 'szt',
      unitPriceGrosze: 1000,
      totalGrosze: 1000,
      vatLetter: 'A',
    }),
    2500,
  );
  await step('kontrola (Esc 50H)', cmd.checkStatus());

  await step('koniec pozycji: 99,99 zl (zle)', cmd.endItems(9999), 2500);
  await step('kontrola (Esc 50H)', cmd.checkStatus());
  await step('status 1 (Esc 54H)', cmd.readStatus1());
  await step('status 2 (Esc 55H)', cmd.readStatus2());

  await step('platnosc 99,99 zl', cmd.payment(1, 'GOTOWKA', 9999), 2500);
  await step('kontrola (Esc 50H)', cmd.checkStatus());

  await step('zamkniecie (Esc 24H)', cmd.closeReceipt(), 12000);
  await step('kontrola (Esc 50H)', cmd.checkStatus(), 5000);
  await step('status 1 (Esc 54H)', cmd.readStatus1());
  await step('status 2 (Esc 55H)', cmd.readStatus2());
  await step('nr paragonu (Esc 66H)', cmd.lastReceiptNumber(), 3000);

  // Gdyby paragon nadal był otwarty — sprzątamy.
  await step('anulowanie (Esc 23H)', cmd.cancelReceipt(), 5000);
  ok('sonda zakończona');
} finally {
  await transport.close();
}
