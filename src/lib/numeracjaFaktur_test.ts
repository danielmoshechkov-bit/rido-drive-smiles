/**
 * Bramka: NUMER FAKTURY NIE MOŻE WRACAĆ.
 *
 * 09.09.2026 numer GR/2026/007 dostały dwa dokumenty u dwóch różnych nabywców.
 * Przyczyną nie był błąd w kodzie, tylko REGUŁA: wszystkie miejsca liczące
 * numer pytały o faktury AKTYWNE (`deleted_at IS NULL`), więc skasowanie
 * faktury zwalniało jej numer.
 *
 * Miejsc było SIEDEM. Poprawka w jednym z nich nic by nie dała, a poprawka
 * w sześciu byłaby gorsza niż żadna: propozycja numeru i więz w bazie
 * mówiłyby co innego, więc klient dostawałby odmowę zapisu przy każdej
 * fakturze po skasowanej.
 *
 * Ten test czyta ŹRÓDŁA i pilnuje, żeby filtr nie wrócił tylnymi drzwiami —
 * nie sprawdza logiki (od tego jest wyzwalacz i jego kontrola w migracji),
 * tylko to, czy któreś z siedmiu miejsc znowu nie zaczęło pytać o aktywne.
 * To ta sama klasa kontroli co testy agenta głosowego czytające pliki
 * źródłowe: audyt kodu, nie test jednostkowy — ale łapie realną regresję.
 */
import { readFileSync } from 'node:fs';

/** Pliki, w których numer faktury jest liczony albo sprawdzany. */
const PLIKI = [
  'src/components/invoices/SimpleFreeInvoice.tsx',
  'supabase/functions/billing-invoice-issue/index.ts',
];

/**
 * Wzorce zapytań o `user_invoices` z filtrem na aktywne. Szukamy filtra
 * W SĄSIEDZTWIE numeru faktury — `deleted_at IS NULL` w innych zapytaniach
 * (lista faktur, raporty) jest poprawny i nie ma go tu ruszać.
 */
const FILTR = /\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)|\.is\(\s*"deleted_at"\s*,\s*null\s*\)/g;
const NUMER = /invoice_number|seriesLike|extractSeq|nextSeq/;

/** Ile linii wokół filtra uznajemy za „to samo zapytanie". */
const OKNO = 8;

let zle = 0;

for (const plik of PLIKI) {
  let tresc: string;
  try {
    tresc = readFileSync(plik, 'utf8');
  } catch {
    console.log(`❌ ${plik} — nie ma takiego pliku (przeniesiony? zmień listę w teście)`);
    zle++;
    continue;
  }

  const linie = tresc.split('\n');
  const trafienia: number[] = [];

  linie.forEach((linia, i) => {
    FILTR.lastIndex = 0;
    if (!FILTR.test(linia)) return;
    // Czy to zapytanie dotyczy numeru faktury?
    const od = Math.max(0, i - OKNO);
    const do_ = Math.min(linie.length, i + OKNO);
    const okolica = linie.slice(od, do_).join('\n');
    if (NUMER.test(okolica)) trafienia.push(i + 1);
  });

  if (trafienia.length) {
    zle++;
    console.log(
      `❌ ${plik} — zapytanie o numer faktury znowu filtruje po \`deleted_at IS NULL\`` +
      ` (linie: ${trafienia.join(', ')}).\n` +
      `   Numer raz wystawiony jest ZUŻYTY. Wyzwalacz w bazie odrzuci taki numer,` +
      ` więc klient dostanie odmowę zapisu zamiast kolejnego numeru.`,
    );
  } else {
    console.log(`✅ ${plik} — numer liczony ze WSZYSTKICH faktur serii`);
  }
}

// KONTROLA POZYTYWNA: test musi umieć zapalić się na czerwono. Sprawdzamy go
// na treści, o której wiemy, że jest zła — bez tego zielony wynik mógłby brać
// się z niedziałającego wyrażenia regularnego, a nie z poprawnego kodu.
{
  const zlaTresc = [
    "const { data } = await supabase.from('user_invoices').select('invoice_number')",
    "  .eq('user_id', userId)",
    "  .is('deleted_at', null)",
    "  .like('invoice_number', seriesLike(c, now));",
  ].join('\n');
  const linie = zlaTresc.split('\n');
  let zlapane = false;
  linie.forEach((linia, i) => {
    FILTR.lastIndex = 0;
    if (!FILTR.test(linia)) return;
    const okolica = linie.slice(Math.max(0, i - OKNO), i + OKNO).join('\n');
    if (NUMER.test(okolica)) zlapane = true;
  });
  if (!zlapane) {
    zle++;
    console.log('❌ KONTROLA POZYTYWNA: test nie wykrywa nawet wzorca, o którym wiadomo, że jest zły');
  } else {
    console.log('✅ kontrola pozytywna — test wykrywa zły wzorzec, więc zieleń coś znaczy');
  }
}

if (zle > 0) throw new Error(`${zle} niezgodności w regule „numer nie wraca"`);
console.log('\nWSZYSTKO ZIELONE');
