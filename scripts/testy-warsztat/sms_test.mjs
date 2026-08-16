// SMS do admina musi być JEDNĄ wiadomością (160 znaków ASCII).
// Odtworzony po utracie pliku tymczasowego (16.08). Testuje funkcję z produkcji:
// wyciąga buildSingleSms i asciiOnly z kodu edge, nie z kopii.
import { readFileSync } from 'node:fs';
const zrodlo = readFileSync('supabase/functions/support-notify/index.ts', 'utf8');
// Stałe i obie funkcje bierzemy WPROST z kodu produkcyjnego (są to `const`
// ze strzałkami, nie deklaracje `function`), żeby test nie badał własnej kopii.
const wytnij = (nazwa) => {
  const start = zrodlo.indexOf(`const ${nazwa} =`);
  if (start < 0) throw new Error(`brak ${nazwa} w support-notify`);
  const koniec = zrodlo.indexOf('\n\n', start);
  return zrodlo.slice(start, koniec < 0 ? zrodlo.length : koniec);
};
const stale = (zrodlo.match(/const SMS_LIMIT[^\n]*\n/) || [''])[0]
            + (zrodlo.match(/const SMS_TAIL[^\n]*\n/) || [''])[0];
const kod = [stale, wytnij('asciiOnly'), wytnij('buildSingleSms')]
  .join('\n').replace(/: string/g, '').replace(/: number/g, '');
const { buildSingleSms, asciiOnly } = new Function(`${kod}; return { buildSingleSms, asciiOnly };`)();

const przypadki = [
  ['Jan Kowalski', 'Dzien dobry, czy zrobicie przeglad w moim aucie?'],
  ['[AI-TEST] Klient', 'Czy zrobicie integracje z moim systemem XYZ i ile to potrwa?'],
  ['Firma Transportowa Kowalski i Synowie sp. z o.o.', 'A'.repeat(400)],
  ['Zażółć gęślą jaźń', 'Ćwierć litra żółtej oliwy — pytanie o cenę wymiany rozrządu w Passacie'],
  ['', ''],
];
let bledy = 0;
for (const [kto, tresc] of przypadki) {
  // Tak jak w produkcji: najpierw odchudzenie do ASCII i przycięcie nazwy
  // (support-notify robi to przed złożeniem wiadomości), potem złożenie SMS-a.
  const sms = buildSingleSms(asciiOnly(kto || 'Klient').slice(0, 28), asciiOnly(tresc));
  const dlugosc = sms.length;
  const czysteAscii = /^[\x20-\x7E]*$/.test(sms);
  const ok = dlugosc <= 160 && czysteAscii;
  if (!ok) bledy++;
  console.log(`${ok ? ' OK  ' : 'BLAD '} ${dlugosc} znakow, ascii=${czysteAscii} :: ${sms.slice(0, 70)}`);
}
console.log(bledy ? `BLAD: ${bledy} wiadomosci nie miesci sie w 1 SMS` : 'WSZYSTKIE MIESZCZA SIE W 1 SMS');
process.exit(bledy ? 1 : 0);
