// Edge function: weekly-debt-calc
// Liczy/aktualizuje dług tygodniowy dla pojedynczego (driver_id, settlement_id).
// Źródło prawdy: driver_weekly_debts. Nie używa driver_debts ani driver_debt_transactions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { calculateWeeklyDebt, round2 } from "../_shared/weeklyDebt.ts";

interface RequestBody {
  driver_id: string;
  settlement_id?: string | null;
  period_from: string;
  period_to: string;
  // currentPayout = wypłata "raw" przed potrąceniem długu z tego tygodnia.
  // Jeśli nie podano, próbujemy odtworzyć z settlements (actual_payout + debt_after).
  current_payout?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as RequestBody;
    if (!body.driver_id || !body.period_from || !body.period_to) {
      return new Response(
        JSON.stringify({ error: "driver_id, period_from, period_to wymagane" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Settlement aktualnego tygodnia (jeśli nie podano id)
    let currentSettlement: any = null;
    if (body.settlement_id) {
      const { data } = await supabase
        .from("settlements")
        .select("id, actual_payout, period_from, period_to, amounts")
        .eq("id", body.settlement_id)
        .maybeSingle();
      currentSettlement = data;
    } else {
      const { data } = await supabase
        .from("settlements")
        .select("id, actual_payout, period_from, period_to, amounts")
        .eq("driver_id", body.driver_id)
        .eq("period_from", body.period_from)
        .eq("period_to", body.period_to)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      currentSettlement = data;
    }

    // 2. Opening_debt = remaining_debt z poprzedniego rekordu w driver_weekly_debts
    const { data: previousDwd } = await supabase
      .from("driver_weekly_debts")
      .select("id, remaining_debt, period_from, period_to, settlement_id")
      .eq("driver_id", body.driver_id)
      .lt("period_to", body.period_from)
      .order("period_to", { ascending: false })
      .limit(1)
      .maybeSingle();

    const openingDebt = Number(previousDwd?.remaining_debt || 0);

    // 3. Wypłata "raw" tego tygodnia
    let currentPayout: number;
    if (body.current_payout !== undefined && body.current_payout !== null) {
      currentPayout = Number(body.current_payout);
    } else if (currentSettlement) {
      // Odtwórz raw z istniejącego settlement: actual + debt_after - debt_before + debt_payment
      const a = Number(currentSettlement.actual_payout || 0);
      const dB = Number((currentSettlement as any).debt_before || 0);
      const dP = Number((currentSettlement as any).debt_payment || 0);
      const dA = Number((currentSettlement as any).debt_after || 0);
      currentPayout = round2(a + dA - dB + dP);
    } else {
      currentPayout = 0;
    }

    // 4. Wpłaty z tego tygodnia
    const { data: payments } = await supabase
      .from("driver_weekly_debt_payments")
      .select("amount")
      .eq("driver_id", body.driver_id)
      .eq("period_from", body.period_from)
      .eq("period_to", body.period_to);

    // 5. Oblicz
    const computed = calculateWeeklyDebt(openingDebt, currentPayout, payments || []);

    // 6. Upsert driver_weekly_debts
    const sourceNote = openingDebt > 0.01
      ? `Dług otwarcia ${round2(openingDebt)} z poprzedniego tygodnia`
      : "Brak długu z poprzedniego tygodnia";

    const { data: upserted, error: upsertErr } = await supabase
      .from("driver_weekly_debts")
      .upsert(
        {
          driver_id: body.driver_id,
          settlement_id: currentSettlement?.id || body.settlement_id || null,
          period_from: body.period_from,
          period_to: body.period_to,
          opening_debt: computed.openingDebt,
          paid_amount: computed.paidAmount,
          visible_debt: computed.visibleDebt,
          remaining_debt: computed.remainingDebt,
          source_previous_settlement_id: previousDwd?.settlement_id || null,
          source_previous_actual_payout: round2(openingDebt),
          source_note: sourceNote,
          status: "active",
        },
        { onConflict: "driver_id,period_from,period_to" },
      )
      .select()
      .single();

    if (upsertErr) throw upsertErr;

    // 7. Sync settlements: debt_after = visibleDebt (UI), NIE remainingDebt
    if (currentSettlement?.id) {
      await supabase
        .from("settlements")
        .update({
          debt_before: computed.openingDebt,
          debt_payment: computed.paidAmount,
          debt_after: computed.visibleDebt,
          actual_payout: computed.actualPayout,
        })
        .eq("id", currentSettlement.id);

      // Backfill weekly_debt_id w wpłatach
      if (upserted?.id) {
        await supabase
          .from("driver_weekly_debt_payments")
          .update({ weekly_debt_id: upserted.id })
          .eq("driver_id", body.driver_id)
          .eq("period_from", body.period_from)
          .eq("period_to", body.period_to)
          .is("weekly_debt_id", null);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        weekly_debt: upserted,
        computed,
        previous_settlement_id: previousSettlement?.id || null,
        previous_actual_payout: previousActualPayout,
        current_payout_used: currentPayout,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[weekly-debt-calc] error", err);
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
