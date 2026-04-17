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

  if (actualPayout < -0.01) {
    return round2(actualPayout + debtBefore);
  }

  if (debtIncrease > 0.01) {
    return round2(-debtIncrease);
  }

  return round2(actualPayout + debtPayment);
};

/**
 * PROSTA ZASADA JAK W EXCELU:
 * Dług tyg. N = abs(Wypłata fin. tyg. N-1) jeśli ujemna, inaczej 0.
 *
 * Wypłata fin. = rawPayout - dług
 *
 * Bez podziału na dług rozliczeniowy / wynajmu.
 * Jeden numer przepisywany do przodu.
 */
export const buildWeeklyDebtSplit = (
  driverIds: string[],
  settlementHistoryData: SettlementHistoryRowForDebtSplit[],
  _fallbackRentalByDriver: Map<string, FallbackRentalAssignment>,
) => {
  const splitDebtByWeek = new Map<string, WeeklyDebtSplit>();

  for (const driverId of driverIds) {
    const historyRows = settlementHistoryData.filter((row) => row.driver_id === driverId);
    if (historyRows.length === 0) continue;

    // Grupuj po tygodniu i sumuj raw payout
    const weeklyRollup = new Map<string, {
      periodFrom: string;
      periodTo: string;
      rawPayout: number;
      debtBeforeMax: number;
    }>();

    historyRows.forEach((row) => {
      const weekKey = `${row.period_from || ''}|${row.period_to || ''}`;
      const rawPayout = deriveRawPayoutFromSettlementSnapshot(row);
      const debtBefore = Math.max(0, Number(row.debt_before || 0));

      const existing = weeklyRollup.get(weekKey);
      if (existing) {
        existing.rawPayout = round2(existing.rawPayout + rawPayout);
        existing.debtBeforeMax = Math.max(existing.debtBeforeMax, debtBefore);
      } else {
        weeklyRollup.set(weekKey, {
          periodFrom: row.period_from || '',
          periodTo: row.period_to || '',
          rawPayout,
          debtBeforeMax: debtBefore,
        });
      }
    });

    const sortedWeeks = [...weeklyRollup.values()].sort(
      (a, b) => new Date(a.periodFrom).getTime() - new Date(b.periodFrom).getTime(),
    );

    if (sortedWeeks.length === 0) continue;

    // Seed: debt_before z pierwszego tygodnia w historii
    let runningDebt = round2(Math.max(0, sortedWeeks[0].debtBeforeMax || 0));

    for (const week of sortedWeeks) {
      const weekKey = `${week.periodFrom}|${week.periodTo}`;
      const debtBefore = runningDebt;

      // Wypłata fin. = rawPayout - dług
      const wyplataFin = round2(week.rawPayout - debtBefore);

      // Dług na następny tydzień: abs(Wypłata fin.) jeśli ujemna, inaczej 0
      const debtAfter = wyplataFin < -0.01 ? round2(Math.abs(wyplataFin)) : 0;

      splitDebtByWeek.set(`${driverId}|${weekKey}`, {
        settlementDebtBefore: debtBefore,
        rentalDebtBefore: 0,
        settlementDebtAfter: debtAfter,
        rentalDebtAfter: 0,
      });

      runningDebt = debtAfter;
    }
  }

  return splitDebtByWeek;
};