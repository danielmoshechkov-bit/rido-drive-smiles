// Numeracja faktur — JEDNO źródło prawdy dla propozycji numeru, walidacji serii
// i formatu (ustawienia firmy: user_invoice_companies.numbering_*).
//
// TO JEST KANONICZNA KOPIA. `src/utils/invoiceNumbering.ts` tylko ją re-eksportuje.
// Powód: od 4.17 numer nadaje także serwer (faktura sprzedażowa GetRido wystawiana
// z webhooka), a numeracja licząca inaczej we froncie niż w edge function dałaby
// dwie faktury o tym samym numerze — błąd, którego nie da się cofnąć po wysyłce
// do KSeF. Moduł jest czysty: bez Deno, bez importów, działa po obu stronach.
//
// Wzory (NNN = licznik, RRRR = rok, MM = miesiąc; reset licznika wynika ze wzoru):
//   'RRRR/MM/NNN' -> FV/2026/07/001  (reset co miesiąc)
//   'RRRR/NNN'    -> FV/2026/001     (reset co rok, licznik ciągły w roku)
//   'NNN/RRRR'    -> FV/001/2026     (reset co rok)
//   'NNN'         -> FV/001          (ciągły, bez resetu)
//
// 🔴 NUMER RAZ WYSTAWIONY NIE WRACA — nawet po skasowaniu faktury.
//
// Do 09.09.2026 propozycja liczyła się z AKTYWNYCH wierszy (`deleted_at IS NULL`),
// więc skasowanie faktury ZWALNIAŁO jej numer. Zdarzyło się to naprawdę:
// GR/2026/007 wystawiona 09.09 o 09:51 dla AUTO-SERWIS HAWRYLUK została
// skasowana o 12:18, a o 12:58 ten sam numer dostał CART78GARAGE. Dwa dokumenty
// o jednym numerze u dwóch klientów — problem przy kontroli, bo klient mógł już
// dostać dokument, a księgowa go zaksięgować.
//
// Numeracja liczy się teraz z WSZYSTKICH wierszy serii, łącznie z miękko
// skasowanymi. Skasowanie zostawia lukę i tak ma być: numer jest zużyty.
// Więz w bazie mówi to samo — wyzwalacz `prevent_duplicate_invoice_number`
// odrzuca numer użyty KIEDYKOLWIEK (migracja `20260909…_numer_nie_wraca`).

export type NumberingPattern = 'RRRR/MM/NNN' | 'RRRR/NNN' | 'NNN/RRRR' | 'NNN';
export type NumberingMode = 'continuous' | 'fill_gaps' | 'manual';

export interface NumberingConfig {
  prefix: string;
  pattern: NumberingPattern;
  mode: NumberingMode;
}

export const DEFAULT_NUMBERING: NumberingConfig = {
  prefix: 'FV',
  pattern: 'RRRR/MM/NNN',
  mode: 'continuous',
};

export const NUMBERING_PATTERNS: { value: NumberingPattern; label: string; reset: string }[] = [
  { value: 'RRRR/MM/NNN', label: 'PREFIKS/RRRR/MM/NNN', reset: 'reset co miesiąc' },
  { value: 'RRRR/NNN', label: 'PREFIKS/RRRR/NNN', reset: 'reset co rok (licznik ciągły w roku)' },
  { value: 'NNN/RRRR', label: 'PREFIKS/NNN/RRRR', reset: 'reset co rok' },
  { value: 'NNN', label: 'PREFIKS/NNN', reset: 'ciągła (bez resetu)' },
];

const pad = (n: number, len: number) => String(n).padStart(len, '0');

/** Zbuduj numer wg konfiguracji, daty i wartości licznika. */
export function buildInvoiceNumber(cfg: NumberingConfig, date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  const n = pad(seq, 3);
  switch (cfg.pattern) {
    case 'RRRR/MM/NNN': return `${cfg.prefix}/${y}/${m}/${n}`;
    case 'RRRR/NNN': return `${cfg.prefix}/${y}/${n}`;
    case 'NNN/RRRR': return `${cfg.prefix}/${n}/${y}`;
    case 'NNN': return `${cfg.prefix}/${n}`;
  }
}

/** Wzorzec SQL LIKE zawężający zapytanie do bieżącej serii (rok/miesiąc wg wzoru). */
export function seriesLike(cfg: NumberingConfig, date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  switch (cfg.pattern) {
    case 'RRRR/MM/NNN': return `${cfg.prefix}/${y}/${m}/%`;
    case 'RRRR/NNN': return `${cfg.prefix}/${y}/%`;
    case 'NNN/RRRR': return `${cfg.prefix}/%/${y}`;
    case 'NNN': return `${cfg.prefix}/%`;
  }
}

/** Wyciągnij licznik NNN z numeru należącego do bieżącej serii; null = spoza serii. */
export function extractSeq(cfg: NumberingConfig, date: Date, invoiceNumber: string): number | null {
  const esc = cfg.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  let re: RegExp;
  switch (cfg.pattern) {
    case 'RRRR/MM/NNN': re = new RegExp(`^${esc}/${y}/${m}/(\\d+)$`); break;
    case 'RRRR/NNN': re = new RegExp(`^${esc}/${y}/(\\d+)$`); break;
    case 'NNN/RRRR': re = new RegExp(`^${esc}/(\\d+)/${y}$`); break;
    case 'NNN': re = new RegExp(`^${esc}/(\\d+)$`); break;
  }
  const match = String(invoiceNumber || '').trim().match(re);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return isNaN(n) ? null : n;
}

/** Następny numer: continuous/manual = max(aktywnych)+1; fill_gaps = najniższy wolny. */
/**
 * Kolejny wolny numer.
 *
 * `uzyteSeqs` to numery UŻYTE, nie „aktywne". Różnica jest cała treścią
 * poprawki z 09.09.2026: wywołujący MUSI podać także numery faktur miękko
 * skasowanych, inaczej skasowanie zwolni numer i trafi on do drugiego klienta.
 * Nazwa parametru brzmiała `activeSeqs` i to ona podpowiadała złe zapytanie.
 *
 * `fill_gaps` wypełnia luki tylko po numerach, których NIGDY nie użyto —
 * luka po skasowanej fakturze luką nie jest.
 */
export function nextSeq(mode: NumberingMode, uzyteSeqs: number[]): number {
  if (mode === 'fill_gaps') {
    const taken = new Set(uzyteSeqs);
    let n = 1;
    while (taken.has(n)) n++;
    return n;
  }
  return (uzyteSeqs.length ? Math.max(...uzyteSeqs) : 0) + 1;
}
