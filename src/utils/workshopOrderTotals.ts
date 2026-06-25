// Single source of truth for workshop order money math.
//
// An order's `total_gross` / `total_net` are denormalized columns on
// `workshop_orders`. They MUST be derived from the order's line items with the
// exact same logic everywhere (the order detail, the orders list, and the write
// mutations) — otherwise the list and the saved column drift apart, which is the
// "5600 on the card / 4600 on the list" bug.

export const VAT_RATE = 1.23;

export const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
