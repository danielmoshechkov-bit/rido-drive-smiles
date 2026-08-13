/**
 * Sonda diagnostyczna — pełen cykl paragonu krok po kroku, z pokazaniem odpowiedzi
 * (albo ciszy) po każdej sekwencji. DRUKUJE paragon 10,00 zł w trybie szkoleniowym.
 *
 *   node scripts/elzab/91-probe-full.ts
 *   CANCEL=1 node scripts/elzab/91-probe-full.ts   # zakończ anulowaniem zamiast wydrukiem
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { createNodeTransport } from './transport-node.ts';
import { HOST, PORT, dim, header, ok, warn } from './common.ts';

header('ELZAB — sonda pełnego cyklu paragonu');
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
  console.log(`${dim('→')} ${label.padEnd(28)} ${response.length ? hex(response) : dim('(cisza)')}`);
  return response;
}

try {
  await collect(300);
  await step('otwarcie (Esc 21H)', cmd.openReceipt());

  const item = cmd.saleItem({
    name: 'Usluga testowa Zeta',
    quantity: 1,
    unit: 'usl',
    unitPriceGrosze: 1000,
    totalGrosze: 1000,
    vatLetter: 'A',
  });
  await step('pozycja (Esc 06H 20H)', item, 2500);
  await step('kontrola (Esc 50H)', cmd.checkStatus());

  await step('koniec pozycji (Esc 07H)', cmd.endItems(1000), 2500);
  await step('kontrola (Esc 50H)', cmd.checkStatus());

  await step('platnosc (Esc 81H)', cmd.payment(1, 'GOTOWKA', 1000), 2500);
  await step('kontrola (Esc 50H)', cmd.checkStatus());

  if (process.env.CANCEL === '1') {
    warn('CANCEL=1 — anuluję paragon zamiast drukować');
    await step('anulowanie (Esc 23H)', cmd.cancelReceipt(), 5000);
  } else {
    await step('zamkniecie (Esc 24H)', cmd.closeReceipt(), 12000);
    await step('kontrola (Esc 50H)', cmd.checkStatus(), 5000);
    await step('nr paragonu (Esc 66H)', cmd.lastReceiptNumber(), 3000);
  }
  ok('sonda zakończona');
} finally {
  await transport.close();
}
