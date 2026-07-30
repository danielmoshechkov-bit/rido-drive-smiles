/**
 * Strony kodowe drukarek fiskalnych.
 *
 * TextEncoder koduje wyłącznie UTF-8, więc tablice są własne.
 * Obsługiwane: CP1250 (Windows Środkowoeuropejska), CP852 (Latin-2 DOS), Mazovia (CP790).
 * Której używa konkretne urządzenie — ustala się empirycznie (patrz scripts/elzab/05-codepage-test.ts)
 * i zapisuje per tenant w `fiscal_printers.codepage`.
 */

export type Codepage = 'cp1250' | 'latin2' | 'cp852' | 'mazovia';

/**
 * Domyślna strona kodowa modułu.
 * ELZAB Zeta Online (potwierdzone mapą bajtów, paragon nr 6 z 30.07.2026) drukuje
 * polskie znaki w CP852 — bajty spoza jej tablicy glifów są po cichu pomijane.
 */
export const DEFAULT_CODEPAGE: Codepage = 'cp852';

export const CODEPAGES: Codepage[] = ['cp1250', 'latin2', 'cp852', 'mazovia'];

// Pełna mapa 0x80..0xFF windows-1250. '�' = pozycja niezdefiniowana.
const CP1250_HIGH =
  '€�‚�„…†‡' + // 80-87
  '�‰Š‹ŚŤŽŹ' + // 88-8F
  '�‘’“”•–—' + // 90-97
  '�™š›śťžź' + // 98-9F
  ' ˇ˘Ł¤Ą¦§' + // A0-A7
  '¨©Ş«¬­®Ż' + // A8-AF
  '°±˛ł´µ¶·' + // B0-B7
  '¸ąş»Ľ˝ľż' + // B8-BF
  'ŔÁÂĂÄĹĆÇ' + // C0-C7
  'ČÉĘËĚÍÎĎ' + // C8-CF
  'ĐŃŇÓÔŐÖ×' + // D0-D7
  'ŘŮÚŰÜÝŢß' + // D8-DF
  'ŕáâăäĺćç' + // E0-E7
  'čéęëěíîď' + // E8-EF
  'đńňóôőö÷' + // F0-F7
  'řůúűüýţ˙';  // F8-FF

function buildCp1250(): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < CP1250_HIGH.length; i++) {
    const ch = CP1250_HIGH[i];
    if (ch !== '�') map.set(ch, 0x80 + i);
  }
  return map;
}

/**
 * ISO 8859-2 (Latin-2). Różni się od CP1250 tylko przy ą/Ą, ś/Ś, ź/Ź —
 * dlatego wydruk „prawie dobry" (6 z 9 liter poprawnych) wskazuje właśnie na tę stronę.
 */
const LATIN2_POLISH: Record<string, number> = {
  ą: 0xb1, Ą: 0xa1,
  ć: 0xe6, Ć: 0xc6,
  ę: 0xea, Ę: 0xca,
  ł: 0xb3, Ł: 0xa3,
  ń: 0xf1, Ń: 0xd1,
  ó: 0xf3, Ó: 0xd3,
  ś: 0xb6, Ś: 0xa6,
  ź: 0xbc, Ź: 0xac,
  ż: 0xbf, Ż: 0xaf,
};

/**
 * CP852 (Latin-2 DOS) — pełen komplet polskich znaków.
 * Pozostałe znaki narodowe tej strony pomijamy (nie występują w nazwach towarów);
 * trafiają w transliterację ASCII.
 */
const CP852_POLISH: Record<string, number> = {
  ą: 0xa5, Ą: 0xa4,
  ć: 0x86, Ć: 0x8f,
  ę: 0xa9, Ę: 0xa8,
  ł: 0x88, Ł: 0x9d,
  ń: 0xe4, Ń: 0xe3,
  ó: 0xa2, Ó: 0xe0,
  ś: 0x98, Ś: 0x97,
  ź: 0xab, Ź: 0x8d,
  ż: 0xbe, Ż: 0xbd,
};

/** Mazovia (CP790) — historyczna polska strona kodowa, wciąż spotykana w kasach fiskalnych. */
const MAZOVIA_POLISH: Record<string, number> = {
  ą: 0x86, Ą: 0x8f,
  ć: 0x8d, Ć: 0x95,
  ę: 0x91, Ę: 0x90,
  ł: 0x92, Ł: 0x9c,
  ń: 0xa4, Ń: 0xa5,
  ó: 0xa2, Ó: 0xa3,
  ś: 0x9e, Ś: 0x98,
  ź: 0xa6, Ź: 0xa0,
  ż: 0xa7, Ż: 0xa1,
};

const TABLES: Record<Codepage, Map<string, number>> = {
  cp1250: buildCp1250(),
  latin2: new Map(Object.entries(LATIN2_POLISH)),
  cp852: new Map(Object.entries(CP852_POLISH)),
  mazovia: new Map(Object.entries(MAZOVIA_POLISH)),
};

/** Polskie znaki — używane przez skrypt diagnostyczny i testy. */
export const POLISH_LOWER = 'ąćęłńóśźż';
export const POLISH_UPPER = 'ĄĆĘŁŃÓŚŹŻ';

// Awaryjna transliteracja dla znaków spoza tablicy.
const FALLBACK: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'",
  '“': '"', '”': '"', '„': '"', '•': '*',
  '…': '...',
  ł: 'l', Ł: 'L',
};

/** Znak nieobsługiwany przez stronę kodową → najbliższy ASCII (ostatnia deska ratunku). */
function foldToAscii(ch: string): string {
  if (FALLBACK[ch]) return FALLBACK[ch];
  const stripped = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const code = stripped.charCodeAt(0);
  if (stripped.length >= 1 && code >= 0x20 && code < 0x7f) return stripped[0];
  return '?';
}

/**
 * Koduje tekst do wybranej strony kodowej.
 * Każdy znak zawsze daje co najmniej jeden bajt — nic nie jest pomijane po cichu:
 * znak spoza tablicy przechodzi przez transliterację ASCII, a w ostateczności '?' (0x3F).
 */
export function encodeText(text: string, codepage: Codepage = 'cp1250'): Uint8Array {
  const table = TABLES[codepage];
  if (!table) throw new RangeError(`encodeText: nieznana strona kodowa "${codepage}"`);

  const out: number[] = [];
  for (const ch of text ?? '') {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const mapped = table.get(ch);
    if (mapped !== undefined) {
      out.push(mapped);
      continue;
    }
    for (const f of foldToAscii(ch)) {
      const fc = f.codePointAt(0)!;
      out.push(fc < 0x80 ? fc : (table.get(f) ?? 0x3f));
    }
  }
  return new Uint8Array(out);
}

/** Dekoduje bajty danej strony kodowej (diagnostyka odpowiedzi tekstowych). */
export function decodeText(bytes: Uint8Array, codepage: Codepage = 'cp1250'): string {
  const table = TABLES[codepage];
  const reverse = new Map<number, string>();
  for (const [ch, byte] of table) reverse.set(byte, ch);
  let out = '';
  for (const b of bytes) {
    out += b < 0x80 ? String.fromCharCode(b) : (reverse.get(b) ?? '?');
  }
  return out.replace(/�/g, '?');
}

/** Skrót zgodności — CP1250 jest domyślną stroną kodową modułu. */
export const encodeCp1250 = (text: string) => encodeText(text, 'cp1250');
export const decodeCp1250 = (bytes: Uint8Array) => decodeText(bytes, 'cp1250');
