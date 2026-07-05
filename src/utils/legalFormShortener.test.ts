/**
 * Testy legalFormShortener — w repo nie ma test runnera, więc plik jest
 * samodzielnie wykonywalny: `node src/utils/legalFormShortener.test.ts`
 * (Node ≥22.6 ze strip-types). Wypisuje PASS/FAIL i kończy kodem błędu przy porażce.
 */
import { shortenLegalForm, hasShortenableLegalForm } from './legalFormShortener.ts';

const cases: Array<{ input: string; expected: string; label: string }> = [
  {
    label: 'sp. z o.o. na końcu',
    input: 'DR NATURA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
    expected: 'DR NATURA sp. z o.o.',
  },
  {
    label: 'sp. z o.o. sp.k. (dłuższy wzorzec przed krótszym)',
    input: 'BUDIMEX NIERUCHOMOŚCI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ SPÓŁKA KOMANDYTOWA',
    expected: 'BUDIMEX NIERUCHOMOŚCI sp. z o.o. sp.k.',
  },
  {
    label: 'P.S.A. przed S.A.',
    input: 'TECHNOLOGIE JUTRA PROSTA SPÓŁKA AKCYJNA',
    expected: 'TECHNOLOGIE JUTRA P.S.A.',
  },
  {
    label: 'S.A.',
    input: 'POWSZECHNA KASA OSZCZĘDNOŚCI BANK POLSKI SPÓŁKA AKCYJNA',
    expected: 'POWSZECHNA KASA OSZCZĘDNOŚCI BANK POLSKI S.A.',
  },
  {
    label: 'S.K.A. (komandytowo-akcyjna ≠ komandytowa)',
    input: 'INWESTYCJE ALFA SPÓŁKA KOMANDYTOWO-AKCYJNA',
    expected: 'INWESTYCJE ALFA S.K.A.',
  },
  {
    label: 'sp.k.',
    input: 'KANCELARIA NOWAK SPÓŁKA KOMANDYTOWA',
    expected: 'KANCELARIA NOWAK sp.k.',
  },
  {
    label: 'sp.j.',
    input: 'KOWALSKI I WSPÓLNICY SPÓŁKA JAWNA',
    expected: 'KOWALSKI I WSPÓLNICY sp.j.',
  },
  {
    label: 'sp.p.',
    input: 'ADWOKACI NOWAK WIŚNIEWSKI SPÓŁKA PARTNERSKA',
    expected: 'ADWOKACI NOWAK WIŚNIEWSKI sp.p.',
  },
  {
    label: 's.c.',
    input: 'USŁUGI REMONTOWE JAN I ADAM NOWAK SPÓŁKA CYWILNA',
    expected: 'USŁUGI REMONTOWE JAN I ADAM NOWAK s.c.',
  },
  {
    label: 'forma w środku nazwy',
    input: 'GRUPA KAPITAŁOWA SPÓŁKA AKCYJNA ODDZIAŁ W WARSZAWIE',
    expected: 'GRUPA KAPITAŁOWA S.A. ODDZIAŁ W WARSZAWIE',
  },
  {
    label: 'case-insensitive (małe litery)',
    input: 'Dr Natura spółka z ograniczoną odpowiedzialnością',
    expected: 'Dr Natura sp. z o.o.',
  },
  {
    label: 'bez formy prawnej — bez zmian',
    input: 'JAN KOWALSKI USŁUGI TRANSPORTOWE',
    expected: 'JAN KOWALSKI USŁUGI TRANSPORTOWE',
  },
  {
    label: 'nie skraca fragmentów innych słów',
    input: 'PRZEDSIĘBIORSTWO SPÓŁKA AKCYJNAOWO', // sklejone litery — nie ma granicy słowa
    expected: 'PRZEDSIĘBIORSTWO SPÓŁKA AKCYJNAOWO',
  },
];

let failed = 0;
for (const { input, expected, label } of cases) {
  const actual = shortenLegalForm(input);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok) console.log(`  input:    ${input}\n  expected: ${expected}\n  actual:   ${actual}`);
}

const hasCases: Array<[string, boolean]> = [
  ['DR NATURA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', true],
  ['JAN KOWALSKI USŁUGI TRANSPORTOWE', false],
];
for (const [input, expected] of hasCases) {
  const ok = hasShortenableLegalForm(input) === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} — hasShortenableLegalForm(${JSON.stringify(input)}) === ${expected}`);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${cases.length + hasCases.length} tests passed`);
