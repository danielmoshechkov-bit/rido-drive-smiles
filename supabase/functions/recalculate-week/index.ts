import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase env vars");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { fleet_id, period_from, period_to, historical_only } = await req.json();

    if (!fleet_id || !period_from || !period_to) {
      throw new Error("Missing required parameters: fleet_id, period_from, period_to");
    }

    // historical_only = true → update settlement snapshots only, skip ledger & balance writes
    const skipLedger = !!historical_only;
    console.log(`🔄 Recalculating week ${period_from} - ${period_to} for fleet ${fleet_id}${skipLedger ? ' [HISTORICAL - no ledger writes]' : ''}`);

    const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

    const computeDebtValues = (debtBefore: number, payout: number) => {
      const db = round2(Math.max(0, debtBefore || 0));
      const p = round2(payout || 0);
      let debtPayment = 0, remainingDebt = db, actualPayout = 0;

      if (Math.abs(p) < 0.01) {
        return { debtBefore: db, debtPayment, remainingDebt, actualPayout };
      }
      if (p < 0) {
        remainingDebt = round2(db + Math.abs(p));
      } else if (db <= 0) {
        remainingDebt = 0;
        actualPayout = p;
      } else if (p >= db) {
        debtPayment = db;
        remainingDebt = 0;
        actualPayout = round2(p - db);
      } else {
        debtPayment = p;
        remainingDebt = round2(db - p);
      }
      return { debtBefore: db, debtPayment: round2(debtPayment), remainingDebt: round2(remainingDebt), actualPayout: round2(actualPayout) };
    };

    // 1. Get all drivers in this fleet (with city_id and custom_weekly_fee for fee lookup)
    const { data: drivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, city_id, custom_weekly_fee')
      .eq('fleet_id', fleet_id);
    if (driversErr) throw driversErr;
    if (!drivers || drivers.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0, message: "No drivers in fleet" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const driverIds = drivers.map(d => d.id);
    const driverMap = new Map(drivers.map(d => [d.id, d]));

    // Fetch city names for fee lookup
    const cityIds = [...new Set(drivers.map(d => d.city_id).filter(Boolean))];
    const { data: citiesData } = await supabase
      .from('cities')
      .select('id, name')
      .in('id', cityIds.length > 0 ? cityIds : ['__none__']);
    const cityNameMap = new Map((citiesData || []).map(c => [c.id, c.name]));

    // Fetch fleet_city_settings for service fee
    const { data: citySettings } = await supabase
      .from('fleet_city_settings')
      .select('city_name, base_fee')
      .eq('fleet_id', fleet_id);
    const cityFeeMap = new Map((citySettings || []).map(cs => [cs.city_name, cs.base_fee]));

    // Helper: get service fee for a driver
    const getDriverServiceFee = (driverId: string, amounts: any): number => {
      // Priority: 1) manual override in amounts, 2) driver custom_weekly_fee, 3) city base_fee, 4) default 50
      const manualFee = amounts?.manual_service_fee;
      if (manualFee !== null && manualFee !== undefined && manualFee !== 0) return Number(manualFee);

      const driver = driverMap.get(driverId);
      if (!driver) return 50;

      if (driver.custom_weekly_fee !== null && driver.custom_weekly_fee !== undefined) {
        return Number(driver.custom_weekly_fee);
      }

      const cityName = cityNameMap.get(driver.city_id);
      if (cityName) {
        const cityFee = cityFeeMap.get(cityName);
        if (cityFee !== null && cityFee !== undefined) return Number(cityFee);
      }

      return 50; // default
    };

    // 2. Get settlements for this week
    const { data: settlements, error: settErr } = await supabase
      .from('settlements')
      .select('*')
      .in('driver_id', driverIds)
      .gte('period_from', period_from)
      .lte('period_to', period_to);
    if (settErr) throw settErr;

    if (!settlements || settlements.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0, message: "No settlements for this week" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`📊 Found ${settlements.length} settlements to recalculate`);

    let processedCount = 0;
    const results: Array<{ driver_id: string; debt_before: number; debt_after: number; actual_payout: number }> = [];

    for (const settlement of settlements) {
      const amounts = settlement.amounts as any;
      const netAmount = Number(settlement.net_amount || 0);

      // Skip empty settlements (no CSV data)
      const isEmptyAmounts = !amounts || (typeof amounts === 'object' && Object.keys(amounts).length === 0);
      if (isEmptyAmounts && netAmount === 0) {
        // For empty settlements, just carry debt forward from previous week
        const { data: prev } = await supabase
          .from('settlements')
          .select('debt_after')
          .eq('driver_id', settlement.driver_id)
          .lt('period_to', period_from)
          .not('debt_after', 'is', null)
          .order('period_to', { ascending: false })
          .limit(1)
          .maybeSingle();

        const carryDebt = round2(Math.max(0, Number(prev?.debt_after ?? 0)));
        
        await supabase.from('settlements').update({
          debt_before: carryDebt,
          debt_after: carryDebt,
          debt_payment: 0,
          actual_payout: 0,
        }).eq('id', settlement.id);

        results.push({ driver_id: settlement.driver_id, debt_before: carryDebt, debt_after: carryDebt, actual_payout: 0 });
        processedCount++;
        continue;
      }

      // Calculate rawPayout including service_fee (opłata)
      const calculatedPayout = netAmount;
      const rentalFee = Number(settlement.rental_fee || 0);
      
      // Determine if this is a "Bolt adjustment only" week (no real activity → fee = 0)
      const totalBase = (amounts?.uber_base || 0) + (amounts?.bolt_projected_d || 0) + (amounts?.freenow_base_s || 0);
      const totalCash = (amounts?.uber_cash_f || 0) + (amounts?.bolt_cash || 0) + (amounts?.freenow_cash_f || 0);
      const totalCommission = (amounts?.uber_commission || 0) + (amounts?.bolt_commission || 0) + (amounts?.freenow_commission_t || 0);
      const isBoltAdjustmentOnly = Math.abs(totalBase) < 0.01 && Math.abs(totalCash) < 0.01 && Math.abs(totalCommission) < 0.01;
      
      const serviceFee = isBoltAdjustmentOnly ? 0 : getDriverServiceFee(settlement.driver_id, amounts);
      const rawPayout = round2(calculatedPayout - rentalFee - serviceFee);
      
      console.log(`💰 Driver ${settlement.driver_id}: net=${netAmount}, rental=${rentalFee}, serviceFee=${serviceFee}, rawPayout=${rawPayout}`);

      // Get debt_before from previous week
      const { data: prevSettlement } = await supabase
        .from('settlements')
        .select('debt_after')
        .eq('driver_id', settlement.driver_id)
        .lt('period_to', period_from)
        .not('debt_after', 'is', null)
        .order('period_to', { ascending: false })
        .limit(1)
        .maybeSingle();

      const debtBefore = round2(Math.max(0, Number(prevSettlement?.debt_after ?? 0)));
      const computed = computeDebtValues(debtBefore, rawPayout);

      // Update settlement record (never insert new)
      const { error: updateErr } = await supabase
        .from('settlements')
        .update({
          debt_before: computed.debtBefore,
          debt_payment: computed.debtPayment,
          debt_after: computed.remainingDebt,
          actual_payout: computed.actualPayout,
        })
        .eq('id', settlement.id);

      if (updateErr) {
        console.error(`Error updating settlement ${settlement.id}:`, updateErr);
        continue;
      }

      // --- LEDGER & BALANCE WRITES (skip in historical mode) ---
      if (!skipLedger) {
        // Delete old auto-transactions for this driver+period
        await supabase
          .from('driver_debt_transactions')
          .delete()
          .eq('driver_id', settlement.driver_id)
          .eq('period_from', period_from)
          .eq('period_to', period_to)
          .in('type', ['debt_increase', 'debt_payment'])
          .not('settlement_id', 'is', null);

        // Insert new debt transactions
        if (rawPayout < -0.01) {
          const totalDeficit = Math.abs(rawPayout);
          const payoutWithoutRental = round2(rawPayout + rentalFee);
          const settlementDeficit = payoutWithoutRental < 0 ? round2(Math.abs(payoutWithoutRental)) : 0;
          const rentalDeficit = round2(Math.max(0, totalDeficit - settlementDeficit));

          if (settlementDeficit > 0.01) {
            await supabase.from('driver_debt_transactions').upsert({
              driver_id: settlement.driver_id,
              settlement_id: settlement.id,
              type: 'debt_increase',
              amount: settlementDeficit,
              balance_before: computed.debtBefore,
              balance_after: round2(computed.debtBefore + settlementDeficit),
              period_from,
              period_to,
              description: `Dług rozliczenia z okresu ${period_from} - ${period_to}`,
              debt_category: 'settlement',
            }, { onConflict: 'driver_id,period_from,period_to,debt_category,type', ignoreDuplicates: false });
          }

          if (rentalDeficit > 0.01) {
            await supabase.from('driver_debt_transactions').upsert({
              driver_id: settlement.driver_id,
              settlement_id: settlement.id,
              type: 'debt_increase',
              amount: rentalDeficit,
              balance_before: round2(computed.debtBefore + settlementDeficit),
              balance_after: computed.remainingDebt,
              period_from,
              period_to,
              description: `Dług wynajmu z okresu ${period_from} - ${period_to}`,
              debt_category: 'rental',
            }, { onConflict: 'driver_id,period_from,period_to,debt_category,type', ignoreDuplicates: false });
          }
        } else if (computed.debtPayment > 0.01) {
          await supabase.from('driver_debt_transactions').upsert({
            driver_id: settlement.driver_id,
            settlement_id: settlement.id,
            type: 'debt_payment',
            amount: -Math.abs(computed.debtPayment),
            balance_before: computed.debtBefore,
            balance_after: computed.remainingDebt,
            period_from,
            period_to,
            description: `Spłata długu z okresu ${period_from} - ${period_to}`,
            debt_category: 'settlement',
          }, { onConflict: 'driver_id,period_from,period_to,debt_category,type', ignoreDuplicates: false });
        }

        // Update driver_debts.current_balance from ledger
        const { data: txData } = await supabase
          .from('driver_debt_transactions')
          .select('type, amount')
          .eq('driver_id', settlement.driver_id);

        const ledgerBalance = round2(Math.max(0, (txData || []).reduce((sum, tx) => {
          const amt = Math.abs(Number(tx.amount) || 0);
          return sum + (tx.type === 'debt_increase' || tx.type === 'manual_add' ? amt : -amt);
        }, 0)));

        await supabase.from('driver_debts').upsert({
          driver_id: settlement.driver_id,
          current_balance: ledgerBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'driver_id' });
      }

      results.push({
        driver_id: settlement.driver_id,
        debt_before: computed.debtBefore,
        debt_after: computed.remainingDebt,
        actual_payout: computed.actualPayout,
      });
      processedCount++;
    }

    console.log(`✅ Recalculated ${processedCount} settlements`);

    return new Response(
      JSON.stringify({ success: true, count: processedCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('Error in recalculate-week:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
