/**
 * Test 11 — DOCELOWY UKŁAD PARAGONU (DRUKUJE).
 *
 * Pokazuje pełny łańcuch formatowania pozycji:
 *   pozycje zlecenia → nazwa fiskalna (skróty branżowe, granica słowa, max 40 znaków)
 *   → dopełnienie twardą spacją (jednolity układ dwuliniowy) → wydruk.
 *
 * Drukuje bezpośrednio przez bibliotekę (z pominięciem edge function), bo służy do
 * oceny WYGLĄDU — nie tworzy wpisu w logu paragonów i nie podlega blokadzie
 * podwójnej fiskalizacji.
 *
 *   ORDER_ITEMS_FILE=<plik.json> node scripts/elzab/11-layout-demo.ts
 *   DRY_RUN=1 ORDER_ITEMS_FILE=... node scripts/elzab/11-layout-demo.ts
 */

import { readFileSync } from 'node:fs';
import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { DEFAULT_VAT_MAP } from '../../supabase/functions/_shared/elzab/types.ts';
import { mapWorkshopItemsToReceipt, formatPln, toGrosze } from '../../src/lib/fiscal.ts';
import { toFiscalName } from '../../src/lib/fiscalName.ts';
import { connect, bold, dim, fail, header, ok, warn } from './common.ts';

const ITEMS_FILE = process.env.ORDER_ITEMS_FILE ?? '';
const NAME_LENGTH = 40;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!ITEMS_FILE) {
  fail('Brak ORDER_ITEMS_FILE — plik JSON z pozycjami zlecenia.');
  process.exit(1);
}

const mapped = mapWorkshopItemsToReceipt(JSON.parse(readFileSync(ITEMS_FILE, 'utf8')));
const items = mapped.items.map((item) => ({ ...item, fiscalName: toFiscalName(item.name, NAME_LENGTH) }));

header('ELZAB — docelowy układ paragonu (nazwa fiskalna + jednolity układ)');
console.log(bold('\nPozycje po skróceniu do nazwy fiskalnej:'));
for (const item of items) {
  const changed = item.fiscalName !== item.name;
  console.log(`  ${item.fiscalName}`);
  console.log(
    dim(
      `      ${item.quantity} ${item.unit} × ${item.unitPrice.toFixed(2)} = ` +
        `${(Math.round(toGrosze(item.unitPrice) * item.quantity) / 100).toFixed(2)} zł` +
        (changed ? `   [skrócono z: „${item.name}"]` : ''),
    ),
  );
}
console.log(bold(`\nSuma: ${formatPln(mapped.totalGrosze)}`));

if (DRY_RUN) {
  warn('DRY_RUN=1 — nie wysyłam nic do drukarki');
  process.exit(0);
}

let client;
try {
  client = await connect({ verbose: false });
  await client.drain();
  await client.send('otwarcie paragonu', cmd.openReceipt());

  for (const item of items) {
    await client.sendSilent(
      item.fiscalName,
      cmd.saleItem({
        name: item.fiscalName,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceGrosze: toGrosze(item.unitPrice),
        totalGrosze: Math.round(toGrosze(item.unitPrice) * item.quantity),
        vatLetter: DEFAULT_VAT_MAP[item.vatRate] ?? 'A',
        nameLength: NAME_LENGTH,
        codepage: 'cp1250',
        forceNameLine: true,
      }),
    );
  }

  await client.sendSilent('koniec pozycji', cmd.endItems(mapped.totalGrosze));
  await client.sendSilent('płatność', cmd.payment(1, 'GOTOWKA', mapped.totalGrosze));
  await client.send('zamknięcie paragonu', cmd.closeReceipt(), 0, { timeoutMs: 30000 });

  const number = await client.getLastReceiptNumber();
  ok(`wydrukowano paragon nr ${number.value ?? '?'} — ${formatPln(mapped.totalGrosze)}`);
} catch (error) {
  fail(toUserMessage(error));
  await client?.cancelReceiptSafe();
  process.exitCode = 1;
} finally {
  await client?.close();
}
