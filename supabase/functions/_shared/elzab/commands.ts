/**
 * Buildery sekwencji ElzabESC (czyste funkcje — zwracają bajty do wysłania).
 *
 * Źródło: dokumentacja protokołu ELZAB ESC, Redakcja 36.
 * Każda sekwencja zaczyna się od ESC (0x1B) + numer sekwencji.
 * Drukarka odpowiada ACK (0x06) = przyjęte lub NAK (0x15) = odrzucone.
 */

import { concat, ESC, fixedAscii, fixedBytes, fixedText, trimToWordBoundary, u32le, encodeQuantity } from './codec.ts';
import { DEFAULT_CODEPAGE, hardSpaceByte, type Codepage } from './codepages.ts';
import { VAT_LETTER_BYTE, type VatLetter } from './types.ts';

/** Numery sekwencji (drugi bajt po ESC). */
export const SEQ = {
  IDENTIFY: 0xf6, // identyfikacja drukarki → ACK, NT, NW
  READ_CLOCK: 0x35, // odczyt czasu/daty → ACK + 10 bajtów
  OPEN_RECEIPT: 0x21,
  CANCEL_RECEIPT: 0x23,
  CLOSE_RECEIPT: 0x24, // zakończenie + wydruk
  DAY_REPORT: 0x25, // raport dobowy fiskalny
  ITEM_28: 0x06, // pozycja sprzedaży, nazwa 28 znaków
  ITEM_40: 0x05, // pozycja sprzedaży, nazwa 40 znaków
  END_ITEMS: 0x07, // koniec pozycji + suma kontrolna
  CHECK_STATUS: 0x50, // status po pozycji (zalecane dla Zeta)
  BUYER_NIP: 0x4b, // NIP nabywcy na paragonie
  READ_STATUS_1: 0x54,
  READ_STATUS_2: 0x55,
  LAST_RECEIPT_NO: 0x66,
  PAYMENT: 0x81,
  CHANGE: 0x82,
} as const;

/** Drugi bajt sekwencji pozycji sprzedaży (po numerze sekwencji). */
const ITEM_SUBCODE = 0x20;

/** Bajt „brak komunikatu" w polu A1 pozycji sprzedaży. */
const ITEM_NO_MESSAGE = 0x30; // '0'

/** Długości pól tekstowych. */
export const FIELD = {
  ITEM_NAME_28: 28,
  ITEM_NAME_40: 40,
  UNIT: 4,
  PAYMENT_NAME: 13,
  BUYER_NIP: 42,
} as const;

const simple = (seq: number) => new Uint8Array([ESC, seq]);

export const identify = () => simple(SEQ.IDENTIFY);
export const readClock = () => simple(SEQ.READ_CLOCK);
export const openReceipt = () => simple(SEQ.OPEN_RECEIPT);
export const cancelReceipt = () => simple(SEQ.CANCEL_RECEIPT);
export const closeReceipt = () => simple(SEQ.CLOSE_RECEIPT);
export const dayReport = () => simple(SEQ.DAY_REPORT);
export const checkStatus = () => simple(SEQ.CHECK_STATUS);
export const readStatus1 = () => simple(SEQ.READ_STATUS_1);
export const readStatus2 = () => simple(SEQ.READ_STATUS_2);
export const lastReceiptNumber = () => simple(SEQ.LAST_RECEIPT_NO);

export interface ItemBytesInput {
  name: string;
  /** Ilość, max 4 miejsca po przecinku. */
  quantity: number;
  unit?: string;
  /** Cena jednostkowa w groszach. */
  unitPriceGrosze: number;
  /** Wartość pozycji w groszach. */
  totalGrosze: number;
  /** Litera stawki VAT zaprogramowana w drukarce. */
  vatLetter: VatLetter;
  /** Wariant nazwy: 28 (domyślny) lub 40 znaków. */
  nameLength?: 28 | 40;
  /** Strona kodowa drukarki (per tenant) — domyślnie CP852 (patrz DEFAULT_CODEPAGE). */
  codepage?: Codepage;
  /** Surowe bajty nazwy zamiast kodowania tekstu — TYLKO diagnostyka (mapa bajtów). */
  nameBytes?: Uint8Array;
  /**
   * Wymuszenie układu dwuliniowego dla KAŻDEJ pozycji (dopełnienie twardą spacją).
   * DOMYŚLNIE WYŁĄCZONE — naturalny układ drukarki jest czytelniejszy: krótkie nazwy
   * zostają w jednej linii z liczbami, a łamią się tylko te, które się nie mieszczą
   * w 42 kolumnach. Wymuszanie rozstrzeliwuje paragon bez potrzeby.
   * Działa wyłącznie w CP1250/ISO 8859-2 (gdzie 0xA0 to twarda spacja).
   */
  forceNameLine?: boolean;
}

/**
 * Pozycja sprzedaży.
 * Esc 06H 20H | nazwa(28) | A1 | I1..I4 | M | J1..J4 | C1..C4 | Esc ST | W1..W4
 */
export function saleItem(input: ItemBytesInput): Uint8Array {
  const nameLength = input.nameLength ?? 28;
  const codepage = input.codepage ?? DEFAULT_CODEPAGE;
  const seq = nameLength === 40 ? SEQ.ITEM_40 : SEQ.ITEM_28;
  const vatByte = VAT_LETTER_BYTE[input.vatLetter];
  if (vatByte === undefined) {
    throw new RangeError(`saleItem: nieznana litera stawki VAT "${input.vatLetter}"`);
  }
  const qty = encodeQuantity(input.quantity);

  return concat(
    [ESC, seq, ITEM_SUBCODE],
    input.nameBytes
      ? fixedBytes(input.nameBytes, nameLength)
      : fixedText(
          trimToWordBoundary(input.name, nameLength),
          nameLength,
          codepage,
          input.forceNameLine ? (hardSpaceByte(codepage) ?? 0x20) : 0x20,
        ),
    ITEM_NO_MESSAGE,
    qty.value,
    qty.decimals,
    fixedAscii(input.unit ?? 'szt', FIELD.UNIT),
    u32le(input.unitPriceGrosze),
    [ESC, vatByte],
    u32le(input.totalGrosze),
  );
}

/** Koniec pozycji: Esc 07H + suma do zapłaty w groszach (LE). */
export function endItems(sumGrosze: number): Uint8Array {
  return concat([ESC, SEQ.END_ITEMS], u32le(sumGrosze));
}

/**
 * Forma płatności: Esc 81H | Nr(1..4) | N1..N13 | P1..P4
 * Nazwa formy płatności bez polskich znaków (drukowana wprost).
 */
export function payment(index: number, name: string, amountGrosze: number): Uint8Array {
  if (index < 1 || index > 4) {
    throw new RangeError(`payment: numer płatności musi być z zakresu 1..4 (otrzymano ${index})`);
  }
  return concat(
    [ESC, SEQ.PAYMENT, index],
    fixedAscii(name, FIELD.PAYMENT_NAME),
    u32le(amountGrosze),
  );
}

/**
 * Reszta: Esc 82H + kwota (LE).
 * TODO(hardware): sekwencja nieprzetestowana na Zeta — używać tylko przy nadpłacie gotówką.
 */
export function change(amountGrosze: number): Uint8Array {
  return concat([ESC, SEQ.CHANGE], u32le(amountGrosze));
}

/**
 * NIP nabywcy na paragonie: Esc 4BH + NIP (do 42 znaków).
 * TODO(hardware): długość pola do potwierdzenia na urządzeniu (dopełniamy spacjami do 42).
 */
export function buyerNip(nip: string): Uint8Array {
  const clean = (nip ?? '').replace(/[^0-9A-Za-z-]/g, '');
  return concat([ESC, SEQ.BUYER_NIP], fixedAscii(clean, FIELD.BUYER_NIP));
}
