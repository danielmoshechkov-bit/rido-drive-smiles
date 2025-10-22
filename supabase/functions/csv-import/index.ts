import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CSVRow {
  email?: string;
  uber_id?: string;       // Kolumna B - Uber ID
  phone?: string;         // Kolumna C - nr tel
  bolt_id?: string;       // Bolt ID (opcjonalnie)
  freenow_id?: string;    // Kolumna D
  fuel_card?: string;     // Kolumna E
  full_name?: string;     // Kolumna F - Imie nazwisko
  getrido_id?: string;    // Ostatnia kolumna - GetRido ID (główny identyfikator)
  [key: string]: any;
}

// Normalize email
function normalizeEmail(email: string): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

// Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Check if this is the first import
async function isFirstImport(supabase: any): Promise<boolean> {
  const { count, error } = await supabase
    .from('drivers')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error('Error checking for existing drivers:', error);
    return false;
  }
  
  return count === 0;
}

// Create system alert
async function createAlert(
  supabase: any,
  type: 'error' | 'warning' | 'new_driver' | 'info',
  category: 'import' | 'matching' | 'validation' | 'system',
  title: string,
  description: string,
  metadata: any = {},
  driverId?: string,
  importJobId?: string
) {
  const { error } = await supabase
    .from('system_alerts')
    .insert({
      type,
      category,
      title,
      description,
      driver_id: driverId,
      import_job_id: importJobId,
      metadata
    });
  
  if (error) {
    console.error('Error creating alert:', error);
  }
}

// Parse full name
function parseFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(' ').filter(p => p);
  const first_name = parts[0] || '';
  const last_name = parts.slice(1).join(' ') || '';
  return { first_name, last_name };
}

// Normalize name for matching
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z]/g, '');
}

// Helper function to update existing driver data
async function updateDriverData(
  supabase: any,
  existingDriver: any,
  row: CSVRow,
  getrido_id: string | null,
  email: string | null,
  fuel_card: string | null
): Promise<void> {
  const updateData: any = {};
  
  // Update getrido_id if present in CSV and different
  if (getrido_id && existingDriver.getrido_id !== getrido_id) {
    updateData.getrido_id = getrido_id;
    console.log(`📝 Updating getrido_id: ${existingDriver.getrido_id} -> ${getrido_id}`);
  }
  
  // Update phone if present in CSV and different
  if (row.phone && existingDriver.phone !== row.phone) {
    updateData.phone = row.phone;
    console.log(`📝 Updating phone: ${existingDriver.phone} -> ${row.phone}`);
  }
  
  // Update fuel card if present in CSV and different
  if (fuel_card && existingDriver.fuel_card_number !== fuel_card) {
    updateData.fuel_card_number = fuel_card;
    console.log(`📝 Updating fuel_card: ${existingDriver.fuel_card_number} -> ${fuel_card}`);
  }
  
  // Update email if present in CSV and different
  if (email && existingDriver.email !== email) {
    updateData.email = email;
    console.log(`📝 Updating email: ${existingDriver.email} -> ${email}`);
  }
  
  // Execute update if there are changes
  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase
      .from('drivers')
      .update(updateData)
      .eq('id', existingDriver.id);
    
    if (error) {
      console.error('⚠️ Error updating driver:', error);
    } else {
      console.log(`✅ Updated driver ${existingDriver.id}:`, updateData);
    }
  }
}

// Find or create driver
async function findOrCreateDriver(
  supabase: any,
  row: CSVRow,
  cityId: string,
  importJobId: string,
  firstImport: boolean,
  manualMatches: any[]
): Promise<{ driver: any; isNew: boolean; matchMethod?: string }> {
  const email = normalizeEmail(row.email || '');
  const uber_id = row.uber_id?.trim() || null;
  const bolt_id = row.bolt_id?.trim() || null;
  const freenow_id = row.freenow_id?.trim() || null;
  const full_name = row.full_name?.trim() || '';
  const fuel_card = row.fuel_card?.trim() || null;
  const getrido_id = row.getrido_id?.trim() || null;
  
  const { first_name, last_name } = parseFullName(full_name);
  
  // Validate email if provided
  if (email && !isValidEmail(email)) {
    await createAlert(
      supabase,
      'warning',
      'validation',
      'Nieprawidłowy adres email',
      `Email "${email}" dla kierowcy ${full_name} jest nieprawidłowy`,
      { row },
      undefined,
      importJobId
    );
    // Continue anyway - don't fail
  }
  
  // Check if we have any identifier
  if (!email && !uber_id && !freenow_id && !getrido_id) {
    await createAlert(
      supabase,
      'error',
      'validation',
      'Brak danych identyfikacyjnych',
      `Kierowca ${full_name} nie ma ani emaila ani ID platform (Uber/FreeNow) ani GetRido ID`,
      { row },
      undefined,
      importJobId
    );
    return { driver: null, isNew: false, matchMethod: 'validation_failed' };
  }
  
  // 1. NAJPIERW sprawdź GetRido ID - to główny identyfikator!
  if (getrido_id) {
    const { data: existingDriver } = await supabase
      .from('drivers')
      .select('*')
      .eq('getrido_id', getrido_id)
      .maybeSingle();
    
    if (existingDriver) {
      console.log('✅ Matched driver by GetRido ID:', existingDriver.id, getrido_id);
      await updateDriverData(supabase, existingDriver, row, getrido_id, email, fuel_card);
      return { driver: existingDriver, isNew: false, matchMethod: 'getrido_id' };
    }
  }
  
  // 2. Check manual matches
  for (const match of manualMatches) {
    if (match.match_key === 'uber_id' && uber_id && match.match_value === uber_id) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.log('Matched driver by manual uber_id match:', driver.id);
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        return { driver, isNew: false, matchMethod: 'manual_uber_id' };
      }
    }
    if (match.match_key === 'bolt_id' && bolt_id && match.match_value === bolt_id) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.log('Matched driver by manual bolt_id match:', driver.id);
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        return { driver, isNew: false, matchMethod: 'manual_bolt_id' };
      }
    }
    if (match.match_key === 'freenow_id' && freenow_id && match.match_value === freenow_id) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.log('Matched driver by manual freenow_id match:', driver.id);
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        return { driver, isNew: false, matchMethod: 'manual_freenow_id' };
      }
    }
    if (match.match_key === 'email' && email && match.match_value.toLowerCase() === email) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.log('Matched driver by manual email match:', driver.id);
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        return { driver, isNew: false, matchMethod: 'manual_email' };
      }
    }
  }
  
  // 3. Try to match by Uber ID (skip if first import)
  if (!firstImport && uber_id) {
    const { data: platformData } = await supabase
      .from('driver_platform_ids')
      .select('driver_id, drivers(*)')
      .eq('platform', 'uber')
      .eq('platform_id', uber_id)
      .maybeSingle();
    
    if (platformData && platformData.drivers) {
      console.log('Found driver by Uber ID:', platformData.drivers.id);
      await updateDriverData(supabase, platformData.drivers, row, getrido_id, email, fuel_card);
      return { driver: platformData.drivers, isNew: false, matchMethod: 'uber_id' };
    }
  }
  
  // 4. Try to match by FreeNow ID (skip if first import)
  if (!firstImport && freenow_id) {
    const { data: platformData } = await supabase
      .from('driver_platform_ids')
      .select('driver_id, drivers(*)')
      .eq('platform', 'freenow')
      .eq('platform_id', freenow_id)
      .maybeSingle();
    
    if (platformData && platformData.drivers) {
      console.log('Found driver by FreeNow ID:', platformData.drivers.id);
      await updateDriverData(supabase, platformData.drivers, row, getrido_id, email, fuel_card);
      return { driver: platformData.drivers, isNew: false, matchMethod: 'freenow_id' };
    }
  }
  
  // 5. Try to match by email (skip if first import)
  if (!firstImport && email) {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .ilike('email', email)
      .limit(1);
    
    if (data && data.length > 0) {
      console.log('Found driver by email:', data[0].id);
      await updateDriverData(supabase, data[0], row, getrido_id, email, fuel_card);
      return { driver: data[0], isNew: false, matchMethod: 'email' };
    }
  }
  
  // 6. Try to match by normalized name (skip if first import)
  if (!firstImport && full_name) {
    const normalizedName = normalizeName(full_name);
    const { data: allDrivers } = await supabase
      .from('drivers')
      .select('*')
      .eq('city_id', cityId);
    
    if (allDrivers) {
      for (const driver of allDrivers) {
        const driverName = `${driver.first_name} ${driver.last_name}`;
        if (normalizeName(driverName) === normalizedName) {
          console.log('Found driver by normalized name:', driver.id);
          await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
          return { driver, isNew: false, matchMethod: 'name' };
        }
      }
    }
  }
  
  // 7. No match found - create new driver
  console.log('No existing driver found, creating new one');
  
  // Determine login
  const login = email || `driver_${uber_id || bolt_id || freenow_id}@rido.local`;
  
  // Create auth account
  let authUserId = null;
  try {
    console.log(`🔐 Creating auth account for: ${login}`);
    
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: login,
      password: 'Test12345!',
      email_confirm: true,
      user_metadata: { first_name, last_name }
    });
    
    if (authError) {
      // Check if user already exists
      if (authError.message?.includes('already registered') || authError.message?.includes('already been registered')) {
        console.log(`⚠️ User ${login} already exists, trying to find existing user`);
        
        // Try to find existing user by email
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === login.toLowerCase());
        
        if (existingUser) {
          console.log(`✅ Found existing user: ${existingUser.id}`);
          authUserId = existingUser.id;
        } else {
          console.error('❌ User exists but could not find it');
          await createAlert(
            supabase,
            'warning',
            'system',
            'Nie znaleziono istniejącego użytkownika',
            `Email ${login} jest już zarejestrowany, ale nie można znaleźć użytkownika`,
            { error: authError, login },
            undefined,
            importJobId
          );
        }
      } else {
        console.error('❌ Auth error:', authError);
        await createAlert(
          supabase,
          'warning',
          'system',
          'Nie utworzono konta auth',
          `Kierowca ${full_name} będzie dodany, ale nie utworzono konta logowania: ${authError.message}`,
          { error: authError, login },
          undefined,
          importJobId
        );
      }
    } else {
      authUserId = authUser.user.id;
      console.log(`✅ Created auth user: ${authUserId}`);
    }
  } catch (authErr) {
    console.error('💥 Exception creating auth account:', authErr);
    await createAlert(
      supabase,
      'error',
      'system',
      'Wyjątek podczas tworzenia konta',
      `Nie udało się utworzyć konta dla ${full_name}: ${authErr instanceof Error ? authErr.message : String(authErr)}`,
      { error: String(authErr), login },
      undefined,
      importJobId
    );
  }
  
  // Create driver record
  const { data: newDriver, error: insertError } = await supabase
    .from('drivers')
    .insert({
      id: authUserId,
      first_name,
      last_name,
      email: email || null,
      phone: row.phone || null,
      city_id: cityId,
      fuel_card_number: fuel_card || null,
      getrido_id: getrido_id || null
    })
    .select()
    .single();
  
  if (insertError) {
    console.error('Error creating driver:', insertError);
    await createAlert(
      supabase,
      'error',
      'import',
      'Błąd tworzenia kierowcy',
      `Nie udało się utworzyć kierowcy ${full_name}: ${insertError.message}`,
      { row, error: insertError },
      undefined,
      importJobId
    );
    throw insertError;
  }
  
  // Add platform IDs to separate table
  if (uber_id) {
    await supabase.from('driver_platform_ids').insert({
      driver_id: newDriver.id, platform: 'uber', platform_id: uber_id
    });
  }
  if (bolt_id) {
    await supabase.from('driver_platform_ids').insert({
      driver_id: newDriver.id, platform: 'bolt', platform_id: bolt_id
    });
  }
  if (freenow_id) {
    await supabase.from('driver_platform_ids').insert({
      driver_id: newDriver.id, platform: 'freenow', platform_id: freenow_id
    });
  }
  
  // Create alert for new driver
  await createAlert(
    supabase,
    'new_driver',
    'import',
    'Nowy kierowca utworzony',
    `${full_name} (${email || login}) - GetRido ID: ${getrido_id || 'brak'}`,
    { firstImport, login, uber_id, freenow_id, getrido_id },
    newDriver.id,
    importJobId
  );
  
  console.log('Created new driver:', newDriver.id);
  return { driver: newDriver, isNew: true, matchMethod: 'created' };
}

// Parse CSV with semicolon delimiter
function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const rows: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split by semicolon and remove quotes
    const values = line.split(';').map(v => v.replace(/^"|"$/g, '').trim());
    
    // Skip empty rows
    if (values.every(v => !v)) continue;
    
    const row: CSVRow = {
      email: values[0] || null,           // Kolumna A - email
      uber_id: values[1] || null,         // Kolumna B - ID Uber
      phone: values[2] || null,           // Kolumna C - nr tel
      freenow_id: values[3] || null,      // Kolumna D - ID FreeNow
      fuel_card: values[4] || null,       // Kolumna E - karta paliwowa
      full_name: values[5] || '',         // Kolumna F - Imie nazwisko
      getrido_id: values[23] || null,     // Ostatnia kolumna - GetRido ID
    };
    
    // Add all financial columns for amounts mapping
    for (let j = 6; j < values.length; j++) {
      row[`col_${j}`] = values[j];
    }
    
    rows.push(row);
  }
  
  return rows;
}

// Map row to settlement amounts
function mapRowToAmounts(row: CSVRow): Record<string, number> {
  const parseNum = (val: any): number => {
    if (!val) return 0;
    const str = String(val).replace(/[^\d.-]/g, '').replace(',', '.');
    return parseFloat(str) || 0;
  };
  
  // Mapowanie kolumn z nowego CSV (kolumny 7-22)
  return {
    uber: parseNum(row['col_6']),                    // Kolumna G - Uber
    uber_cashless: parseNum(row['col_7']),           // Kolumna H - Uber bezgotówka
    uber_cash: parseNum(row['col_8']),               // Kolumna I - uber gotówka
    bolt_gross: parseNum(row['col_9']),              // Kolumna J - bolt brutto
    bolt_net: parseNum(row['col_10']),               // Kolumna K - bolt netto
    bolt_commission: parseNum(row['col_11']),        // Kolumna L - bolt prowizja
    bolt_cash: parseNum(row['col_12']),              // Kolumna M - bolt gotówka
    freenow_gross: parseNum(row['col_13']),          // Kolumna N - freenow brutto
    freenow_net: parseNum(row['col_14']),            // Kolumna O - freenow netto
    freenow_commission: parseNum(row['col_15']),     // Kolumna P - freenow prowizja
    freenow_cash: parseNum(row['col_16']),           // Kolumna Q - freenow gotówka
    total_cash: parseNum(row['col_17']),             // Kolumna R - razem gotówka
    total_commission: parseNum(row['col_18']),       // Kolumna S - razem prowizja
    tax: parseNum(row['col_19']),                    // Kolumna T - podatek
    fuel: parseNum(row['col_20']),                   // Kolumna U - paliwo
    fuel_vat: parseNum(row['col_21']),               // Kolumna V - vat z paliwa
    fuel_vat_refund: parseNum(row['col_22'])         // Kolumna W - zwrot vat
  };
}

// Generate row ID for idempotency
function generateRowId(driverId: string, periodFrom: string, periodTo: string, rowIndex: number): string {
  const data = `${driverId}-${periodFrom}-${periodTo}-${rowIndex}`;
  return btoa(data).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { csv_text, period_from, period_to, city_id, force_first_import } = await req.json();
    
    console.log('🚀 CSV Import started:', { 
      period_from, 
      period_to, 
      city_id, 
      force_first_import,
      csv_length: csv_text?.length 
    });
    
    if (!csv_text || !period_from || !period_to || !city_id) {
      throw new Error('Missing required fields: csv_text, period_from, period_to, city_id');
    }
    
    // Use force_first_import parameter or auto-detect
    const firstImport = force_first_import === true || await isFirstImport(supabase);
    
    if (firstImport) {
      console.log('⚠️ FIRST IMPORT - Deleting all drivers from database');
      
      // Delete all drivers (cascade will delete related data)
      const { error: deleteError } = await supabase
        .from('drivers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (deleteError) {
        console.error('❌ Error deleting existing drivers:', deleteError);
        throw new Error('Failed to reset database for first import');
      }
      
      console.log('✅ All drivers deleted successfully');
      
      await createAlert(
        supabase,
        'info',
        'system',
        'Pierwszy import - baza zresetowana',
        `Baza kierowców została wyczyszczona. ${force_first_import ? 'Użytkownik wymusił reset.' : 'Wykryto pustą bazę.'}`,
        { period_from, period_to, forced: force_first_import }
      );
    }

    // Fetch manual matches
    const { data: manualMatches } = await supabase
      .from('manual_driver_matches')
      .select('*');
    
    const matches = manualMatches || [];

    // Create import job
    const { data: importJob, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        week_start: period_from,
        week_end: period_to,
        platform: 'csv',
        filename: 'settlements.csv',
        status: 'processing',
        city_id: city_id
      })
      .select()
      .single();
    
    if (jobError) {
      console.error('Error creating import job:', jobError);
      throw jobError;
    }
    
    const importJobId = importJob.id;
    
    // Parse CSV
    const rows = parseCSV(csv_text);
    console.log(`Parsed ${rows.length} rows from CSV`);
    
    let added = 0;
    let updated = 0;
    let errors = 0;
    let newDriversCount = 0;
    let matchedDriversCount = 0;

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Find or create driver
        const { driver, isNew } = await findOrCreateDriver(
          supabase,
          row,
          city_id,
          importJobId,
          firstImport,
          matches
        );
        
        if (!driver) {
          errors++;
          continue;
        }
        
        if (isNew) {
          newDriversCount++;
        } else {
          matchedDriversCount++;
        }
        
        // Map amounts
        const amounts = mapRowToAmounts(row);
        
        // Generate row ID for idempotency
        const rawRowId = generateRowId(driver.id, period_from, period_to, i);
        
        // Check if settlement already exists
        const { data: existing } = await supabase
          .from('settlements')
          .select('id')
          .eq('raw_row_id', rawRowId)
          .maybeSingle();
        
        if (existing) {
          // Update existing
          await supabase
            .from('settlements')
            .update({
              amounts,
              raw: row,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
          
          updated++;
        } else {
          // Insert new
          await supabase
            .from('settlements')
            .insert({
              city_id,
              driver_id: driver.id,
              period_from,
              period_to,
              platform: 'main',
              source: 'csv_import',
              amounts,
              raw: row,
              raw_row_id: rawRowId
            });
          
          added++;
        }
        
      } catch (err) {
        console.error(`Error processing row ${i}:`, err);
        errors++;
        
        await createAlert(
          supabase,
          'error',
          'import',
          `Błąd przetwarzania wiersza ${i + 2}`,
          `Nie udało się przetworzyć wiersza: ${err instanceof Error ? err.message : 'Nieznany błąd'}`,
          { row, rowIndex: i + 2, error: String(err) },
          undefined,
          importJobId
        );
      }
    }
    
    // Update import job status
    await supabase
      .from('import_jobs')
      .update({ status: 'completed' })
      .eq('id', importJobId);
    
    // Create import history record
    await supabase
      .from('import_history')
      .insert({
        import_job_id: importJobId,
        period_from,
        period_to,
        total_rows: rows.length,
        successful_rows: added + updated,
        error_rows: errors,
        new_drivers_count: newDriversCount,
        matched_drivers_count: matchedDriversCount,
        is_first_import: firstImport,
        filename: 'settlements.csv'
      });

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total: rows.length,
          added,
          updated,
          errors,
          newDrivers: newDriversCount,
          matchedDrivers: matchedDriversCount,
          isFirstImport: firstImport
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('CSV import error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
