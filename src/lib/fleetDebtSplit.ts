export interface SettlementHistoryRowForDebtSplit {
  driver_id: string;
  period_from: string;
  period_to: string;
  rental_fee: number | null;
  debt_before: number | null;
  debt_after: number | null;
  debt_payment: number | null;
  actual_payout: number | null;
  amounts: Record<string, any> | null;
}

export interface FallbackRentalAssignment {
  weeklyRate: number;
  assignedAt: string;
}

export interface WeeklyDebtSplit {
  settlementDebtBefore: number;
  rentalDebtBefore: number;
  settlementDebtAfter: number;
  rentalDebtAfter: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const calculateProportionalRentForSettlement = (
  assignedAt: string,
  weekStart: string,
  weekEnd: string,
  weeklyFee: number,
) => {
  const assignDate = new Date(assignedAt);
  const startDate = new Date(weekStart);
  const endDate = new Date(weekEnd);

  const startCounting = new Date(assignDate);
  startCounting.setDate(startCounting.getDate() + 1);

  if (startCounting > endDate) return 0;
  if (startCounting <= startDate) return weeklyFee;

  const days = Math.ceil((endDate.getTime() - startCounting.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const dailyRate = weeklyFee / 7;
  return round2(dailyRate * Math.min(days, 7));
};

export const deriveRawPayoutFromSettlementSnapshot = (settlement: {
  debt_before?: number | null;
  debt_after?: number | null;
  debt_payment?: number | null;
  actual_payout?: number | null;
}) => {
  const debtBefore = round2(Math.max(0, Number(settlement?.debt_before ?? 0)));
  const debtAfter = round2(Math.max(0, Number(settlement?.debt_after ?? debtBefore)));
  const debtPayment = round2(Math.max(0, Number(settlement?.debt_payment ?? 0)));
  const actualPayout = round2(Number(settlement?.actual_payout ?? 0));
  const debtIncrease = round2(Math.max(0, debtAfter - debtBefore));

  if (debtIncrease > 0.01) {
    return round2(-debtIncrease);
  }

  return round2(actualPayout + debtPayment);
};

const getDerivedRentalFee = (
  row: SettlementHistoryRowForDebtSplit,
  fallback?: FallbackRentalAssignment,
) => {
  const amounts = row.amounts || {};
  const uberBase = Number(amounts?.uber_base || 0);
  const boltBase = Number(amounts?.bolt_projected_d || 0);
  const freenowBase = Number(amounts?.freenow_base_s || 0);
  const totalBase = uberBase + boltBase + freenowBase;
  const totalCash = Number(amounts?.uber_cash_f || 0) + Number(amounts?.bolt_cash || 0) + Number(amounts?.freenow_cash_f || 0);
  const totalCommission = Number(amounts?.uber_commission || 0) + Number(amounts?.bolt_commission || 0) + Number(amounts?.freenow_commission_t || 0);
  const boltPayoutS = Number(amounts?.bolt_payout_s || 0);

  const hasPositivePlatformActivity =
    Math.max(0, uberBase) + Math.max(0, boltBase) + Math.max(0, freenowBase) + Math.max(0, totalCash) > 0.01;

  const isBoltAdjustmentOnly =
    !hasPositivePlatformActivity &&
    boltPayoutS < -0.01 &&
    Math.abs(boltBase - boltPayoutS) < 0.01 &&
    Math.abs(totalCash) < 0.01 &&
    Math.abs(totalCommission) < 0.01;

  const isNegativeAdjustmentOnly =
    !hasPositivePlatformActivity &&
    totalBase < -0.01 &&
    Math.abs(totalCash) < 0.01 &&
    Math.abs(totalCommission) < 0.01;

  if (!hasPositivePlatformActivity || isBoltAdjustmentOnly || isNegativeAdjustmentOnly) {
    return 0;
  }

  const manualRentalFee = amounts?.manual_rental_fee;
  if (manualRentalFee !== null && manualRentalFee !== undefined) {
    return Number(manualRentalFee || 0);
  }

  const persistedRentalFee = Number(row.rental_fee || 0);
  if (persistedRentalFee > 0) {
    return persistedRentalFee;
  }

  if (!fallback) {
    return 0;
  }

  if (fallback.assignedAt && row.period_from && row.period_to) {
    return calculateProportionalRentForSettlement(
      fallback.assignedAt,
      row.period_from,
      row.period_to,
      fallback.weeklyRate,
    );
  }

  return fallback.weeklyRate || 0;
};

export const buildWeeklyDebtSplit = (
  driverIds: string[],
  settlementHistoryData: SettlementHistoryRowForDebtSplit[],
  fallbackRentalByDriver: Map<string, FallbackRentalAssignment>,
) => {
  const splitDebtByWeek = new Map<string, WeeklyDebtSplit>();

  for (const driverId of driverIds) {
    const historyRows = settlementHistoryData.filter((row) => row.driver_id === driverId);
    if (historyRows.length === 0) continue;

    const weeklyRollup = new Map<string, {
      periodFrom: string;
      periodTo: string;
      payoutNoRental: number;
      rental: number;
      debtBeforeMax: number;
      debtAfterMax: number;
    }>();

    historyRows.forEach((row) => {
      const periodFromKey = row.period_from || '';
      const periodToKey = row.period_to || '';
      const weekKey = `${periodFromKey}|${periodToKey}`;
      const rawPayout = deriveRawPayoutFromSettlementSnapshot(row);
      const rentalFee = getDerivedRentalFee(row, fallbackRentalByDriver.get(driverId));
      const debtBefore = Math.max(0, Number(row.debt_before || 0));
      const debtAfter = Math.max(0, Number(row.debt_after || 0));

      const existing = weeklyRollup.get(weekKey) || {
        periodFrom: periodFromKey,
        periodTo: periodToKey,
        payoutNoRental: 0,
        rental: 0,
        debtBeforeMax: 0,
        debtAfterMax: 0,
      };

      existing.payoutNoRental = round2(existing.payoutNoRental + rawPayout + rentalFee);
      existing.rental = round2(existing.rental + rentalFee);
      existing.debtBeforeMax = Math.max(existing.debtBeforeMax, debtBefore);
      existing.debtAfterMax = Math.max(existing.debtAfterMax, debtAfter);

      weeklyRollup.set(weekKey, existing);
    });

    const sortedWeeks = [...weeklyRollup.values()].sort(
      (a, b) => new Date(a.periodFrom).getTime() - new Date(b.periodFrom).getTime(),
    );

    if (sortedWeeks.length === 0) continue;

    let runningSettlementDebt = round2(Math.max(0, sortedWeeks[0].debtBeforeMax || 0));
    let runningRentalDebt = 0;

    for (const week of sortedWeeks) {
      const weekKey = `${week.periodFrom}|${week.periodTo}`;
      const totalDebtBefore = round2(Math.max(0, week.debtBeforeMax || 0));

      if (round2(runningSettlementDebt + runningRentalDebt) !== totalDebtBefore) {
        const remainder = round2(totalDebtBefore - runningRentalDebt);
        runningSettlementDebt = Math.max(0, remainder);
      }

      const settlementDebtBefore = runningSettlementDebt;
      const rentalDebtBefore = runningRentalDebt;

      const wyplata1 = round2(week.payoutNoRental - settlementDebtBefore);
      let settlementDebtAfter = round2(Math.max(0, -wyplata1));

      const availableForRental = Math.max(0, wyplata1);
      const remainingPreviousRentalDebt = Math.max(0, rentalDebtBefore - availableForRental);
      const availableAfterPreviousRentalDebt = Math.max(0, availableForRental - rentalDebtBefore);
      const currentRentalDebt = Math.max(0, week.rental - availableAfterPreviousRentalDebt);
      let rentalDebtAfter = round2(remainingPreviousRentalDebt + currentRentalDebt);

      const totalDebtAfterSnapshot = round2(Math.max(0, week.debtAfterMax || 0));
      const computedTotalDebtAfter = round2(settlementDebtAfter + rentalDebtAfter);

      if (Math.abs(computedTotalDebtAfter - totalDebtAfterSnapshot) > 0.01) {
        if (rentalDebtAfter > totalDebtAfterSnapshot) {
          rentalDebtAfter = totalDebtAfterSnapshot;
          settlementDebtAfter = 0;
        } else {
          settlementDebtAfter = round2(Math.max(0, totalDebtAfterSnapshot - rentalDebtAfter));
        }
      }

      splitDebtByWeek.set(`${driverId}|${weekKey}`, {
        settlementDebtBefore,
        rentalDebtBefore,
        settlementDebtAfter,
        rentalDebtAfter,
      });

      runningSettlementDebt = settlementDebtAfter;
      runningRentalDebt = rentalDebtAfter;
    }
  }

  return splitDebtByWeek;
};