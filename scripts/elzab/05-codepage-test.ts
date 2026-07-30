/**
 * Test 5 — DIAGNOSTYKA POLSKICH ZNAKÓW (DRUKUJE).
 *
 * Drukuje jeden paragon z sześcioma pozycjami: ten sam polski alfabet zakodowany
 * w trzech stronach kodowych (CP1250, CP852/Latin-2, Mazovia/CP790).
 * Na papierze widać, którą stronę kodową drukarka faktycznie rozumie —
 * pozostałe wyjdą jako krzaki albo znikną.
 *
 *   node scripts/elzab/05-codepage-test.ts
 *   DRY_RUN=1 node scripts/elzab/05-codepage-test.ts   # tylko bajty, bez drukowania
 *   ONLY=cp852 node scripts/elzab/05-codepage-test.ts  # jedna strona kodowa
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import {
  CODEPAGES,
  encodeText,
  POLISH_LOWER,
  POLISH_UPPER,
  type Codepage,
} from '../../supabase/functions/_shared/elzab/codepages.ts';
import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { connect, bold, dim, fail, header, ok, warn } from './common.ts';

const LABELS: Record<Codepage, string> = {
  cp1250: 'CP1250',
  cp852: 'CP852',
  mazovia: 'MAZOVIA',
};

const only = process.env.ONLY as Codepage | undefined;
const pages = only ? [only] : CODEPAGES;
const DRY_RUN = process.env.DRY_RUN === '1';

header('ELZAB — która strona kodowa? (test polskich znaków)');

// ── podgląd bajtów: dowód, że koder niczego nie gubi ──────────────────
console.log(bold('\nBajty wysyłane dla „Płyn chłodzący ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż":'));
for (const page of CODEPAGES) {
  const text = `Płyn chłodzący ${POLISH_UPPER} ${POLISH_LOWER}`;
  const bytes = encodeText(text, page);
  console.log(`  ${LABELS[page].padEnd(8)} ${bytes.length} B (znaków: ${[...text].length})`);
  console.log(dim(`           ${hex(bytes)}`));
}
console.log(bold('\nSame polskie litery, bajt po bajcie:'));
for (const page of CODEPAGES) {
  const lower = [...POLISH_LOWER].map((c) => `${c}=${hex(encodeText(c, page))}`).join(' ');
  const upper = [...POLISH_UPPER].map((c) => `${c}=${hex(encodeText(c, page))}`).join(' ');
  console.log(`  ${LABELS[page]}\n    ${dim(lower)}\n    ${dim(upper)}`);
}

// ── pozycje paragonu: po dwie na każdą stronę kodową ──────────────────
const items = pages.flatMap((page) => [
  { page, name: `${LABELS[page]} male ${POLISH_LOWER}` },
  { page, name: `${LABELS[page]} DUZE ${POLISH_UPPER}` },
]);

const ITEM_GROSZE = 100; // 1,00 zł za pozycję
const totalGrosze = items.length * ITEM_GROSZE;

console.log(bold(`\nParagon testowy: ${items.length} pozycji × 1,00 zł = ${(totalGrosze / 100).toFixed(2)} zł`));
for (const item of items) {
  console.log(dim(`  • ${item.name}  (${LABELS[item.page]}, ${[...item.name].length} znaków)`));
}

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
      `pozycja ${LABELS[item.page]}`,
      cmd.saleItem({
        name: item.name,
        quantity: 1,
        unit: 'szt',
        unitPriceGrosze: ITEM_GROSZE,
        totalGrosze: ITEM_GROSZE,
        vatLetter: 'A',
        codepage: item.page,
      }),
    );
  }
  await client.sendSilent('koniec pozycji', cmd.endItems(totalGrosze));
  await client.sendSilent('płatność', cmd.payment(1, 'GOTOWKA', totalGrosze));
  await client.send('zamknięcie paragonu', cmd.closeReceipt(), 0, { timeoutMs: 20000 });

  const number = await client.getLastReceiptNumber();
  ok(`paragon wydrukowany (nr ${number.value ?? '?'})`);
  console.log(
    bold('\nSPRAWDŹ NA PAPIERZE: która grupa pozycji ma poprawne ą ć ę ł ń ó ś ź ż —') +
      '\n  ta strona kodowa trafia do ustawień drukarki (fiscal_printers.codepage).',
  );
} catch (error) {
  fail(toUserMessage(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await client?.close();
}
