/**
 * Skracanie form prawnych w nazwach rejestrowych firm (GUS zwraca pełne formy,
 * np. "DR NATURA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ" → "DR NATURA sp. z o.o.").
 * Dotyczy tylko nazwy wstawianej do formularza — oryginalnych danych z GUS nie modyfikujemy.
 */

// Kolejność ma znaczenie: najdłuższe wzorce pierwsze (sp. z o.o. sp.k. przed sp. z o.o.,
// P.S.A. przed S.A., S.K.A. przed sp.k.).
const LEGAL_FORM_RULES: Array<{ full: string; short: string }> = [
  { full: 'SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ SPÓŁKA KOMANDYTOWA', short: 'sp. z o.o. sp.k.' },
  { full: 'SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', short: 'sp. z o.o.' },
  { full: 'PROSTA SPÓŁKA AKCYJNA', short: 'P.S.A.' },
  { full: 'SPÓŁKA KOMANDYTOWO-AKCYJNA', short: 'S.K.A.' },
  { full: 'SPÓŁKA AKCYJNA', short: 'S.A.' },
  { full: 'SPÓŁKA KOMANDYTOWA', short: 'sp.k.' },
  { full: 'SPÓŁKA JAWNA', short: 'sp.j.' },
  { full: 'SPÓŁKA PARTNERSKA', short: 'sp.p.' },
  { full: 'SPÓŁKA CYWILNA', short: 's.c.' },
];

// (?<!\p{L}) / (?!\p{L}) zamiast \b — \b nie działa na polskich znakach (Ą, Ś itd.).
// Spacje we wzorcu dopasowują dowolne odstępy (GUS bywa niekonsekwentny).
function buildPattern(full: string): RegExp {
  const escaped = full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'giu');
}

const COMPILED_RULES = LEGAL_FORM_RULES.map(({ full, short }) => ({
  pattern: buildPattern(full),
  short,
}));

/**
 * Zamienia pełne formy prawne na skróty (case-insensitive, na końcu i w środku nazwy).
 * Reszta nazwy pozostaje bez zmian.
 */
export function shortenLegalForm(name: string): string {
  let result = name;
  for (const { pattern, short } of COMPILED_RULES) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, short);
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

/** Czy nazwa zawiera pełną formę prawną, którą da się skrócić. */
export function hasShortenableLegalForm(name: string): boolean {
  return COMPILED_RULES.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(name);
  });
}
