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

    const skipLedger = !!historical_only;
    console.log(`🔄 Recalculating week ${period_from} - ${period_to} for fleet ${fleet_id}${skipLedger ? ' [HISTORICAL]' : ''}`);

    const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

    // Must match UI logic: when bolt_projected_d is 0, fall back to bolt_payout_s
    const getEffectiveBoltBase = (amounts: any): number => {
      const boltProjected = Number(amounts?.bolt_projected_d || 0);
      if (Math.abs(boltProjected) > 0.01) return boltProjected;
      return Number(amounts?.bolt_payout_s || 0);
    };

    const calculateProportionalRentForSettlement = (
      assignedAt: string | null | undefined,
      periodFrom: string,
      periodTo: string,
      weeklyFee: number,
    ): number => {
      if (!assignedAt || weeklyFee <= 0) return 0;
      const startDate = new Date(periodFrom);
      const endDate = new Date(periodTo);
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

    // 1. Get all drivers in this fleet
    const { data: drivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, city_id, custom_weekly_fee, payment_method, billing_method, b2b_enabled, b2b_vat_payer')
      .eq('fleet_id', fleet_id);
    if (driversErr) throw driversErr;
    if (!drivers || drivers.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0, message: "No drivers in fleet" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const driverIds = drivers.map(d => d.id);
    const driverMap = new Map(drivers.map(d => [d.id, d]));

    const { data: assignmentsData } = await supabase
      .from('driver_vehicle_assignments')
      .select('driver_id, assigned_at, vehicles(weekly_rental_fee)')
      .in('driver_id', driverIds)
      .eq('status', 'active');

    const assignmentMap = new Map<string, { assignedAt: string | null; weeklyRate: number }>();
    (assignmentsData || []).forEach((assignment: any) => {
      const weeklyRate = Number((assignment?.vehicles as any)?.weekly_rental_fee || 0);
      if (weeklyRate > 0 && !assignmentMap.has(assignment.driver_id)) {
        assignmentMap.set(assignment.driver_id, {
          assignedAt: assignment.assigned_at || null,
          weeklyRate,
        });
      }
    });

    // Fetch fleet settings
    const { data: fleetData } = await supabase
      .from('fleets')
      .select('vat_rate, settlement_mode, uber_calculation_mode, secondary_vat_rate, additional_percent_rate')
      .eq('id', fleet_id)
      .maybeSingle();
    const fleetVatRate = fleetData?.vat_rate ?? 8;
    const fleetSettlementMode = fleetData?.settlement_mode ?? 'single_tax';
    const fleetUberCalcMode = fleetData?.uber_calculation_mode ?? 'netto';
    const fleetSecondaryVatRate = fleetData?.secondary_vat_rate ?? 23;
    const fleetAdditionalPercentRate = fleetData?.additional_percent_rate ?? 0;

    const cityIds = [...new Set(drivers.map(d => d.city_id).filter(Boolean))];
    const { data: citiesData } = await supabase
      .from('cities')
      .select('id, name')
      .in('id', cityIds.length > 0 ? cityIds : ['__none__']);
    const cityNameMap = new Map((citiesData || []).map(c => [c.id, c.name]));

    // Fetch fleet_city_settings
    const { data: citySettings } = await supabase
      .from('fleet_city_settings')
      .select('city_name, platform, base_fee, vat_rate, settlement_mode, uber_calculation_mode, secondary_vat_rate, additional_percent_rate')
      .eq('fleet_id', fleet_id);

    // Merge city settings: prefer bolt entry for base_fee and settlement_mode, uber entry for uber_calculation_mode
    const citySettingsMerged = new Map<string, any>();
    const byCityName = new Map<string, any[]>();
    (citySettings || []).forEach(cs => {
      const existing = byCityName.get(cs.city_name) || [];
      existing.push(cs);
      byCityName.set(cs.city_name, existing);
    });
    byCityName.forEach((entries, cityName) => {
      const boltEntry = entries.find(e => e.platform === 'bolt') || entries[0];
      const uberEntry = entries.find(e => e.platform === 'uber');
      citySettingsMerged.set(cityName, {
        base_fee: boltEntry.base_fee,
        vat_rate: boltEntry.vat_rate,
        settlement_mode: boltEntry.settlement_mode,
        secondary_vat_rate: boltEntry.secondary_vat_rate,
        additional_percent_rate: boltEntry.additional_percent_rate,
        uber_calculation_mode: uberEntry?.uber_calculation_mode ?? fleetUberCalcMode,
      });
    });
    const cityFeeMap = new Map<string, number>();
    const citySettingsFullMap = citySettingsMerged;
    citySettingsMerged.forEach((merged, cityName) => {
      cityFeeMap.set(cityName, merged.base_fee);
    });

    // Fetch fleet_settlement_fees (additional fees like ZUS)
    const { data: fleetFees } = await supabase
      .from('fleet_settlement_fees')
      .select('*')
      .eq('fleet_id', fleet_id)
      .eq('is_active', true);

    // Helper: check if this week is first full week of month (for monthly fees)
    const isFirstFullWeekOfMonth = (weekStart: string): boolean => {
      const start = new Date(weekStart);
      return start.getDate() >= 1 && start.getDate() <= 7;
    };
    const isFirstWeek = isFirstFullWeekOfMonth(period_from);

    // Filter applicable fees for this period
    const applicableFees = (fleetFees || []).filter(fee => {
      const periodStartDate = new Date(period_from);
      if (fee.valid_from) {
        if (new Date(fee.valid_from) > periodStartDate) return false;
      }
      if (fee.valid_to) {
        if (new Date(fee.valid_to) < periodStartDate) return false;
      }
      if (fee.frequency === 'weekly') return true;
      if (fee.frequency === 'monthly' && isFirstWeek) return true;
      return false;
    });

    // Helper: get driver-specific settings
    const getDriverSettings = (driverId: string) => {
      const driver = driverMap.get(driverId);
      const cityName = driver?.city_id ? cityNameMap.get(driver.city_id) : null;
      const cs = cityName ? citySettingsFullMap.get(cityName) : null;
      return {
        vatRate: cs?.vat_rate ?? fleetVatRate,
        settlementMode: cs?.settlement_mode ?? fleetSettlementMode,
        uberCalcMode: cs?.uber_calculation_mode ?? fleetUberCalcMode,
        secondaryVatRate: cs?.secondary_vat_rate ?? fleetSecondaryVatRate,
        additionalPercentRate: cs?.additional_percent_rate ?? fleetAdditionalPercentRate,
      };
    };

    const getDriverServiceFee = (driverId: string, amounts: any): number => {
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
      return 50;
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

      const isEmptyAmounts = !amounts || (typeof amounts === 'object' && Object.keys(amounts).length === 0);
      if (isEmptyAmounts) {
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

      // Get driver-specific VAT settings
      const { vatRate, settlementMode, uberCalcMode, secondaryVatRate, additionalPercentRate } = getDriverSettings(settlement.driver_id);
      
      // Check B2B status
      const driver = driverMap.get(settlement.driver_id);
      const isB2BDriver = driver?.payment_method === 'b2b' || driver?.billing_method === 'b2b' || driver?.b2b_enabled === true;
      const isB2BVatPayer = isB2BDriver && driver?.b2b_vat_payer === true;
      const effectiveVatRate = isB2BVatPayer ? 0 : vatRate;

      const uberBase = Number(amounts?.uber_base || 0);
      const uberPayoutD = Number(amounts?.uber_payout_d || 0);
      const uberGrossTotal = Number(amounts?.uber_gross_total || 0);
      const boltBase = getEffectiveBoltBase(amounts);
      const freenowBase = Number(amounts?.freenow_base_s || 0);
      const totalBase = uberBase + boltBase + freenowBase;

      const totalCashRaw = Number(amounts?.uber_cash_f || 0) + Number(amounts?.bolt_cash || 0) + Number(amounts?.freenow_cash_f || 0);
      const totalCommissionRaw = Number(amounts?.uber_commission || 0) + Number(amounts?.bolt_commission || 0) + Number(amounts?.freenow_commission_t || 0);
      
      const hasPositivePlatformActivity =
        Math.max(0, uberBase) + Math.max(0, boltBase) + Math.max(0, freenowBase) + Math.max(0, totalCashRaw) > 0.01;
      
      const boltPayoutS = Number(amounts?.bolt_payout_s || 0);
      const isBoltAdjustmentOnly =
        !hasPositivePlatformActivity &&
        boltPayoutS < -0.01 &&
        Math.abs(boltBase - boltPayoutS) < 0.01 &&
        Math.abs(totalCashRaw) < 0.01 &&
        Math.abs(totalCommissionRaw) < 0.01;
      
      const isNegativeAdjustmentOnly =
        !hasPositivePlatformActivity &&
        totalBase < -0.01 &&
        Math.abs(totalCashRaw) < 0.01 &&
        Math.abs(totalCommissionRaw) < 0.01;

      const fuel = Number(amounts?.fuel || 0);
      const fuelVatRefund = Number(amounts?.fuel_vat_refund || 0);
      const manualAdj = Number(amounts?.manual_week_adjustment || 0);

      // === CALCULATE VAT BASED ON SETTLEMENT MODE ===
      let vatAmount = 0;
      let secondaryVatAmount = 0;

      if (settlementMode === 'dual_tax') {
        // Combined VAT% + Additional% from Bolt D
        const combinedVatRate = effectiveVatRate + additionalPercentRate;
        const boltVatEf = isB2BVatPayer ? 0 : Math.max(0, boltBase) * (combinedVatRate / 100);
        
        // Secondary 23% VAT on campaigns(I) + returns(J) + cancellations(K)
        const boltI = Math.abs(Number(amounts?.bolt_col_i || 0));
        const boltJ = Math.abs(Number(amounts?.bolt_col_j || 0));
        const boltK = Math.abs(Number(amounts?.bolt_col_k || 0));
        secondaryVatAmount = isB2BVatPayer ? 0 : round2((boltI + boltJ + boltK) * (secondaryVatRate / 100));

        // Uber VAT in dual_tax: use uber_base * 1.25 for 'netto', uber_gross_total for 'brutto'
        const uberVatBase = uberCalcMode === 'brutto'
          ? Math.max(0, (uberGrossTotal > 0) ? uberGrossTotal : Math.max(0, uberBase) * 1.25)
          : Math.max(0, uberBase) * 1.25;
        const uberFreenowBase = uberVatBase + Math.max(0, freenowBase);
        const uberFreenowVat = isB2BVatPayer ? 0 : round2(uberFreenowBase * (effectiveVatRate / 100));

        vatAmount = round2(boltVatEf + uberFreenowVat);
      } else {
        // Single tax mode
        const uberVatBaseSingle = uberCalcMode === 'netto'
          ? Math.max(0, uberPayoutD || uberBase)
          : uberCalcMode === 'gross_total'
            ? Math.max(0, uberGrossTotal > 0 ? uberGrossTotal : uberBase * 1.25)
            : Math.max(0, uberBase);
        const adjustedVatBase = uberVatBaseSingle + Math.max(0, boltBase) + Math.max(0, freenowBase);
        vatAmount = round2(adjustedVatBase * (effectiveVatRate / 100));
      }

      // Calculate net (netto)
      const nettoCalc = totalBase - totalCommissionRaw;

      // Service fee (zero if no real activity)
      const effectiveServiceFee = (isBoltAdjustmentOnly || isNegativeAdjustmentOnly) ? 0 : getDriverServiceFee(settlement.driver_id, amounts);

      // Additional fees from fleet_settlement_fees
      const additionalFeesTotal = (isBoltAdjustmentOnly || isNegativeAdjustmentOnly) ? 0 : applicableFees.reduce((sum, fee) => {
        // Check manual override in amounts
        const manualKey = `manual_fee_${applicableFees.indexOf(fee)}`;
        const manualVal = amounts?.[manualKey];
        if (manualVal !== null && manualVal !== undefined) return sum + Number(manualVal);
        const baseAmount = fee.type === 'fixed' ? fee.amount : totalBase * (fee.amount / 100);
        return sum + baseAmount;
      }, 0);

      // Rental fee
      const manualRentalFee = amounts?.manual_rental_fee;
      let rentalFee = 0;
      if (manualRentalFee !== null && manualRentalFee !== undefined) {
        rentalFee = Number(manualRentalFee || 0);
      } else if (Number(settlement.rental_fee || 0) > 0) {
        rentalFee = Number(settlement.rental_fee || 0);
      } else if (hasPositivePlatformActivity) {
        const assignment = assignmentMap.get(settlement.driver_id);
        if (assignment?.weeklyRate) {
          rentalFee = assignment.assignedAt
            ? calculateProportionalRentForSettlement(assignment.assignedAt, settlement.period_from, settlement.period_to, assignment.weeklyRate)
            : round2(assignment.weeklyRate);
        }
      }

      if (isNegativeAdjustmentOnly || isBoltAdjustmentOnly) {
        rentalFee = 0;
      }

      // === CALCULATE PAYOUT (matching UI formula exactly) ===
      let rawPayout: number;
      
      // Check if platform_net is negative (negative balance path)
      const uberNet = Number(amounts?.uber_net || 0);
      const boltNet = Number(amounts?.bolt_net || 0);
      const freenowNet = Number(amounts?.freenow_net || 0);
      const platformNet = uberNet + boltNet + freenowNet;

      if (platformNet < 0 && !hasPositivePlatformActivity) {
        // Negative platform net path: VAT from negative amount, no fees
        const negVatAmount = platformNet * (effectiveVatRate / 100);
        rawPayout = round2(platformNet - negVatAmount - manualAdj);
      } else if (settlementMode === 'dual_tax') {
        // Dual tax: Netto - Cash - VAT(combined) - SecondaryVAT - fees - rental
        rawPayout = round2(
          nettoCalc 
          - totalCashRaw 
          - vatAmount 
          - secondaryVatAmount 
          - effectiveServiceFee 
          - additionalFeesTotal 
          - manualAdj 
          - rentalFee 
          - fuel 
          + fuelVatRefund
        );
      } else {
        // Single tax
        rawPayout = round2(
          totalBase 
          - totalCommissionRaw 
          - vatAmount 
          - effectiveServiceFee 
          - additionalFeesTotal 
          - manualAdj 
          - totalCashRaw 
          - rentalFee 
          - fuel 
          + fuelVatRefund
        );
      }

      console.log(`💰 Driver ${settlement.driver_id}: mode=${settlementMode}, base=${totalBase}, vat=${vatAmount}(${vatRate}%), secVat=${secondaryVatAmount}, svcFee=${effectiveServiceFee}, addFees=${additionalFeesTotal}, rental=${rentalFee}, rawPayout=${rawPayout}`);

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

      // Update settlement record
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
        await supabase
          .from('driver_debt_transactions')
          .delete()
          .eq('driver_id', settlement.driver_id)
          .eq('period_from', period_from)
          .eq('period_to', period_to)
          .in('type', ['debt_increase', 'debt_payment'])
          .not('settlement_id', 'is', null);

        if (rawPayout < -0.01) {
          const totalDeficit = Math.abs(rawPayout);
          const payoutWithoutRental = round2(rawPayout + rentalFee);
          const settlementDeficit = payoutWithoutRental < 0 ? round2(Math.abs(payoutWithoutRental)) : 0;
          const rentalDeficit = round2(Math.max(0, totalDeficit - settlementDeficit));

          if (settlementDeficit > 0.01) {
            await supabase.from('driver_debt_transactions').insert({
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
            });
          }

          if (rentalDeficit > 0.01) {
            await supabase.from('driver_debt_transactions').insert({
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
            });
          }
        } else if (computed.debtPayment > 0.01) {
          await supabase.from('driver_debt_transactions').insert({
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
          });
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
