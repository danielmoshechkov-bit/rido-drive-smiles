/**
 * Test 2 — pełny cykl paragonu (DRUKUJE na drukarce).
 * Drukarka musi być w trybie SZKOLENIOWYM — paragon będzie niefiskalny.
 *
 * Uruchomienie:
 *   node scripts/elzab/02-receipt.ts            # drukuje
 *   DRY_RUN=1 node scripts/elzab/02-receipt.ts  # tylko podgląd bajtów, bez połączenia
 *   VAT_RATE=8 node scripts/elzab/02-receipt.ts # inna stawka (gdy A/23% nie jest zaprogramowana)
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { ElzabClient } from '../../supabase/functions/_shared/elzab/client.ts';
import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { DEFAULT_VAT_MAP, type ReceiptRequest } from '../../supabase/functions/_shared/elzab/types.ts';
import { connect, dim, fail, header, ok, warn } from './common.ts';

const VAT_RATE = process.env.VAT_RATE ?? '23';
const DRY_RUN = process.env.DRY_RUN === '1';

const items: ReceiptRequest['items'] = [
  // Typowa usługa warsztatowa
  { name: 'Wymiana oleju silnikowego', quantity: 1, unit: 'usl', unitPrice: 150.0, vatRate: VAT_RATE },
  // Ilość ułamkowa + nazwa z ą/ł/ż
  { name: 'Płyn chłodzący G12 żółty', quantity: 2.5, unit: 'l', unitPrice: 39.99, vatRate: VAT_RATE },
  // Komplet ę/ł/ż w jednej nazwie
  { name: 'Sprzęgło wymiana łożyska', quantity: 1, unit: 'usl', unitPrice: 480.0, vatRate: VAT_RATE },
];

// Suma płatności liczona z pozycji — drukarka unieważnia paragon przy najmniejszej niezgodności.
const total = items.reduce((sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity, 0) / 100;

const receipt: ReceiptRequest = {
  vatMap: DEFAULT_VAT_MAP,
  items,
  payments: [{ name: 'GOTOWKA', amount: total }],
};

header(`ELZAB — paragon testowy (tryb szkoleniowy, stawka ${VAT_RATE}%)`);

const prepared = ElzabClient.prepare(receipt);
console.log(dim(`   pozycje: ${prepared.items.length}, suma: ${(prepared.totalGrosze / 100).toFixed(2)} zł`));
for (const item of prepared.items) {
  console.log(
    dim(
      `   • ${item.name} | ${item.quantity} ${item.unit ?? 'szt'} × ${(item.unitPriceGrosze / 100).toFixed(2)} = ${(item.totalGrosze / 100).toFixed(2)} zł | VAT ${item.vatLetter}`,
    ),
  );
  console.log(dim(`     ${hex(cmd.saleItem(item))}`));
}
console.log(dim(`   koniec pozycji: ${hex(cmd.endItems(prepared.totalGrosze))}`));
console.log(dim(`   płatność:       ${hex(cmd.payment(1, prepared.payments[0].name, prepared.payments[0].grosze))}`));

if (DRY_RUN) {
  warn('DRY_RUN=1 — nie wysyłam nic do drukarki');
  process.exit(0);
}

let client;
const started = Date.now();
try {
  client = await connect();
  await client.drain();

  const before = await client.getLastReceiptNumber();
  console.log(dim(`   nr paragonu przed: ${before.value ?? '?'}`));

  const result = await client.printReceipt(receipt);
  ok(
    `paragon wydrukowany w ${Date.now() - started} ms — suma ${(result.totalGrosze / 100).toFixed(2)} zł, nr paragonu: ${result.receiptNumber ?? '(nieodczytany)'}`,
  );
} catch (error) {
  fail(toUserMessage(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await client?.close();
}
