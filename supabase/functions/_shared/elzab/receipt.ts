/**
 * Walidacja i normalizacja paragonu ZANIM cokolwiek poleci do drukarki.
 * Lepiej odrzucić dane tutaj niż dostać #ANULOWANY# na papierze.
 */

import { toGrosze } from './codec.ts';
import { ElzabValidationError } from './errors.ts';
import type { ItemBytesInput } from './commands.ts';
import type { ReceiptItem, ReceiptPayment, ReceiptRequest, VatLetter, VatMap } from './types.ts';

/** Minimalna liczba znaków znaczących w nazwie towaru (wymóg drukarki — błąd "B"). */
export const MIN_NAME_CHARS = 5;

/** Maksymalna kwota pojedynczego pola (4 bajty groszy) z zapasem — błąd "S". */
export const MAX_TOTAL_GROSZE = 0xffffffff;

export interface PreparedPayment {
  name: string;
  grosze: number;
}

export interface PreparedReceipt {
  items: ItemBytesInput[];
  payments: PreparedPayment[];
  totalGrosze: number;
  buyerNip?: string;
}

/** Normalizuje nazwę: przycina, skleja wielokrotne spacje (drukarka i tak ma stałe pole). */
function normalizeName(name: string): string {
  return (name ?? '').replace(/\s+/g, ' ').trim();
}

function significantChars(name: string): number {
  return name.replace(/\s/g, '').length;
}

function resolveVatLetter(item: ReceiptItem, vatMap: VatMap): VatLetter {
  const key = String(item.vatRate ?? '').trim().toLowerCase();
  const normalized = key === 'zw' || key === 'zw.' ? 'zw' : key.replace('%', '');
  const letter = vatMap[normalized] ?? vatMap[key];
  if (!letter) {
    throw new ElzabValidationError(
      `Pozycja „${item.name}": stawka VAT „${item.vatRate}" nie jest przypisana do żadnej litery drukarki. Uzupełnij mapowanie stawek w ustawieniach drukarki.`,
      { item: item.name, vatRate: item.vatRate, vatMap },
    );
  }
  return letter;
}

/** Wartość pozycji w groszach: z pola `total` albo ilość × cena (zaokrąglone do grosza). */
function itemTotalGrosze(item: ReceiptItem, unitPriceGrosze: number): number {
  if (item.total !== undefined && item.total !== null) return toGrosze(item.total);
  return Math.round(unitPriceGrosze * Number(item.quantity));
}

export function prepareReceipt(request: ReceiptRequest): PreparedReceipt {
  const rawItems = request.items ?? [];
  if (!rawItems.length) {
    throw new ElzabValidationError('Paragon nie zawiera żadnych pozycji.');
  }
  if (rawItems.length > 100) {
    throw new ElzabValidationError(
      `Paragon ma ${rawItems.length} pozycji — maksymalnie 100 na jeden paragon.`,
    );
  }

  const items: ItemBytesInput[] = [];
  let totalGrosze = 0;

  for (const [index, item] of rawItems.entries()) {
    const name = normalizeName(item.name);
    if (significantChars(name) < MIN_NAME_CHARS) {
      throw new ElzabValidationError(
        `Pozycja ${index + 1}: nazwa „${item.name}" jest za krótka — drukarka wymaga min. ${MIN_NAME_CHARS} znaków.`,
        { index, name: item.name },
      );
    }
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ElzabValidationError(
        `Pozycja „${name}": ilość musi być większa od zera (otrzymano ${item.quantity}).`,
        { index, quantity: item.quantity },
      );
    }
    const unitPriceGrosze = toGrosze(item.unitPrice);
    if (unitPriceGrosze < 0) {
      throw new ElzabValidationError(`Pozycja „${name}": cena nie może być ujemna.`, { index });
    }
    const total = itemTotalGrosze(item, unitPriceGrosze);
    if (total <= 0) {
      // Błąd "R" drukarki — pozycja o zerowej wartości unieważnia cały paragon.
      throw new ElzabValidationError(
        `Pozycja „${name}" ma zerową wartość — usuń ją z paragonu lub ustaw cenę.`,
        { index, total },
      );
    }
    if (total > MAX_TOTAL_GROSZE) {
      throw new ElzabValidationError(`Pozycja „${name}": kwota przekracza limit drukarki.`, { index });
    }

    items.push({
      name,
      quantity,
      unit: item.unit,
      unitPriceGrosze,
      totalGrosze: total,
      vatLetter: resolveVatLetter(item, request.vatMap),
    });
    totalGrosze += total;
  }

  if (totalGrosze > MAX_TOTAL_GROSZE) {
    throw new ElzabValidationError('Suma paragonu przekracza maksymalną kwotę obsługiwaną przez drukarkę.');
  }

  const payments = preparePayments(request.payments, totalGrosze);

  return {
    items,
    payments,
    totalGrosze,
    buyerNip: request.buyerNip?.replace(/[^0-9A-Za-z-]/g, '') || undefined,
  };
}

function preparePayments(payments: ReceiptPayment[] | undefined, totalGrosze: number): PreparedPayment[] {
  if (!payments?.length) {
    // Domyślnie: całość gotówką (Faza 1 — kartę dokłada Faza 3).
    return [{ name: 'GOTOWKA', grosze: totalGrosze }];
  }
  if (payments.length > 4) {
    throw new ElzabValidationError('Maksymalnie 4 formy płatności na jednym paragonie.');
  }
  const prepared = payments.map((p) => ({ name: p.name || 'GOTOWKA', grosze: toGrosze(p.amount) }));
  const sum = prepared.reduce((acc, p) => acc + p.grosze, 0);
  if (sum !== totalGrosze) {
    throw new ElzabValidationError(
      `Suma form płatności (${(sum / 100).toFixed(2)} zł) różni się od sumy paragonu (${(totalGrosze / 100).toFixed(2)} zł).`,
      { sum, totalGrosze },
    );
  }
  return prepared;
}
