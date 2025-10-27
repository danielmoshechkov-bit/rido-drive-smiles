import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SettlementRequest {
  period_from: string;
  period_to: string;
  city_id: string;
  main_csv?: string;
  uber_csv?: string;
  bolt_csv?: string;
  freenow_csv?: string;
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

    const { period_from, period_to, city_id, main_csv } = body;

    if (!period_from || !period_to || !city_id || !main_csv) {
      throw new Error('Missing required fields');
    }

    // ========== KROK 1: PARSOWANIE CSV (z poprawnym UTF-8) ==========
    const uint8Array = Uint8Array.from(atob(main_csv), c => c.charCodeAt(0));
    const csvText = new TextDecoder('utf-8').decode(uint8Array);
    const parsedRows = parseCSV(csvText);
    
    console.log(`📊 Sparsowano ${parsedRows.length} wierszy CSV`);
    
    if (parsedRows.length < 2) {
      throw new Error('CSV jest pusty lub ma tylko nagłówki');
    }

    // Debug: pokaż nagłówki i pierwsze 3 wiersze
    console.log('🔍 Nagłówki CSV:', parsedRows[0]);
    console.log('🔍 Pierwsze 3 wiersze:', parsedRows.slice(1, 4));

    // ========== KROK 2: MAPOWANIE KOLUMN PO NAZWIE ==========
    const headers = parsedRows[0].map(h => h.toLowerCase().trim());
    
    const emailIdx = headers.findIndex(h => h.includes('adres mailowy'));
    const uberIdIdx = headers.findIndex(h => h.includes('id uber')); // ✅ Kolumna "ID Uber" z CSV
    const phoneIdx = headers.findIndex(h => h.includes('nr tel'));
    const freenowIdIdx = headers.findIndex(h => h.includes('id freenow'));
    const fuelCardIdx = headers.findIndex(h => h.includes('nr karty paliwowej'));
    const fullNameIdx = headers.findIndex(h => h.includes('imie nazwisko'));
    const getRidoIdIdx = headers.findIndex(h => h.includes('getrido id') || h.includes('get rido') || h === 'getrido');
    
    // Wszystkie kolumny kwotowe
    const uberIdx = headers.findIndex(h => h === 'uber');
    const uberCashlessIdx = headers.findIndex(h => h.includes('uber bezgotówka'));
    const uberCashIdx = headers.findIndex(h => h.includes('uber gotówka'));
    const boltGrossIdx = headers.findIndex(h => h.includes('bolt brutto'));
    const boltNetIdx = headers.findIndex(h => h.includes('bolt netto'));
    const boltCommissionIdx = headers.findIndex(h => h.includes('bolt prowizja'));
    const boltCashIdx = headers.findIndex(h => h.includes('bolt gotówka'));
    const freenowGrossIdx = headers.findIndex(h => h.includes('freenow brutto'));
    const freenowNetIdx = headers.findIndex(h => h.includes('freenow netto'));
    const freenowCommissionIdx = headers.findIndex(h => h.includes('freenow prowizja'));
    const freenowCashIdx = headers.findIndex(h => h.includes('freenow gotówka'));
    const totalCashIdx = headers.findIndex(h => h.includes('razem gotówka'));
    const totalCommissionIdx = headers.findIndex(h => h.includes('razem prowizja'));
    const taxIdx = headers.findIndex(h => h.includes('podatek'));
    const fuelIdx = headers.findIndex(h => h === 'paliwo');
    const fuelVATIdx = headers.findIndex(h => h.includes('vat z paliwa'));
    const fuelVATRefundIdx = headers.findIndex(h => h.includes('zwrot vat'));

    console.log('📍 Indeksy kolumn:', {
      email: emailIdx, uberId: uberIdIdx, phone: phoneIdx, freenowId: freenowIdIdx,
      fullName: fullNameIdx, getRidoId: getRidoIdIdx, uber: uberIdx, uberCashless: uberCashlessIdx
    });

    // ========== KROK 3: POBIERZ ISTNIEJĄCYCH KIEROWCÓW ==========
    const existingDriversMap = new Map<string, any>();
    
    const { data: existingDrivers } = await supabase
      .from('drivers')
      .select('id, email, phone, getrido_id, first_name, last_name, driver_platform_ids(platform, platform_id)')
      .eq('city_id', city_id);
    
    existingDrivers?.forEach((driver: any) => {
      if (driver.phone) {
        existingDriversMap.set(`phone:${driver.phone.trim()}`, driver);
      }
      if (driver.getrido_id) {
        existingDriversMap.set(`getrido:${driver.getrido_id.trim()}`, driver);
      }
      if (Array.isArray(driver.driver_platform_ids)) {
        driver.driver_platform_ids.forEach((pid: any) => {
          existingDriversMap.set(`${pid.platform}:${pid.platform_id.trim()}`, driver);
        });
      }
    });
    
    console.log(`✅ Załadowano ${existingDriversMap.size} istniejących kierowców`);

    // ========== KROK 4: PRZETWARZANIE WIERSZY ==========
    const settlementsToInsert: any[] = [];
    let newDriversCount = 0;
    let matchedDriversCount = 0;

    for (let i = 1; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      
      // Pomiń puste wiersze
      if (row.every(cell => !cell || cell.trim() === '')) continue;
      
      const rowData = {
        email: row[emailIdx] || '',
        uberId: row[uberIdIdx]?.trim() || '',
        phone: row[phoneIdx]?.trim() || '',
        freenowId: row[freenowIdIdx]?.trim() || '',
        fuelCard: row[fuelCardIdx]?.trim() || '',
        fullName: (fullNameIdx >= 0 ? row[fullNameIdx] : row[5])?.trim() || 'Nieznany Kierowca', // fallback F (index 5)
        getRidoId: (getRidoIdIdx >= 0 ? row[getRidoIdIdx] : row[23])?.trim() || '', // fallback X (index 23)
        uber: parsePLNumber(row[uberIdx]),
        uberCashless: parsePLNumber(row[uberCashlessIdx]),
        uberCash: parsePLNumber(row[uberCashIdx]),
        boltGross: parsePLNumber(row[boltGrossIdx]),
        boltNet: parsePLNumber(row[boltNetIdx]),
        boltCommission: parsePLNumber(row[boltCommissionIdx]),
        boltCash: parsePLNumber(row[boltCashIdx]),
        freenowGross: parsePLNumber(row[freenowGrossIdx]),
        freenowNet: parsePLNumber(row[freenowNetIdx]),
        freenowCommission: parsePLNumber(row[freenowCommissionIdx]),
        freenowCash: parsePLNumber(row[freenowCashIdx]),
        totalCash: parsePLNumber(row[totalCashIdx]),
        totalCommission: parsePLNumber(row[totalCommissionIdx]),
        tax: parsePLNumber(row[taxIdx]),
        fuel: parsePLNumber(row[fuelIdx]),
        fuelVAT: parsePLNumber(row[fuelVATIdx]),
        fuelVATRefund: parsePLNumber(row[fuelVATRefundIdx])
      };
      
      // Znajdź lub utwórz kierowcę (pass headers, row, and getRidoIdIdx)
      const beforeSize = existingDriversMap.size;
      const driverId = await findOrCreateDriver(
        supabase,
        rowData,
        city_id,
        existingDriversMap,
        headers,
        row,
        getRidoIdIdx
      );
      
      if (!driverId) {
        console.error(`❌ Nie udało się przetworzyć wiersza ${i}: ${rowData.fullName}`);
        continue;
      }
      
      if (existingDriversMap.size > beforeSize) {
        newDriversCount++;
      } else {
        matchedDriversCount++;
      }
      
      // Update GetRido ID and name if needed
      const uber_id_val = rowData.uber_id || null;
      const freenow_id_val = rowData.freenow_id || null;
      const bolt_id_val = null; // Not in main CSV
      
      const extractedGetRidoId = extractGetRidoFromRow(headers, row, getRidoIdIdx, uber_id_val, bolt_id_val, freenow_id_val);
      const validGetRidoId = extractedGetRidoId && isValidGetRidoId(extractedGetRidoId, uber_id_val, bolt_id_val, freenow_id_val) ? extractedGetRidoId : null;
      
      if (driverId && validGetRidoId) {
        const { data: currentDriver } = await supabase
          .from('drivers')
          .select('getrido_id, first_name, last_name')
          .eq('id', driverId)
          .single();
        
        const updateData: any = {};
        
        // Update GetRido ID if different
        if (currentDriver?.getrido_id !== validGetRidoId) {
          updateData.getrido_id = validGetRidoId;
          console.log(`📝 Updating getrido_id: ${currentDriver?.getrido_id} -> ${validGetRidoId}`);
        }
        
        // Update name from column F if GetRido ID changed
        if (updateData.getrido_id && rowData.fullName) {
          const nameParts = rowData.fullName.trim().split(' ');
          const newFirstName = nameParts[0] || '';
          const newLastName = nameParts.slice(1).join(' ') || '';
          
          if (currentDriver?.first_name !== newFirstName || currentDriver?.last_name !== newLastName) {
            updateData.first_name = newFirstName;
            updateData.last_name = newLastName;
            console.log(`📝 Updating name: ${currentDriver?.first_name} ${currentDriver?.last_name} -> ${newFirstName} ${newLastName}`);
          }
        }
        
        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('drivers')
            .update(updateData)
            .eq('id', driverId);
          
          if (updateError) {
            console.error('❌ Failed to update driver', driverId, updateError);
          } else {
            console.log(`✅ Updated driver ${driverId}:`, updateData);
          }
        }
      }
      
      // Przygotuj settlement
      const totalEarnings = rowData.uber + rowData.boltGross + rowData.freenowGross;
      const commissionAmount = rowData.totalCommission;
      const netAmount = rowData.uberCashless + rowData.boltNet + rowData.freenowNet 
                        - rowData.fuel + rowData.fuelVATRefund;
      
      settlementsToInsert.push({
        city_id,
        driver_id: driverId,
        platform: 'main',
        period_from,
        period_to,
        week_start: period_from,
        week_end: period_to,
        total_earnings: totalEarnings,
        commission_amount: commissionAmount,
        net_amount: netAmount,
        amounts: rowData,
        raw: row,
        source: 'csv_import',
        raw_row_id: `main_${period_from}_row${i}`
      });
    }

    // ========== KROK 6: BATCH UPSERT SETTLEMENTS (ignore duplicates) ==========
    if (settlementsToInsert.length > 0) {
      console.log(`💾 Zapisuję ${settlementsToInsert.length} rozliczeń...`);
      const { error } = await supabase
        .from('settlements')
        .upsert(settlementsToInsert, { 
          onConflict: 'raw_row_id',
          ignoreDuplicates: true 
        });
      if (error) {
        console.error('❌ Błąd upsert:', error);
        throw error;
      }
      console.log('✅ Rozliczenia zapisane');
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

// ========== HELPER: PARSOWANIE CSV ==========
function parseCSV(csvText: string): string[][] {
  const lines = csvText.trim().split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.match(/^[;,\s]*$/);
  });
  
  return lines.map(line => {
    // Split by semicolon (CSV z Excela)
    return line.split(';').map(cell => 
      cell.replace(/^"|"$/g, '').trim()
    );
  });
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