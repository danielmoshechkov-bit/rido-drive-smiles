/**
 * Warstwa mapowania dokumentów źródłowych na paragon fiskalny.
 *
 * Moduł fiskalny jest branżowo neutralny — to TUTAJ (po stronie modułu wywołującego)
 * zamieniamy pozycje zlecenia warsztatowego na uniwersalne pozycje paragonu.
 * Kolejna branża dopisuje własną funkcję mapującą i nic więcej.
 */

export interface FiscalItemInput {
  name: string;
  quantity: number;
  unit?: string;
  /** Cena jednostkowa BRUTTO w złotych. */
  unitPrice: number;
  /** Stawka jako klucz mapy VAT tenanta: '23' | '8' | '5' | '0' | 'zw'. */
  vatRate: string;
}

export interface FiscalItemProblem {
  name: string;
  reason: string;
}

export interface MappedReceipt {
  items: FiscalItemInput[];
  /** Pozycje odrzucone wraz z powodem — pokazujemy je użytkownikowi przed wydrukiem. */
  skipped: FiscalItemProblem[];
  /** Pozycje, które zablokują wydruk (drukarka unieważniłaby paragon). */
  blocking: FiscalItemProblem[];
  totalGrosze: number;
}

/** Minimalna liczba znaków znaczących w nazwie (wymóg drukarki — błąd „B"). */
export const MIN_ITEM_NAME_CHARS = 5;

const STANDARD_RATES = [23, 8, 5, 0];

/**
 * Stawka VAT wyliczona ze stosunku brutto/netto — `workshop_order_items` nie ma
 * kolumny ze stawką. Dobieramy najbliższą standardową; przy braku danych 23%.
 */
export function deriveVatRate(net?: number | null, gross?: number | null, fallback = '23'): string {
  const n = Number(net) || 0;
  const g = Number(gross) || 0;
  if (n <= 0 || g <= 0) return fallback;
  const percent = (g / n - 1) * 100;
  const closest = STANDARD_RATES.reduce((best, rate) =>
    Math.abs(rate - percent) < Math.abs(best - percent) ? rate : best,
  );
  // Rozjazd większy niż 1 p.p. oznacza dane, którym nie ufamy — bierzemy wartość domyślną.
  return Math.abs(closest - percent) <= 1 ? String(closest) : fallback;
}

/** Grosze z kwoty w złotych, bez błędów zmiennoprzecinkowych (jak w bibliotece drukarki). */
export function toGrosze(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/** Suma paragonu liczona dokładnie tak jak w bibliotece: round(cena_gr × ilość) na pozycję. */
export function computeReceiptTotalGrosze(items: FiscalItemInput[]): number {
  return items.reduce((sum, item) => sum + Math.round(toGrosze(item.unitPrice) * Number(item.quantity)), 0);
}

function significantChars(text: string): number {
  return (text || '').replace(/\s/g, '').length;
}

/**
 * Pozycje zlecenia warsztatowego (`workshop_order_items`) → pozycje paragonu.
 *
 * Zasady:
 *  • cena brutto ma pierwszeństwo; przy jej braku liczymy z netto i stawki,
 *  • rabat uwzględniamy w cenie jednostkowej (drukarka nie zna pola „rabat"),
 *  • pozycje o zerowej wartości są pomijane (unieważniłyby paragon — błąd „R"),
 *  • zbyt krótka nazwa blokuje wydruk (błąd „B") — z nazwą użytkownik musi coś zrobić sam.
 */
export function mapWorkshopItemsToReceipt(
  orderItems: any[],
  options: { defaultVatRate?: string; defaultUnit?: string } = {},
): MappedReceipt {
  const defaultVat = options.defaultVatRate ?? '23';
  const defaultUnit = options.defaultUnit ?? 'szt';

  const items: FiscalItemInput[] = [];
  const skipped: FiscalItemProblem[] = [];
  const blocking: FiscalItemProblem[] = [];

  for (const raw of orderItems || []) {
    const name = String(raw?.name ?? '').replace(/\s+/g, ' ').trim();
    const quantity = Number(raw?.quantity) || 0;
    const vatRate = deriveVatRate(raw?.unit_price_net, raw?.unit_price_gross, defaultVat);

    let unitPrice = Number(raw?.unit_price_gross) || 0;
    if (unitPrice <= 0) {
      const net = Number(raw?.unit_price_net) || 0;
      const multiplier = vatRate === 'zw' ? 1 : 1 + Number(vatRate) / 100;
      unitPrice = net > 0 ? Math.round(net * multiplier * 100) / 100 : 0;
    }

    const discount = Number(raw?.discount_percent) || 0;
    if (discount > 0 && discount < 100) {
      unitPrice = Math.round(unitPrice * (1 - discount / 100) * 100) / 100;
    }

    if (!name && unitPrice <= 0) continue; // pusty wiersz zestawienia — cicho pomijamy

    if (quantity <= 0 || unitPrice <= 0) {
      skipped.push({
        name: name || '(bez nazwy)',
        reason: quantity <= 0 ? 'ilość zero' : 'cena zero — paragon nie może zawierać pozycji za 0 zł',
      });
      continue;
    }

    if (significantChars(name) < MIN_ITEM_NAME_CHARS) {
      blocking.push({
        name: name || '(bez nazwy)',
        reason: `nazwa musi mieć min. ${MIN_ITEM_NAME_CHARS} znaków — uzupełnij ją w zleceniu`,
      });
      continue;
    }

    items.push({
      name,
      quantity,
      unit: String(raw?.unit || defaultUnit).slice(0, 4),
      unitPrice,
      vatRate,
    });
  }

  return { items, skipped, blocking, totalGrosze: computeReceiptTotalGrosze(items) };
}

/** Kwota w złotych do wyświetlenia. */
export function formatPln(grosze: number): string {
  return `${(grosze / 100).toFixed(2).replace('.', ',')} zł`;
}

/** Etykiety stron kodowych w UI. */
export const CODEPAGE_LABELS: Record<string, string> = {
  cp1250: 'CP1250 (Windows Środkowoeuropejska)',
  latin2: 'ISO 8859-2 (Latin-2)',
  cp852: 'CP852 (Latin-2 DOS)',
  mazovia: 'Mazovia (CP790)',
};

/** Etykiety statusów paragonu w logu. */
export const RECEIPT_STATUS_LABELS: Record<string, string> = {
  pending: 'Oczekuje',
  printing: 'Drukowanie',
  printed: 'Wydrukowany',
  failed: 'Błąd',
  cancelled: 'Anulowany',
};
