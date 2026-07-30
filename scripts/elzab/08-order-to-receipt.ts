/**
 * Test 8 — integracja: prawdziwe zlecenie z bazy → mapowanie → edge function → wydruk.
 *
 * Używa DOKŁADNIE tego samego modułu mapującego co UI (src/lib/fiscal.ts), więc
 * sprawdza ścieżkę produkcyjną bez React-a: pozycje zlecenia (nazwa/ilość/cena/VAT)
 * → payload dla fiscalize-receipt → realny paragon.
 *
 *   ORDER_ID=<uuid> FN_URL=http://127.0.0.1:9000 TOKEN=<jwt> \
 *     node scripts/elzab/08-order-to-receipt.ts
 *
 * ORDER_ITEMS_FILE=<plik.json> pozwala podać pozycje z pliku (bez dostępu do bazy).
 */

import { readFileSync } from 'node:fs';
import { mapWorkshopItemsToReceipt, formatPln } from '../../src/lib/fiscal.ts';
import { bold, dim, fail, ok, warn } from './common.ts';

const FN_URL = process.env.FN_URL ?? 'http://127.0.0.1:9000';
const TOKEN = process.env.TOKEN ?? '';
const PROVIDER_ID = process.env.PROVIDER_ID ?? '664ed87b-a20f-457b-a9fa-97ca13dcae7c';
const ORDER_ID = process.env.ORDER_ID ?? '';
const ITEMS_FILE = process.env.ORDER_ITEMS_FILE ?? '';

if (!TOKEN) {
  fail('Brak TOKEN (klucz service_role albo JWT użytkownika).');
  process.exit(1);
}
if (!ITEMS_FILE) {
  fail('Brak ORDER_ITEMS_FILE — plik JSON z pozycjami zlecenia.');
  process.exit(1);
}

const orderItems = JSON.parse(readFileSync(ITEMS_FILE, 'utf8'));

console.log(bold(`\nZlecenie ${ORDER_ID || '(bez id)'} — ${orderItems.length} pozycji z bazy`));
const mapped = mapWorkshopItemsToReceipt(orderItems);

for (const item of mapped.items) {
  console.log(
    dim(
      `  • ${item.name} | ${item.quantity} ${item.unit} × ${item.unitPrice.toFixed(2)} zł | VAT ${item.vatRate}%`,
    ),
  );
}
for (const problem of mapped.skipped) console.log(dim(`  ⊘ pominięto „${problem.name}" — ${problem.reason}`));
for (const problem of mapped.blocking) warn(`blokada: „${problem.name}" — ${problem.reason}`);

console.log(bold(`  suma: ${formatPln(mapped.totalGrosze)}`));

if (!mapped.items.length) {
  fail('Brak pozycji nadających się na paragon.');
  process.exit(1);
}
if (mapped.blocking.length) {
  fail('Zlecenie ma pozycje blokujące wydruk — popraw je najpierw.');
  process.exit(1);
}

const payload = {
  providerId: PROVIDER_ID,
  documentType: 'workshop_order',
  documentId: ORDER_ID || undefined,
  items: mapped.items,
  payments: [{ name: 'GOTOWKA', amount: mapped.totalGrosze / 100 }],
};

const response = await fetch(FN_URL, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const result = await response.json();

if (result.ok) {
  ok(`paragon nr ${result.receiptNumber} na kwotę ${result.total.toFixed(2)} zł (${result.printerMode})`);
} else {
  fail(`[${result.code}] ${result.message}`);
  process.exitCode = 1;
}
