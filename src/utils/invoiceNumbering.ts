// Numeracja faktur — JEDNO źródło prawdy dla propozycji numeru, walidacji serii
// i formatu (ustawienia firmy: user_invoice_companies.numbering_*).
//
// Wzory (NNN = licznik, RRRR = rok, MM = miesiąc; reset licznika wynika ze wzoru):
//   'RRRR/MM/NNN' -> FV/2026/07/001  (reset co miesiąc)
//   'RRRR/NNN'    -> FV/2026/001     (reset co rok, licznik ciągły w roku)
//   'NNN/RRRR'    -> FV/001/2026     (reset co rok)
//   'NNN'         -> FV/001          (ciągły, bez resetu)
//
// Propozycja numeru NIE używa licznika RPC (martwy licznik zliczał usunięte
// faktury) — zawsze liczona z AKTYWNYCH wierszy (deleted_at IS NULL).

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
export function nextSeq(mode: NumberingMode, activeSeqs: number[]): number {
  if (mode === 'fill_gaps') {
    const taken = new Set(activeSeqs);
    let n = 1;
    while (taken.has(n)) n++;
    return n;
  }
  return (activeSeqs.length ? Math.max(...activeSeqs) : 0) + 1;
}
