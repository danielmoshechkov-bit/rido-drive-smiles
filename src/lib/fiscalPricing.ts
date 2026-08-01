/**
 * Przeliczenia cen dla szybkiego paragonu: netto ⇄ brutto i rabaty.
 *
 * Zasada fiskalna: na drukarkę idzie ZAWSZE finalna cena brutto po rabacie — paragon
 * rejestruje kwotę, którą klient faktycznie płaci. Udokumentowana lista sekwencji
 * ElzabESC (Redakcja 36) nie zawiera komendy rabatu, więc rabat liczymy po naszej
 * stronie i wysyłamy cenę już pomniejszoną.
 */

/** Liczba z pola tekstowego: znosi spacje, „zł" i przecinek dziesiętny. */
export function parseAmount(text: string | number | null | undefined): number {
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
  const cleaned = String(text ?? '')
    .replace(/\s/g, '')
    .replace(/zł/gi, '')
    .replace(/,/g, '.');
  if (!cleaned) return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

/** Mnożnik stawki VAT: '23' → 1.23, 'zw' → 1. */
export function vatMultiplier(vatRate: string): number {
  if (!vatRate || vatRate === 'zw') return 1;
  const rate = Number(vatRate);
  return Number.isFinite(rate) ? 1 + rate / 100 : 1;
}

/** Cena netto → brutto, zaokrąglona do grosza. */
export function netToGross(net: number, vatRate: string): number {
  return Math.round(net * vatMultiplier(vatRate) * 100) / 100;
}

/** Cena brutto → netto, zaokrąglona do grosza. */
export function grossToNet(gross: number, vatRate: string): number {
  return Math.round((gross / vatMultiplier(vatRate)) * 100) / 100;
}

export type DiscountType = 'percent' | 'amount';

/**
 * Cena jednostkowa po rabacie. Rabat kwotowy dotyczy CAŁEJ pozycji, więc rozkładamy
 * go na jednostki — dzięki temu ilość × cena nadal daje wartość pozycji i drukarka
 * nie zgłosi niezgodności.
 */
export function applyLineDiscount(
  unitGross: number,
  quantity: number,
  discountValue: number,
  discountType: DiscountType,
): number {
  if (!discountValue || discountValue <= 0 || quantity <= 0) return unitGross;
  if (discountType === 'percent') {
    const percent = Math.min(discountValue, 100);
    return Math.max(0, Math.round(unitGross * (1 - percent / 100) * 100) / 100);
  }
  const perUnit = discountValue / quantity;
  return Math.max(0, Math.round((unitGross - perUnit) * 100) / 100);
}

/**
 * Współczynnik rabatu na cały paragon — rozkładany proporcjonalnie na pozycje,
 * żeby suma po rabacie zgadzała się z tym, co widzi klient.
 */
export function totalDiscountFactor(
  totalGrosze: number,
  discountValue: number,
  discountType: DiscountType,
): number {
  if (!discountValue || discountValue <= 0 || totalGrosze <= 0) return 1;
  if (discountType === 'percent') {
    return Math.max(0, 1 - Math.min(discountValue, 100) / 100);
  }
  const discountGrosze = Math.round(discountValue * 100);
  return Math.max(0, (totalGrosze - discountGrosze) / totalGrosze);
}
