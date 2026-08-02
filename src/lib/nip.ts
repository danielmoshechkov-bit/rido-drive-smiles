/**
 * NIP — normalizacja, walidacja sumą kontrolną i formatowanie.
 *
 * Walidacja jest twarda, bo paragon fiskalny z błędnym NIP-em jest nieodwracalny:
 * obrót trafia do pamięci fiskalnej razem z numerem i nie da się tego poprawić
 * inaczej niż przez ewidencję pomyłek.
 */

/** Same cyfry — bez myślników, spacji i prefiksu PL. */
export function normalizeNip(nip: string): string {
  return String(nip ?? '')
    .replace(/^PL/i, '')
    .replace(/\D/g, '');
}

/**
 * Suma kontrolna NIP: wagi 6,5,7,2,3,4,5,6,7 dla pierwszych 9 cyfr,
 * reszta z dzielenia przez 11 musi równać się cyfrze kontrolnej.
 * Reszta 10 oznacza numer nieprawidłowy (taki NIP nie jest nadawany).
 */
export function isValidNip(nip: string): boolean {
  const digits = normalizeNip(nip);
  if (digits.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(digits)) return false; // 0000000000 itp.

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, weight, index) => acc + weight * Number(digits[index]), 0);
  const control = sum % 11;
  return control !== 10 && control === Number(digits[9]);
}

/** 5223247450 → 522-324-74-50 */
export function formatNip(nip: string): string {
  const digits = normalizeNip(nip);
  if (digits.length !== 10) return String(nip ?? '');
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

/**
 * Próg faktury uproszczonej: paragon z NIP nabywcy do 450 zł brutto (100 EUR)
 * jest traktowany jak faktura uproszczona (art. 106e ust. 5 pkt 3 ustawy o VAT).
 * Powyżej tej kwoty firma potrzebuje pełnej faktury.
 */
export const SIMPLIFIED_INVOICE_LIMIT_GROSZE = 45000;

export function isSimplifiedInvoice(totalGrosze: number): boolean {
  return totalGrosze <= SIMPLIFIED_INVOICE_LIMIT_GROSZE;
}
