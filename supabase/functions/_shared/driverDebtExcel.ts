export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export interface DebtSnapshotLike {
  debt_before?: number | null;
  debt_after?: number | null;
  debt_payment?: number | null;
  actual_payout?: number | null;
}

export interface ComputedDebtValues {
  debtBefore: number;
  debtPayment: number;
  remainingDebt: number;
  actualPayout: number;
}

export const computeExcelDebtValues = (debtBefore: number, payout: number): ComputedDebtValues => {
  const normalizedDebtBefore = round2(Math.max(0, debtBefore || 0));
  const normalizedPayout = round2(payout || 0);
  const debtPayment = normalizedPayout > 0
    ? round2(Math.min(normalizedDebtBefore, normalizedPayout))
    : 0;
  const actualPayout = round2(normalizedPayout - normalizedDebtBefore);
  const remainingDebt = actualPayout < -0.01 ? round2(Math.abs(actualPayout)) : 0;

  return {
    debtBefore: normalizedDebtBefore,
    debtPayment,
    remainingDebt,
    actualPayout,
  };
};

export const deriveRawPayoutFromSnapshot = (settlement: DebtSnapshotLike): number => {
  const debtBefore = round2(Math.max(0, Number(settlement?.debt_before ?? 0)));
  const debtAfter = round2(Math.max(0, Number(settlement?.debt_after ?? debtBefore)));
  const debtPayment = round2(Math.max(0, Number(settlement?.debt_payment ?? 0)));
  const actualPayout = round2(Number(settlement?.actual_payout ?? 0));
  const legacyDebtIncrease = round2(Math.max(0, debtAfter - debtBefore));

  if (actualPayout < -0.01) {
    return round2(actualPayout + debtBefore);
  }

  if (legacyDebtIncrease > 0.01 && Math.abs(actualPayout) < 0.01) {
    return round2(-legacyDebtIncrease);
  }

  return round2(actualPayout + debtPayment);
};