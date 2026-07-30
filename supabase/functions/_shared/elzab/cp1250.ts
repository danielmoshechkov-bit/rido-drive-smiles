/**
 * CP1250 (windows-1250) encoder.
 *
 * TextDecoder potrafi dekodować 'windows-1250', ale TextEncoder w Deno/Node
 * koduje wyłącznie UTF-8 — dlatego własna tablica.
 *
 * Drukarka ELZAB musi mieć ustawioną stronę kodową CP1250 (Ustawienia → Kody).
 */

// Mapa 0x80..0xFF windows-1250. '�' = pozycja niezdefiniowana w tej stronie kodowej.
const HIGH_RANGE =
  '€�‚�„…†‡' + // 80-87
  '�‰Š‹ŚŤŽŹ' + // 88-8F
  '�‘’“”•–—' + // 90-97
  '�™š›śťžź' + // 98-9F
  ' ˇ˘Ł¤Ą¦§' + // A0-A7
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

const ENCODE_MAP: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < HIGH_RANGE.length; i++) {
    const ch = HIGH_RANGE[i];
    if (ch !== '�') m.set(ch, 0x80 + i);
  }
  return m;
})();

// Awaryjna transliteracja dla znaków spoza CP1250 (np. cyrylica, emoji, „…" z innych stron).
const FALLBACK: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'",
  '“': '"', '”': '"', '„': '"', '•': '*',
  '°': 'st', '…': '...',
};

/** Zamienia znak nieobsługiwany przez CP1250 na najbliższy ASCII (ostatnia deska ratunku). */
function foldToAscii(ch: string): string {
  if (FALLBACK[ch]) return FALLBACK[ch];
  const stripped = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const code = stripped.charCodeAt(0);
  if (stripped.length >= 1 && code >= 0x20 && code < 0x7f) return stripped[0];
  return '?';
}

/** Koduje string do bajtów CP1250. Znaki nieobsługiwane → transliteracja ASCII → '?'. */
export function encodeCp1250(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const mapped = ENCODE_MAP.get(ch);
    if (mapped !== undefined) {
      out.push(mapped);
      continue;
    }
    for (const f of foldToAscii(ch)) {
      const fc = f.codePointAt(0)!;
      out.push(fc < 0x80 ? fc : (ENCODE_MAP.get(f) ?? 0x3f));
    }
  }
  return new Uint8Array(out);
}

/** Dekoduje bajty CP1250 do stringa (używane przy odczycie odpowiedzi tekstowych). */
export function decodeCp1250(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b < 0x80 ? String.fromCharCode(b) : HIGH_RANGE[b - 0x80];
  }
  return out.replace(/�/g, '?');
}
