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

    // DEDUPLICATION: Check if a debt transaction already exists for this settlement
    const { data: existingTx } = await supabase
      .from("driver_debt_transactions")
      .select("id")
      .eq("settlement_id", settlement_id)
      .maybeSingle();

    if (existingTx) {
      console.log(`⚠️ Debt transaction already exists for settlement ${settlement_id}, skipping`);
      // Return existing settlement debt info
      const { data: settlement } = await supabase
        .from("settlements")
        .select("debt_before, debt_payment, debt_after, actual_payout")
        .eq("id", settlement_id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          debt_before: settlement?.debt_before || 0,
          debt_payment: settlement?.debt_payment || 0,
          debt_after: settlement?.debt_after || 0,
          actual_payout: settlement?.actual_payout || 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If payout is 0 or very close to 0, no debt action needed
    if (Math.abs(calculated_payout) < 0.01) {
      console.log(`Payout is ~0, no debt action needed`);
      
      const { data: debtData } = await supabase
        .from("driver_debts")
        .select("current_balance")
        .eq("driver_id", driver_id)
        .maybeSingle();
      
      const currentDebt = debtData?.current_balance || 0;
      
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

    // 1. Pobierz aktualny dług
    let { data: debtData, error: debtError } = await supabase
      .from("driver_debts")
      .select("current_balance")
      .eq("driver_id", driver_id)
      .maybeSingle();

    if (debtError) {
      console.error("Error fetching debt:", debtError);
      throw debtError;
    }

    const currentDebt = debtData?.current_balance || 0;
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