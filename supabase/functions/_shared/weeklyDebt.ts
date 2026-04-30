// Czysta logika długu tygodniowego.
// Brak zależności od driver_debts / driver_debt_transactions / chain / ledger.

export const round2 = (value: number): number =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export interface PaymentLike {
  amount: number | string | null;
}

export interface WeeklyDebtComputation {
  /** Dług otwarcia (przeniesiony z poprzedniego tygodnia jako endingRemainingDebt). */
  openingDebt: number;
  /** Suma wpłat zaksięgowanych w tym tygodniu (zawsze dodatnia). */
  paidAmount: number;
  /**
   * Dług POKAZYWANY w UI (kolumna "Dług" w arkuszu tygodnia).
   * = max(0, openingDebt - paidAmount)
   * NIE zawiera nowego deficytu z bieżącego tygodnia.
   */
  visibleDebt: number;
  /**
   * Dług NA KONIEC tygodnia – używany jako openingDebt następnego tygodnia.
   * = visibleDebt + max(0, -currentRawPayout)
   */
  remainingDebt: number;
  /**
   * Faktyczna wypłata kierowcy:
   *  - jeśli currentRawPayout <= 0  -> 0
   *  - inaczej max(0, currentRawPayout - visibleDebt)
   */
  actualPayout: number;
}

/**
 * Czysta funkcja licząca dług tygodnia.
 *
 * @param openingDebtIn  remainingDebt z poprzedniego tygodnia (z driver_weekly_debts)
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

  const visibleDebt = Math.max(0, openingDebt - paidAmount);
  const newDeficit = rawPayout < 0 ? Math.abs(rawPayout) : 0;
  const remainingDebt = visibleDebt + newDeficit;

  let actualPayout = 0;
  if (rawPayout > 0) {
    actualPayout = Math.max(0, rawPayout - visibleDebt);
  }

  return {
    openingDebt: round2(openingDebt),
    paidAmount: round2(paidAmount),
    visibleDebt: round2(visibleDebt),
    remainingDebt: round2(remainingDebt),
    actualPayout: round2(actualPayout),
  };
}
