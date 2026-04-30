// Czysta logika długu tygodniowego.
// Brak zależności od driver_debts / driver_debt_transactions / chain / ledger.

export const round2 = (value: number): number =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export interface PaymentLike {
  amount: number | string | null;
}

export interface WeeklyDebtComputation {
  openingDebt: number;
  paidAmount: number;
  remainingDebt: number;
  actualPayout: number;
}

/**
 * Czysta funkcja licząca dług tygodnia.
 * - openingDebt = abs(previousActualPayout) jeśli ujemna, inaczej 0
 * - paidAmount  = suma abs(amount) z wpłat tego tygodnia
 * - remainingDebt = max(0, opening - paid)
 * - actualPayout = currentPayout - remainingDebt
 */
export function calculateWeeklyDebt(
  previousActualPayout: number,
  currentPayout: number,
  paymentsThisWeek: PaymentLike[],
): WeeklyDebtComputation {
  const prev = Number(previousActualPayout || 0);
  const openingDebt = prev < -0.01 ? Math.abs(prev) : 0;

  const paidAmount = (paymentsThisWeek || []).reduce(
    (sum, p) => sum + Math.abs(Number(p?.amount || 0)),
    0,
  );

  const remainingDebt = Math.max(0, openingDebt - paidAmount);
  const actualPayout = Number(currentPayout || 0) - remainingDebt;

  return {
    openingDebt: round2(openingDebt),
    paidAmount: round2(paidAmount),
    remainingDebt: round2(remainingDebt),
    actualPayout: round2(actualPayout),
  };
}
