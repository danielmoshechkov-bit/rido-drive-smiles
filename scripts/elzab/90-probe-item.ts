/**
 * Sonda diagnostyczna — ustalenie faktycznego zachowania sekwencji pozycji sprzedaży.
 * Paragon jest na końcu ANULOWANY (drukarka wypisze #ANULOWANY# — tryb szkoleniowy).
 *
 *   node scripts/elzab/90-probe-item.ts [wariant]
 * warianty: 28 (domyślny), 40
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { createNodeTransport } from './transport-node.ts';
import { HOST, PORT, dim, header, ok, warn } from './common.ts';

const variant = (process.argv[2] ?? '28') === '40' ? 40 : 28;
header(`ELZAB — sonda pozycji sprzedaży (nazwa ${variant} znaków)`);

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

async function step(label: string, bytes: Uint8Array, waitMs = 2500) {
  console.log(dim(`→ ${label}: ${hex(bytes)}`));
  await transport.write(bytes);
  const response = await collect(waitMs);
  console.log(`   ← ${response.length ? hex(response) : '(cisza)'}`);
  return response;
}

try {
  await collect(300); // drain

  await step('otwarcie paragonu', cmd.openReceipt());

  const item = cmd.saleItem({
    name: 'Test pozycji fiskalnej',
    quantity: 1,
    unit: 'szt',
    unitPriceGrosze: 1000,
    totalGrosze: 1000,
    vatLetter: 'A',
    nameLength: variant,
  });
  console.log(dim(`   długość sekwencji pozycji: ${item.length} B`));
  const itemResponse = await step('pozycja sprzedaży', item, 4000);
  if (!itemResponse.length) warn('pozycja: brak odpowiedzi — sprawdzam Esc 50H');

  await step('kontrola stanu (Esc 50H)', cmd.checkStatus(), 3000);
  await step('status 1 (Esc 54H)', cmd.readStatus1(), 2000);
  await step('status 2 (Esc 55H)', cmd.readStatus2(), 2000);

  await step('anulowanie paragonu', cmd.cancelReceipt(), 5000);
  ok('sonda zakończona');
} finally {
  await transport.close();
}
