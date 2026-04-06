import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { normalizePolishName, levenshtein, fuzzyMatchDriver } from './fuzzyMatch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SettlementRequest {
  period_from: string;
  period_to: string;
  city_id?: string;
  fleet_id?: string;
  main_csv?: string;
  uber_csv?: string;
  bolt_csv?: string;
  freenow_csv?: string;
}

interface PlatformData {
  driverId: string;
  // Uber
  uber_payout_d: number;
  uber_cash_f: number;
  uber_base: number;
  uber_tax_8: number;
  uber_net: number;
  // Bolt
  bolt_projected_d: number;
  bolt_payout_s: number;
  bolt_cash: number;
  bolt_commission: number;
  bolt_tax_8: number;
  bolt_net: number;
  // Bolt extra columns for dual_tax mode
  bolt_col_e: number; // Column E - Przejazdy brutto
  bolt_col_f: number; // Column F - Opłaty za anulowanie (zarobione)
  bolt_col_g: number; // Column G - Napiwki
  bolt_col_i: number; // Column I - Zarobki z kampanii (Bonusy)
  bolt_col_j: number; // Column J - Zwroty wydatków (Anulacje)
  bolt_col_k: number; // Column K - Rekompensaty
  // FreeNow
  freenow_base_s: number;
  freenow_commission_t: number;
  freenow_cash_f: number;
  freenow_tax_8: number;
  freenow_net: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    console.log('🚀 Settlements edge function started');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: SettlementRequest;
    try {
      const contentType = req.headers.get('content-type');
      console.log('📨 Content-Type:', contentType);
      console.log('📨 Request method:', req.method);
      
      const rawBody = await req.text();
      console.log('📨 Raw body length:', rawBody.length);
      
      if (!rawBody || rawBody.length === 0) {
        throw new Error('Empty request body');
      }
      
      body = JSON.parse(rawBody);
      console.log('📥 Dane odebrane:', {
        period_from: body.period_from,
        period_to: body.period_to,
        city_id: body.city_id,
        fleet_id: (body as any).fleet_id,
        has_main_csv: !!body.main_csv,
        main_csv_length: body.main_csv?.length || 0,
        has_uber_csv: !!(body as any).uber_csv,
        has_bolt_csv: !!(body as any).bolt_csv,
        has_freenow_csv: !!(body as any).freenow_csv
      });
    } catch (parseError) {
      console.error('❌ Błąd parsowania JSON:', parseError);
      throw new Error(`Failed to parse request: ${parseError.message}`);
    }

    const { period_from, period_to, city_id, main_csv, uber_csv, bolt_csv, freenow_csv } = body;
    const fleet_id = (body as any).fleet_id;

    if (!period_from || !period_to || (!city_id && !fleet_id)) {
      throw new Error('Missing required fields: period_from, period_to, and either city_id or fleet_id');
    }

    let effectiveCityId = city_id;
    if (fleet_id && !city_id) {
      const { data: fleetDriver } = await supabase
        .from('drivers')
        .select('city_id')
        .eq('fleet_id', fleet_id)
        .limit(1)
        .single();
      
      if (fleetDriver?.city_id) {
        effectiveCityId = fleetDriver.city_id;
        console.log('📍 Using city_id from fleet:', effectiveCityId);
      } else {
        const { data: defaultCity } = await supabase
          .from('cities')
          .select('id')
          .limit(1)
          .single();
        effectiveCityId = defaultCity?.id;
        console.log('📍 Using default city_id:', effectiveCityId);
      }
    }

    const has3Csvs = uber_csv || bolt_csv || freenow_csv;
    const hasMainCsv = !!main_csv;

    if (!has3Csvs && !hasMainCsv) {
      throw new Error('No CSV files provided. Upload either 3 platform CSVs or 1 RIDO template CSV');
    }

    console.log('📋 Import mode:', has3Csvs ? '3 platform CSVs' : '1 RIDO template');

  let settlementsToInsert: any[] = [];
  let newDriversCount = 0;
  let matchedDriversCount = 0;
  let unmappedDriversList: any[] = [];

  if (has3Csvs) {
    const result = await process3PlatformCsvs(
      supabase,
      { uber_csv, bolt_csv, freenow_csv },
      { period_from, period_to, city_id: effectiveCityId, fleet_id }
    );
    settlementsToInsert = result.settlements;
    newDriversCount = result.newDrivers;
    matchedDriversCount = result.matchedDrivers;
    unmappedDriversList = result.unmappedDrivers || [];
  } else if (hasMainCsv) {
    const result = await processRidoTemplate(
      supabase,
      main_csv,
      { period_from, period_to, city_id: effectiveCityId, fleet_id }
    );
    settlementsToInsert = result.settlements;
    newDriversCount = result.newDrivers;
    matchedDriversCount = result.matchedDrivers;
    unmappedDriversList = result.unmappedDrivers || [];
  }

  // Ensure debt carry-over for inactive drivers not present in imported CSV
  if (fleet_id) {
    const importedDriverIds = new Set(settlementsToInsert.map((s: any) => s.driver_id));

    const { data: fleetDrivers } = await supabase
      .from('drivers')
      .select('id')
      .eq('fleet_id', fleet_id);

    const missingDriverIds = (fleetDrivers || [])
      .map((d: any) => d.id)
      .filter((driverId: string) => !importedDriverIds.has(driverId));

    if (missingDriverIds.length > 0) {
      const [
        { data: debtsData },
        { data: previousDebtsData }
      ] = await Promise.all([
        supabase
          .from('driver_debts')
          .select('driver_id, current_balance')
          .in('driver_id', missingDriverIds),
        supabase
          .from('settlements')
          .select('driver_id, debt_after')
          .in('driver_id', missingDriverIds)
          .lt('period_to', period_from)
          .not('debt_after', 'is', null)
          .order('driver_id', { ascending: true })
          .order('period_to', { ascending: false })
          .order('updated_at', { ascending: false })
      ]);

      const debtByDriver = new Map<string, number>();
      (debtsData || []).forEach((row: any) => {
        debtByDriver.set(row.driver_id, Math.max(0, row.current_balance || 0));
      });

      const previousDebtByDriver = new Map<string, number>();
      (previousDebtsData || []).forEach((row: any) => {
        if (!previousDebtByDriver.has(row.driver_id)) {
          previousDebtByDriver.set(row.driver_id, Math.max(0, row.debt_after || 0));
        }
      });

      const carryOverSettlements = missingDriverIds
        .map((driverId: string) => {
          const carryDebt = Math.max(
            debtByDriver.get(driverId) || 0,
            previousDebtByDriver.get(driverId) || 0
          );

          if (carryDebt <= 0.01) return null;

          return {
            city_id: effectiveCityId,
            driver_id: driverId,
            platform: 'main',
            period_from,
            period_to,
            week_start: period_from,
            week_end: period_to,
            total_earnings: 0,
            commission_amount: 0,
            net_amount: 0,
            rental_fee: 0,
            amounts: {},
            source: 'debt_carryover',
            raw_row_id: `carry_${period_from}_${fleet_id}_${driverId}`
          };
        })
        .filter(Boolean);

      if (carryOverSettlements.length > 0) {
        console.log(`↪️ Added ${carryOverSettlements.length} debt carry-over settlements for inactive drivers`);
        settlementsToInsert = [...settlementsToInsert, ...carryOverSettlements];
      }
    }
  }

    if (settlementsToInsert.length > 0) {
      console.log(`💾 Zapisuję ${settlementsToInsert.length} rozliczeń...`);
      const { data: insertedSettlements, error } = await supabase
        .from('settlements')
        .upsert(settlementsToInsert, { 
          onConflict: 'raw_row_id',
          ignoreDuplicates: false
        })
        .select('id, driver_id, period_from, period_to');
      if (error) {
        console.error('❌ Błąd upsert:', error);
        throw error;
      }
      console.log('✅ Rozliczenia zapisane');
      
      if (insertedSettlements && insertedSettlements.length > 0) {
        console.log('💳 Aktualizuję zadłużenia kierowców...');
        
        const settlementsByDriver = new Map<string, any[]>();
        for (const settlement of insertedSettlements) {
          if (!settlementsByDriver.has(settlement.driver_id)) {
            settlementsByDriver.set(settlement.driver_id, []);
          }
          settlementsByDriver.get(settlement.driver_id)!.push(settlement);
        }
        
        for (const [driverId, driverSettlements] of settlementsByDriver.entries()) {
          for (const settlement of driverSettlements) {
            const { data: fullSettlement } = await supabase
              .from('settlements')
              .select('*')
              .eq('id', settlement.id)
              .single();
            
            if (fullSettlement) {
              const amounts = fullSettlement.amounts || {};
              
              // Calculate total base and cash
              const totalBase = (amounts.uber_base || 0) + (amounts.bolt_projected_d || 0) + (amounts.freenow_base_s || 0);
              const totalCash = (amounts.uber_cash_f || 0) + (amounts.bolt_cash || 0) + (amounts.freenow_cash_f || 0);
              const totalCommission = (amounts.uber_commission || 0) + (amounts.bolt_commission || 0) + (amounts.freenow_commission_t || 0);
              
              // Always pass through debt function, even for inactive drivers,
              // so debt carry-over is preserved week-to-week.
              const hasAnyActivity = totalBase !== 0 || totalCash !== 0;
              if (!hasAnyActivity) {
                console.log(`⏭️ Driver ${driverId}: no activity, forcing debt carry-over sync`);
              }

              // VAT 8% on base
              const vat8 = totalBase * 0.08;
              
              // Fuel and refund from amounts
              const fuel = amounts.fuel || 0;
              const fuelVatRefund = amounts.fuel_vat_refund || 0;
              
              // Use actual service fee from settlement, or fleet base_fee, fallback to 0
              // The frontend saves the actual fee to the settlement record
              const serviceFee = fullSettlement.service_fee || 0;
              
              // Rental from settlement
              const rentalFee = fullSettlement.rental_fee || 0;
              
              // Final payout = Base - Commission - VAT - Service Fee - Rental - Cash - Fuel + Fuel VAT Refund
              const calculatedPayout = totalBase - totalCommission - vat8 - serviceFee - rentalFee - totalCash - fuel + fuelVatRefund;
              
              console.log(`📊 Driver ${driverId}: base=${totalBase}, cash=${totalCash}, vat=${vat8}, service=${serviceFee}, rental=${rentalFee}, fuel=${fuel}, fuelRefund=${fuelVatRefund}, payout=${calculatedPayout}`);
              
              try {
                const debtResponse = await fetch(`${supabaseUrl}/functions/v1/update-driver-debt`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`
                  },
                  body: JSON.stringify({
                    driver_id: driverId,
                    settlement_id: settlement.id,
                    period_from: settlement.period_from,
                    period_to: settlement.period_to,
                    calculated_payout: calculatedPayout
                  })
                });
                
                if (!debtResponse.ok) {
                  console.error(`⚠️ Nie udało się zaktualizować długu dla kierowcy ${driverId}`);
                }
              } catch (debtError) {
                console.error(`⚠️ Błąd aktualizacji długu dla kierowcy ${driverId}:`, debtError);
              }
            }
          }
        }
        
        console.log('✅ Zadłużenia zaktualizowane');
      }
    }

    const { data: settlementPeriod, error: periodError } = await supabase
      .from('settlement_periods')
      .insert({
        city_id: effectiveCityId,
        week_start: period_from,
        week_end: period_to,
        status: 'robocze',
      })
      .select()
      .single();

    if (periodError) throw periodError;

    const duration = Date.now() - startTime;
    console.log('✅ ZAKOŃCZONO:', { 
      processed: settlementsToInsert.length,
      newDrivers: newDriversCount,
      matched: matchedDriversCount,
      duration_ms: duration
    });

    return new Response(
      JSON.stringify({
        success: true,
        settlement_period_id: settlementPeriod.id,
        stats: {
          processed: settlementsToInsert.length,
          new_drivers: newDriversCount,
          matched_drivers: matchedDriversCount,
          unmapped_drivers: unmappedDriversList
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('💥 ERROR:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ========== MODE 1: PROCESS 3 PLATFORM CSVs ==========
async function process3PlatformCsvs(
  supabase: any,
  csvFiles: { uber_csv?: string; bolt_csv?: string; freenow_csv?: string },
  meta: { period_from: string; period_to: string; city_id: string; fleet_id?: string }
) {
  console.log('🎯 Processing 3 platform CSVs...');

  const driverDataMap = new Map<string, PlatformData>();
  const existingDriversMap = new Map<string, any>();

  let driversQuery = supabase
    .from('drivers')
    .select('id, email, phone, getrido_id, first_name, last_name, driver_platform_ids(platform, platform_id)');
  
  if (meta.fleet_id) {
    driversQuery = driversQuery.eq('fleet_id', meta.fleet_id);
  } else {
    driversQuery = driversQuery.eq('city_id', meta.city_id);
  }
  
  const { data: existingDrivers } = await driversQuery;

  existingDrivers?.forEach((driver: any) => {
    if (driver.phone) existingDriversMap.set(`phone:${driver.phone.trim()}`, driver);
    if (driver.getrido_id) existingDriversMap.set(`getrido:${driver.getrido_id.trim()}`, driver);
    if (Array.isArray(driver.driver_platform_ids)) {
      driver.driver_platform_ids.forEach((pid: any) => {
        existingDriversMap.set(`${pid.platform}:${pid.platform_id.trim()}`, driver);
      });
    }
    
    // Index by full name (for fuzzy matching)
    const fullName = `${driver.first_name || ''} ${driver.last_name || ''}`.trim().toLowerCase();
    if (fullName && fullName.length > 1) {
      existingDriversMap.set(`name:${fullName}`, driver);
    }
  });

  let newDrivers = 0;
  let matchedDrivers = 0;
  let unmappedDrivers: any[] = [];

  if (csvFiles.uber_csv) {
    const result = await parseUberCsv(csvFiles.uber_csv, supabase, meta.city_id, meta.fleet_id, existingDriversMap, driverDataMap);
    newDrivers += result.newDrivers;
    matchedDrivers += result.matchedDrivers;
    unmappedDrivers = unmappedDrivers.concat(result.unmappedDrivers || []);
  }

  if (csvFiles.bolt_csv) {
    const result = await parseBoltCsv(csvFiles.bolt_csv, supabase, meta.city_id, meta.fleet_id, existingDriversMap, driverDataMap);
    newDrivers += result.newDrivers;
    matchedDrivers += result.matchedDrivers;
    unmappedDrivers = unmappedDrivers.concat(result.unmappedDrivers || []);
  }

  if (csvFiles.freenow_csv) {
    const result = await parseFreenowCsv(csvFiles.freenow_csv, supabase, meta.city_id, meta.fleet_id, existingDriversMap, driverDataMap);
    newDrivers += result.newDrivers;
    matchedDrivers += result.matchedDrivers;
    unmappedDrivers = unmappedDrivers.concat(result.unmappedDrivers || []);
  }

  // Fetch fuel data
  const driverIds = Array.from(driverDataMap.keys());
  console.log('⛽ Pobieranie danych paliwowych dla', driverIds.length, 'kierowców...');
  
  const { data: driversWithFuel } = await supabase
    .from('drivers')
    .select('id, fuel_card_number')
    .in('id', driverIds);
  
  const fuelCardMap = new Map<string, string>();
  driversWithFuel?.forEach((d: any) => {
    if (d.fuel_card_number) {
      fuelCardMap.set(d.id, d.fuel_card_number.replace(/^0+/, ''));
    }
  });
  console.log('⛽ Znaleziono karty paliwowe dla', fuelCardMap.size, 'kierowców');
  
  const { data: fuelTransactions } = await supabase
    .from('fuel_transactions')
    .select('card_number, total_amount')
    .gte('transaction_date', meta.period_from)
    .lte('transaction_date', meta.period_to);
  
  console.log('⛽ Znaleziono', fuelTransactions?.length || 0, 'transakcji paliwowych w okresie');
  
  const fuelByDriver = new Map<string, number>();
  for (const [driverId, cardNumber] of fuelCardMap) {
    let total = 0;
    fuelTransactions?.forEach((ft: any) => {
      const ftCardClean = ft.card_number?.replace(/^0+/, '');
      if (ftCardClean === cardNumber) {
        total += ft.total_amount || 0;
      }
    });
    if (total > 0) {
      fuelByDriver.set(driverId, total);
      console.log(`⛽ Kierowca ${driverId}: paliwo = ${total.toFixed(2)} zł`);
    }
  }

  // Create settlements
  const settlements: any[] = [];
  for (const [driverId, data] of driverDataMap.entries()) {
    const fuel = fuelByDriver.get(driverId) || 0;
    const fuel_vat_refund = fuel > 0 ? (fuel - fuel / 1.23) / 2 : 0;
    
    // Sumy
    const total_cash = (data.uber_cash_f || 0) + (data.bolt_cash || 0) + (data.freenow_cash_f || 0);
    const total_tax = (data.uber_tax_8 || 0) + (data.bolt_tax_8 || 0) + (data.freenow_tax_8 || 0);
    const total_commission = (data.bolt_commission || 0) + (data.freenow_commission_t || 0);
    const total_base = (data.uber_base || 0) + (data.bolt_projected_d || 0) + (data.freenow_base_s || 0);
    
    // POPRAWIONA FORMUŁA:
    // Wypłata = Suma bazowa - podatek - prowizja - gotówka - paliwo + VAT_zwrot
    const calculated_net = total_base - total_tax - total_commission - total_cash - fuel + fuel_vat_refund;
    
    console.log(`💰 Driver ${driverId}: base=${total_base.toFixed(2)}, tax=${total_tax.toFixed(2)}, comm=${total_commission.toFixed(2)}, cash=${total_cash.toFixed(2)}, fuel=${fuel.toFixed(2)}, vat_refund=${fuel_vat_refund.toFixed(2)}, WYPŁATA=${calculated_net.toFixed(2)}`);
    
    settlements.push({
      city_id: meta.city_id,
      driver_id: driverId,
      platform: 'main',
      period_from: meta.period_from,
      period_to: meta.period_to,
      week_start: meta.period_from,
      week_end: meta.period_to,
      total_earnings: total_base,
      commission_amount: total_commission,
      net_amount: calculated_net,
      amounts: {
        uber_payout_d: data.uber_payout_d || 0,
        uber_cash_f: data.uber_cash_f || 0,
        uber_base: data.uber_base || 0,
        uber_tax_8: data.uber_tax_8 || 0,
        uber_net: data.uber_net || 0,
        bolt_projected_d: data.bolt_projected_d || 0,
        bolt_payout_s: data.bolt_payout_s || 0,
        bolt_cash: data.bolt_cash || 0,
        bolt_commission: data.bolt_commission || 0,
        bolt_tax_8: data.bolt_tax_8 || 0,
        bolt_net: data.bolt_net || 0,
        bolt_col_e: data.bolt_col_e || 0,
        bolt_col_f: data.bolt_col_f || 0,
        bolt_col_g: data.bolt_col_g || 0,
        bolt_col_i: data.bolt_col_i || 0,
        bolt_col_j: data.bolt_col_j || 0,
        bolt_col_k: data.bolt_col_k || 0,
        freenow_base_s: data.freenow_base_s || 0,
        freenow_commission_t: data.freenow_commission_t || 0,
        freenow_cash_f: data.freenow_cash_f || 0,
        freenow_tax_8: data.freenow_tax_8 || 0,
        freenow_net: data.freenow_net || 0,
        fuel: fuel,
        fuel_vat_refund: fuel_vat_refund,
        total_cash: total_cash,
        total_tax: total_tax,
        total_commission: total_commission
      },
      source: '3_platform_csvs',
      raw_row_id: `combined_${meta.period_from}_${meta.fleet_id || meta.city_id || 'all'}_${driverId}`
    });
  }

  return { settlements, newDrivers, matchedDrivers, unmappedDrivers };
}

// ========== MODE 2: PROCESS RIDO TEMPLATE ==========
async function processRidoTemplate(
  supabase: any,
  main_csv: string,
  meta: { period_from: string; period_to: string; city_id: string; fleet_id?: string }
) {
  console.log('🎯 Processing RIDO template...');

  const uint8Array = Uint8Array.from(atob(main_csv), c => c.charCodeAt(0));
  const csvText = new TextDecoder('utf-8').decode(uint8Array);
  const parsedRows = parseCSV(csvText);

  if (parsedRows.length < 2) {
    throw new Error('CSV jest pusty lub ma tylko nagłówki');
  }

  const headers = parsedRows[0].map(h => h.toLowerCase().trim());
  
  const emailIdx = headers.findIndex(h => h.includes('adres mailowy'));
  const uberIdIdx = headers.findIndex(h => h.includes('id uber'));
  const phoneIdx = headers.findIndex(h => h.includes('nr tel'));
  const fullNameIdx = headers.findIndex(h => h.includes('imie nazwisko'));
  const getRidoIdIdx = headers.findIndex(h => h.includes('getrido id'));

  // Kolumny wg screenshota z arkusza RIDO:
  // E = Imię i Nazwisko (index 4)
  // F = D UBER Wypłacono ci (index 5)
  // G = F UBER Gotówka (index 6)
  // H = D BOLT Zarobki brutto (index 7)
  // I = G BOLT Gotówka (index 8)
  // J = S BOLT Projected payout (index 9)
  // K = F FreeNow Gotówka (index 10)
  // L = S FreeNow Zarobki (index 11)
  // M = T FreeNow Prowizja (index 12)
  // P = Paliwo (index 15)
  // U = VAT zwrot (index 20)

  // Helper: findIndex returns -1 when not found; use fallback index safely
  const safeIdx = (idx: number, fallback: number) => idx >= 0 ? idx : fallback;

  const uberPayoutDIdx = safeIdx(headers.findIndex(h => h.includes('d uber wyplacono') || h.includes('d uber wypłacono')), 5);
  const uberCashFIdx = safeIdx(headers.findIndex(h => h.includes('f uber') && h.includes('gotow')), 6);
  const boltProjectedDIdx = safeIdx(headers.findIndex(h => h.includes('d bolt')), 7);
  const boltCashIdx = safeIdx(headers.findIndex(h => h.includes('g bolt') && h.includes('gotow')), 8);
  const boltPayoutSIdx = safeIdx(headers.findIndex(h => h.includes('s bolt')), 9);
  const freenowCashFIdx = safeIdx(headers.findIndex(h => h.includes('f freenow') || (h.includes('freenow') && h.includes('gotow'))), 10);
  const freenowBaseSIdx = safeIdx(headers.findIndex(h => h.includes('s freenow') || (h.includes('freenow') && h.includes('zarobki'))), 11);
  const freenowCommissionTIdx = safeIdx(headers.findIndex(h => h.includes('t freenow') || (h.includes('freenow') && h.includes('prowizj'))), 12);
  const fuelIdx = safeIdx(headers.findIndex(h => h === 'paliwo' || h.includes('paliwo')), 15);
  const fuelVATRefundIdx = safeIdx(headers.findIndex(h => h.includes('vat') && h.includes('zwrot')), 20);

  // CRITICAL: Validate that base and commission don't point to the same column
  if (freenowBaseSIdx === freenowCommissionTIdx && freenowBaseSIdx >= 0) {
    console.warn(`⚠️ FreeNow base and commission resolved to same column ${freenowBaseSIdx}! Forcing commission to fallback.`);
  }

  console.log('📊 RIDO Headers:', headers.join(' | '));
  console.log('📊 RIDO Indexes:', { uberPayoutDIdx, uberCashFIdx, boltProjectedDIdx, boltCashIdx, boltPayoutSIdx, freenowCashFIdx, freenowBaseSIdx, freenowCommissionTIdx, fuelIdx, fuelVATRefundIdx });

  // Load existing drivers
  const existingDriversMap = new Map<string, any>();
  let driversQuery = supabase
    .from('drivers')
    .select('id, email, phone, getrido_id, first_name, last_name, driver_platform_ids(platform, platform_id)');
  
  if (meta.fleet_id) {
    driversQuery = driversQuery.eq('fleet_id', meta.fleet_id);
  } else {
    driversQuery = driversQuery.eq('city_id', meta.city_id);
  }
  
  const { data: existingDrivers } = await driversQuery;

  existingDrivers?.forEach((driver: any) => {
    if (driver.phone) existingDriversMap.set(`phone:${driver.phone.trim()}`, driver);
    if (driver.getrido_id) existingDriversMap.set(`getrido:${driver.getrido_id.trim()}`, driver);
    if (Array.isArray(driver.driver_platform_ids)) {
      driver.driver_platform_ids.forEach((pid: any) => {
        existingDriversMap.set(`${pid.platform}:${pid.platform_id.trim()}`, driver);
      });
    }
  });

  const settlements: any[] = [];
  let newDrivers = 0;
  let matchedDrivers = 0;
  const unmappedDrivers: any[] = [];

  for (let i = 1; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if (row.every(cell => !cell || cell.trim() === '')) continue;

    const rowData = {
      email: row[emailIdx] || '',
      uberId: row[uberIdIdx]?.trim() || '',
      phone: row[phoneIdx]?.trim() || '',
      fullName: getColValue(row, fullNameIdx, 4).trim() || 'Nieznany Kierowca',
      getRidoId: getColValue(row, getRidoIdIdx, 23).trim() || '',
    };

    // Parsowanie wartości z CSV - use detected indexes directly (no double fallback)
    const uber_payout_d = parsePLNumber(row[uberPayoutDIdx] || '0');
    const uber_cash_f = Math.abs(parsePLNumber(row[uberCashFIdx] || '0'));
    const bolt_projected_d = parsePLNumber(row[boltProjectedDIdx] || '0');
    const bolt_cash = Math.abs(parsePLNumber(row[boltCashIdx] || '0'));
    const bolt_payout_s = parsePLNumber(row[boltPayoutSIdx] || '0');
    const freenow_cash_f = Math.abs(parsePLNumber(row[freenowCashFIdx] || '0'));
    const freenow_base_s = parsePLNumber(row[freenowBaseSIdx] || '0');
    // CRITICAL: If commission index == base index, it's a detection error - use 0
    const freenow_commission_t = (freenowCommissionTIdx !== freenowBaseSIdx) 
      ? parsePLNumber(row[freenowCommissionTIdx] || '0') 
      : 0;
    const fuel = parsePLNumber(row[fuelIdx] || '0');
    const fuelVATRefund = parsePLNumber(row[fuelVATRefundIdx] || '0');

    // ============= POPRAWIONA FORMUŁA KALKULACJI =============
    // UBER: base = D + |F| (podstawa opodatkowania = wypłata + gotówka)
    // Podatek 8% = 8% od CAŁEJ PODSTAWY (D + F)
    // Gotówka = kierowca ją pobrał od klientów, musi oddać firmie
    const uber_base = uber_payout_d + uber_cash_f;
    const uber_tax_8 = uber_base * 0.08;

    // BOLT: D=brutto, G=gotówka, S=payout
    // Prowizja Bolt = D - G - S
    const bolt_commission = bolt_projected_d > 0 ? (bolt_projected_d - bolt_cash - bolt_payout_s) : 0;
    const bolt_tax_8 = bolt_projected_d * 0.08;

    // FREENOW: S=zarobki, T=prowizja, F=gotówka
    const freenow_tax_8 = freenow_base_s * 0.08;
    
    // SUMY
    const total_base = uber_base + bolt_projected_d + freenow_base_s;
    const total_cash = uber_cash_f + bolt_cash + freenow_cash_f;
    const total_tax = uber_tax_8 + bolt_tax_8 + freenow_tax_8;
    const total_commission = bolt_commission + freenow_commission_t;

    // ============= KOŃCOWA FORMUŁA WYPŁATY =============
    // Wypłata = Suma bazowa - podatek - prowizja - gotówka - paliwo + VAT_zwrot
    const net_amount = total_base - total_tax - total_commission - total_cash - fuel + fuelVATRefund;
    
    console.log(`📊 RIDO Wiersz ${i} [${rowData.fullName}]: base=${total_base.toFixed(2)}, tax=${total_tax.toFixed(2)}, comm=${total_commission.toFixed(2)}, cash=${total_cash.toFixed(2)}, fuel=${fuel.toFixed(2)}, vat=${fuelVATRefund.toFixed(2)} => WYPŁATA=${net_amount.toFixed(2)}`);

    const beforeSize = existingDriversMap.size;
    const result = await findOrCreateDriver(
      supabase,
      rowData,
      meta.city_id,
      meta.fleet_id,
      existingDriversMap,
      headers,
      row,
      getRidoIdIdx
    );

    if (!result.driverId) continue;
    const driverId = result.driverId;

    if (result.isNew) {
      newDrivers++;
      unmappedDrivers.push({
        id: driverId,
        full_name: rowData.fullName,
        uber_id: rowData.uberId || null,
        bolt_id: null,
        freenow_id: null
      });
    } else {
      matchedDrivers++;
    }

    settlements.push({
      city_id: meta.city_id,
      driver_id: driverId,
      platform: 'main',
      period_from: meta.period_from,
      period_to: meta.period_to,
      week_start: meta.period_from,
      week_end: meta.period_to,
      total_earnings: total_base,
      commission_amount: total_commission,
      net_amount: net_amount,
      amounts: {
        uber_payout_d,
        uber_cash_f,
        uber_base,
        uber_tax_8,
        uber_net: uber_base - uber_tax_8, // Dla kompatybilności
        bolt_projected_d,
        bolt_payout_s,
        bolt_cash,
        bolt_commission,
        bolt_tax_8,
        bolt_net: bolt_projected_d - bolt_tax_8 - bolt_commission, // Dla kompatybilności
        freenow_base_s,
        freenow_commission_t,
        freenow_cash_f,
        freenow_tax_8,
        freenow_net: freenow_base_s - freenow_tax_8 - freenow_commission_t, // Dla kompatybilności
        fuel,
        fuelVATRefund,
        total_cash,
        total_tax,
        total_commission
      },
      source: 'rido_template',
      raw_row_id: `rido_${meta.period_from}_${meta.fleet_id || meta.city_id || 'all'}_${driverId}`
    });
  }

  return { settlements, newDrivers, matchedDrivers, unmappedDrivers };
}

// ========== PLATFORM CSV PARSERS ==========
async function parseUberCsv(
  base64Csv: string,
  supabase: any,
  city_id: string,
  fleet_id: string | undefined,
  existingDriversMap: Map<string, any>,
  driverDataMap: Map<string, PlatformData>
) {
  const uint8Array = Uint8Array.from(atob(base64Csv), c => c.charCodeAt(0));
  const csvText = new TextDecoder('utf-8').decode(uint8Array);
  const rows = parseCSV(csvText);

  console.log('📊 UBER CSV - liczba wierszy:', rows.length);
  const headers = rows[0].map(h => h.toLowerCase().trim());
  console.log('📊 UBER CSV - nagłówki:', JSON.stringify(headers));
  
  const payoutIdx = headers.findIndex(h => h.includes('wypłacono') || h.includes('payout') || h.includes('wyplata') || h.includes('wypłata'));
  const cashIdx = headers.findIndex(h => h.includes('gotówka') || h.includes('gotowka') || h.includes('cash'));
  const driverIdIdx = headers.findIndex(h => 
    h.includes('uuid') || 
    h.includes('identyfikator kierowc') ||
    (h.includes('driver') && h.includes('id')) || 
    h === 'id'
  );
  
  // Uber uses SEPARATE columns for first name and last name
  const firstNameIdx = headers.findIndex(h => 
    h.includes('imię') || h.includes('imie') || h.includes('first') || h === 'first_name'
  );
  const lastNameIdx = headers.findIndex(h => 
    h.includes('nazwisko') || h.includes('last') || h === 'last_name'
  );
  // Fallback: combined name column (Bolt/FreeNow style)
  const fullNameIdx = headers.findIndex(h => 
    (h.includes('name') && !h.includes('first') && !h.includes('last')) ||
    h.includes('kierowca') ||
    h.includes('driver')
  );

  console.log('📊 UBER CSV - indeksy:', { payoutIdx, cashIdx, driverIdIdx, firstNameIdx, lastNameIdx, fullNameIdx });

  let newDrivers = 0;
  let matchedDrivers = 0;
  const unmappedDrivers: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(cell => !cell?.trim())) continue;

    const uber_payout_d = parsePLNumber(row[payoutIdx] || '0');
    const uber_cash_f = Math.abs(parsePLNumber(row[cashIdx] || '0'));
    const uber_base = uber_payout_d + uber_cash_f;
    const uber_tax_8 = uber_base * 0.08;
    const uber_net = uber_base - uber_tax_8;

    let platformId = row[driverIdIdx]?.trim();
    
    // Build driver name from separate columns OR combined column
    let driverName = '';
    if (firstNameIdx !== -1 && lastNameIdx !== -1) {
      // Uber format: separate first name and last name columns
      const firstName = row[firstNameIdx]?.trim() || '';
      const lastName = row[lastNameIdx]?.trim() || '';
      driverName = `${firstName} ${lastName}`.trim();
    } else if (fullNameIdx !== -1) {
      // Bolt/FreeNow format: combined name column
      driverName = row[fullNameIdx]?.trim() || '';
    }
    
    if (platformId && platformId.includes(',') && platformId.length > 20) {
      const parts = platformId.split(',');
      platformId = parts[0]?.trim();
    }
    
    if (!platformId && !driverName) continue;

    let driverId: string | null = null;

    // 1. Try platform ID match from cache
    if (platformId && existingDriversMap.has(`uber:${platformId}`)) {
      driverId = existingDriversMap.get(`uber:${platformId}`).id;
      matchedDrivers++;
      console.log(`✅ UBER: Matched by platform ID (cache): ${platformId}`);
    }
    
    // 1b. CRITICAL: Also check database directly for platform_id (in case cache is stale)
    // BUT only match within the same fleet to prevent cross-fleet matching!
    if (!driverId && platformId) {
      // Build a query that joins platform_ids with drivers and filters by fleet
      let platformQuery = supabase
        .from('driver_platform_ids')
        .select('driver_id, drivers!inner(id, first_name, last_name, fleet_id)')
        .eq('platform', 'uber')
        .eq('platform_id', platformId);
      
      // CRITICAL: Only match drivers from the same fleet!
      if (fleet_id) {
        platformQuery = platformQuery.eq('drivers.fleet_id', fleet_id);
      }
      
      const { data: existingPlatformId } = await platformQuery.maybeSingle();
      
      if (existingPlatformId?.driver_id) {
        driverId = existingPlatformId.driver_id;
        matchedDrivers++;
        console.log(`✅ UBER: Matched by platform ID (DB lookup, same fleet): ${platformId} → ${driverId}`);
        
        // Update cache with driver info
        const driverInfo = existingPlatformId.drivers;
        if (driverInfo) {
          existingDriversMap.set(`uber:${platformId}`, { 
            id: driverInfo.id, 
            first_name: driverInfo.first_name, 
            last_name: driverInfo.last_name 
          });
        }
      }
    }
    
    // 2. Try fuzzy name matching
    if (!driverId && driverName) {
      const fuzzyResult = fuzzyMatchDriver(driverName, existingDriversMap, 50);
      if (fuzzyResult.driver && fuzzyResult.score >= 50) {
        driverId = fuzzyResult.driver.id;
        matchedDrivers++;
        console.log(`✅ UBER: Fuzzy matched "${driverName}" → "${fuzzyResult.driver.first_name} ${fuzzyResult.driver.last_name}" (score: ${fuzzyResult.score}, type: ${fuzzyResult.matchType})`);
        
        // Link platform ID to existing driver if not already linked
        if (platformId) {
          const { error: pidErr } = await supabase.from('driver_platform_ids').upsert({
            driver_id: driverId,
            platform: 'uber',
            platform_id: platformId
          }, { onConflict: 'driver_id,platform' });
          if (pidErr) console.log('⚠️ uber platform_ids upsert error:', pidErr.message);
          existingDriversMap.set(`uber:${platformId}`, fuzzyResult.driver);
        }
      }
    }

    // 3. Check by name if driver already exists in this fleet (prevent duplicates)
    if (!driverId) {
      const nameParts = driverName.split(' ');
      const firstName = nameParts[0] || 'Uber';
      const lastName = nameParts.slice(1).join(' ') || 'Driver';
      const fullName = `${firstName} ${lastName}`.trim();
      
      console.log(`🔍 UBER: No platform match for "${driverName}" (platformId: ${platformId}), checking by name in fleet...`);
      
      // CRITICAL: Check if driver with exact name already exists in this fleet
      let existingQuery = supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .ilike('first_name', firstName)
        .ilike('last_name', lastName);
      
      if (fleet_id) {
        existingQuery = existingQuery.eq('fleet_id', fleet_id);
      }
      
      const { data: existingByName } = await existingQuery.maybeSingle();
      
      if (existingByName) {
        driverId = existingByName.id;
        matchedDrivers++;
        console.log(`✅ UBER: Found existing driver by name "${fullName}" (ID: ${driverId})`);
        
        // Link platform ID to existing driver
        if (platformId) {
          const { error: pidErr } = await supabase.from('driver_platform_ids').upsert({
            driver_id: driverId,
            platform: 'uber',
            platform_id: platformId
          }, { onConflict: 'driver_id,platform' });
          if (!pidErr) {
            console.log(`✅ UBER: Linked platform_id ${platformId} to existing driver ${driverId}`);
            existingDriversMap.set(`uber:${platformId}`, existingByName);
          }
        }
      }
    }
    
    // 4. Create NEW driver ONLY if no match by platform ID or name
    if (!driverId) {
      const nameParts = driverName.split(' ');
      const firstName = nameParts[0] || 'Uber';
      const lastName = nameParts.slice(1).join(' ') || 'Driver';
      const fullName = `${firstName} ${lastName}`.trim();
      
      console.log(`🆕 UBER: Creating new driver "${fullName}" (platformId: ${platformId})...`);
      
      const { data: newDriver, error: insertError } = await supabase
        .from('drivers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          city_id: city_id,
          fleet_id: fleet_id || null
        })
        .select('id')
        .single();
      
      if (insertError) {
        console.error(`❌ UBER: Failed to create driver "${fullName}":`, insertError);
      } else if (newDriver) {
        driverId = newDriver.id;
        newDrivers++;
        
        console.log(`🆕 UBER: NEW driver created: ${fullName} (ID: ${driverId}, platformId: ${platformId})`);
        
        unmappedDrivers.push({
          id: driverId,
          full_name: fullName,
          uber_id: platformId || null,
          bolt_id: null,
          freenow_id: null
        });
        
        // Save to unmapped_settlement_drivers for fleet manager to link
        // But only if not already resolved (don't reset resolved records)
        const { data: existingUnmapped } = await supabase.from('unmapped_settlement_drivers')
          .select('id, status')
          .eq('driver_id', driverId)
          .maybeSingle();
        
        if (!existingUnmapped || existingUnmapped.status !== 'resolved') {
          const { error: unmappedErr } = await supabase.from('unmapped_settlement_drivers').upsert({
            fleet_id: fleet_id || null,
            driver_id: driverId,
            full_name: fullName,
            uber_id: platformId || null,
            bolt_id: null,
            freenow_id: null,
            status: 'pending'
          }, { onConflict: 'driver_id' });
          if (unmappedErr) console.log('⚠️ unmapped_settlement_drivers upsert error:', unmappedErr.message);
        }
        
        // Link platform ID to new driver
        if (platformId) {
          const { error: pidError } = await supabase.from('driver_platform_ids').insert({
            driver_id: driverId,
            platform: 'uber',
            platform_id: platformId
          });
          if (pidError) {
            console.log('⚠️ UBER: Failed to insert platform_id:', pidError.message);
          } else {
            console.log(`✅ UBER: Linked platform_id ${platformId} to driver ${driverId}`);
            existingDriversMap.set(`uber:${platformId}`, { id: driverId, first_name: firstName, last_name: lastName });
          }
        }
      } else {
        console.error(`❌ UBER: newDriver is null for "${fullName}"`);
      }
    }

    if (driverId) {
      const existing = driverDataMap.get(driverId) || createEmptyPlatformData(driverId);
      existing.uber_payout_d = uber_payout_d;
      existing.uber_cash_f = uber_cash_f;
      existing.uber_base = uber_base;
      existing.uber_tax_8 = uber_tax_8;
      existing.uber_net = uber_net;
      driverDataMap.set(driverId, existing);
    }
  }

  return { newDrivers, matchedDrivers, unmappedDrivers };
}

async function parseBoltCsv(
  base64Csv: string,
  supabase: any,
  city_id: string,
  fleet_id: string | undefined,
  existingDriversMap: Map<string, any>,
  driverDataMap: Map<string, PlatformData>
) {
  const uint8Array = Uint8Array.from(atob(base64Csv), c => c.charCodeAt(0));
  const csvText = new TextDecoder('utf-8').decode(uint8Array);
  const rows = parseCSV(csvText);

  console.log('📊 BOLT CSV - liczba wierszy:', rows.length);
  const headers = rows[0].map(h => h.toLowerCase().trim());
  
  const projectedIdx = headers.findIndex(h => h.includes('brutto') || h.includes('gross') || h.includes('total'));
  const payoutIdx = headers.findIndex(h => h.includes('payout') || h.includes('wypłat') || h.includes('projected'));
  const cashIdx = headers.findIndex(h => h.includes('gotówka') || h.includes('cash'));
  const driverIdIdx = headers.findIndex(h => h.includes('driver') && h.includes('id'));
  const driverNameIdx = headers.findIndex(h => h.includes('name') || h.includes('imię') || h.includes('kierowca'));
  // Bolt CSV: Column A = name, Column B = email, Column C = phone
  const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail') || h.includes('adres email') || h.includes('mail'));
  const phoneIdx = headers.findIndex(h => h.includes('telefon') || h.includes('phone') || h.includes('numer telefonu') || h.includes('nr telefonu'));
  console.log('📊 BOLT CSV - indeksy:', { projectedIdx, payoutIdx, cashIdx, driverIdIdx, driverNameIdx, emailIdx, phoneIdx });

  let newDrivers = 0;
  let matchedDrivers = 0;
  const unmappedDrivers: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(cell => !cell?.trim())) continue;

    const bolt_projected_d = parsePLNumber(row[projectedIdx] || '0');
    const bolt_payout_s = parsePLNumber(row[payoutIdx] || '0');
    const bolt_cash = Math.abs(parsePLNumber(row[cashIdx] || '0'));
    const bolt_commission = bolt_projected_d > 0 ? (bolt_projected_d - bolt_cash - bolt_payout_s) : 0;
    const bolt_tax_8 = bolt_projected_d * 0.08;
    const bolt_net = bolt_projected_d - bolt_tax_8 - bolt_commission;
    
    // Extra columns for dual_tax mode (0-indexed: E=4, F=5, G=6, I=8, J=9, K=10)
    const bolt_col_e = parsePLNumber(row[4] || '0');
    const bolt_col_f = parsePLNumber(row[5] || '0');
    const bolt_col_g = parsePLNumber(row[6] || '0'); // Napiwki (tips)
    const bolt_col_i = parsePLNumber(row[8] || '0');
    const bolt_col_j = parsePLNumber(row[9] || '0');
    const bolt_col_k = parsePLNumber(row[10] || '0');

    const platformId = row[driverIdIdx]?.trim();
    const driverName = row[driverNameIdx]?.trim() || '';
    // Extract email and phone from Bolt CSV for matching
    const boltEmail = emailIdx !== -1 ? (row[emailIdx]?.trim() || '') : '';
    const boltPhone = phoneIdx !== -1 ? (row[phoneIdx]?.trim() || '') : '';
    
    if (!platformId && !driverName && !boltPhone) continue;

    let driverId: string | null = null;

    // 1. Try platform ID match from cache
    if (platformId && existingDriversMap.has(`bolt:${platformId}`)) {
      driverId = existingDriversMap.get(`bolt:${platformId}`).id;
      matchedDrivers++;
      console.log(`✅ BOLT: Matched by platform ID (cache): ${platformId}`);
    }
    
    // 1b. Check database directly for platform_id
    if (!driverId && platformId) {
      let platformQuery = supabase
        .from('driver_platform_ids')
        .select('driver_id, drivers!inner(id, first_name, last_name, fleet_id)')
        .eq('platform', 'bolt')
        .eq('platform_id', platformId);
      
      if (fleet_id) {
        platformQuery = platformQuery.eq('drivers.fleet_id', fleet_id);
      }
      
      const { data: existingPlatformId } = await platformQuery.maybeSingle();
      
      if (existingPlatformId?.driver_id) {
        driverId = existingPlatformId.driver_id;
        matchedDrivers++;
        console.log(`✅ BOLT: Matched by platform ID (DB lookup, same fleet): ${platformId} → ${driverId}`);
        
        const driverInfo = existingPlatformId.drivers;
        if (driverInfo) {
          existingDriversMap.set(`bolt:${platformId}`, { 
            id: driverInfo.id, 
            first_name: driverInfo.first_name, 
            last_name: driverInfo.last_name 
          });
        }
      }
    }

    // 1c. CRITICAL: Match by PHONE NUMBER from Bolt CSV (most stable identifier)
    if (!driverId && boltPhone) {
      // Check cache first
      if (existingDriversMap.has(`phone:${boltPhone}`)) {
        const matched = existingDriversMap.get(`phone:${boltPhone}`);
        driverId = matched.id;
        matchedDrivers++;
        console.log(`✅ BOLT: Matched by phone (cache): ${boltPhone} → ${matched.first_name} ${matched.last_name}`);
        
        // Also save bolt platform ID for future fast lookups
        const boltPid = platformId || boltPhone;
        const { error: pidErr1 } = await supabase.from('driver_platform_ids').upsert({
          driver_id: driverId,
          platform: 'bolt',
          platform_id: boltPid
        }, { onConflict: 'driver_id,platform' });
        if (pidErr1) console.log('⚠️ bolt platform_ids upsert error:', pidErr1.message);
        existingDriversMap.set(`bolt:${boltPid}`, matched);
      }
      
      // Check DB by phone
      if (!driverId) {
        let phoneQuery = supabase
          .from('drivers')
          .select('id, first_name, last_name, phone')
          .eq('phone', boltPhone);
        
        if (fleet_id) {
          phoneQuery = phoneQuery.eq('fleet_id', fleet_id);
        }
        
        const { data: phoneMatch } = await phoneQuery.maybeSingle();
        
        if (phoneMatch) {
          driverId = phoneMatch.id;
          matchedDrivers++;
          console.log(`✅ BOLT: Matched by phone (DB): ${boltPhone} → ${phoneMatch.first_name} ${phoneMatch.last_name}`);
          
          existingDriversMap.set(`phone:${boltPhone}`, phoneMatch);
          const boltPid = platformId || boltPhone;
          const { error: pidErr2 } = await supabase.from('driver_platform_ids').upsert({
            driver_id: driverId,
            platform: 'bolt',
            platform_id: boltPid
          }, { onConflict: 'driver_id,platform' });
          if (pidErr2) console.log('⚠️ bolt platform_ids upsert error:', pidErr2.message);
          existingDriversMap.set(`bolt:${boltPid}`, phoneMatch);
        }
      }
    }

    // 1d. Match by EMAIL from Bolt CSV
    if (!driverId && boltEmail) {
      let emailQuery = supabase
        .from('drivers')
        .select('id, first_name, last_name, email')
        .ilike('email', boltEmail);
      
      if (fleet_id) {
        emailQuery = emailQuery.eq('fleet_id', fleet_id);
      }
      
      const { data: emailMatch } = await emailQuery.maybeSingle();
      
      if (emailMatch) {
        driverId = emailMatch.id;
        matchedDrivers++;
        console.log(`✅ BOLT: Matched by email (DB): ${boltEmail} → ${emailMatch.first_name} ${emailMatch.last_name}`);
        
        if (boltPhone) existingDriversMap.set(`phone:${boltPhone}`, emailMatch);
        const boltPid = platformId || boltPhone || boltEmail;
        const { error: pidErr3 } = await supabase.from('driver_platform_ids').upsert({
          driver_id: driverId,
          platform: 'bolt',
          platform_id: boltPid
        }, { onConflict: 'driver_id,platform' });
        if (pidErr3) console.log('⚠️ bolt platform_ids upsert error:', pidErr3.message);
        existingDriversMap.set(`bolt:${boltPid}`, emailMatch);
      }
    }
    
    // 2. Try fuzzy name matching
    if (!driverId && driverName) {
      const fuzzyResult = fuzzyMatchDriver(driverName, existingDriversMap, 50);
      if (fuzzyResult.driver && fuzzyResult.score >= 50) {
        driverId = fuzzyResult.driver.id;
        matchedDrivers++;
        console.log(`✅ BOLT: Fuzzy matched "${driverName}" → "${fuzzyResult.driver.first_name} ${fuzzyResult.driver.last_name}" (score: ${fuzzyResult.score}, type: ${fuzzyResult.matchType})`);
        
        const boltPid = platformId || boltPhone || null;
        if (boltPid) {
          const { error: pidErr } = await supabase.from('driver_platform_ids').upsert({
            driver_id: driverId,
            platform: 'bolt',
            platform_id: boltPid
          }, { onConflict: 'driver_id,platform' });
          if (pidErr) console.log('⚠️ bolt platform_ids upsert error:', pidErr.message);
          existingDriversMap.set(`bolt:${boltPid}`, fuzzyResult.driver);
        }
        // Save phone mapping for future lookups
        if (boltPhone) existingDriversMap.set(`phone:${boltPhone}`, fuzzyResult.driver);
      }
    }

    // 3. Check by name if driver already exists in this fleet (prevent duplicates)
    if (!driverId && driverName) {
      const nameParts = driverName.split(' ');
      const firstName = nameParts[0] || 'Bolt';
      const lastName = nameParts.slice(1).join(' ') || 'Driver';
      
      let existingQuery = supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .ilike('first_name', firstName)
        .ilike('last_name', lastName);
      
      if (fleet_id) {
        existingQuery = existingQuery.eq('fleet_id', fleet_id);
      }
      
      const { data: existingByName } = await existingQuery.maybeSingle();
      
      if (existingByName) {
        driverId = existingByName.id;
        matchedDrivers++;
        console.log(`✅ BOLT: Found existing driver by name "${firstName} ${lastName}" (ID: ${driverId})`);
        
        const boltPid = platformId || boltPhone || null;
        if (boltPid) {
          const { error: pidErr } = await supabase.from('driver_platform_ids').upsert({
            driver_id: driverId,
            platform: 'bolt',
            platform_id: boltPid
          }, { onConflict: 'driver_id,platform' });
          if (!pidErr) {
            existingDriversMap.set(`bolt:${boltPid}`, existingByName);
          }
        }
        // Update phone on driver record if missing
        if (boltPhone && !existingByName.phone) {
          await supabase.from('drivers').update({ phone: boltPhone }).eq('id', driverId);
        }
        if (boltPhone) existingDriversMap.set(`phone:${boltPhone}`, existingByName);
      }
    }
    
    // 4. Create NEW driver ONLY if no match by platform ID, phone, email or name
    if (!driverId) {
      const nameParts = driverName.split(' ');
      const firstName = nameParts[0] || 'Bolt';
      const lastName = nameParts.slice(1).join(' ') || 'Driver';
      
      // Use phone as Bolt platform ID if no driver ID column
      const boltPlatformId = platformId || boltPhone || null;
      
      const driverInsertData: any = {
        first_name: firstName,
        last_name: lastName,
        city_id: city_id,
        fleet_id: fleet_id || null
      };
      if (boltEmail) driverInsertData.email = boltEmail;
      if (boltPhone) driverInsertData.phone = boltPhone;
      
      const { data: newDriver, error } = await supabase
        .from('drivers')
        .insert(driverInsertData)
        .select('id')
        .single();
      
      if (!error && newDriver) {
        driverId = newDriver.id;
        newDrivers++;
        
        const fullName = `${firstName} ${lastName}`;
        console.log(`🆕 BOLT: Created new driver: ${fullName} (ID: ${driverId}, email: ${boltEmail}, phone: ${boltPhone})`);
        
        unmappedDrivers.push({
          id: driverId,
          full_name: fullName,
          uber_id: null,
          bolt_id: boltPlatformId,
          freenow_id: null
        });
        
        // Save to unmapped_settlement_drivers only if not already resolved
        const { data: existingUnmappedBolt } = await supabase.from('unmapped_settlement_drivers')
          .select('id, status')
          .eq('driver_id', driverId)
          .maybeSingle();
        
        if (!existingUnmappedBolt || existingUnmappedBolt.status !== 'resolved') {
          const { error: unmappedErr } = await supabase.from('unmapped_settlement_drivers').upsert({
            fleet_id: fleet_id || null,
            driver_id: driverId,
            full_name: fullName,
            uber_id: null,
            bolt_id: boltPlatformId,
            freenow_id: null,
            status: 'pending'
          }, { onConflict: 'driver_id' });
          if (unmappedErr) console.log('⚠️ unmapped_settlement_drivers upsert error:', unmappedErr.message);
        }
        
        // Save Bolt platform ID (phone number or driver ID)
        if (boltPlatformId) {
          const { error: pidErr } = await supabase.from('driver_platform_ids').insert({
            driver_id: driverId,
            platform: 'bolt',
            platform_id: boltPlatformId
          });
          if (pidErr) console.log('⚠️ bolt platform_ids insert error:', pidErr.message);
          else {
            existingDriversMap.set(`bolt:${boltPlatformId}`, { id: driverId, first_name: firstName, last_name: lastName });
          }
        }
        // Cache phone for future lookups within same import
        if (boltPhone) {
          existingDriversMap.set(`phone:${boltPhone}`, { id: driverId, first_name: firstName, last_name: lastName });
        }
      }
    }

    if (driverId) {
      const existing = driverDataMap.get(driverId) || createEmptyPlatformData(driverId);
      existing.bolt_projected_d = bolt_projected_d;
      existing.bolt_payout_s = bolt_payout_s;
      existing.bolt_cash = bolt_cash;
      existing.bolt_commission = bolt_commission;
      existing.bolt_tax_8 = bolt_tax_8;
      existing.bolt_net = bolt_net;
      existing.bolt_col_e = bolt_col_e;
      existing.bolt_col_f = bolt_col_f;
      existing.bolt_col_g = bolt_col_g;
      existing.bolt_col_i = bolt_col_i;
      existing.bolt_col_j = bolt_col_j;
      existing.bolt_col_k = bolt_col_k;
      driverDataMap.set(driverId, existing);
    }
  }

  return { newDrivers, matchedDrivers, unmappedDrivers };
}

async function parseFreenowCsv(
  base64Csv: string,
  supabase: any,
  city_id: string,
  fleet_id: string | undefined,
  existingDriversMap: Map<string, any>,
  driverDataMap: Map<string, PlatformData>
) {
  const uint8Array = Uint8Array.from(atob(base64Csv), c => c.charCodeAt(0));
  // Try UTF-8 first, then fallback to Windows-1250 for Polish CSVs
  let csvText = new TextDecoder('utf-8').decode(uint8Array);
  // If UTF-8 decoding produces replacement characters, try Windows-1250
  if (csvText.includes('\uFFFD')) {
    try {
      csvText = new TextDecoder('windows-1250').decode(uint8Array);
      console.log('📊 FREENOW CSV - fallback to Windows-1250 encoding');
    } catch {
      console.log('📊 FREENOW CSV - Windows-1250 decoder not available, using UTF-8');
    }
  }
  const rows = parseCSV(csvText);

  console.log('📊 FREENOW CSV - liczba wierszy:', rows.length);
  const headers = rows[0].map(h => h.toLowerCase().trim());
  // Normalize headers: strip diacritics for robust matching
  const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const headersNorm = headers.map(stripDiacritics);
  
  const baseIdx = headersNorm.findIndex(h => h.includes('zarobki') || h.includes('earnings') || h.includes('base'));
  // CRITICAL: commission column must NOT be the same as base column!
  // FreeNow CSV may have header like "Zarobki przed odliczeniem prowizji" which matches both patterns
  let commissionIdx = headersNorm.findIndex((h, idx) => {
    if (idx === baseIdx) return false; // Skip the base column
    return h.includes('prowizj') || h.includes('commission');
  });
  // If not found with exclusion, try matching specifically "prowizja" as standalone column
  if (commissionIdx < 0) {
    commissionIdx = headersNorm.findIndex((h, idx) => idx !== baseIdx && (h === 'prowizja' || h.startsWith('prowizja ') || h.includes('fee')));
  }
  // Match cash column: "gotówka", "gotowka" (stripped), "cash", "pob." (for "Pob. gotówka")
  const cashIdx = headersNorm.findIndex(h => h.includes('gotowka') || h.includes('gotówka') || h.includes('cash') || (h.includes('pob') && !h.includes('prowizj')));
  const driverIdIdx = headersNorm.findIndex(h => h.includes('driver') && h.includes('id'));
  const driverNameIdx = headersNorm.findIndex(h => h.includes('name') || h.includes('imie') || h.includes('kierowca'));
  
  console.log('📊 FREENOW CSV headers:', headers);
  console.log('📊 FREENOW CSV indexes:', { baseIdx, commissionIdx, cashIdx, driverIdIdx, driverNameIdx });

  let newDrivers = 0;
  let matchedDrivers = 0;
  const unmappedDrivers: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(cell => !cell?.trim())) continue;

    const freenow_base_s = parsePLNumber(row[baseIdx] || '0');
    const freenow_commission_t = parsePLNumber(row[commissionIdx] || '0');
    const freenow_cash_f = Math.abs(parsePLNumber(row[cashIdx] || '0'));
    const freenow_tax_8 = freenow_base_s * 0.08;
    const freenow_net = freenow_base_s - freenow_tax_8 - freenow_commission_t;

    const platformId = row[driverIdIdx]?.trim();
    const driverName = row[driverNameIdx]?.trim() || '';
    
    if (!platformId && !driverName) continue;

    let driverId: string | null = null;

    // 1. Try platform ID match from cache
    if (platformId && existingDriversMap.has(`freenow:${platformId}`)) {
      driverId = existingDriversMap.get(`freenow:${platformId}`).id;
      matchedDrivers++;
      console.log(`✅ FREENOW: Matched by platform ID (cache): ${platformId}`);
    }
    
    // 1b. CRITICAL: Also check database directly for platform_id (in case cache is stale)
    // BUT only match within the same fleet to prevent cross-fleet matching!
    if (!driverId && platformId) {
      let platformQuery = supabase
        .from('driver_platform_ids')
        .select('driver_id, drivers!inner(id, first_name, last_name, fleet_id)')
        .eq('platform', 'freenow')
        .eq('platform_id', platformId);
      
      // CRITICAL: Only match drivers from the same fleet!
      if (fleet_id) {
        platformQuery = platformQuery.eq('drivers.fleet_id', fleet_id);
      }
      
      const { data: existingPlatformId } = await platformQuery.maybeSingle();
      
      if (existingPlatformId?.driver_id) {
        driverId = existingPlatformId.driver_id;
        matchedDrivers++;
        console.log(`✅ FREENOW: Matched by platform ID (DB lookup, same fleet): ${platformId} → ${driverId}`);
        
        const driverInfo = existingPlatformId.drivers;
        if (driverInfo) {
          existingDriversMap.set(`freenow:${platformId}`, { 
            id: driverInfo.id, 
            first_name: driverInfo.first_name, 
            last_name: driverInfo.last_name 
          });
        }
      }
    }
    
    // 2. Try fuzzy name matching
    if (!driverId && driverName) {
      const fuzzyResult = fuzzyMatchDriver(driverName, existingDriversMap, 50);
      if (fuzzyResult.driver && fuzzyResult.score >= 50) {
        driverId = fuzzyResult.driver.id;
        matchedDrivers++;
        console.log(`✅ FREENOW: Fuzzy matched "${driverName}" → "${fuzzyResult.driver.first_name} ${fuzzyResult.driver.last_name}" (score: ${fuzzyResult.score}, type: ${fuzzyResult.matchType})`);
        
        if (platformId) {
          const { error: pidErr } = await supabase.from('driver_platform_ids').upsert({
            driver_id: driverId,
            platform: 'freenow',
            platform_id: platformId
          }, { onConflict: 'driver_id,platform' });
          if (pidErr) console.log('⚠️ freenow platform_ids upsert error:', pidErr.message);
          existingDriversMap.set(`freenow:${platformId}`, fuzzyResult.driver);
        }
      }
    }

    // 3. Create new driver if no match
    if (!driverId) {
      const nameParts = driverName.split(' ');
      const firstName = nameParts[0] || 'FreeNow';
      const lastName = nameParts.slice(1).join(' ') || 'Driver';
      
      const { data: newDriver, error } = await supabase
        .from('drivers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          city_id: city_id,
          fleet_id: fleet_id || null
        })
        .select('id')
        .single();
      
      if (!error && newDriver) {
        driverId = newDriver.id;
        newDrivers++;
        
        const fullName = `${firstName} ${lastName}`;
        console.log(`🆕 FREENOW: Created new driver: ${fullName} (ID: ${driverId})`);
        
        unmappedDrivers.push({
          id: driverId,
          full_name: fullName,
          uber_id: null,
          bolt_id: null,
          freenow_id: platformId || null
        });
        
        // Save to unmapped_settlement_drivers only if not already resolved
        const { data: existingUnmappedFN } = await supabase.from('unmapped_settlement_drivers')
          .select('id, status')
          .eq('driver_id', driverId)
          .maybeSingle();
        
        if (!existingUnmappedFN || existingUnmappedFN.status !== 'resolved') {
          const { error: unmappedErr } = await supabase.from('unmapped_settlement_drivers').upsert({
            fleet_id: fleet_id || null,
            driver_id: driverId,
            full_name: fullName,
            uber_id: null,
            bolt_id: null,
            freenow_id: platformId || null,
            status: 'pending'
          }, { onConflict: 'driver_id' });
          if (unmappedErr) console.log('⚠️ unmapped_settlement_drivers upsert error:', unmappedErr.message);
        }
        
        if (platformId) {
          const { error: pidErr } = await supabase.from('driver_platform_ids').insert({
            driver_id: driverId,
            platform: 'freenow',
            platform_id: platformId
          });
          if (pidErr) console.log('⚠️ freenow platform_ids insert error:', pidErr.message);
        }
      }
    }

    if (driverId) {
      const existing = driverDataMap.get(driverId) || createEmptyPlatformData(driverId);
      existing.freenow_base_s = freenow_base_s;
      existing.freenow_commission_t = freenow_commission_t;
      existing.freenow_cash_f = freenow_cash_f;
      existing.freenow_tax_8 = freenow_tax_8;
      existing.freenow_net = freenow_net;
      driverDataMap.set(driverId, existing);
    }
  }

  return { newDrivers, matchedDrivers, unmappedDrivers };
}

// ========== HELPER FUNCTIONS ==========
function createEmptyPlatformData(driverId: string): PlatformData {
  return {
    driverId,
    uber_payout_d: 0,
    uber_cash_f: 0,
    uber_base: 0,
    uber_tax_8: 0,
    uber_net: 0,
    bolt_projected_d: 0,
    bolt_payout_s: 0,
    bolt_cash: 0,
    bolt_commission: 0,
    bolt_tax_8: 0,
    bolt_net: 0,
    bolt_col_e: 0,
    bolt_col_f: 0,
    bolt_col_g: 0,
    bolt_col_i: 0,
    bolt_col_j: 0,
    bolt_col_k: 0,
    freenow_base_s: 0,
    freenow_commission_t: 0,
    freenow_cash_f: 0,
    freenow_tax_8: 0,
    freenow_net: 0,
  };
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const result: string[][] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((char === ',' || char === ';') && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    result.push(row);
  }
  
  return result;
}

function parsePLNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  
  let cleaned = value.replace(/[^\d,.\-]/g, '');
  
  // Handle Polish format (1 234,56)
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = parts[0].replace(/\./g, '') + '.' + parts[1];
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function getColValue(row: string[], idx: number, fallbackIdx: number): string {
  if (idx >= 0 && row[idx]) return row[idx];
  if (fallbackIdx >= 0 && row[fallbackIdx]) return row[fallbackIdx];
  return '';
}

async function findOrCreateDriver(
  supabase: any,
  rowData: { email: string; uberId: string; phone: string; fullName: string; getRidoId: string },
  city_id: string,
  fleet_id: string | undefined,
  existingDriversMap: Map<string, any>,
  headers: string[],
  row: string[],
  getRidoIdIdx: number
): Promise<{ driverId: string | null; isNew: boolean }> {
  // Try to match by various identifiers
  const lookupKeys = [
    rowData.getRidoId ? `getrido:${rowData.getRidoId}` : null,
    rowData.phone ? `phone:${rowData.phone}` : null,
    rowData.uberId ? `uber:${rowData.uberId}` : null,
  ].filter(Boolean) as string[];

  for (const key of lookupKeys) {
    if (existingDriversMap.has(key)) {
      return { driverId: existingDriversMap.get(key).id, isNew: false };
    }
  }

  // Try fuzzy name matching
  if (rowData.fullName) {
    const fuzzyResult = fuzzyMatchDriver(rowData.fullName, existingDriversMap, 50);
    if (fuzzyResult.driver && fuzzyResult.score >= 50) {
      console.log(`✅ RIDO: Fuzzy matched "${rowData.fullName}" → "${fuzzyResult.driver.first_name} ${fuzzyResult.driver.last_name}" (score: ${fuzzyResult.score})`);
      
      // Link platform ID if available
      if (rowData.uberId) {
        const { error: pidFuzzyErr } = await supabase.from('driver_platform_ids').upsert({
          driver_id: fuzzyResult.driver.id,
          platform: 'uber',
          platform_id: rowData.uberId
        }, { onConflict: 'driver_id,platform' });
        if (pidFuzzyErr) console.log('⚠️ fuzzy platform_ids upsert error:', pidFuzzyErr.message);
        existingDriversMap.set(`uber:${rowData.uberId}`, fuzzyResult.driver);
      }
      
      return { driverId: fuzzyResult.driver.id, isNew: false };
    }
  }

  // Create new driver
  const nameParts = rowData.fullName.split(' ');
  const firstName = nameParts[0] || 'Nieznany';
  const lastName = nameParts.slice(1).join(' ') || 'Kierowca';
  
  const { data: newDriver, error } = await supabase
    .from('drivers')
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: rowData.email || null,
      phone: rowData.phone || null,
      getrido_id: rowData.getRidoId || null,
      city_id: city_id,
      fleet_id: fleet_id || null,
      status: 'active'
    })
    .select('id, first_name, last_name')
    .single();

  if (error || !newDriver) {
    console.error('Error creating driver:', error);
    return { driverId: null, isNew: false };
  }

  const fullName = `${firstName} ${lastName}`;
  console.log(`🆕 RIDO: Created new driver: ${fullName} (ID: ${newDriver.id})`);

  // Save to unmapped_settlement_drivers only if not already resolved
  const { data: existingUnmappedRido } = await supabase.from('unmapped_settlement_drivers')
    .select('id, status')
    .eq('driver_id', newDriver.id)
    .maybeSingle();
  
  if (!existingUnmappedRido || existingUnmappedRido.status !== 'resolved') {
    const { error: unmappedErr } = await supabase.from('unmapped_settlement_drivers').upsert({
      fleet_id: fleet_id || null,
      driver_id: newDriver.id,
      full_name: fullName,
      uber_id: rowData.uberId || null,
      bolt_id: null,
      freenow_id: null,
      status: 'pending'
    }, { onConflict: 'driver_id' });
    if (unmappedErr) console.log('⚠️ unmapped_settlement_drivers upsert error:', unmappedErr.message);
  }

  // Add to map for future lookups
  if (rowData.phone) existingDriversMap.set(`phone:${rowData.phone}`, newDriver);
  if (rowData.getRidoId) existingDriversMap.set(`getrido:${rowData.getRidoId}`, newDriver);
  if (rowData.uberId) {
    existingDriversMap.set(`uber:${rowData.uberId}`, newDriver);
    const { error: uberPidErr } = await supabase.from('driver_platform_ids').insert({
      driver_id: newDriver.id,
      platform: 'uber',
      platform_id: rowData.uberId
    });
    if (uberPidErr) console.log('⚠️ uber platform_ids insert error:', uberPidErr.message);
  }

  return { driverId: newDriver.id, isNew: true };
}
