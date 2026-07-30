/**
 * Kodowanie wartości do formatu ElzabESC.
 *
 * Zasady z dokumentacji (Redakcja 36):
 *  - kwoty w GROSZACH, 4 bajty little-endian (najmłodszy bajt pierwszy)
 *  - ilość: 4 bajty LE + 1 bajt liczby miejsc po przecinku (0..4)
 *  - teksty w CP1250, dopełniane spacjami do stałej długości
 */

import { DEFAULT_CODEPAGE, encodeText, type Codepage } from './codepages.ts';

export const ESC = 0x1b;
export const ACK = 0x06;
export const NAK = 0x15;

/** Maksymalna kwota obsługiwana przez 4-bajtowe pole (w groszach). */
export const MAX_AMOUNT_GROSZE = 0xffffffff;

/** 4 bajty little-endian z liczby całkowitej bez znaku. */
export function u32le(value: number): Uint8Array {
  if (!Number.isInteger(value)) {
    throw new RangeError(`u32le: oczekiwano liczby całkowitej, otrzymano ${value}`);
  }
  if (value < 0 || value > MAX_AMOUNT_GROSZE) {
    throw new RangeError(`u32le: wartość poza zakresem 0..${MAX_AMOUNT_GROSZE}: ${value}`);
  }
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

/** Odczyt 4 bajtów little-endian. */
export function readU32le(bytes: Uint8Array, offset = 0): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

/**
 * Zamienia kwotę w złotych (number lub string) na grosze — bez błędów zmiennoprzecinkowych.
 * 12.34 → 1234, "12,3" → 1230, 0.1+0.2 → 30
 */
export function toGrosze(amount: number | string): number {
  const raw = typeof amount === 'number' ? amount.toFixed(4) : String(amount).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new RangeError(`toGrosze: nieprawidłowa kwota "${amount}"`);
  }
  const negative = raw.startsWith('-');
  const [intPart, fracPart = ''] = raw.replace('-', '').split('.');
  const frac = (fracPart + '000').slice(0, 3);
  // 3. cyfra po przecinku = zaokrąglenie bankowe w górę od 5
  const grosze = Number(intPart) * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  return negative ? -grosze : grosze;
}

/** Tekst przycięty/dopełniony spacjami do dokładnie `length` bajtów w danej stronie kodowej. */
export function fixedText(
  text: string,
  length: number,
  codepage: Codepage = DEFAULT_CODEPAGE,
  padByte = 0x20,
): Uint8Array {
  const encoded = encodeText(text ?? '', codepage);
  const out = new Uint8Array(length).fill(padByte);
  out.set(encoded.subarray(0, length));
  return out;
}

/**
 * Bezpieczne przycięcie nazwy do długości pola — na granicy słowa, nigdy w połowie wyrazu.
 * Sieć bezpieczeństwa dla modułów, które nie skróciły nazwy po swojej stronie
 * (UI robi to wcześniej, z podglądem i słownikiem skrótów).
 */
export function trimToWordBoundary(text: string, maxLength: number): string {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const cut = normalized.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Pole stałej długości z SUROWYCH bajtów — wyłącznie do diagnostyki
 * (mapa bajtów drukarki). Omija kodowanie tekstu.
 */
export function fixedBytes(bytes: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length).fill(0x20);
  out.set(bytes.subarray(0, length));
  return out;
}

/** Tekst ASCII (bez polskich znaków) dopełniony spacjami — np. nazwa formy płatności. */
export function fixedAscii(text: string, length: number): Uint8Array {
  const normalized = (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, (c) => (c === 'ł' ? 'l' : 'L'))
    .replace(/[^\x20-\x7e]/g, ' ');
  const out = new Uint8Array(length).fill(0x20);
  for (let i = 0; i < Math.min(normalized.length, length); i++) {
    out[i] = normalized.charCodeAt(i);
  }
  return out;
}

/** Sklejenie fragmentów w jeden bufor. */
export function concat(...parts: Array<Uint8Array | number[] | number>): Uint8Array {
  const chunks = parts.map((p) =>
    typeof p === 'number' ? new Uint8Array([p]) : p instanceof Uint8Array ? p : new Uint8Array(p),
  );
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Ilość jako 4 bajty LE + bajt liczby miejsc po przecinku.
 * quantity 1.5 → I=15000? Nie: dobieramy najmniejszą liczbę miejsc (max 4), 1.5 → I=15, M=1.
 */
export function encodeQuantity(quantity: number | string): { value: Uint8Array; decimals: number } {
  const raw = typeof quantity === 'number' ? String(quantity) : String(quantity).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new RangeError(`encodeQuantity: nieprawidłowa ilość "${quantity}"`);
  }
  const [intPart, fracPart = ''] = raw.split('.');
  const trimmedFrac = fracPart.replace(/0+$/, '').slice(0, 4);
  const decimals = trimmedFrac.length;
  const scaled = Number(intPart) * Math.pow(10, decimals) + Number(trimmedFrac || '0');
  return { value: u32le(scaled), decimals };
}

/** Hex dump do logów diagnostycznych. */
export function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}
