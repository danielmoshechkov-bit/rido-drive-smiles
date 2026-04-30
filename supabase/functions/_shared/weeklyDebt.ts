// Czysta logika długu tygodniowego (v3).
// Brak zależności od driver_debts / driver_debt_transactions / chain / ledger / starych debt_after.
//
// Reguły (zatwierdzone przez użytkownika):
//   1. opening_debt        = remaining_debt z poprzedniego tygodnia (po wpłatach)
//   2. effective_opening   = max(0, opening_debt - paid_amount)
//   3. final_payout        = raw_payout - effective_opening
//   4. jeśli final_payout < 0  -> remaining_debt = abs(final_payout), actual_payout = 0
//      jeśli final_payout >= 0 -> remaining_debt = 0,                actual_payout = final_payout
//   5. UI "Dług"           = opening_debt (NIE remaining_debt)

export const round2 = (value: number): number =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export interface PaymentLike {
  amount: number | string | null;
}

export interface WeeklyDebtComputation {
  /** Dług otwarcia – pokazywany w UI w kolumnie "Dług". Przeniesiony z poprzedniego tygodnia. */
  openingDebt: number;
  /** Suma wpłat zaksięgowanych w tym tygodniu (zawsze dodatnia). */
  paidAmount: number;
  /** Dług otwarcia po odjęciu wpłat z tego tygodnia (do wewnętrznych obliczeń). */
  visibleDebt: number;
  /** Dług NA KONIEC tygodnia – staje się openingDebt następnego tygodnia. */
  remainingDebt: number;
  /** Faktyczna wypłata kierowcy = max(0, raw_payout - effective_opening). */
  actualPayout: number;
}

/**
 * Czysta funkcja licząca dług tygodnia.
 *
 * @param openingDebtIn     remainingDebt z poprzedniego tygodnia (z driver_weekly_debts)
 * @param currentRawPayout  surowy payout (przed odjęciem długu) – z arkusza tygodnia
 * @param paymentsThisWeek  wpłaty zaksięgowane w tym tygodniu
 */
export function calculateWeeklyDebt(
  openingDebtIn: number,
  currentRawPayout: number,
  paymentsThisWeek: PaymentLike[],
): WeeklyDebtComputation {
  const openingDebt = Math.max(0, Number(openingDebtIn || 0));
  const rawPayout = Number(currentRawPayout || 0);

  const paidAmount = (paymentsThisWeek || []).reduce(
    (sum, p) => sum + Math.abs(Number(p?.amount || 0)),
    0,
  );

  const effectiveOpening = Math.max(0, openingDebt - paidAmount);
  const finalPayout = rawPayout - effectiveOpening;

  const remainingDebt = finalPayout < 0 ? Math.abs(finalPayout) : 0;
  const actualPayout = finalPayout > 0 ? finalPayout : 0;

  return {
    openingDebt: round2(openingDebt),
    paidAmount: round2(paidAmount),
    visibleDebt: round2(effectiveOpening),
    remainingDebt: round2(remainingDebt),
    actualPayout: round2(actualPayout),
  };
}
