/**
 * Test 3 — przypadki brzegowe.
 *
 * Część A (offline): walidacja danych paragonu i kodowanie CP1250 — nic nie idzie do drukarki.
 * Część B (drukarka): celowa niezgodność sumy → drukarka musi zgłosić błąd „7"
 *                      i unieważnić paragon (wydruk #ANULOWANY#, tryb szkoleniowy).
 *
 *   node scripts/elzab/03-edge-cases.ts
 *   SKIP_PRINTER=1 node scripts/elzab/03-edge-cases.ts   # tylko część offline
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { encodeCp1250 } from '../../supabase/functions/_shared/elzab/cp1250.ts';
import { hex, toGrosze, encodeQuantity } from '../../supabase/functions/_shared/elzab/codec.ts';
import { ElzabClient } from '../../supabase/functions/_shared/elzab/client.ts';
import { ElzabError, ElzabValidationError } from '../../supabase/functions/_shared/elzab/errors.ts';
import { DEFAULT_VAT_MAP, type ReceiptRequest } from '../../supabase/functions/_shared/elzab/types.ts';
import { connect, dim, fail, header, ok, warn } from './common.ts';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) ok(`${label}${detail ? ' ' + dim(detail) : ''}`);
  else {
    fail(`${label} ${detail}`);
    failures++;
  }
}

function expectValidationError(label: string, request: ReceiptRequest, fragment: string) {
  try {
    ElzabClient.prepare(request);
    check(label, false, '— brak oczekiwanego błędu walidacji');
  } catch (error) {
    const isValidation = error instanceof ElzabValidationError;
    const message = error instanceof ElzabError ? error.userMessage : String(error);
    check(label, isValidation && message.includes(fragment), `→ „${message}"`);
  }
}

const base = (items: ReceiptRequest['items'], payments?: ReceiptRequest['payments']): ReceiptRequest => ({
  vatMap: DEFAULT_VAT_MAP,
  items,
  payments,
});

header('ELZAB — przypadki brzegowe');
console.log(dim('\n── A. Walidacja i kodowanie (offline) ──'));

// 1. Pozycja o zerowej wartości (błąd drukarki „R")
expectValidationError(
  'pozycja 0 zł jest odrzucana zanim poleci do drukarki',
  base([{ name: 'Usluga gratisowa', quantity: 1, unitPrice: 0, vatRate: '23' }]),
  'zerową wartość',
);

// 2. Nazwa krótsza niż 5 znaków znaczących (błąd drukarki „B")
expectValidationError(
  'nazwa < 5 znaków jest odrzucana',
  base([{ name: 'Olej', quantity: 1, unitPrice: 50, vatRate: '23' }]),
  'za krótka',
);
expectValidationError(
  'spacje nie liczą się jako znaki znaczące',
  base([{ name: 'O l e j', quantity: 1, unitPrice: 50, vatRate: '23' }]),
  'za krótka',
);

// 3. Stawka VAT spoza mapy tenanta (błąd drukarki „I")
expectValidationError(
  'nieznana stawka VAT jest odrzucana',
  base([{ name: 'Usluga nietypowa', quantity: 1, unitPrice: 50, vatRate: '17' }]),
  'nie jest przypisana',
);

// 4. Suma płatności ≠ suma paragonu (błąd drukarki „7")
expectValidationError(
  'niezgodna suma płatności jest wyłapana lokalnie',
  base([{ name: 'Usluga testowa', quantity: 1, unitPrice: 100, vatRate: '23' }], [
    { name: 'GOTOWKA', amount: 90 },
  ]),
  'różni się od sumy paragonu',
);

// 5. Ilość zero / ujemna
expectValidationError(
  'ilość 0 jest odrzucana',
  base([{ name: 'Usluga testowa', quantity: 0, unitPrice: 100, vatRate: '23' }]),
  'większa od zera',
);

// 6. Polskie znaki → CP1250
const polish = 'Płyn chłodzący żółć ĄĘŚŹŻÓŃ';
const encoded = encodeCp1250(polish);
check(
  'polskie znaki kodują się w CP1250',
  hex(encoded).startsWith('50 B3 79 6E') && hex(encoded).includes('BF F3 B3'),
  hex(encoded),
);
check('znak spoza CP1250 (emoji) → zastępczy ASCII', hex(encodeCp1250('A🙂B')) === '41 3F 42', hex(encodeCp1250('A🙂B')));
check('cyrylica → transliteracja/zastępczy', encodeCp1250('Привет').length === 6);

// 7. Kwoty i ilości
check('12.34 zł → 1234 gr', toGrosze(12.34) === 1234);
check('0.1 + 0.2 zł → 30 gr (bez błędu float)', toGrosze(0.1 + 0.2) === 30);
check('"1 234,56" jako string → błąd (spacja)', (() => { try { toGrosze('1 234,56'); return false; } catch { return true; } })());
check('"39,99" → 3999 gr', toGrosze('39,99') === 3999);
check('ilość 2.5 → I=25, M=1', encodeQuantity(2.5).decimals === 1 && hex(encodeQuantity(2.5).value) === '19 00 00 00');
check('ilość 1 → I=1, M=0', encodeQuantity(1).decimals === 0 && hex(encodeQuantity(1).value) === '01 00 00 00');
check('ilość 0.125 → I=125, M=3', encodeQuantity(0.125).decimals === 3 && hex(encodeQuantity(0.125).value) === '7D 00 00 00');

// 8. Nazwa dłuższa niż pole — przycięcie do 28 znaków bez rozjechania sekwencji
const longItem = cmd.saleItem({
  name: 'Kompleksowa naprawa układu hamulcowego z wymianą tarcz',
  quantity: 1,
  unitPriceGrosze: 100,
  totalGrosze: 100,
  vatLetter: 'A',
});
check('długa nazwa → sekwencja nadal 51 B', longItem.length === 51, `${longItem.length} B`);

console.log(dim('\n── B. Zachowanie drukarki przy niezgodnej sumie ──'));

if (process.env.SKIP_PRINTER === '1') {
  warn('SKIP_PRINTER=1 — pomijam część z drukarką');
} else {
  let client;
  try {
    client = await connect({ verbose: false });
    await client.drain();

    await client.send('otwarcie paragonu', cmd.openReceipt());
    await client.sendSilent(
      'pozycja testowa 10,00 zł',
      cmd.saleItem({
        name: 'Pozycja testowa bledna',
        quantity: 1,
        unit: 'szt',
        unitPriceGrosze: 1000,
        totalGrosze: 1000,
        vatLetter: 'A',
      }),
    );

    // Celowo zła suma: 99,99 zł zamiast 10,00 zł.
    // Zeta przyjmuje Esc 07H i Esc 81H bez protestu — błąd wychodzi dopiero na Esc 24H (NAK).
    try {
      await client.sendSilent('koniec pozycji z błędną sumą', cmd.endItems(9999));
      await client.sendSilent('płatność z błędną sumą', cmd.payment(1, 'GOTOWKA', 9999));
      await client.send('zamknięcie paragonu', cmd.closeReceipt(), 0, { timeoutMs: 15000 });
      check('drukarka wykrywa niezgodność sumy', false, '— drukarka przyjęła błędny paragon');
      await client.cancelReceiptSafe();
    } catch (error) {
      const message = error instanceof ElzabError ? error.userMessage : String(error);
      const code = error instanceof ElzabError ? error.code : 'UNKNOWN';
      check(
        'drukarka odrzuca niezgodną sumę i dostajemy komunikat PL',
        error instanceof ElzabError && (code === 'RECEIPT_CANCELLED' || code === 'NAK'),
        `[${code}] „${message}"`,
      );
      await client.cancelReceiptSafe();
    }
  } catch (error) {
    fail(`część z drukarką nie wykonała się: ${String(error)}`);
    failures++;
  } finally {
    await client?.close();
  }
}

console.log(
  failures === 0 ? `\n${'✓'} wszystkie przypadki brzegowe OK` : `\n✗ nieudane sprawdzenia: ${failures}`,
);
process.exitCode = failures === 0 ? 0 : 1;
