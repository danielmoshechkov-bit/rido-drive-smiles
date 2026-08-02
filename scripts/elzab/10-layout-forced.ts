/**
 * Test 10 — WYMUSZENIE JEDNOLITEGO UKŁADU DWULINIOWEGO (DRUKUJE 2 paragony).
 *
 * Paragon 18 pokazał, że pole 40-znakowe samo nie wystarcza: drukarka obcina spacje
 * dopełniające, więc krótka nazwa nadal ląduje w jednej linii z liczbami.
 * Sprawdzamy dwie techniki wymuszenia stałego układu „nazwa / liczby":
 *
 *   PARAGON A (bezpieczny, znane sekwencje):
 *     • dopełnienie twardą spacją 0xA0 — nie jest obcinana jak 0x20,
 *       a powinna drukować się jako pusty znak → nazwa „udaje" długą i wymusza łamanie,
 *     • porównanie: ta sama nazwa dopełniona zwykłymi spacjami (kontrola).
 *
 *   PARAGON B (sekwencja spoza listy protokołu — Esc 04H, linia opisu wg instrukcji Zety):
 *     • wysyłamy Esc 04H i sprawdzamy odpowiedź ORAZ status (Esc 50H),
 *     • gdy drukarka odrzuci — paragon jest natychmiast anulowany, nic nie psujemy.
 *
 *   node scripts/elzab/10-layout-forced.ts
 *   SKIP_B=1 node scripts/elzab/10-layout-forced.ts   # bez testu linii opisu
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { concat, ESC, hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { encodeText } from '../../supabase/functions/_shared/elzab/codepages.ts';
import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { connect, bold, dim, fail, header, ok, warn } from './common.ts';

const ITEM = 10000; // 100,00 zł
const NBSP = 0xa0;

/** Nazwa dopełniona twardą spacją do zadanej długości pola. */
function nameWithNbspPadding(name: string, length: number): Uint8Array {
  const encoded = encodeText(name, 'cp1250');
  const out = new Uint8Array(length).fill(NBSP);
  out.set(encoded.subarray(0, length));
  return out;
}

header('ELZAB — wymuszenie układu dwuliniowego');

let client;
try {
  client = await connect({ verbose: false });
  await client.drain();

  // ── PARAGON A ──────────────────────────────────────────────────────
  if (process.env.ONLY_B === '1') {
    warn('ONLY_B=1 — pomijam paragon A');
  } else {
  console.log(bold('\nPARAGON A — dopełnienie twardą spacją vs zwykłą'));
  const variantsA = [
    { label: 'krótka + 0xA0 do 40', bytes: nameWithNbspPadding('Olej silnikowy', 40), len: 40 as const },
    { label: 'krótka + 0xA0 do 24', bytes: nameWithNbspPadding('Olej silnikowy', 24), len: 40 as const },
    { label: 'krótka, zwykłe spacje', bytes: null, len: 40 as const },
    { label: 'średnia + 0xA0 do 40', bytes: nameWithNbspPadding('Łożysko prawe wymiana', 40), len: 40 as const },
  ];

  await client.send('otwarcie paragonu A', cmd.openReceipt());
  for (const variant of variantsA) {
    const item = cmd.saleItem({
      name: variant.bytes ? '' : 'Olej silnikowy',
      nameBytes: variant.bytes ?? undefined,
      quantity: 1,
      unit: 'oper',
      unitPriceGrosze: ITEM,
      totalGrosze: ITEM,
      vatLetter: 'A',
      nameLength: variant.len,
    });
    console.log(dim(`  ${variant.label.padEnd(24)} ${hex(item.subarray(3, 20))} …`));
    await client.sendSilent(variant.label, item);
  }
  const totalA = variantsA.length * ITEM;
  await client.sendSilent('koniec pozycji', cmd.endItems(totalA));
  await client.sendSilent('płatność', cmd.payment(1, 'GOTOWKA', totalA));
  await client.send('zamknięcie paragonu A', cmd.closeReceipt(), 0, { timeoutMs: 30000 });
  const numberA = await client.getLastReceiptNumber();
  ok(`PARAGON A wydrukowany (nr ${numberA.value ?? '?'})`);
  }

  if (process.env.SKIP_B === '1') {
    warn('SKIP_B=1 — pomijam test linii opisu');
  } else {
    // ── PARAGON B ────────────────────────────────────────────────────
    console.log(bold('\nPARAGON B — linia opisu (Esc 04H, sekwencja spoza listy protokołu)'));
    await client.send('otwarcie paragonu B', cmd.openReceipt());

    let descriptionWorks = true;
    try {
      // Wariant wg instrukcji Zety: linia opisu 36 znaków przed pozycją.
      const description = concat([ESC, 0x04], encodeText('Blotnik przedni prawy malowanie', 'cp1250'));
      console.log(dim(`  Esc 04H: ${hex(description)}`));
      await client.sendSilent('linia opisu (Esc 04H)', description);
      ok('linia opisu przyjęta przez drukarkę');
    } catch (error) {
      descriptionWorks = false;
      warn(`linia opisu odrzucona: ${toUserMessage(error)}`);
    }

    if (descriptionWorks) {
      await client.sendSilent(
        'pozycja po linii opisu',
        cmd.saleItem({
          name: 'i wymiana',
          quantity: 1,
          unit: 'oper',
          unitPriceGrosze: ITEM,
          totalGrosze: ITEM,
          vatLetter: 'A',
          nameLength: 40,
        }),
      );
      await client.sendSilent('koniec pozycji', cmd.endItems(ITEM));
      await client.sendSilent('płatność', cmd.payment(1, 'GOTOWKA', ITEM));
      await client.send('zamknięcie paragonu B', cmd.closeReceipt(), 0, { timeoutMs: 30000 });
      const numberB = await client.getLastReceiptNumber();
      ok(`PARAGON B wydrukowany (nr ${numberB.value ?? '?'})`);
    } else {
      await client.cancelReceiptSafe();
      warn('PARAGON B anulowany — Esc 04H nie jest obsługiwane przez ten firmware');
    }
  }

  console.log(
    bold('\nCO ODCZYTAĆ Z PAPIERU:') +
      '\n  PARAGON A: czy pozycje dopełnione 0xA0 mają liczby w OSOBNEJ linii,' +
      '\n             i czy dopełnienie jest niewidoczne (puste miejsce, nie krzaki).' +
      '\n  PARAGON B: czy nazwa „Blotnik przedni prawy malowanie" pojawiła się jako osobna' +
      '\n             linia opisu nad pozycją „i wymiana".',
  );
} catch (error) {
  fail(toUserMessage(error));
  await client?.cancelReceiptSafe();
  process.exitCode = 1;
} finally {
  await client?.close();
}
