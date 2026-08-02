/**
 * Nazwa fiskalna — skracanie nazwy handlowej do długości pola drukarki.
 *
 * Standard branżowy (Comarch, Trawers): na paragon idzie krótka „nazwa fiskalna",
 * nie pełna nazwa handlowa. Pole drukarki ma 28 albo 40 znaków; dłuższa nazwa zostanie
 * przez firmware ucięta w losowym miejscu, często w połowie wyrazu.
 *
 * Kolejność działań:
 *   1. normalizacja białych znaków,
 *   2. skróty branżowe — od najdłuższego wyrazu, dopóki nie zmieści się w polu
 *      (skracamy tylko tyle, ile trzeba; krótkie nazwy zostają nietknięte),
 *   3. przycięcie na granicy słowa, gdy skróty nie wystarczą,
 *   4. twarde cięcie tylko dla pojedynczego wyrazu dłuższego niż całe pole.
 *
 * UWAGA: to jest źródło prawdy dla podglądu w UI. Biblioteka drukarki po stronie
 * serwera robi wyłącznie bezpieczne przycięcie na granicy słowa (bez słownika),
 * żeby żaden inny moduł nie wysłał nazwy dłuższej niż pole.
 */

/** Skróty warsztatowe: pełny wyraz → skrót. Klucze porównujemy bez wielkości liter. */
const ABBREVIATIONS: Record<string, string> = {
  malowanie: 'malow.',
  malowania: 'malow.',
  lakierowanie: 'lakier.',
  wymiana: 'wym.',
  wymiany: 'wym.',
  wymienić: 'wym.',
  naprawa: 'napr.',
  naprawy: 'napr.',
  regulacja: 'reg.',
  regulacji: 'reg.',
  czyszczenie: 'czyszcz.',
  konserwacja: 'konserw.',
  diagnostyka: 'diagn.',
  diagnostyki: 'diagn.',
  geometria: 'geom.',
  geometrii: 'geom.',
  montaż: 'mont.',
  demontaż: 'demont.',
  przegląd: 'przegl.',
  serwis: 'serw.',
  stabilizatora: 'stabil.',
  stabilizator: 'stabil.',
  amortyzator: 'amort.',
  amortyzatora: 'amort.',
  amortyzatory: 'amort.',
  akumulator: 'akum.',
  akumulatora: 'akum.',
  klimatyzacja: 'klim.',
  klimatyzacji: 'klim.',
  zawieszenie: 'zaw.',
  zawieszenia: 'zaw.',
  kierownicza: 'kier.',
  kierowniczy: 'kier.',
  hamulcowy: 'ham.',
  hamulcowa: 'ham.',
  hamulcowe: 'ham.',
  hamulcowego: 'ham.',
  silnikowy: 'siln.',
  silnikowa: 'siln.',
  silnikowego: 'siln.',
  chłodniczy: 'chłodn.',
  chłodnicza: 'chłodn.',
  chłodzący: 'chłodz.',
  chłodzącego: 'chłodz.',
  rozrządu: 'rozrz.',
  sprzęgła: 'sprz.',
  sprzęgło: 'sprz.',
  łożyska: 'łoż.',
  łożysko: 'łoż.',
  łącznik: 'łącz.',
  łącznika: 'łącz.',
  drążka: 'drąż.',
  drążek: 'drąż.',
  uszczelka: 'uszcz.',
  uszczelki: 'uszcz.',
  komplet: 'kpl.',
  kompletny: 'kpl.',
  zestaw: 'zest.',
  przedni: 'przed.',
  przednia: 'przed.',
  przednie: 'przed.',
  przedniego: 'przed.',
  przednich: 'przed.',
  tylny: 'tyl.',
  tylna: 'tyl.',
  tylne: 'tyl.',
  tylnego: 'tyl.',
  prawy: 'pr.',
  prawa: 'pr.',
  prawe: 'pr.',
  prawego: 'pr.',
  lewy: 'lew.',
  lewa: 'lew.',
  lewe: 'lew.',
  lewego: 'lew.',
  górny: 'górn.',
  dolny: 'doln.',
  kompresor: 'kompr.',
  wentylator: 'went.',
  alternator: 'altern.',
  rozrusznik: 'rozrusz.',
  turbosprężarka: 'turbo',
  katalizator: 'katal.',
  półosi: 'półos.',
  półoś: 'półoś',
};

export const DEFAULT_FISCAL_NAME_LENGTH = 40;

/** Normalizacja: pojedyncze spacje, bez spacji wokół ukośników. */
function normalize(name: string): string {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim();
}

function applyAbbreviations(words: string[], maxLength: number): string[] {
  const result = [...words];
  // Skracamy od najdłuższego wyrazu — największy zysk przy najmniejszej stracie czytelności.
  const order = result
    .map((word, index) => ({ index, length: word.length }))
    .sort((a, b) => b.length - a.length);

  for (const { index } of order) {
    if (result.join(' ').length <= maxLength) break;
    const word = result[index];
    const key = word.toLowerCase().replace(/[.,;:]$/, '');
    const abbreviation = ABBREVIATIONS[key];
    if (abbreviation && abbreviation.length < word.length) {
      // Zachowujemy wielką literę, jeśli oryginał zaczynał się wielką.
      result[index] = /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(word)
        ? abbreviation.charAt(0).toUpperCase() + abbreviation.slice(1)
        : abbreviation;
    }
  }
  return result;
}

/** Przycięcie na granicy słowa — nigdy w połowie wyrazu. */
function cutOnWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  // Pojedynczy wyraz dłuższy niż całe pole — jedyny przypadek twardego cięcia.
  // Ucięta końcówka MUSI być oznaczona kropką, żeby nie wyglądała na literówkę.
  if (lastSpace <= 0) return cut.slice(0, maxLength - 1).trimEnd() + '.';
  return cut.slice(0, lastSpace).trimEnd();
}

/**
 * Nazwa fiskalna: skrócona do długości pola drukarki, czytelnie i na granicy słowa.
 * Nazwy mieszczące się w polu wracają bez zmian.
 */
export function toFiscalName(name: string, maxLength = DEFAULT_FISCAL_NAME_LENGTH): string {
  const normalized = normalize(name);
  if (normalized.length <= maxLength) return normalized;

  const abbreviated = applyAbbreviations(normalized.split(' '), maxLength).join(' ');
  if (abbreviated.length <= maxLength) return abbreviated;

  return cutOnWordBoundary(abbreviated, maxLength);
}

/** Czy nazwa została zmieniona na potrzeby paragonu (do pokazania w podglądzie). */
export function isFiscalNameShortened(name: string, maxLength = DEFAULT_FISCAL_NAME_LENGTH): boolean {
  return toFiscalName(name, maxLength) !== normalize(name);
}
