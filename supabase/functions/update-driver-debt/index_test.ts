import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { computeExcelDebtValues, deriveRawPayoutFromSnapshot } from "../_shared/driverDebtExcel.ts";

Deno.test("debt uses only previous final payout when current payout is positive but lower than debt", () => {
  const result = computeExcelDebtValues(463.54, 0);

  assertEquals(result.debtBefore, 463.54);
  assertEquals(result.actualPayout, -463.54);
  assertEquals(result.remainingDebt, 463.54);
});

Deno.test("positive payout reduces previous debt exactly by payout amount", () => {
  const result = computeExcelDebtValues(463.54, 231.2);

  assertEquals(result.debtBefore, 463.54);
  assertEquals(result.debtPayment, 231.2);
  assertEquals(result.actualPayout, -232.34);
  assertEquals(result.remainingDebt, 232.34);
});

Deno.test("raw payout can be reconstructed from a negative final payout snapshot", () => {
  const rawPayout = deriveRawPayoutFromSnapshot({
    debt_before: 463.54,
    debt_after: 463.54,
    debt_payment: 0,
    actual_payout: -463.54,
  });

  assertEquals(rawPayout, 0);
});