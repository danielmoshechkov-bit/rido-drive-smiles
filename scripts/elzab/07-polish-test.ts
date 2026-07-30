/**
 * Test 7 — POLSKIE ZNAKI: fraza w 4 stronach kodowych + świeża mapa bajtów (DRUKUJE).
 *
 * Jeden paragon daje komplet odpowiedzi:
 *   • wiersze 1..4 — ta sama fraza zakodowana w CP1250 / ISO 8859-2 / CP852 / Mazovia
 *   • wiersze 80=..F0= — wszystkie bajty 0x80-0xFF, czyli aktualna tablica glifów drukarki
 *
 * Mapę trzeba przedrukować po KAŻDEJ zmianie ustawień drukarki — zmiana strony kodowej
 * w menu przesuwa całą tablicę.
 *
 *   node scripts/elzab/07-polish-test.ts
 *   TEXT="Inna fraza" node scripts/elzab/07-polish-test.ts
 *   DRY_RUN=1 node scripts/elzab/07-polish-test.ts
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { CODEPAGES, encodeText, type Codepage } from '../../supabase/functions/_shared/elzab/codepages.ts';
import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { connect, bold, dim, fail, header, ok, warn } from './common.ts';

const TEXT = process.env.TEXT ?? 'Sprzęgło wymiana łożyska';
const DRY_RUN = process.env.DRY_RUN === '1';
const ROW = 16;

const NAMES: Record<Codepage, string> = {
  cp1250: 'CP1250',
  latin2: 'ISO 8859-2',
  cp852: 'CP852 (Latin-2 DOS)',
  mazovia: 'Mazovia (CP790)',
};

header('ELZAB — polskie znaki: fraza w 4 stronach kodowych + mapa bajtów');

interface Line {
  label: string;
  bytes: Uint8Array;
}

const lines: Line[] = [];

// ── 1..4: ta sama fraza, cztery kodowania ─────────────────────────────
// Numer zamiast nazwy strony kodowej, żeby zmieściła się cała fraza (pole nazwy = 28 znaków).
CODEPAGES.forEach((page, index) => {
  const prefix = `${index + 1}=`;
  const bytes = new Uint8Array([
    ...[...prefix].map((c) => c.charCodeAt(0)),
    ...encodeText(TEXT, page),
  ]);
  lines.push({ label: `${index + 1} = ${NAMES[page]}`, bytes });
});

// ── mapa bajtów: aktualna tablica glifów urządzenia ───────────────────
for (let base = 0x80; base <= 0xff; base += ROW) {
  const label = base.toString(16).toUpperCase().padStart(2, '0') + '=';
  const raw = [...label].map((c) => c.charCodeAt(0));
  for (let i = 0; i < ROW; i++) raw.push(base + i);
  lines.push({ label: `bajty ${label}`, bytes: new Uint8Array(raw) });
}

console.log(bold(`\nFraza testowa: „${TEXT}" (${[...TEXT].length} znaków)`));
console.log(bold('\nLegenda wierszy 1-4 (na paragonie są tylko numery):'));
CODEPAGES.forEach((page, index) => {
  console.log(`  ${index + 1} = ${NAMES[page].padEnd(20)} ${dim(hex(encodeText(TEXT, page)))}`);
});

const ITEM_GROSZE = 100;
const totalGrosze = lines.length * ITEM_GROSZE;
console.log(bold(`\n${lines.length} pozycji × 1,00 zł = ${(totalGrosze / 100).toFixed(2)} zł`));

if (DRY_RUN) {
  warn('DRY_RUN=1 — nie wysyłam nic do drukarki');
  process.exit(0);
}

let client;
try {
  client = await connect({ verbose: false });
  await client.drain();

  const clock = await client.getClock();
  console.log(dim(`   drukarka odpowiada, zegar ${clock.iso}`));

  await client.send('otwarcie paragonu', cmd.openReceipt());
  for (const line of lines) {
    await client.sendSilent(
      line.label,
      cmd.saleItem({
        name: '',
        nameBytes: line.bytes,
        quantity: 1,
        unit: 'szt',
        unitPriceGrosze: ITEM_GROSZE,
        totalGrosze: ITEM_GROSZE,
        vatLetter: 'A',
      }),
    );
  }
  await client.sendSilent('koniec pozycji', cmd.endItems(totalGrosze));
  await client.sendSilent('płatność', cmd.payment(1, 'GOTOWKA', totalGrosze));
  await client.send('zamknięcie paragonu', cmd.closeReceipt(), 0, { timeoutMs: 30000 });

  const number = await client.getLastReceiptNumber();
  ok(`wydrukowano (paragon nr ${number.value ?? '?'})`);
  console.log(
    bold('\nCO ODCZYTAĆ Z PAPIERU:') +
      `\n  • który z wierszy 1-4 pokazuje „${TEXT}" w całości` +
      '\n  • jeśli żaden — czy wiersze 80=..F0= mają jakiekolwiek znaki po znaku równości' +
      '\n    (puste = drukarka nie drukuje bajtów > 127 przy obecnym ustawieniu)',
  );
} catch (error) {
  fail(toUserMessage(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await client?.close();
}
