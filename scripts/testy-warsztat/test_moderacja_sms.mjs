// Kontrola treści SMS: co ma być zablokowane, a co MUSI przejść.
// Fałszywy alarm jest tu kosztowny — blokuje warsztatowi normalną pracę.
// Moduł ładujemy WPROST (node zdejmuje typy sam) — wcześniejsze wycinanie
// typów wyrażeniami regularnymi psuło kod, a test badałby wtedy własną kopię.
import { sprawdzTrescSms } from '../../src/lib/smsModeration.ts';

const ZABLOKOWANE = [
  ['kurwa co za warsztat', 'wulgaryzm'],
  ['k u r w a nie odbieraj', 'wulgaryzm'],
  ['Ty debilu oddaj auto', 'wulgaryzm'],
  ['Twoj bank: blokada konta, zaloguj sie', 'podszywanie'],
  ['Twoja paczka czeka, doplac 1,50 zl', 'podszywanie'],
  ['Podaj kod BLIK zeby odebrac auto', 'wyludzenie'],
  ['Wygrales nagroda czeka, kliknij', 'wyludzenie'],
  ['Potwierdz dane: https://login-getrido.com', 'link_logowania'],
  ['szczegoly: bit.ly/xyz123', 'link_logowania'],
];

const DOZWOLONE = [
  'Auto gotowe do odbioru. Zapraszamy do 17:00.',
  'Wizyta 18.08 o 9:00, Warsztat Testowy, ul. Polna 3.',
  'Kosztorys do akceptacji: https://getrido.pl/r/abc123',
  'Niestety czesc nie dotarla, przepraszamy za opoznienie.',
  'Przypomnienie: przeglad rejestracyjny konczy sie 30.09.',
  'Zaplata 450 zl gotowka lub kartą przy odbiorze.',
  'Klocki hamulcowe wymienione, tarcze do obserwacji.',
];

let bledy = 0;
for (const [tresc, powod] of ZABLOKOWANE) {
  const w = sprawdzTrescSms(tresc);
  const ok = !w.dozwolone && w.powod === powod;
  if (!ok) bledy++;
  console.log(`${ok ? ' OK  ' : 'BLAD '} blokuje (${powod}): "${tresc.slice(0, 45)}" → ${w.powod || 'przepuscil'}`);
}
for (const tresc of DOZWOLONE) {
  const w = sprawdzTrescSms(tresc);
  if (w.dozwolone) { console.log(` OK   przepuszcza: "${tresc.slice(0, 45)}"`); }
  else { bledy++; console.log(`BLAD  FALSZYWY ALARM (${w.powod}) na: "${tresc}"`); }
}
// Obie kopie muszą mieć IDENTYCZNE listy słów — inaczej serwer przepuszcza coś,
// co ekran blokuje, albo odwrotnie, i nikt tego nie zauważy.
import { readFileSync } from 'node:fs';
const listy = (plik) => (readFileSync(plik, 'utf8').match(/const (?:WULGARYZMY|PODSZYWANIE|WYLUDZENIE)[\s\S]*?\];/g) || []).join('');
const zgodne = listy('src/lib/smsModeration.ts') === listy('supabase/functions/_shared/smsModeration.ts');
if (zgodne) console.log(' OK   ekran i serwer maja te sama liste slow');
else { bledy++; console.log('BLAD  listy slow rozjechaly sie miedzy ekranem a serwerem'); }

console.log(bledy ? `BLAD: ${bledy} przypadkow` : 'MODERACJA SMS DZIALA');
process.exit(bledy ? 1 : 0);
