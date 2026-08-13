/**
 * Test 6 — MAPA BAJTÓW DRUKARKI (DRUKUJE).
 *
 * Zamiast zgadywać stronę kodową, drukujemy WSZYSTKIE bajty 0x80–0xFF
 * w ponumerowanych wierszach po 16. Z papieru odczytujemy, jaki znak
 * drukarka rysuje dla którego bajtu — to jednoznacznie identyfikuje jej
 * tablicę znaków (albo pokazuje, że wysokich bajtów w ogóle nie drukuje).
 *
 * Wiersz wygląda tak (etykieta jest czystym ASCII, więc zawsze się wydrukuje):
 *   B0=<16 znaków dla bajtów B0..BF>
 *
 * Dodatkowo drukuje wiersze kontrolne z polskim alfabetem w 4 stronach kodowych.
 *
 *   node scripts/elzab/06-byte-map.ts
 *   DRY_RUN=1 node scripts/elzab/06-byte-map.ts
 *   FROM=A0 TO=BF node scripts/elzab/06-byte-map.ts   # węższy zakres
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

const FROM = parseInt(process.env.FROM ?? '80', 16);
const TO = parseInt(process.env.TO ?? 'FF', 16);
const DRY_RUN = process.env.DRY_RUN === '1';
const ROW = 16; // bajtów w wierszu

const LABELS: Record<Codepage, string> = {
  cp1250: '1250',
  latin2: 'L2',
  cp852: '852',
  mazovia: 'MAZ',
};

header('ELZAB — mapa bajtów drukarki (co rysuje dla 0x80–0xFF)');

interface Line {
  label: string;
  bytes: Uint8Array;
}

const lines: Line[] = [];

// ── wiersze mapy bajtów: "B0=" + 16 surowych bajtów ───────────────────
for (let base = FROM; base <= TO; base += ROW) {
  const label = base.toString(16).toUpperCase().padStart(2, '0') + '=';
  const raw = [...label].map((c) => c.charCodeAt(0));
  for (let i = 0; i < ROW && base + i <= TO; i++) raw.push(base + i);
  lines.push({ label: `bajty ${label}`, bytes: new Uint8Array(raw) });
}

// ── wiersze kontrolne: polski alfabet w każdej stronie kodowej ────────
for (const page of CODEPAGES) {
  for (const [suffix, letters] of [['m', POLISH_LOWER], ['W', POLISH_UPPER]] as const) {
    const prefix = `${LABELS[page]}${suffix}=`;
    const raw = [...[...prefix].map((c) => c.charCodeAt(0)), ...encodeText(letters, page)];
    lines.push({ label: `alfabet ${LABELS[page]}${suffix}`, bytes: new Uint8Array(raw) });
  }
}

console.log(bold(`\n${lines.length} pozycji do wydruku:`));
for (const line of lines) console.log(dim(`  ${line.label.padEnd(16)} ${hex(line.bytes)}`));

const ITEM_GROSZE = 100;
const totalGrosze = lines.length * ITEM_GROSZE;
console.log(bold(`\nSuma paragonu: ${(totalGrosze / 100).toFixed(2)} zł`));

if (DRY_RUN) {
  warn('DRY_RUN=1 — nie wysyłam nic do drukarki');
  process.exit(0);
}

let client;
try {
  client = await connect({ verbose: false });
  await client.drain();

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
  ok(`mapa bajtów wydrukowana (paragon nr ${number.value ?? '?'})`);
  console.log(
    bold('\nCO ODCZYTAĆ Z PAPIERU:') +
      '\n  1. Czy wiersze „80=", „90=" … mają PO ZNAKU RÓWNOŚCI jakiekolwiek znaki,' +
      '\n     czy zostały puste/obcięte → puste = drukarka w ogóle nie drukuje bajtów > 127.' +
      '\n  2. W którym wierszu i na której pozycji widać ą ć ę ł ń ó ś ź ż' +
      '\n     (pozycja 1 = pierwszy bajt po „=", np. w wierszu „B0=" pozycja 4 to bajt B3).' +
      '\n  3. Który wiersz kontrolny (1250m / L2m / 852m / MAZm) wygląda poprawnie.',
  );
} catch (error) {
  fail(toUserMessage(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await client?.close();
}
