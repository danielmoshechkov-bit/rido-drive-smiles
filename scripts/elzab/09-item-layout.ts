/**
 * Test 9 — UKŁAD POZYCJI NA PAPIERZE (DRUKUJE).
 *
 * Układ linii składa firmware drukarki: dostaje nazwę w polu stałej długości
 * (28 znaków — Esc 06H, albo 40 znaków — Esc 05H) i liczby, po czym samo decyduje,
 * czy zmieści je w 42 kolumnach papieru. Ten test pokazuje na papierze:
 *
 *   1. czy sekwencja 40-znakowa (Esc 05H) w ogóle działa na tym urządzeniu,
 *   2. czy samo użycie dłuższego pola wypycha nazwę do osobnej linii,
 *   3. gdzie leży próg zawijania (nazwa 14 / 21 / 30 / 40 znaków),
 *   4. czy drukarka zawija na granicy słowa, czy w środku wyrazu.
 *
 *   node scripts/elzab/09-item-layout.ts
 *   DRY_RUN=1 node scripts/elzab/09-item-layout.ts
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { connect, bold, dim, fail, header, ok, warn } from './common.ts';

const DRY_RUN = process.env.DRY_RUN === '1';
const ITEM_GROSZE = 10000; // 100,00 zł — kwota nieistotna, chodzi o układ

interface Variant {
  label: string;
  name: string;
  nameLength: 28 | 40;
  unit: string;
}

const VARIANTS: Variant[] = [
  // Krótka nazwa w obu wariantach pola — pokazuje, czy samo pole 40 zmienia układ
  { label: '28: krótka (14 zn.)', name: 'Olej silnikowy', nameLength: 28, unit: 'oper' },
  { label: '40: krótka (14 zn.)', name: 'Olej silnikowy', nameLength: 40, unit: 'oper' },
  // Próg zawijania: 21 znaków to szerokość trybu dwuliniowego wg dokumentacji mechanizmu
  { label: '40: średnia (21 zn.)', name: 'Łożysko prawe wymiana', nameLength: 40, unit: 'oper' },
  { label: '40: długa (30 zn.)', name: 'Łącznik drążka stabilizatora P', nameLength: 40, unit: 'szt' },
  // Pełne 40 znaków — sprawdzamy, czy zawija na granicy słowa
  { label: '40: pełna (40 zn.)', name: 'Błotnik przedni prawy malowanie i wymian', nameLength: 40, unit: 'oper' },
  // To samo w polu 28 — porównanie obcięcia
  { label: '28: długa (obcięta)', name: 'Błotnik przedni prawy malowanie i wymian', nameLength: 28, unit: 'oper' },
];

header('ELZAB — układ pozycji na wydruku (28 vs 40 znaków)');

console.log(bold('\nWarianty do wydruku:'));
for (const variant of VARIANTS) {
  const bytes = cmd.saleItem({
    name: variant.name,
    quantity: 1,
    unit: variant.unit,
    unitPriceGrosze: ITEM_GROSZE,
    totalGrosze: ITEM_GROSZE,
    vatLetter: 'A',
    nameLength: variant.nameLength,
  });
  console.log(`  ${variant.label.padEnd(22)} „${variant.name}" (${[...variant.name].length} zn.) → ${bytes.length} B`);
  console.log(dim(`    ${hex(bytes.subarray(0, 6))} …`));
}

const totalGrosze = VARIANTS.length * ITEM_GROSZE;
console.log(bold(`\nSuma: ${(totalGrosze / 100).toFixed(2)} zł`));

if (DRY_RUN) {
  warn('DRY_RUN=1 — nie wysyłam nic do drukarki');
  process.exit(0);
}

let client;
try {
  client = await connect({ verbose: false });
  await client.drain();
  await client.send('otwarcie paragonu', cmd.openReceipt());

  for (const variant of VARIANTS) {
    await client.sendSilent(
      variant.label,
      cmd.saleItem({
        name: variant.name,
        quantity: 1,
        unit: variant.unit,
        unitPriceGrosze: ITEM_GROSZE,
        totalGrosze: ITEM_GROSZE,
        vatLetter: 'A',
        nameLength: variant.nameLength,
      }),
    );
    ok(`przyjęta: ${variant.label}`);
  }

  await client.sendSilent('koniec pozycji', cmd.endItems(totalGrosze));
  await client.sendSilent('płatność', cmd.payment(1, 'GOTOWKA', totalGrosze));
  await client.send('zamknięcie paragonu', cmd.closeReceipt(), 0, { timeoutMs: 30000 });

  const number = await client.getLastReceiptNumber();
  ok(`wydrukowano paragon nr ${number.value ?? '?'}`);
  console.log(
    bold('\nCO ODCZYTAĆ Z PAPIERU:') +
      '\n  • czy pozycje 40-znakowe w ogóle się wydrukowały (Esc 05H działa?),' +
      '\n  • przy której długości nazwy drukarka przenosi liczby do osobnej linii,' +
      '\n  • czy zawijanie następuje na granicy słowa, czy w środku wyrazu,' +
      '\n  • czy nazwa 40-znakowa nie została obcięta.',
  );
} catch (error) {
  fail(toUserMessage(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await client?.close();
}
