import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { driver_id, settlement_id, period_from, period_to, calculated_payout }: DebtUpdateRequest = await req.json();

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

    const getAuthoritativeDebtBalance = async (): Promise<number> => {
      const [
        { data: debtData, error: debtError },
        { data: txData, error: txError },
        { data: previousSettlement, error: previousSettlementError }
      ] = await Promise.all([
        supabase
          .from("driver_debts")
          .select("current_balance")
          .eq("driver_id", driver_id)
          .maybeSingle(),
        supabase
          .from("driver_debt_transactions")
          .select("type, amount")
          .eq("driver_id", driver_id),
        supabase
          .from("settlements")
          .select("debt_after")
          .eq("driver_id", driver_id)
          .lt("period_to", period_from)
          .not("debt_after", "is", null)
          .order("period_to", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (debtError) {
        console.error("Error fetching driver_debts:", debtError);
        throw debtError;
      }
      if (txError) {
        console.error("Error fetching debt transactions:", txError);
        throw txError;
      }
      if (previousSettlementError) {
        console.error("Error fetching previous settlement debt:", previousSettlementError);
        throw previousSettlementError;
      }

      const dbDebt = Math.max(0, debtData?.current_balance || 0);
      const previousSettlementDebt = Math.max(0, previousSettlement?.debt_after || 0);

      let authoritativeDebt = 0;

      if ((txData || []).length > 0) {
        const ledgerDebt = (txData || []).reduce((sum: number, tx: any) => {
          const amount = Math.abs(tx.amount || 0);
          if (tx.type === "debt_increase" || tx.type === "manual_add") return sum + amount;
          return sum - amount;
        }, 0);
        authoritativeDebt = Math.max(0, ledgerDebt);
      } else {
        authoritativeDebt = Math.max(dbDebt, previousSettlementDebt);
      }

      if (Math.abs(dbDebt - authoritativeDebt) > 0.01) {
        await supabase.from("driver_debts").upsert({
          driver_id,
          current_balance: authoritativeDebt,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "driver_id"
        });
      }

      return authoritativeDebt;
    };

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

    const currentDebt = await getAuthoritativeDebtBalance();

    // If payout is 0 or very close to 0, no debt action needed
    if (Math.abs(calculated_payout) < 0.01) {
      console.log(`Payout is ~0, no debt action needed`);
      
      await supabase.from("settlements").update({
        debt_before: currentDebt,
        debt_payment: 0,
        debt_after: currentDebt,
        actual_payout: 0
      }).eq("id", settlement_id);

      return new Response(
        JSON.stringify({
          success: true,
          debt_before: currentDebt,
          debt_payment: 0,
          debt_after: currentDebt,
          actual_payout: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let debtPayment = 0;
    let remainingDebt = 0;
    let actualPayout = 0;

    console.log(`Current debt: ${currentDebt}`);

    // 2. Oblicz spłatę i nowe saldo
    if (calculated_payout < 0) {
      // Kierowca jest winien - narastanie długu
      remainingDebt = currentDebt + Math.abs(calculated_payout);
      actualPayout = 0;
      console.log(`Debt increase: ${Math.abs(calculated_payout)}, new debt: ${remainingDebt}`);
    } else if (currentDebt <= 0) {
      // Brak długu - pełna wypłata
      remainingDebt = 0;
      actualPayout = calculated_payout;
      console.log(`No debt, full payout: ${actualPayout}`);
    } else if (calculated_payout >= currentDebt) {
      // Spłaca cały dług
      debtPayment = currentDebt;
      remainingDebt = 0;
      actualPayout = calculated_payout - currentDebt;
      console.log(`Full debt payment: ${debtPayment}, remaining payout: ${actualPayout}`);
    } else {
      // Częściowa spłata
      debtPayment = calculated_payout;
      remainingDebt = currentDebt - calculated_payout;
      actualPayout = 0;
      console.log(`Partial debt payment: ${debtPayment}, remaining debt: ${remainingDebt}`);
    }

    // 3. Upsert driver_debts
    const { error: upsertError } = await supabase.from("driver_debts").upsert({
      driver_id,
      current_balance: remainingDebt,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'driver_id'
    });

    if (upsertError) {
      console.error("Error upserting debt:", upsertError);
      throw upsertError;
    }

    // 4. Zapisz transakcję
    if (calculated_payout < 0) {
      // Narastanie długu
      const { error: txError } = await supabase.from("driver_debt_transactions").insert({
        driver_id,
        settlement_id,
        type: "debt_increase",
        amount: Math.abs(calculated_payout),
        balance_before: currentDebt,
        balance_after: remainingDebt,
        period_from,
        period_to,
        description: `Dług z okresu ${period_from} - ${period_to}`
      });

      if (txError) {
        console.error("Error creating debt transaction:", txError);
        throw txError;
      }
    } else if (debtPayment > 0) {
      // Spłata długu
      const { error: txError } = await supabase.from("driver_debt_transactions").insert({
        driver_id,
        settlement_id,
        type: "debt_payment",
        amount: -debtPayment,
        balance_before: currentDebt,
        balance_after: remainingDebt,
        period_from,
        period_to,
        description: `Spłata długu z okresu ${period_from} - ${period_to}`
      });

      if (txError) {
        console.error("Error creating payment transaction:", txError);
        throw txError;
      }
    }

    // 5. Zaktualizuj settlement
    const { error: updateError } = await supabase.from("settlements").update({
      debt_before: currentDebt,
      debt_payment: debtPayment,
      debt_after: remainingDebt,
      actual_payout: actualPayout
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
        debt_payment: debtPayment,
        debt_after: remainingDebt,
        actual_payout: actualPayout
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