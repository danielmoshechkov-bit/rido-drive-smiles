/** Typy domenowe modułu fiskalizacji (wspólne dla edge functions i frontendu). */

import type { Codepage } from './codepages.ts';

export type { Codepage };

/** Litery stawek VAT tak, jak są zaprogramowane w drukarce. */
export type VatLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** Bajt sekwencji `Esc ST` dla danej litery stawki (wg dokumentacji ElzabESC). */
export const VAT_LETTER_BYTE: Record<VatLetter, number> = {
  A: 0x01,
  B: 0x02,
  C: 0x03,
  D: 0x04,
  E: 0x06,
  F: 0x07,
  G: 0x05,
};

/**
 * Mapa stawka → litera, konfigurowalna per tenant (drukarki mogą mieć różne przypisania).
 * Klucze to stawki jako string: '23' | '8' | '5' | '0' | 'zw'.
 */
export type VatMap = Record<string, VatLetter>;

/** Typowe ustawienie dla polskich drukarek — używane wyłącznie jako wartość startowa w UI. */
export const DEFAULT_VAT_MAP: VatMap = {
  '23': 'A',
  '8': 'B',
  '5': 'C',
  '0': 'D',
  'zw': 'E',
};

export interface ReceiptItem {
  /** Nazwa towaru/usługi — min. 5 znaków znaczących, kodowana CP1250. */
  name: string;
  /** Ilość (max 4 miejsca po przecinku). */
  quantity: number;
  /** Jednostka miary, max 4 znaki, np. 'szt', 'godz', 'kpl'. */
  unit?: string;
  /** Cena jednostkowa brutto w złotych. */
  unitPrice: number;
  /** Stawka VAT jako klucz mapy tenanta: '23' | '8' | '5' | '0' | 'zw'. */
  vatRate: string;
  /**
   * Wartość pozycji brutto w złotych. Gdy pominięta — liczona jako quantity * unitPrice
   * (zaokrąglona do groszy).
   */
  total?: number;
}

export type PaymentFormName = 'GOTOWKA' | 'KARTA' | 'PRZELEW' | 'BLIK' | string;

export interface ReceiptPayment {
  /** Nazwa formy płatności drukowana na paragonie (ASCII, max 13 znaków). */
  name: PaymentFormName;
  /** Kwota w złotych. */
  amount: number;
}

export interface ReceiptRequest {
  items: ReceiptItem[];
  /** Strona kodowa drukarki (per tenant) — domyślnie CP852 (ELZAB Zeta). */
  codepage?: Codepage;
  /** Wariant pola nazwy pozycji: 28 (domyślny) lub 40 znaków. */
  itemNameLength?: 28 | 40;
  payments?: ReceiptPayment[];
  /** NIP nabywcy (paragon z NIP). Opcjonalny — sekwencja Esc 4BH. */
  buyerNip?: string;
  /** Mapa stawek tenanta. */
  vatMap: VatMap;
}

export interface ReceiptResult {
  ok: boolean;
  /** Numer paragonu odczytany z drukarki po zamknięciu (Esc 66H), jeśli dostępny. */
  receiptNumber?: number;
  /** Suma paragonu w groszach. */
  totalGrosze: number;
  /** Kroki wykonane na drukarce — do logu diagnostycznego. */
  trace: string[];
}

export interface PrinterClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Data jako ISO 'YYYY-MM-DDTHH:mm' w czasie lokalnym drukarki. */
  iso: string;
}

export interface PrinterConnectionConfig {
  host: string;
  port: number;
  /** Timeout pojedynczej komendy (drukarka bywa wolna — domyślnie 10 s). */
  commandTimeoutMs?: number;
  connectTimeoutMs?: number;
}
