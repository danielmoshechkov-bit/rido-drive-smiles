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
 * W SĄSIEDZTWIE liczenia albo sprawdzania NUMERU — `deleted_at IS NULL`
 * w innych zapytaniach jest poprawny i nie ma go tu ruszać.
 */
const FILTR = /\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)|\.is\(\s*"deleted_at"\s*,\s*null\s*\)/g;

/**
 * Co uznajemy za „to zapytanie dotyczy numeru".
 *
 * ⚠️ Warunek brzmiał wcześniej po prostu `invoice_number` i był ZA SZEROKI:
 * zapalił się na kontroli `external_payment_ref`, która ma pełne prawo
 * filtrować po `deleted_at` (skasowana faktura ZWALNIA odnośnik płatności,
 * choć nie zwalnia numeru) i przy okazji pobiera `invoice_number` do
 * odpowiedzi. Bramka, która krzyczy na poprawny kod, uczy ignorowania siebie.
 *
 * Liczy się LICZENIE numeru (`seriesLike`/`extractSeq`/`nextSeq`) albo
 * SPRAWDZANIE jego zajętości (`.eq('invoice_number', …)`).
 */
const NUMER = /seriesLike|extractSeq|nextSeq|\.eq\(\s*['"]invoice_number['"]/;

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

// KONTROLA POZYTYWNA 2: drugi kształt złego kodu — sprawdzanie zajętości
// numeru z filtrem na aktywne. Po zawężeniu warunku wyżej trzeba pokazać,
// że nadal go łapiemy, a nie tylko ten z `seriesLike`.
{
  const zlaTresc = [
    "let q = supabase.from('user_invoices').select('id')",
    "  .eq('user_id', user.id)",
    "  .eq('invoice_number', n)",
    "  .is('deleted_at', null)",
    "  .limit(1);",
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
    console.log('❌ KONTROLA POZYTYWNA 2: test nie wykrywa sprawdzania zajętości numeru z filtrem na aktywne');
  } else {
    console.log('✅ kontrola pozytywna 2 — wykrywa też sprawdzanie zajętości numeru');
  }
}

// KONTROLA ODWROTNA: zapytanie o ODNOŚNIK PŁATNOŚCI ma NIE zapalać bramki.
// Tam filtr na aktywne jest poprawny — skasowana faktura zwalnia odnośnik.
{
  const dobraTresc = [
    "const { data: istnieje } = await admin.from('user_invoices')",
    "  .select('id, invoice_number')",
    "  .eq('external_payment_ref', ref)",
    "  .is('deleted_at', null)",
    "  .maybeSingle();",
  ].join('\n');
  const linie = dobraTresc.split('\n');
  let zlapane = false;
  linie.forEach((linia, i) => {
    FILTR.lastIndex = 0;
    if (!FILTR.test(linia)) return;
    const okolica = linie.slice(Math.max(0, i - OKNO), i + OKNO).join('\n');
    if (NUMER.test(okolica)) zlapane = true;
  });
  if (zlapane) {
    zle++;
    console.log('❌ KONTROLA ODWROTNA: bramka zapala się na poprawnym zapytaniu o odnośnik płatności');
  } else {
    console.log('✅ kontrola odwrotna — poprawne zapytanie o odnośnik płatności nie zapala bramki');
  }
}

if (zle > 0) throw new Error(`${zle} niezgodności w regule „numer nie wraca"`);
console.log('\nWSZYSTKO ZIELONE');
