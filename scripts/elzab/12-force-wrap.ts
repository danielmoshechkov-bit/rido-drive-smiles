/**
 * Test 12 — WYMUSZENIE ŁAMANIA NIEWIDOCZNYM DOPEŁNIENIEM (DRUKUJE).
 *
 * Ustalone na paragonie 28: firmware łamie pozycję na dwie linie wtedy i tylko wtedy,
 * gdy `nazwa + linia liczb > 42 kolumny`. Dopełnienie spacją (0x20) i twardą spacją
 * (0xA0) jest obcinane, więc nie da się nimi „wydłużyć" krótkiej nazwy.
 *
 * Hipoteza: bajt, który NIE jest białym znakiem, nie zostanie obcięty, a jeśli nie ma
 * przypisanego glifu — wydrukuje się jako puste miejsce. Wtedy krótka nazwa liczy się
 * jako długa i firmware sam przenosi liczby do osobnej linii.
 *
 * Kandydaci (pozycje niezdefiniowane w CP1250 + miękki łącznik):
 *   0x81, 0x90 — brak glifu w CP1250
 *   0xAD       — miękki łącznik (SHY), często niedrukowany
 *
 * Wszystkie pozycje mają tę samą nazwę i tę samą kwotę, więc każda różnica na papierze
 * pochodzi wyłącznie od bajtu dopełniającego.
 *
 *   node scripts/elzab/12-force-wrap.ts
 *   DRY_RUN=1 node scripts/elzab/12-force-wrap.ts
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { encodeText } from '../../supabase/functions/_shared/elzab/codepages.ts';
import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { connect, bold, dim, fail, header, ok, warn } from './common.ts';

const NAME = 'Czolowa szyba'; // 13 znaków — bez dopełnienia zmieści się w jednej linii
const ITEM = 10000;
const LENGTH = 40;

const CANDIDATES: Array<{ label: string; padByte: number }> = [
  { label: '1. dopelnienie 0x81', padByte: 0x81 },
  { label: '2. dopelnienie 0x90', padByte: 0x90 },
  { label: '3. dopelnienie 0xAD', padByte: 0xad },
  { label: '4. kontrola: spacje', padByte: 0x20 },
];

function paddedName(padByte: number): Uint8Array {
  const encoded = encodeText(NAME, 'cp1250');
  const out = new Uint8Array(LENGTH).fill(padByte);
  out.set(encoded);
  return out;
}

header('ELZAB — wymuszenie łamania niewidocznym dopełnieniem');
console.log(bold(`\nNazwa „${NAME}" (${NAME.length} zn.) dopełniona do ${LENGTH} znaków:`));
for (const candidate of CANDIDATES) {
  console.log(`  ${candidate.label}  ${dim(hex(paddedName(candidate.padByte).subarray(0, 18)) + ' …')}`);
}

if (process.env.DRY_RUN === '1') {
  warn('DRY_RUN=1 — nie wysyłam nic do drukarki');
  process.exit(0);
}

let client;
try {
  client = await connect({ verbose: false });
  await client.drain();
  await client.send('otwarcie paragonu', cmd.openReceipt());

  for (const candidate of CANDIDATES) {
    await client.sendSilent(
      candidate.label,
      cmd.saleItem({
        name: '',
        nameBytes: paddedName(candidate.padByte),
        quantity: 1,
        unit: 'szt',
        unitPriceGrosze: ITEM,
        totalGrosze: ITEM,
        vatLetter: 'A',
        nameLength: LENGTH,
      }),
    );
    ok(`przyjęta: ${candidate.label}`);
  }

  const total = CANDIDATES.length * ITEM;
  await client.sendSilent('koniec pozycji', cmd.endItems(total));
  await client.sendSilent('płatność', cmd.payment(1, 'GOTOWKA', total));
  await client.send('zamknięcie paragonu', cmd.closeReceipt(), 0, { timeoutMs: 30000 });

  const number = await client.getLastReceiptNumber();
  ok(`wydrukowano paragon nr ${number.value ?? '?'}`);
  console.log(
    bold('\nCO ODCZYTAĆ Z PAPIERU:') +
      '\n  • która z pozycji 1-3 ma liczby w OSOBNEJ linii (pozycja 4 na pewno nie będzie),' +
      '\n  • czy po nazwie widać jakiekolwiek znaki (kwadraty, kropki) — dopełnienie ma być niewidoczne.',
  );
} catch (error) {
  fail(toUserMessage(error));
  await client?.cancelReceiptSafe();
  process.exitCode = 1;
} finally {
  await client?.close();
}
