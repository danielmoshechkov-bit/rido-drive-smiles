import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

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
      console.log('📨 Request headers:', Object.fromEntries(req.headers.entries()));
      
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

    // Accept either city_id or fleet_id
    if (!period_from || !period_to || (!city_id && !fleet_id)) {
      throw new Error('Missing required fields: period_from, period_to, and either city_id or fleet_id');
    }

    // If fleet_id provided, get city_id from drivers in that fleet
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
        // Get a default city if no drivers in fleet yet
        const { data: defaultCity } = await supabase
          .from('cities')
          .select('id')
          .limit(1)
          .single();
        effectiveCityId = defaultCity?.id;
        console.log('📍 Using default city_id:', effectiveCityId);
      }
    }

    // Determine import mode
    const has3Csvs = uber_csv || bolt_csv || freenow_csv;
    const hasMainCsv = !!main_csv;

    if (!has3Csvs && !hasMainCsv) {
      throw new Error('No CSV files provided. Upload either 3 platform CSVs or 1 RIDO template CSV');
    }

    console.log('📋 Import mode:', has3Csvs ? '3 platform CSVs' : '1 RIDO template');

    let settlementsToInsert: any[] = [];
    let newDriversCount = 0;
    let matchedDriversCount = 0;

    // ========== MODE 1: 3 PLATFORM CSVs ==========
    if (has3Csvs) {
      const result = await process3PlatformCsvs(
        supabase,
        { uber_csv, bolt_csv, freenow_csv },
        { period_from, period_to, city_id: effectiveCityId, fleet_id }
      );
      settlementsToInsert = result.settlements;
      newDriversCount = result.newDrivers;
      matchedDriversCount = result.matchedDrivers;
    }
    // ========== MODE 2: 1 RIDO TEMPLATE ==========
    else if (hasMainCsv) {
      const result = await processRidoTemplate(
        supabase,
        main_csv,
        { period_from, period_to, city_id: effectiveCityId, fleet_id }
      );
      settlementsToInsert = result.settlements;
      newDriversCount = result.newDrivers;
      matchedDriversCount = result.matchedDrivers;
    }

    // ========== BATCH UPSERT SETTLEMENTS (ignore duplicates) ==========
    if (settlementsToInsert.length > 0) {
      console.log(`💾 Zapisuję ${settlementsToInsert.length} rozliczeń...`);
      const { data: insertedSettlements, error } = await supabase
        .from('settlements')
        .upsert(settlementsToInsert, { 
          onConflict: 'raw_row_id',
          ignoreDuplicates: true 
        })
        .select('id, driver_id, period_from, period_to');
      if (error) {
        console.error('❌ Błąd upsert:', error);
        throw error;
      }
      console.log('✅ Rozliczenia zapisane');
      
      // ========== UPDATE DRIVER DEBTS ==========
      if (insertedSettlements && insertedSettlements.length > 0) {
        console.log('💳 Aktualizuję zadłużenia kierowców...');
        
        // Grupuj settlements według kierowcy
        const settlementsByDriver = new Map<string, any[]>();
        for (const settlement of insertedSettlements) {
          if (!settlementsByDriver.has(settlement.driver_id)) {
            settlementsByDriver.set(settlement.driver_id, []);
          }
          settlementsByDriver.get(settlement.driver_id)!.push(settlement);
        }
        
        // Dla każdego kierowcy, zaktualizuj dług
        for (const [driverId, driverSettlements] of settlementsByDriver.entries()) {
          for (const settlement of driverSettlements) {
            // Pobierz pełne dane settlement aby obliczyć payout
            const { data: fullSettlement } = await supabase
              .from('settlements')
              .select('*')
              .eq('id', settlement.id)
              .single();
            
            if (fullSettlement) {
              // Oblicz calculated_payout (tu musimy zreplikować logikę z DriverSettlements)
              const amounts = fullSettlement.amounts || {};
              const calculatedPayout = (amounts.uberNet || 0) + (amounts.boltNet || 0) + (amounts.freenowNet || 0);
              
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

    // ========== KROK 7: UTWÓRZ SETTLEMENT PERIOD ==========
    const { data: settlementPeriod, error: periodError } = await supabase
      .from('settlement_periods')
      .insert({
        city_id,
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
          matched_drivers: matchedDriversCount
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

  // Load existing drivers - filter by fleet_id if provided, otherwise by city_id
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

  let newDrivers = 0;
  let matchedDrivers = 0;

  // Process each platform CSV
  if (csvFiles.uber_csv) {
    const result = await parseUberCsv(csvFiles.uber_csv, supabase, meta.city_id, existingDriversMap, driverDataMap);
    newDrivers += result.newDrivers;
    matchedDrivers += result.matchedDrivers;
  }

  if (csvFiles.bolt_csv) {
    const result = await parseBoltCsv(csvFiles.bolt_csv, supabase, meta.city_id, existingDriversMap, driverDataMap);
    newDrivers += result.newDrivers;
    matchedDrivers += result.matchedDrivers;
  }

  if (csvFiles.freenow_csv) {
    const result = await parseFreenowCsv(csvFiles.freenow_csv, supabase, meta.city_id, existingDriversMap, driverDataMap);
    newDrivers += result.newDrivers;
    matchedDrivers += result.matchedDrivers;
  }

  // ========== FETCH FUEL DATA ==========
  const driverIds = Array.from(driverDataMap.keys());
  console.log('⛽ Pobieranie danych paliwowych dla', driverIds.length, 'kierowców...');
  
  // Pobierz numery kart paliwowych
  const { data: driversWithFuel } = await supabase
    .from('drivers')
    .select('id, fuel_card_number')
    .in('id', driverIds);
  
  // Mapa: driver_id -> fuel_card_number (bez zer wiodących)
  const fuelCardMap = new Map<string, string>();
  driversWithFuel?.forEach((d: any) => {
    if (d.fuel_card_number) {
      fuelCardMap.set(d.id, d.fuel_card_number.replace(/^0+/, ''));
    }
  });
  console.log('⛽ Znaleziono karty paliwowe dla', fuelCardMap.size, 'kierowców');
  
  // Pobierz transakcje paliwowe dla okresu
  const { data: fuelTransactions } = await supabase
    .from('fuel_transactions')
    .select('card_number, total_amount')
    .gte('transaction_date', meta.period_from)
    .lte('transaction_date', meta.period_to);
  
  console.log('⛽ Znaleziono', fuelTransactions?.length || 0, 'transakcji paliwowych w okresie', meta.period_from, '-', meta.period_to);
  
  // Suma paliwa per kierowca
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

  // Combine data and create settlements
  const settlements: any[] = [];
  for (const [driverId, data] of driverDataMap.entries()) {
    const fuel = fuelByDriver.get(driverId) || 0;
    // Prawidłowy wzór: (brutto - brutto/1.23) / 2 = 50% VAT refund
    // Przykład: (422.70 - 422.70/1.23) / 2 = (422.70 - 343.66) / 2 = 79.04 / 2 = 39.52 zł
    const fuel_vat_refund = fuel > 0 ? (fuel - fuel / 1.23) / 2 : 0;
    
    // Suma gotówki do zwrotu (kierowca odebrał gotówkę od pasażerów)
    const total_cash = (data.uber_cash_f || 0) + (data.bolt_cash || 0) + (data.freenow_cash_f || 0);
    
    // POPRAWIONA FORMUŁA NET_AMOUNT:
    // = suma net z platform - gotówka do zwrotu + VAT refund - paliwo
    // Uwaga: rental_fee jest aplikowana osobno przy wypłacie
    const calculated_net = (data.uber_net || 0) + (data.bolt_net || 0) + (data.freenow_net || 0) 
                           - total_cash 
                           + fuel_vat_refund 
                           - fuel;
    
    console.log(`💰 Driver ${driverId}: uber_net=${data.uber_net?.toFixed(2)}, bolt_net=${data.bolt_net?.toFixed(2)}, freenow_net=${data.freenow_net?.toFixed(2)}, total_cash=${total_cash.toFixed(2)}, fuel=${fuel.toFixed(2)}, vat_refund=${fuel_vat_refund.toFixed(2)}, net_amount=${calculated_net.toFixed(2)}`);
    
    settlements.push({
      city_id: meta.city_id,
      driver_id: driverId,
      platform: 'main',
      period_from: meta.period_from,
      period_to: meta.period_to,
      week_start: meta.period_from,
      week_end: meta.period_to,
      total_earnings: data.uber_base + data.bolt_projected_d + data.freenow_base_s,
      commission_amount: data.freenow_commission_t + (data.bolt_commission || 0),
      net_amount: calculated_net,
      amounts: {
        uber_payout_d: data.uber_payout_d || 0,
        uber_cash_f: data.uber_cash_f || 0,
        uber_base: data.uber_base || 0,
        uber_tax_8: data.uber_tax_8 || 0,
        uber_net: data.uber_net || 0,
        uber_commission: data.uber_commission || 0,
        bolt_projected_d: data.bolt_projected_d || 0,
        bolt_payout_s: data.bolt_payout_s || 0,
        bolt_cash: data.bolt_cash || 0,
        bolt_commission: data.bolt_commission || 0,
        bolt_tax_8: data.bolt_tax_8 || 0,
        bolt_net: data.bolt_net || 0,
        freenow_base_s: data.freenow_base_s || 0,
        freenow_commission_t: data.freenow_commission_t || 0,
        freenow_cash_f: data.freenow_cash_f || 0,
        freenow_tax_8: data.freenow_tax_8 || 0,
        freenow_net: data.freenow_net || 0,
        fuel: fuel,
        fuel_vat_refund: fuel_vat_refund
      },
      source: '3_platform_csvs',
      raw_row_id: `combined_${meta.period_from}_${driverId}`
    });
  }

  return { settlements, newDrivers, matchedDrivers };
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
  
  // Column indexes
  const emailIdx = headers.findIndex(h => h.includes('adres mailowy'));
  const uberIdIdx = headers.findIndex(h => h.includes('id uber'));
  const phoneIdx = headers.findIndex(h => h.includes('nr tel'));
  const fullNameIdx = headers.findIndex(h => h.includes('imie nazwisko'));
  const getRidoIdIdx = headers.findIndex(h => h.includes('getrido id'));

  // Amount columns (H, I, J, K, M, N, O, P, U)
  const uberPayoutDIdx = headers.findIndex(h => h === 'h' || parsedRows[0][7]); // Column H
  const uberCashFIdx = headers.findIndex(h => h === 'i' || parsedRows[0][8]); // Column I
  const boltProjectedDIdx = headers.findIndex(h => h === 'j' || parsedRows[0][9]); // Column J
  const boltPayoutSIdx = headers.findIndex(h => h === 'k' || parsedRows[0][10]); // Column K
  const freenowCashFIdx = headers.findIndex(h => h === 'm' || parsedRows[0][12]); // Column M
  const freenowBaseSIdx = headers.findIndex(h => h === 'n' || parsedRows[0][13]); // Column N
  const freenowCommissionTIdx = headers.findIndex(h => h === 'o' || parsedRows[0][14]); // Column O
  const fuelIdx = headers.findIndex(h => h === 'p' || parsedRows[0][15]); // Column P
  const fuelVATRefundIdx = headers.findIndex(h => h === 'u' || parsedRows[0][20]); // Column U

  // Use actual column letters as fallback
  const getColValue = (row: string[], idx: number, fallbackIdx: number) => 
    (idx >= 0 ? row[idx] : row[fallbackIdx]) || '';

  // Load existing drivers - filter by fleet_id if provided, otherwise by city_id
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

  for (let i = 1; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if (row.every(cell => !cell || cell.trim() === '')) continue;

    const rowData = {
      email: row[emailIdx] || '',
      uberId: row[uberIdIdx]?.trim() || '',
      phone: row[phoneIdx]?.trim() || '',
      fullName: getColValue(row, fullNameIdx, 5).trim() || 'Nieznany Kierowca',
      getRidoId: getColValue(row, getRidoIdIdx, 23).trim() || '',
    };

    // Extract amounts from columns H, I, J, K, M, N, O, P, U
    const uber_payout_d = parsePLNumber(getColValue(row, uberPayoutDIdx, 7));
    const uber_cash_f = parsePLNumber(getColValue(row, uberCashFIdx, 8));
    const bolt_projected_d = parsePLNumber(getColValue(row, boltProjectedDIdx, 9));
    const bolt_payout_s = parsePLNumber(getColValue(row, boltPayoutSIdx, 10));
    const freenow_cash_f = parsePLNumber(getColValue(row, freenowCashFIdx, 12));
    const freenow_base_s = parsePLNumber(getColValue(row, freenowBaseSIdx, 13));
    const freenow_commission_t = parsePLNumber(getColValue(row, freenowCommissionTIdx, 14));
    const fuel = parsePLNumber(getColValue(row, fuelIdx, 15));
    const fuelVATRefund = parsePLNumber(getColValue(row, fuelVATRefundIdx, 20));

    // Calculate 8% tax and net amounts
    // UBER: base = D + F (payout + cash), tax = 8% od base, net = D - tax - cash
    const uber_base = uber_payout_d + uber_cash_f;
    const uber_tax_8 = uber_base * 0.08;
    const uber_net = uber_payout_d - uber_tax_8 - uber_cash_f;  // POPRAWIONE: odejmij gotówkę

    // BOLT: base = D (projected), tax = 8% od D, net = S - tax - cash
    // Gotówka Bolt jest pobierana z osobnej kolumny (G)
    const bolt_cash = 0;  // W template Bolt gotówka jest w amounts z platform CSV
    const bolt_tax_8 = bolt_projected_d * 0.08;
    const bolt_net = bolt_payout_s - bolt_tax_8 - bolt_cash;  // POPRAWIONE: odejmij gotówkę

    // FREENOW: net = S - tax - commission - cash (to było OK)
    const freenow_tax_8 = freenow_base_s * 0.08;
    const freenow_net = freenow_base_s - freenow_tax_8 - freenow_commission_t - freenow_cash_f;

    const beforeSize = existingDriversMap.size;
    const driverId = await findOrCreateDriver(
      supabase,
      rowData,
      meta.city_id,
      existingDriversMap,
      headers,
      row,
      getRidoIdIdx
    );

    if (!driverId) continue;

    if (existingDriversMap.size > beforeSize) newDrivers++;
    else matchedDrivers++;

    settlements.push({
      city_id: meta.city_id,
      driver_id: driverId,
      platform: 'main',
      period_from: meta.period_from,
      period_to: meta.period_to,
      week_start: meta.period_from,
      week_end: meta.period_to,
      total_earnings: uber_base + bolt_projected_d + freenow_base_s,
      commission_amount: freenow_commission_t,
      net_amount: uber_net + bolt_net + freenow_net + fuelVATRefund - fuel,
      amounts: {
        uber_payout_d,
        uber_cash_f,
        uber_base,
        uber_tax_8,
        uber_net,
        bolt_projected_d,
        bolt_payout_s,
        bolt_tax_8,
        bolt_net,
        freenow_base_s,
        freenow_commission_t,
        freenow_cash_f,
        freenow_tax_8,
        freenow_net,
        fuel,
        fuelVATRefund
      },
      source: 'rido_template',
      raw_row_id: `main_${meta.period_from}_row${i}`
    });
  }

  return { settlements, newDrivers, matchedDrivers };
}

// ========== PLATFORM CSV PARSERS ==========
async function parseUberCsv(
  base64Csv: string,
  supabase: any,
  city_id: string,
  existingDriversMap: Map<string, any>,
  driverDataMap: Map<string, PlatformData>
) {
  const uint8Array = Uint8Array.from(atob(base64Csv), c => c.charCodeAt(0));
  const csvText = new TextDecoder('utf-8').decode(uint8Array);
  const rows = parseCSV(csvText);

  console.log('📊 UBER CSV - liczba wierszy:', rows.length);
  const headers = rows[0].map(h => h.toLowerCase().trim());
  console.log('📊 UBER CSV - nagłówki:', JSON.stringify(headers));
  
  // More flexible header matching
  const payoutIdx = headers.findIndex(h => h.includes('wypłacono') || h.includes('payout') || h.includes('wyplata') || h.includes('wypłata'));
  const cashIdx = headers.findIndex(h => h.includes('gotówka') || h.includes('gotowka') || h.includes('cash'));
  // NAPRAWIONE: Uber CSV ma kolumnę "identyfikator uuid kierowcy" - dopasowujemy przez 'uuid' lub 'identyfikator kierowc'
  const driverIdIdx = headers.findIndex(h => 
    h.includes('uuid') || 
    h.includes('identyfikator kierowc') ||
    (h.includes('driver') && h.includes('id')) || 
    h === 'id'
  );
  const driverNameIdx = headers.findIndex(h => h.includes('name') || h.includes('imię') || h.includes('imie') || h.includes('nazwisko'));

  console.log('📊 UBER CSV - indeksy kolumn:', { payoutIdx, cashIdx, driverIdIdx, driverNameIdx });

  let newDrivers = 0;
  let matchedDrivers = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(cell => !cell?.trim())) continue;

    const uber_payout_d = parsePLNumber(row[payoutIdx] || '0');
    // Math.abs because cash in Uber CSV has minus sign (e.g. "-100" means 100 cash)
    const uber_cash_f = Math.abs(parsePLNumber(row[cashIdx] || '0'));
    const uber_base = uber_payout_d + uber_cash_f;
    const uber_tax_8 = uber_base * 0.08;
    // POPRAWIONE: uber_net = D - podatek - gotówka (kierowca musi oddać gotówkę)
    const uber_net = uber_payout_d - uber_tax_8 - uber_cash_f;

    let platformId = row[driverIdIdx]?.trim();
    const driverName = row[driverNameIdx]?.trim() || '';
    
    // Clean platformId if it looks like full row data
    if (platformId && platformId.includes(',') && platformId.length > 20) {
      const parts = platformId.split(',');
      platformId = parts[0]?.trim();
    }
    
    if (!platformId && !driverName) continue;

    let driverId: string | null = null;

    // Try to match by platform ID
    if (platformId && existingDriversMap.has(`uber:${platformId}`)) {
      driverId = existingDriversMap.get(`uber:${platformId}`).id;
      matchedDrivers++;
    } 
    // Try to match by driver name
    else if (driverName) {
      const nameParts = driverName.split(' ');
      const firstName = nameParts[0]?.toLowerCase() || '';
      const lastName = nameParts.slice(1).join(' ').toLowerCase() || '';
      
      for (const [key, driver] of existingDriversMap.entries()) {
        if (key.startsWith('phone:') || key.startsWith('getrido:')) {
          const driverFirstName = (driver.first_name || '').toLowerCase();
          const driverLastName = (driver.last_name || '').toLowerCase();
          
          if (driverFirstName === firstName && driverLastName === lastName) {
            driverId = driver.id;
            matchedDrivers++;
            
            if (platformId) {
              await supabase
                .from('driver_platform_ids')
                .upsert({
                  driver_id: driverId,
                  platform: 'uber',
                  platform_id: platformId
                }, { onConflict: 'driver_id,platform' });
              existingDriversMap.set(`uber:${platformId}`, driver);
            }
            break;
          }
        }
      }
    }
    
    // If still no match, log warning instead of creating new driver
    if (!driverId) {
      console.warn(`⚠️ UBER: Nie znaleziono kierowcy dla platformId=${platformId}, name=${driverName}. Pomijam wiersz.`);
      continue;
    }

    if (driverId) {
      if (!driverDataMap.has(driverId)) {
        driverDataMap.set(driverId, {
          driverId,
          uber_payout_d: 0, uber_cash_f: 0, uber_base: 0, uber_tax_8: 0, uber_net: 0,
          bolt_projected_d: 0, bolt_payout_s: 0, bolt_cash: 0, bolt_commission: 0, bolt_tax_8: 0, bolt_net: 0,
          freenow_base_s: 0, freenow_commission_t: 0, freenow_cash_f: 0, freenow_tax_8: 0, freenow_net: 0
        });
      }
      const data = driverDataMap.get(driverId)!;
      data.uber_payout_d = uber_payout_d;
      data.uber_cash_f = uber_cash_f;
      data.uber_base = uber_base;
      data.uber_tax_8 = uber_tax_8;
      data.uber_net = uber_net;
    }
  }

  return { newDrivers, matchedDrivers };
}

async function parseBoltCsv(
  base64Csv: string,
  supabase: any,
  city_id: string,
  existingDriversMap: Map<string, any>,
  driverDataMap: Map<string, PlatformData>
) {
  const uint8Array = Uint8Array.from(atob(base64Csv), c => c.charCodeAt(0));
  const csvText = new TextDecoder('utf-8').decode(uint8Array);
  const rows = parseCSV(csvText);

  console.log('📊 BOLT CSV - liczba wierszy:', rows.length);
  const headers = rows[0].map(h => h.toLowerCase().trim());
  console.log('📊 BOLT CSV - nagłówki:', JSON.stringify(headers));
  
  // BOLT: kolumna "kierowca" to IMIĘ I NAZWISKO, nie ID!
  // Kolumna "identyfikator kierowcy" to platform ID
  // D Bolt = Zarobki brutto (ogółem) - podstawa do podatku
  const projectedIdx = headers.findIndex(h => h.includes('zarobki brutto (ogółem)') || h.includes('brutto') || h.includes('projected'));
  
  // S Bolt = Projected payout - właściwa wypłata kierowcy (WAŻNE: NIE "zarobki netto"!)
  // "Projected payout" to kolumna z rzeczywistą wypłatą, "zarobki netto" to inna wartość!
  const payoutIdx = headers.findIndex(h => 
    h.includes('projected payout') || 
    h.includes('przewidywana wypłata') || 
    h.includes('payout')
  );
  
  // G Bolt = Gotówka na stanie (pobrana gotówka)
  const cashIdx = headers.findIndex(h => h.includes('gotówka na stanie') || h.includes('pobrana gotówka') || h.includes('gotówka') || h.includes('cash'));
  
  // Prowizja Bolt - parsuj bezpośrednio z CSV jeśli dostępna
  const commissionIdx = headers.findIndex(h => (h.includes('prowizja') && h.includes('zł')) || h === 'prowizja|zł' || h === 'prowizja');
  
  console.log('📊 BOLT CSV - szukanie kolumn:', {
    'brutto (D)': projectedIdx >= 0 ? headers[projectedIdx] : 'NIE ZNALEZIONO',
    'payout (S)': payoutIdx >= 0 ? headers[payoutIdx] : 'NIE ZNALEZIONO', 
    'gotówka (G)': cashIdx >= 0 ? headers[cashIdx] : 'NIE ZNALEZIONO',
    'prowizja': commissionIdx >= 0 ? headers[commissionIdx] : 'NIE ZNALEZIONO'
  });
  
  // WAŻNE: "kierowca" to nazwa, NIE ID!
  const driverNameIdx = headers.findIndex(h => h === 'kierowca' || h.includes('imię') || h.includes('name'));
  // ID kierowcy to osobna kolumna
  const driverIdIdx = headers.findIndex(h => h.includes('identyfikator kierowcy') || h.includes('driver id') || h.includes('id kierowcy'));
  const phoneIdx = headers.findIndex(h => h.includes('numer telefonu') || h.includes('telefon') || h.includes('phone'));
  const emailIdx = headers.findIndex(h => h.includes('adres e-mail') || h.includes('e-mail') || h.includes('email'));

  console.log('📊 BOLT CSV - indeksy kolumn:', { projectedIdx, payoutIdx, cashIdx, commissionIdx, driverNameIdx, driverIdIdx, phoneIdx, emailIdx });

  let newDrivers = 0;
  let matchedDrivers = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(cell => !cell?.trim())) continue;

    const bolt_projected_d = parsePLNumber(row[projectedIdx] || '0');
    const bolt_payout_s = parsePLNumber(row[payoutIdx] || '0');
    const bolt_cash = parsePLNumber(row[cashIdx] || '0');
    // Prowizja Bolt: D - G - S (zarobki brutto - gotówka na stanie - projected payout)
    // Jeśli prowizja jest w CSV, użyj jej, inaczej oblicz
    const bolt_commission = commissionIdx >= 0 
      ? parsePLNumber(row[commissionIdx] || '0') 
      : (bolt_projected_d - bolt_cash - bolt_payout_s);
    
    // Podatek 8% od zarobków brutto (D)
    const bolt_tax_8 = bolt_projected_d * 0.08;
    
    // POPRAWIONE: Wypłata netto Bolt = S (projected payout) - podatek 8% - gotówka
    // Kierowca musi oddać gotówkę którą zebrał od pasażerów
    const bolt_net = bolt_payout_s - bolt_tax_8 - bolt_cash;
    
    console.log(`📊 BOLT wiersz ${i}: D(brutto)=${bolt_projected_d}, S(payout)=${bolt_payout_s}, G(gotówka)=${bolt_cash}, prowizja=${bolt_commission}, podatek=${bolt_tax_8.toFixed(2)}, net=${bolt_net.toFixed(2)}`);

    // WAŻNE: Pobierz imię i nazwisko z kolumny "kierowca" (indeks 0 zazwyczaj)
    const driverName = (driverNameIdx >= 0 ? row[driverNameIdx] : row[0])?.trim() || '';
    // ID kierowcy to osobna kolumna (np. indeks 21)
    const platformId = driverIdIdx >= 0 ? row[driverIdIdx]?.trim() : '';
    const phone = phoneIdx >= 0 ? row[phoneIdx]?.trim() : '';
    const email = emailIdx >= 0 ? row[emailIdx]?.trim() : '';
    
    if (!driverName) continue;

    let driverId: string | null = null;

    // 1. Najpierw spróbuj po platform ID (identyfikator kierowcy)
    if (platformId && existingDriversMap.has(`bolt:${platformId}`)) {
      driverId = existingDriversMap.get(`bolt:${platformId}`).id;
      matchedDrivers++;
      console.log(`✅ BOLT: Znaleziono kierowcę ${driverName} po platformId=${platformId}`);
    }
    // 2. Spróbuj po telefonie
    else if (phone && existingDriversMap.has(`phone:${phone}`)) {
      driverId = existingDriversMap.get(`phone:${phone}`).id;
      matchedDrivers++;
      console.log(`✅ BOLT: Znaleziono kierowcę ${driverName} po telefonie=${phone}`);
    }
    // 3. Spróbuj po imieniu i nazwisku
    else if (driverName) {
      const nameParts = driverName.split(' ');
      const firstName = nameParts[0]?.toLowerCase().trim() || '';
      const lastName = nameParts.slice(1).join(' ').toLowerCase().trim() || '';
      
      for (const [key, driver] of existingDriversMap.entries()) {
        const driverFirstName = (driver.first_name || '').toLowerCase().trim();
        const driverLastName = (driver.last_name || '').toLowerCase().trim();
        
        // Sprawdź dopasowanie imienia i nazwiska
        if (driverFirstName === firstName && driverLastName === lastName) {
          driverId = driver.id;
          matchedDrivers++;
          console.log(`✅ BOLT: Znaleziono kierowcę po nazwie: ${driverName} -> ${driver.first_name} ${driver.last_name}`);
          
          // Zapisz platformId jeśli jest
          if (platformId) {
            await supabase
              .from('driver_platform_ids')
              .upsert({
                driver_id: driverId,
                platform: 'bolt',
                platform_id: platformId
              }, { onConflict: 'driver_id,platform' });
            existingDriversMap.set(`bolt:${platformId}`, driver);
          }
          break;
        }
      }
    }
    
    // Jeśli nadal brak dopasowania, loguj ostrzeżenie
    if (!driverId) {
      console.warn(`⚠️ BOLT: Nie znaleziono kierowcy dla name="${driverName}", platformId="${platformId}", phone="${phone}". Pomijam wiersz.`);
      continue;
    }

    if (driverId) {
      if (!driverDataMap.has(driverId)) {
        driverDataMap.set(driverId, {
          driverId,
          uber_payout_d: 0, uber_cash_f: 0, uber_base: 0, uber_tax_8: 0, uber_net: 0,
          bolt_projected_d: 0, bolt_payout_s: 0, bolt_cash: 0, bolt_commission: 0, bolt_tax_8: 0, bolt_net: 0,
          freenow_base_s: 0, freenow_commission_t: 0, freenow_cash_f: 0, freenow_tax_8: 0, freenow_net: 0
        });
      }
      const data = driverDataMap.get(driverId)!;
      data.bolt_projected_d = bolt_projected_d;
      data.bolt_payout_s = bolt_payout_s;
      data.bolt_cash = bolt_cash;
      data.bolt_commission = bolt_commission;
      data.bolt_tax_8 = bolt_tax_8;
      data.bolt_net = bolt_net;
    }
  }

  return { newDrivers, matchedDrivers };
}

async function parseFreenowCsv(
  base64Csv: string,
  supabase: any,
  city_id: string,
  existingDriversMap: Map<string, any>,
  driverDataMap: Map<string, PlatformData>
) {
  const uint8Array = Uint8Array.from(atob(base64Csv), c => c.charCodeAt(0));
  const csvText = new TextDecoder('utf-8').decode(uint8Array);
  const rows = parseCSV(csvText);

  console.log('📊 FREENOW CSV - liczba wierszy:', rows.length);
  const headers = rows[0].map(h => h.toLowerCase().trim());
  console.log('📊 FREENOW CSV - nagłówki:', JSON.stringify(headers));
  
  // FREENOW: kolumna "kierowca" to IMIĘ I NAZWISKO, "id kierowcy" to platform ID
  const baseIdx = headers.findIndex(h => h.includes('zarobki przed odliczeniem prowizji') || h.includes('revenue') || h.includes('brutto'));
  const commissionIdx = headers.findIndex(h => h === 'prowizja' || h.includes('commission'));
  const cashIdx = headers.findIndex(h => h.includes('płatności gotówką') || h.includes('gotówka') || h.includes('cash'));
  
  // WAŻNE: "id kierowcy" to kolumna 0, "kierowca" to kolumna 1 (imię i nazwisko)
  const driverIdIdx = headers.findIndex(h => h === 'id kierowcy' || h.includes('driver id'));
  const driverNameIdx = headers.findIndex(h => h === 'kierowca' || h.includes('imię') || h.includes('name'));
  const plateIdx = headers.findIndex(h => h.includes('plate') || h.includes('rejestracja') || h.includes('tablica'));

  console.log('📊 FREENOW CSV - indeksy kolumn:', { baseIdx, commissionIdx, cashIdx, driverIdIdx, driverNameIdx, plateIdx });

  let newDrivers = 0;
  let matchedDrivers = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(cell => !cell?.trim())) continue;

    const freenow_base_s = parsePLNumber(row[baseIdx] || '0');
    const freenow_commission_t = parsePLNumber(row[commissionIdx] || '0');
    const freenow_cash_f = parsePLNumber(row[cashIdx] || '0');
    const freenow_tax_8 = freenow_base_s * 0.08;
    const freenow_net = freenow_base_s - freenow_tax_8 - freenow_commission_t - freenow_cash_f;

    // FREENOW: kolumna 0 = id kierowcy (np. "5389DB"), kolumna 1 = kierowca (imię nazwisko)
    const platformId = driverIdIdx >= 0 ? row[driverIdIdx]?.trim() : '';
    const driverName = driverNameIdx >= 0 ? row[driverNameIdx]?.trim() : '';
    const plateNumber = plateIdx >= 0 ? row[plateIdx]?.trim() : '';
    
    if (!driverName) continue;

    let driverId: string | null = null;

    // 1. Najpierw spróbuj po platform ID
    if (platformId && existingDriversMap.has(`freenow:${platformId}`)) {
      driverId = existingDriversMap.get(`freenow:${platformId}`).id;
      matchedDrivers++;
      console.log(`✅ FREENOW: Znaleziono kierowcę ${driverName} po platformId=${platformId}`);
    } 
    // 2. Spróbuj po imieniu i nazwisku
    else if (driverName) {
      const nameParts = driverName.split(' ');
      const firstName = nameParts[0]?.toLowerCase().trim() || '';
      const lastName = nameParts.slice(1).join(' ').toLowerCase().trim() || '';
      
      for (const [key, driver] of existingDriversMap.entries()) {
        const driverFirstName = (driver.first_name || '').toLowerCase().trim();
        const driverLastName = (driver.last_name || '').toLowerCase().trim();
        
        if (driverFirstName === firstName && driverLastName === lastName) {
          driverId = driver.id;
          matchedDrivers++;
          console.log(`✅ FREENOW: Znaleziono kierowcę po nazwie: ${driverName} -> ${driver.first_name} ${driver.last_name}`);
          
          // Zapisz platform ID
          if (platformId) {
            await supabase
              .from('driver_platform_ids')
              .upsert({
                driver_id: driverId,
                platform: 'freenow',
                platform_id: platformId
              }, { onConflict: 'driver_id,platform' });
            existingDriversMap.set(`freenow:${platformId}`, driver);
          }
          break;
        }
      }
    }
    
    // Jeśli brak dopasowania, loguj ostrzeżenie
    if (!driverId) {
      console.warn(`⚠️ FREENOW: Nie znaleziono kierowcy dla name="${driverName}", platformId="${platformId}". Pomijam wiersz.`);
      continue;
    }

    if (driverId) {
      if (!driverDataMap.has(driverId)) {
        driverDataMap.set(driverId, {
          driverId,
          uber_payout_d: 0, uber_cash_f: 0, uber_base: 0, uber_tax_8: 0, uber_net: 0,
          bolt_projected_d: 0, bolt_payout_s: 0, bolt_cash: 0, bolt_commission: 0, bolt_tax_8: 0, bolt_net: 0,
          freenow_base_s: 0, freenow_commission_t: 0, freenow_cash_f: 0, freenow_tax_8: 0, freenow_net: 0
        });
      }
      const data = driverDataMap.get(driverId)!;
      data.freenow_base_s = freenow_base_s;
      data.freenow_commission_t = freenow_commission_t;
      data.freenow_cash_f = freenow_cash_f;
      data.freenow_tax_8 = freenow_tax_8;
      data.freenow_net = freenow_net;
    }
  }

  return { newDrivers, matchedDrivers };
}

// ========== HELPER: PARSOWANIE CSV ==========
function parseCSV(csvText: string): string[][] {
  const lines = csvText.trim().split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.match(/^[;,\s]*$/);
  });
  
  if (lines.length === 0) return [];
  
  // Wykryj separator: sprawdź czy więcej średników czy przecinków w pierwszej linii
  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const separator = semicolonCount >= commaCount ? ';' : ',';
  
  console.log(`📝 CSV separator wykryty: '${separator}' (średniki: ${semicolonCount}, przecinki: ${commaCount})`);
  
  const result = lines.map(line => parseCSVLine(line, separator));
  
  if (result.length > 0) {
    console.log(`📊 CSV: ${result.length} wierszy, ${result[0].length} kolumn w nagłówku`);
    console.log(`📊 Nagłówki: ${result[0].slice(0, 10).join(' | ')}${result[0].length > 10 ? '...' : ''}`);
  }
  
  return result;
}

// ========== HELPER: PARSOWANIE LINII CSV Z OBSŁUGĄ CUDZYSŁOWÓW ==========
function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// ========== HELPER: PARSOWANIE LICZB (polski format) ==========
function parsePLNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  // Usuń spacje, zamień przecinek na kropkę
  return parseFloat(value.replace(/\s/g, '').replace(',', '.')) || 0;
}

// ========== HELPER: WALIDACJA GETRIDO ID ==========
function isValidGetRidoId(
  value: string | null | undefined,
  uber_id?: string | null,
  bolt_id?: string | null,
  freenow_id?: string | null
): boolean {
  if (!value || value.trim().length < 3) return false;
  
  const trimmed = value.trim();
  
  // Nie jest UUID (zawiera myślniki i jest 36 znaków)
  if (trimmed.includes('-') && trimmed.length === 36) return false;
  
  // Nie jest tylko cyframi
  if (/^\d+$/.test(trimmed)) return false;
  
  // Nie jest emailem
  if (trimmed.includes('@')) return false;
  
  // Nie jest Uber UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return false;
  
  // Reject if identical to any platform ID from the same row
  if (uber_id && trimmed === uber_id) return false;
  if (bolt_id && trimmed === bolt_id) return false;
  if (freenow_id && trimmed === freenow_id) return false;
  
  return true;
}

// ========== HELPER: EKSTRAKCJA GETRIDO ID Z WIERSZA ==========
function extractGetRidoFromRow(
  headers: string[], 
  row: string[], 
  getRidoIdIdx: number,
  uber_id?: string | null,
  bolt_id?: string | null,
  freenow_id?: string | null
): string {
  // 1) Bezpośrednio z nazwy kolumny, jeśli istnieje
  let candidate = (getRidoIdIdx >= 0 ? row[getRidoIdIdx] : '')?.trim() || '';
  if (isValidGetRidoId(candidate, uber_id, bolt_id, freenow_id)) {
    console.log(`🆔 GetRido z kolumny nazwanej (idx ${getRidoIdIdx}): ${candidate}`);
    return candidate;
  }

  // 2) Hard fallback: TYLKO kolumna X (index 23)
  if (row.length > 23) {
    const v = row[23]?.trim();
    if (isValidGetRidoId(v, uber_id, bolt_id, freenow_id)) {
      console.log(`🆔 GetRido z kolumny X (idx 23): ${v}`);
      return v;
    }
  }

  // NO more risky scans - we only use X or named column
  return '';
}
// ========== HELPER: ZNAJDŹ LUB UTWÓRZ KIEROWCĘ ==========
async function findOrCreateDriver(
  supabase: any,
  rowData: any,
  city_id: string,
  existingDriversMap: Map<string, any>,
  headers: string[],
  row: string[],
  getRidoIdIdx: number
): Promise<string | null> {
  
  const uberId = rowData.uberId;
  const freenowId = rowData.freenowId;
  const phone = rowData.phone;
  const fullName = rowData.fullName;
  
  // Use extractGetRidoFromRow to get GetRido ID reliably with platform IDs for validation
  const uber_id_val = rowData.uber_id || null;
  const freenow_id_val = rowData.freenowId || null;
  const bolt_id_val = null; // Not in main CSV
  
  const extractedGetRidoId = extractGetRidoFromRow(headers, row, getRidoIdIdx, uber_id_val, bolt_id_val, freenow_id_val);
  const getRidoId = extractedGetRidoId;
  
  // Waliduj GetRido ID
  const validGetRidoId = isValidGetRidoId(getRidoId, uber_id_val, bolt_id_val, freenow_id_val) ? getRidoId : null;
  
  // PRIORYTET MATCHOWANIA (od najbardziej stabilnego):
  // 1. GetRido ID (jeśli jest poprawne)
  if (validGetRidoId && existingDriversMap.has(`getrido:${validGetRidoId}`)) {
    const existingDriver = existingDriversMap.get(`getrido:${validGetRidoId}`);
    console.log(`✅ Matched by GetRido ID: ${fullName} (${validGetRidoId})`);
    
    // Aktualizuj imię i nazwisko jeśli się zmieniły
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Nieznane';
    const lastName = nameParts.slice(1).join(' ') || 'Nazwisko';
    
    if (existingDriver.first_name !== firstName || existingDriver.last_name !== lastName) {
      console.log(`🔄 Aktualizuję imię/nazwisko dla ${validGetRidoId}: ${existingDriver.first_name} ${existingDriver.last_name} → ${firstName} ${lastName}`);
      await supabase
        .from('drivers')
        .update({ 
          first_name: firstName, 
          last_name: lastName 
        })
        .eq('id', existingDriver.id);
    }
    
    return existingDriver.id;
  }
  
  // 2. Telefon (bardzo stabilny identyfikator)
  if (phone && existingDriversMap.has(`phone:${phone}`)) {
    const existingDriver = existingDriversMap.get(`phone:${phone}`);
    console.log(`✅ Matched by phone: ${fullName}`);
    
    // Aktualizuj GetRido ID jeśli jest poprawne i różne
    if (validGetRidoId && existingDriver.getrido_id !== validGetRidoId) {
      console.log(`🔄 Aktualizuję GetRido ID dla ${phone}: ${existingDriver.getrido_id} → ${validGetRidoId}`);
      await supabase
        .from('drivers')
        .update({ getrido_id: validGetRidoId })
        .eq('id', existingDriver.id);
      
      // Aktualizuj mapę
      existingDriversMap.set(`getrido:${validGetRidoId}`, existingDriver);
    }

    // Aktualizuj imię/nazwisko jeśli się zmieniły
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Nieznane';
    const lastName = nameParts.slice(1).join(' ') || 'Nazwisko';
    if (existingDriver.first_name !== firstName || existingDriver.last_name !== lastName) {
      await supabase
        .from('drivers')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', existingDriver.id);
    }
    
    return existingDriver.id;
  }
  
  // 3. FreeNow ID
  if (freenowId && existingDriversMap.has(`freenow:${freenowId}`)) {
    const existingDriver = existingDriversMap.get(`freenow:${freenowId}`);
    console.log(`✅ Matched by FreeNow ID: ${fullName}`);
    
    // Aktualizuj GetRido ID jeśli jest poprawne i różne
    if (validGetRidoId && existingDriver.getrido_id !== validGetRidoId) {
      console.log(`🔄 Aktualizuję GetRido ID dla FreeNow ${freenowId}: ${existingDriver.getrido_id} → ${validGetRidoId}`);
      await supabase
        .from('drivers')
        .update({ getrido_id: validGetRidoId })
        .eq('id', existingDriver.id);
      
      existingDriversMap.set(`getrido:${validGetRidoId}`, existingDriver);
    }

    // Aktualizuj imię/nazwisko jeśli się zmieniły
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Nieznane';
    const lastName = nameParts.slice(1).join(' ') || 'Nazwisko';
    if (existingDriver.first_name !== firstName || existingDriver.last_name !== lastName) {
      await supabase
        .from('drivers')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', existingDriver.id);
    }
    
    return existingDriver.id;
  }
  
  // 4. Email (jeśli jest prawdziwy email)
  const emailForMatch = rowData.email?.trim();
  if (emailForMatch && emailForMatch.includes('@') && !emailForMatch.includes('@rido.internal')) {
    const emailMatch = Array.from(existingDriversMap.values()).find(
      (driver: any) => driver.email === emailForMatch
    );
    if (emailMatch) {
      console.log(`✅ Matched by email: ${fullName}`);
      
      // Aktualizuj GetRido ID jeśli jest poprawne i różne
      if (validGetRidoId && emailMatch.getrido_id !== validGetRidoId) {
        console.log(`🔄 Aktualizuję GetRido ID dla email ${emailForMatch}: ${emailMatch.getrido_id} → ${validGetRidoId}`);
        await supabase
          .from('drivers')
          .update({ getrido_id: validGetRidoId })
          .eq('id', emailMatch.id);
        
        existingDriversMap.set(`getrido:${validGetRidoId}`, emailMatch);
      }

      // Aktualizuj imię/nazwisko jeśli się zmieniły
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || 'Nieznane';
      const lastName = nameParts.slice(1).join(' ') || 'Nazwisko';
      if (emailMatch.first_name !== firstName || emailMatch.last_name !== lastName) {
        await supabase
          .from('drivers')
          .update({ first_name: firstName, last_name: lastName })
          .eq('id', emailMatch.id);
      }
      
      return emailMatch.id;
    }
  }
  
  // 5. Uber ID (najmniej stabilny - może być UUID)
  if (uberId && existingDriversMap.has(`uber:${uberId}`)) {
    const existingDriver = existingDriversMap.get(`uber:${uberId}`);
    console.log(`✅ Matched by Uber ID: ${fullName}`);
    
    // Aktualizuj GetRido ID jeśli jest poprawne i różne
    if (validGetRidoId && existingDriver.getrido_id !== validGetRidoId) {
      console.log(`🔄 Aktualizuję GetRido ID dla Uber ${uberId}: ${existingDriver.getrido_id} → ${validGetRidoId}`);
      await supabase
        .from('drivers')
        .update({ getrido_id: validGetRidoId })
        .eq('id', existingDriver.id);
      
      existingDriversMap.set(`getrido:${validGetRidoId}`, existingDriver);
    }

    // Aktualizuj imię/nazwisko jeśli się zmieniły
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Nieznane';
    const lastName = nameParts.slice(1).join(' ') || 'Nazwisko';
    if (existingDriver.first_name !== firstName || existingDriver.last_name !== lastName) {
      await supabase
        .from('drivers')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', existingDriver.id);
    }
    
    return existingDriver.id;
  }
  
  // ========== TWORZENIE NOWEGO KIEROWCY ==========
  console.log(`➕ Tworzę: ${fullName} (GetRido: ${validGetRidoId || 'brak'}, Uber: ${uberId})`);
  
  // Podziel imię i nazwisko z kolumny F
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Nieznane';
  const lastName = nameParts.slice(1).join(' ') || 'Nazwisko';
  
  // ✅ Email w drivers = prawdziwy email z CSV (jeśli istnieje) LUB null
  const csvEmail = rowData.email?.trim();
  const hasRealEmail = csvEmail && csvEmail.includes('@') && !csvEmail.includes('@rido.internal');
  
  // ✅ Login email: jeśli ma prawdziwy email, użyj go, w przeciwnym razie internal
  const loginEmail = hasRealEmail
    ? csvEmail
    : uberId
      ? `uber_${uberId}@rido.internal`
      : phone
        ? `tel_${phone.replace(/[^0-9]/g, '')}@rido.internal`
        : freenowId
          ? `freenow_${freenowId}@rido.internal`
          : `driver_${Date.now()}@rido.internal`;
  
  // Hasło: Test12345! dla wszystkich
  const password = 'Test12345!';
  
  // Utwórz użytkownika w Supabase Auth
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: loginEmail,
    password: password,
    email_confirm: true, // ✅ Nie wysyłaj maili potwierdzających
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      phone: phone || '',
      real_email: hasRealEmail ? csvEmail : ''
    }
  });
  
  if (authError || !authUser.user) {
    console.error('❌ Błąd Auth:', authError);
    return null;
  }
  
  // Wstaw do tabeli drivers
  // ✅ ZMIANA: email = prawdziwy email z CSV LUB null (nie wpisuj Uber ID!)
  const { data: newDriver, error: driverError } = await supabase
    .from('drivers')
    .insert({
      id: authUser.user.id,
      city_id,
      first_name: firstName,
      last_name: lastName,
      email: hasRealEmail ? csvEmail : null, // ✅ null jeśli brak emaila w CSV
      phone: phone || null,
      fuel_card_number: rowData.fuelCard || null,
      getrido_id: validGetRidoId || null, // ✅ Zapisz GetRido ID
      user_role: 'kierowca'
    })
    .select()
    .single();
  
  if (driverError) {
    console.error('❌ Błąd drivers:', driverError);
    return null;
  }
  
  // ✅ NOWE: Utwórz wpis w driver_app_users aby kierowca mógł się zalogować
  const { error: appUserError } = await supabase
    .from('driver_app_users')
    .insert({
      user_id: authUser.user.id,
      driver_id: newDriver.id,
      city_id: city_id,
      phone: phone || null
    });
  
  if (appUserError) {
    console.error('⚠️ Błąd driver_app_users (nie krytyczny):', appUserError);
  } else {
    console.log('✅ Utworzono wpis w driver_app_users');
  }
  
  // Wstaw platform IDs
  const platformIds = [];
  if (uberId) {
    platformIds.push({ 
      driver_id: newDriver.id, 
      platform: 'uber', 
      platform_id: uberId 
    });
  }
  if (freenowId) {
    platformIds.push({ 
      driver_id: newDriver.id, 
      platform: 'freenow', 
      platform_id: freenowId 
    });
  }
  if (phone) {
    platformIds.push({ 
      driver_id: newDriver.id, 
      platform: 'bolt', 
      platform_id: phone 
    });
  }
  
  if (platformIds.length > 0) {
    await supabase.from('driver_platform_ids').insert(platformIds);
  }
  
  // Dodaj do mapy
  existingDriversMap.set(`uber:${uberId}`, newDriver);
  if (freenowId) existingDriversMap.set(`freenow:${freenowId}`, newDriver);
  if (phone) existingDriversMap.set(`phone:${phone}`, newDriver);
  if (validGetRidoId) existingDriversMap.set(`getrido:${validGetRidoId}`, newDriver);
  
  console.log(`✅ Utworzono: ${fullName} (GetRido ID: ${validGetRidoId || 'brak'})`);
  
  return newDriver.id;
}