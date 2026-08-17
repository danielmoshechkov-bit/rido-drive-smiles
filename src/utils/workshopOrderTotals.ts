// Single source of truth for workshop order money math.
//
// An order's `total_gross` / `total_net` are denormalized columns on
// `workshop_orders`. They MUST be derived from the order's line items with the
// exact same logic everywhere (the order detail, the orders list, and the write
// mutations) — otherwise the list and the saved column drift apart, which is the
// "5600 on the card / 4600 on the list" bug.

export const VAT_RATE = 1.23;

/**
 * Liczba z pola formularza — rozumie PRZECINEK i kropkę.
 *
 * Powód (17.08.2026): warsztat wpisywał „1,5 l” oleju i dostawał 0 albo 1.
 * `Number("1,5")` to `NaN`, a ilość szła dodatkowo przez `parseInt`, który
 * obcinał część dziesiętną. Klawiatura numeryczna na telefonie daje przecinek,
 * układ polski też — a klawiatura amerykańska kropkę. Użytkownik nie ma się
 * zastanawiać, którego znaku wymaga akurat to pole.
 *
 * Spacje (także rozdzielające tysiące) usuwamy; pusty tekst to zero.
 */
export const parsujLiczbe = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  const tekst = String(value).replace(/\s/g, '').replace(',', '.');
  if (tekst === '') return 0;

  const parsed = Number(tekst);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const safeNumber = (value: unknown) => parsujLiczbe(value);

/**
 * Ilość do pokazania w polu: zawsze z przecinkiem, bez zbędnych zer.
 * 2 → „2”, 1.5 → „1,5”, 0.25 → „0,25”.
 */
export const formatujIlosc = (value: unknown): string => {
  const liczba = parsujLiczbe(value);
  if (!Number.isFinite(liczba)) return '';
  return String(Math.round(liczba * 1000) / 1000).replace('.', ',');
};

export const getDiscountPercent = (item: any) => safeNumber(item?.discount_percent);

// Per-line total. Prefers the stored line total; falls back to recomputing from
// unit price × quantity − discount for legacy/zero rows.
export const getLineTotal = (item: any, gross: boolean) => {
  const stored = gross ? safeNumber(item?.total_gross) : safeNumber(item?.total_net);
  if (stored > 0) return stored;

  const quantity = safeNumber(item?.quantity) || 1;
  const unitPrice = gross ? safeNumber(item?.unit_price_gross) : safeNumber(item?.unit_price_net);
  const raw = unitPrice * quantity;
  const discountPercent = getDiscountPercent(item);
  return raw - (raw * discountPercent / 100);
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface OrderTotals {
  total_gross: number;
  total_net: number;
}

// Sum a set of order items into the order-level gross/net totals.
export const computeOrderTotals = (items: any[] | null | undefined): OrderTotals => {
  const list = Array.isArray(items) ? items : [];
  return {
    total_gross: round2(list.reduce((sum, item) => sum + getLineTotal(item, true), 0)),
    total_net: round2(list.reduce((sum, item) => sum + getLineTotal(item, false), 0)),
  };
};
