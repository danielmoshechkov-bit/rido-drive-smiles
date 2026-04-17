import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeExcelDebtValues, deriveRawPayoutFromSnapshot, round2 } from "../_shared/driverDebtExcel.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DebtUpdateRequest {
  driver_id: string;
  settlement_id: string;
  period_from: string;
  period_to: string;
  calculated_payout: number;
  calculated_payout_without_rental?: number;
  rental_fee?: number;
  force_recalculate_chain?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { driver_id, settlement_id, period_from, period_to, calculated_payout, calculated_payout_without_rental, rental_fee, force_recalculate_chain }: DebtUpdateRequest = await req.json();

    console.log(`Processing debt for driver ${driver_id}, payout: ${calculated_payout}`);

    // 🚫 SKIP FLEET OWNERS: Check if driver is actually a fleet owner (has fleet role)
    const { data: driverAppUser } = await supabase
      .from("driver_app_users")
      .select("user_id")
      .eq("driver_id", driver_id)
      .maybeSingle();
    
    if (driverAppUser?.user_id) {
      const { data: ownerRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", driverAppUser.user_id)
        .in("role", ["fleet_settlement", "fleet_rental"])
        .maybeSingle();
      
      if (ownerRole) {
        console.log(`⏭️ Driver ${driver_id} is a fleet owner (${ownerRole.role}), skipping debt calculation`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "fleet_owner" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const calculateProportionalRentForSettlement = (
      assignedAt: string | null | undefined,
      settlementPeriodFrom: string,
      settlementPeriodTo: string,
      weeklyFee: number,
    ): number => {
      if (!assignedAt || weeklyFee <= 0) return 0;

      const startDate = new Date(settlementPeriodFrom);
      const endDate = new Date(settlementPeriodTo);
      const assignmentDate = new Date(assignedAt);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || Number.isNaN(assignmentDate.getTime())) {
        return round2(weeklyFee);
      }

      if (assignmentDate > endDate) return 0;

      const effectiveStart = assignmentDate > startDate ? assignmentDate : startDate;
      const days = Math.ceil((endDate.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const dailyRate = weeklyFee / 7;

      return round2(dailyRate * Math.min(Math.max(days, 0), 7));
    };

    const { data: assignmentData } = await supabase
      .from("driver_vehicle_assignments")
      .select(`
        assigned_at,
        vehicles(weekly_rental_fee)
      `)
      .eq("driver_id", driver_id)
      .eq("status", "active")
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const assignmentWeeklyRate = Number((assignmentData?.vehicles as any)?.weekly_rental_fee || 0);
    const assignmentAssignedAt = assignmentData?.assigned_at || null;

    const resolveEffectiveRental = (settlement: any): number => {
      const amountsObj = (settlement?.amounts as any) || {};
      const manualRentalFee = amountsObj?.manual_rental_fee;

      if (manualRentalFee !== null && manualRentalFee !== undefined) {
        return Number(manualRentalFee || 0);
      }

      const persistedRentalFee = Number(settlement?.rental_fee || 0);
      if (persistedRentalFee > 0) {
        return persistedRentalFee;
      }

      const totalBase = Number(amountsObj?.uber_base || 0) + Number(amountsObj?.bolt_projected_d || 0) + Number(amountsObj?.freenow_base_s || 0);
      const totalCash = Number(amountsObj?.uber_cash_f || 0) + Number(amountsObj?.bolt_cash || 0) + Number(amountsObj?.freenow_cash_f || 0);
      const hasAnyActivity = Math.abs(totalBase) > 0.01 || Math.abs(totalCash) > 0.01;

      if (!hasAnyActivity || assignmentWeeklyRate <= 0) {
        return 0;
      }

      if (assignmentAssignedAt && settlement?.period_from && settlement?.period_to) {
        return calculateProportionalRentForSettlement(
          assignmentAssignedAt,
          settlement.period_from,
          settlement.period_to,
          assignmentWeeklyRate,
        );
      }

      return round2(assignmentWeeklyRate);
    };

    const recalculateDebtChainFromPeriod = async () => {
      const { data: previousSettlement, error: previousSettlementError } = await supabase
        .from("settlements")
        .select("debt_after")
        .eq("driver_id", driver_id)
        .lt("period_to", period_from)
        .not("debt_after", "is", null)
        .order("period_to", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousSettlementError) {
        console.error("Error fetching previous settlement for chain recalculation:", previousSettlementError);
        throw previousSettlementError;
      }

      let runningDebt = round2(Math.max(0, Number(previousSettlement?.debt_after ?? 0)));

      const { error: deleteAutoTxError } = await supabase
        .from("driver_debt_transactions")
        .delete()
        .eq("driver_id", driver_id)
        .gte("period_from", period_from)
        .in("type", ["debt_increase", "debt_payment"])
        .not("settlement_id", "is", null);

      if (deleteAutoTxError) {
        console.error("Error deleting auto debt transactions for recalculation:", deleteAutoTxError);
        throw deleteAutoTxError;
      }

      const { data: chainSettlements, error: chainSettlementsError } = await supabase
        .from("settlements")
        .select("id, period_from, period_to, debt_before, debt_payment, debt_after, actual_payout, net_amount, amounts, rental_fee")
        .eq("driver_id", driver_id)
        .gte("period_from", period_from)
        .order("period_from", { ascending: true })
        .order("period_to", { ascending: true })
        .order("updated_at", { ascending: true });

      if (chainSettlementsError) {
        console.error("Error fetching settlements for debt chain recalculation:", chainSettlementsError);
        throw chainSettlementsError;
      }

      if (!chainSettlements || chainSettlements.length === 0) {
        throw new Error("No settlements found for debt chain recalculation");
      }

      let targetSnapshot: { debtBefore: number; debtPayment: number; remainingDebt: number; actualPayout: number } | null = null;

      for (const settlement of chainSettlements) {
        // Detect empty settlement (no CSV data) — carry debt forward without accrual
        const amountsObj = settlement.amounts as any;
        const isEmptySettlement = (
          (amountsObj === null || amountsObj === undefined || (typeof amountsObj === 'object' && Object.keys(amountsObj).length === 0))
          && (Number(settlement.net_amount) === 0 || settlement.net_amount === null)
          && (Number(settlement.rental_fee) === 0 || settlement.rental_fee === null)
        );

        let rawPayout: number;
        if (isEmptySettlement && settlement.id !== settlement_id) {
          // Empty settlement: payout = 0, just carry debt forward
          rawPayout = 0;
        } else if (settlement.id === settlement_id) {
          rawPayout = round2(calculated_payout);
        } else {
          rawPayout = deriveRawPayoutFromSnapshot(settlement);
        }

        const computed = computeExcelDebtValues(runningDebt, rawPayout);

        const { error: settlementUpdateError } = await supabase
          .from("settlements")
          .update({
            debt_before: computed.debtBefore,
            debt_payment: computed.debtPayment,
            debt_after: computed.remainingDebt,
            actual_payout: computed.actualPayout,
          })
          .eq("id", settlement.id);

        if (settlementUpdateError) {
          console.error("Error updating settlement during debt chain recalculation:", settlementUpdateError);
          throw settlementUpdateError;
        }

        if (rawPayout < -0.01) {
          const { error: txError } = await supabase.from("driver_debt_transactions").insert({
            driver_id,
            settlement_id: settlement.id,
            type: "debt_increase",
            amount: round2(Math.abs(rawPayout)),
            balance_before: computed.debtBefore,
            balance_after: computed.remainingDebt,
            period_from: settlement.period_from,
            period_to: settlement.period_to,
            description: `Dług z okresu ${settlement.period_from} - ${settlement.period_to}`,
            debt_category: "settlement",
          });

          if (txError) {
            console.error("Error creating debt increase transaction during chain recalculation:", txError);
            throw txError;
          }
        } else if (computed.debtPayment > 0.01) {
          const { error: txError } = await supabase.from("driver_debt_transactions").insert({
            driver_id,
            settlement_id: settlement.id,
            type: "debt_payment",
            amount: -Math.abs(computed.debtPayment),
            balance_before: computed.debtBefore,
            balance_after: computed.remainingDebt,
            period_from: settlement.period_from,
            period_to: settlement.period_to,
            description: `Spłata długu z okresu ${settlement.period_from} - ${settlement.period_to}`,
            debt_category: "settlement",
          });

          if (txError) {
            console.error("Error creating debt payment transaction during chain recalculation:", txError);
            throw txError;
          }
        }

        runningDebt = computed.remainingDebt;

        if (settlement.id === settlement_id) {
          targetSnapshot = computed;
        }
      }

      const { data: finalLedgerTransactions, error: finalLedgerTransactionsError } = await supabase
        .from("driver_debt_transactions")
        .select("type, amount")
        .eq("driver_id", driver_id);

      if (finalLedgerTransactionsError) {
        console.error("Error fetching final ledger after chain recalculation:", finalLedgerTransactionsError);
        throw finalLedgerTransactionsError;
      }

      const ledgerBalance = round2(Math.max(0, (finalLedgerTransactions || []).reduce((sum: number, tx: any) => {
        const amount = Math.abs(Number(tx.amount) || 0);
        return sum + (tx.type === "debt_increase" || tx.type === "manual_add" ? amount : -amount);
      }, 0)));

      const { error: debtUpsertError } = await supabase.from("driver_debts").upsert({
        driver_id,
        current_balance: ledgerBalance,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "driver_id",
      });

      if (debtUpsertError) {
        console.error("Error upserting driver debt after chain recalculation:", debtUpsertError);
        throw debtUpsertError;
      }

      return targetSnapshot;
    };

    const getPreviousSettlementDebt = async (): Promise<number> => {
      const { data: previousSettlement, error: previousSettlementError } = await supabase
        .from("settlements")
        .select("debt_after")
        .eq("driver_id", driver_id)
        .lt("period_to", period_from)
        .not("debt_after", "is", null)
        .order("period_to", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousSettlementError) {
        console.error("Error fetching previous settlement debt:", previousSettlementError);
        throw previousSettlementError;
      }

      return round2(Math.max(0, Number(previousSettlement?.debt_after ?? 0)));
    };

    if (force_recalculate_chain) {
      console.log(`♻️ Force recalculating debt chain for driver ${driver_id} from ${period_from}`);

      const snapshot = await recalculateDebtChainFromPeriod();

      return new Response(
        JSON.stringify({
          success: true,
          recalculated: true,
          debt_before: snapshot?.debtBefore ?? 0,
          debt_payment: snapshot?.debtPayment ?? 0,
          debt_after: snapshot?.remainingDebt ?? 0,
          actual_payout: snapshot?.actualPayout ?? 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DEDUPLICATION: Check by settlement_id AND by period to prevent duplicates
    const { data: existingTxBySettlement } = await supabase
      .from("driver_debt_transactions")
      .select("id")
      .eq("settlement_id", settlement_id)
      .maybeSingle();

    // Also check for existing transaction for same driver + period (regardless of settlement_id)
    const { data: existingTxByPeriod } = await supabase
      .from("driver_debt_transactions")
      .select("id")
      .eq("driver_id", driver_id)
      .eq("period_from", period_from)
      .eq("period_to", period_to)
      .limit(1)
      .maybeSingle();

    if (existingTxBySettlement || existingTxByPeriod) {
      console.log(`⚠️ Debt transaction already exists for driver ${driver_id} period ${period_from}-${period_to}, syncing settlement snapshot`);

      const [
        { data: currentSettlement },
        { data: periodSnapshot },
        { data: periodTx }
      ] = await Promise.all([
        supabase
          .from("settlements")
          .select("id, debt_before, debt_payment, debt_after, actual_payout")
          .eq("id", settlement_id)
          .maybeSingle(),
        supabase
          .from("settlements")
          .select("id, debt_before, debt_payment, debt_after, actual_payout")
          .eq("driver_id", driver_id)
          .eq("period_from", period_from)
          .eq("period_to", period_to)
          .not("debt_after", "is", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("driver_debt_transactions")
          .select("type, amount, balance_before, balance_after")
          .eq("driver_id", driver_id)
          .eq("period_from", period_from)
          .eq("period_to", period_to)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      const resolvedDebtBefore = periodSnapshot?.debt_before
        ?? currentSettlement?.debt_before
        ?? periodTx?.balance_before
        ?? 0;
      const resolvedDebtAfter = periodSnapshot?.debt_after
        ?? currentSettlement?.debt_after
        ?? periodTx?.balance_after
        ?? 0;
      const resolvedDebtPayment = periodSnapshot?.debt_payment
        ?? currentSettlement?.debt_payment
        ?? (periodTx?.type === "debt_payment" ? Math.abs(periodTx?.amount || 0) : 0);
      const resolvedActualPayout = periodSnapshot?.actual_payout
        ?? currentSettlement?.actual_payout
        ?? 0;

      if (currentSettlement && (
        Math.abs((currentSettlement.debt_before || 0) - resolvedDebtBefore) > 0.01 ||
        Math.abs((currentSettlement.debt_payment || 0) - resolvedDebtPayment) > 0.01 ||
        Math.abs((currentSettlement.debt_after || 0) - resolvedDebtAfter) > 0.01 ||
        Math.abs((currentSettlement.actual_payout || 0) - resolvedActualPayout) > 0.01
      )) {
        await supabase
          .from("settlements")
          .update({
            debt_before: resolvedDebtBefore,
            debt_payment: resolvedDebtPayment,
            debt_after: resolvedDebtAfter,
            actual_payout: resolvedActualPayout
          })
          .eq("id", settlement_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          debt_before: resolvedDebtBefore,
          debt_payment: resolvedDebtPayment,
          debt_after: resolvedDebtAfter,
          actual_payout: resolvedActualPayout
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CRITICAL: nowe rozliczenie startuje WYŁĄCZNIE z debt_after poprzedniego settlementu.
    // Nie używamy driver_debts/current ledger jako debt_before dla nowego tygodnia,
    // bo to powoduje dopisywanie starych/phantom długów.
    const currentDebt = await getPreviousSettlementDebt();

    const computed = computeExcelDebtValues(currentDebt, calculated_payout);

    console.log(`Current debt: ${currentDebt}`);
    console.log(`Computed final payout: ${computed.actualPayout}, next debt: ${computed.remainingDebt}`);

    // 3. Upsert driver_debts
    const { error: upsertError } = await supabase.from("driver_debts").upsert({
      driver_id,
      current_balance: computed.remainingDebt,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'driver_id'
    });

    if (upsertError) {
      console.error("Error upserting debt:", upsertError);
      throw upsertError;
    }

    // 4. Zapisz transakcję
    if (calculated_payout < -0.01) {
      const { error: txError } = await supabase.from("driver_debt_transactions").insert({
        driver_id,
        settlement_id,
        type: "debt_increase",
        amount: round2(Math.abs(calculated_payout)),
        balance_before: currentDebt,
        balance_after: computed.remainingDebt,
        period_from,
        period_to,
        description: `Dług z okresu ${period_from} - ${period_to}`,
        debt_category: "settlement",
      });

      if (txError) {
        console.error("Error creating debt increase transaction:", txError);
        throw txError;
      }
    } else if (computed.debtPayment > 0.01) {
      // Spłata długu
      const { error: txError } = await supabase.from("driver_debt_transactions").insert({
        driver_id,
        settlement_id,
        type: "debt_payment",
        amount: -computed.debtPayment,
        balance_before: currentDebt,
        balance_after: computed.remainingDebt,
        period_from,
        period_to,
        description: `Spłata długu z okresu ${period_from} - ${period_to}`,
        debt_category: "settlement",
      });

      if (txError) {
        console.error("Error creating payment transaction:", txError);
        throw txError;
      }
    }

    // 5. Zaktualizuj settlement
    const { error: updateError } = await supabase.from("settlements").update({
      debt_before: currentDebt,
      debt_payment: computed.debtPayment,
      debt_after: computed.remainingDebt,
      actual_payout: computed.actualPayout
    }).eq("id", settlement_id);

    if (updateError) {
      console.error("Error updating settlement:", updateError);
      throw updateError;
    }

    console.log(`Debt update completed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        debt_before: currentDebt,
        debt_payment: computed.debtPayment,
        debt_after: computed.remainingDebt,
        actual_payout: computed.actualPayout
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in update-driver-debt:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});