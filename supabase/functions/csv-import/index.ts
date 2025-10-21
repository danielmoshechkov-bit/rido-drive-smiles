import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CSVRow {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  uber_uuid?: string;
  bolt_id?: string;
  freenow_id?: string;
  [key: string]: any;
}

interface DedupSettings {
  prefer_match_by_email: boolean;
  prefer_match_by_phone: boolean;
  allow_match_by_platform_ids: boolean;
  ignore_empty_email_phone: boolean;
  phone_country_default: string;
}

// Normalize phone number to E.164 format
function normalizePhone(phone: string, countryCode: string = 'PL'): string | null {
  if (!phone) return null;
  
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  
  const countryPrefixes: Record<string, string> = {
    'PL': '48',
    'DE': '49',
    'FR': '33',
    'UK': '44',
  };
  
  const prefix = countryPrefixes[countryCode] || '48';
  
  if (digits.startsWith(prefix)) {
    return '+' + digits;
  } else {
    return '+' + prefix + digits;
  }
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

// Get platform ID from row
function getPlatformId(row: CSVRow, source: string): string | null {
  if (source === 'uber') return row.uber_uuid || row['Uber UUID'] || null;
  if (source === 'bolt') return row.bolt_id || row['Bolt ID'] || null;
  if (source === 'freenow') return row.freenow_id || row['FreeNow ID'] || null;
  return null;
}

// Find or create driver
async function findOrCreateDriver(
  supabase: any,
  row: CSVRow,
  dedupSettings: DedupSettings,
  source: string,
  importJobId: string,
  isFirstImport: boolean,
  manualMatches: any[]
): Promise<{ driver: any; isNew: boolean; matchMethod?: string }> {
  const email = normalizeEmail(row.email || '');
  const phone = normalizePhone(row.phone || '', dedupSettings.phone_country_default || 'PL');
  
  // Validate email if provided
  if (email && !isValidEmail(email)) {
    await createAlert(
      supabase,
      'error',
      'validation',
      'Nieprawidłowy adres email',
      `Email "${email}" dla kierowcy ${row.first_name} ${row.last_name} jest nieprawidłowy`,
      { row, source },
      undefined,
      importJobId
    );
    return { driver: null, isNew: false, matchMethod: 'validation_failed' };
  }
  
  // 1. Check manual matches first
  if (email) {
    const manualMatch = manualMatches.find(
      m => m.match_key === 'email' && m.match_value.toLowerCase() === email.toLowerCase()
    );
    if (manualMatch) {
      const { data: driver } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', manualMatch.driver_id)
        .single();
      
      if (driver) {
        console.log('Matched driver by manual email match:', driver.id);
        return { driver, isNew: false, matchMethod: 'manual_email' };
      }
    }
  }
  
  if (phone) {
    const manualMatch = manualMatches.find(
      m => m.match_key === 'phone' && m.match_value === phone
    );
    if (manualMatch) {
      const { data: driver } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', manualMatch.driver_id)
        .single();
      
      if (driver) {
        console.log('Matched driver by manual phone match:', driver.id);
        return { driver, isNew: false, matchMethod: 'manual_phone' };
      }
    }
  }
  
  // 2. Try to match by platform ID (skip if first import)
  if (dedupSettings.allow_match_by_platform_ids && !isFirstImport) {
    const platformId = getPlatformId(row, source);
    if (platformId) {
      const { data: platformData } = await supabase
        .from('driver_platform_ids')
        .select('driver_id, drivers(*)')
        .eq('platform', source)
        .eq('platform_id', platformId)
        .maybeSingle();
      
      if (platformData && platformData.drivers) {
        console.log('Found driver by platform ID:', platformData.drivers.id);
        return { driver: platformData.drivers, isNew: false, matchMethod: 'platform_id' };
      }
    }
  }
  
  // 3. Try to match by email (skip if first import)
  if (dedupSettings.prefer_match_by_email && email && !isFirstImport) {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .ilike('email', email)
      .limit(1);
    
    if (data && data.length > 0) {
      console.log('Found driver by email:', data[0].id);
      return { driver: data[0], isNew: false, matchMethod: 'email' };
    }
  }
  
  // 4. Try to match by phone (skip if first import)
  if (dedupSettings.prefer_match_by_phone && phone && !isFirstImport) {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .eq('phone', phone)
      .limit(1);
    
    if (data && data.length > 0) {
      console.log('Found driver by phone:', data[0].id);
      return { driver: data[0], isNew: false, matchMethod: 'phone' };
    }
  }
  
  // 5. No match found - check if we have minimum required data
  if (!email && !phone && dedupSettings.ignore_empty_email_phone) {
    await createAlert(
      supabase,
      'error',
      'validation',
      'Brak danych kontaktowych',
      `Kierowca ${row.first_name} ${row.last_name} nie ma ani emaila ani telefonu`,
      { row, source },
      undefined,
      importJobId
    );
    return { driver: null, isNew: false, matchMethod: 'validation_failed' };
  }
  
  // 6. Create new driver
  console.log('No existing driver found, creating new one');
  
  const { data: newDriver, error: insertError } = await supabase
    .from('drivers')
    .insert({
      first_name: row.first_name,
      last_name: row.last_name,
      email: email || null,
      phone: phone || null,
      city_id: null
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
      `Nie udało się utworzyć kierowcy ${row.first_name} ${row.last_name}: ${insertError.message}`,
      { row, source, error: insertError },
      undefined,
      importJobId
    );
    throw insertError;
  }
  
  // Create auth account with temp password (don't send email)
  try {
    const tempPassword = 'Test12345!';
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email || `${newDriver.id}@temp.rido.local`,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: row.first_name,
        last_name: row.last_name,
        driver_id: newDriver.id
      }
    });
    
    if (authError) {
      console.error('Error creating auth account:', authError);
      await createAlert(
        supabase,
        'warning',
        'system',
        'Nie utworzono konta auth',
        `Kierowca ${row.first_name} ${row.last_name} został dodany, ale nie udało się utworzyć konta logowania`,
        { driver_id: newDriver.id, error: authError },
        newDriver.id,
        importJobId
      );
    }
  } catch (authErr) {
    console.error('Exception creating auth account:', authErr);
  }
  
  // Add platform ID if available
  const platformId = getPlatformId(row, source);
  if (platformId) {
    await supabase
      .from('driver_platform_ids')
      .insert({
        driver_id: newDriver.id,
        platform: source,
        platform_id: platformId
      });
  }
  
  // Create alert for new driver
  await createAlert(
    supabase,
    'new_driver',
    'import',
    'Nowy kierowca utworzony',
    `${row.first_name} ${row.last_name} (${email || phone || 'brak kontaktu'})`,
    { source, isFirstImport },
    newDriver.id,
    importJobId
  );
  
  console.log('Created new driver:', newDriver.id);
  return { driver: newDriver, isNew: true, matchMethod: 'created' };
}

// Map CSV row to amounts
function mapRowToAmounts(row: CSVRow, source: string): Record<string, number> {
  const amounts: Record<string, number> = {};
  
  const parseNum = (val: string): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/[^\d.-]/g, '')) || 0;
  };
  
  if (source === 'uber') {
    amounts.uberCard = parseNum(row.card || row.Card || row['Uber bezgotówka'] || '0');
    amounts.uberCash = parseNum(row.cash || row.Cash || row['Uber gotówka'] || '0');
  } else if (source === 'bolt') {
    amounts.boltGross = parseNum(row.gross || row.Gross || row['Bolt brutto'] || '0');
    amounts.boltNet = parseNum(row.net || row.Net || row['Bolt netto'] || '0');
    amounts.boltCash = parseNum(row.cash || row.Cash || row['Bolt gotówka'] || '0');
  } else if (source === 'freenow') {
    amounts.freeNowGross = parseNum(row.gross || row.Gross || row['FreeNow brutto'] || '0');
    amounts.freeNowNet = parseNum(row.net || row.Net || row['FreeNow netto'] || '0');
    amounts.freeNowCash = parseNum(row.cash || row.Cash || row['FreeNow gotówka'] || '0');
  } else if (source === 'main') {
    amounts.uberCard = parseNum(row['Uber bezgotówka'] || row.uber_card || '0');
    amounts.uberCash = parseNum(row['Uber gotówka'] || row.uber_cash || '0');
    amounts.boltGross = parseNum(row['Bolt brutto'] || row.bolt_gross || '0');
    amounts.boltNet = parseNum(row['Bolt netto'] || row.bolt_net || '0');
    amounts.boltCash = parseNum(row['Bolt gotówka'] || row.bolt_cash || '0');
    amounts.freeNowGross = parseNum(row['FreeNow brutto'] || row.freenow_gross || '0');
    amounts.freeNowNet = parseNum(row['FreeNow netto'] || row.freenow_net || '0');
    amounts.freeNowCash = parseNum(row['FreeNow gotówka'] || row.freenow_cash || '0');
    amounts.fuel = parseNum(row.paliwo || row.fuel || '0');
    amounts.vatFromFuel = parseNum(row['VAT z paliwa'] || row.vat_from_fuel || '0');
    amounts.vatRefundHalf = parseNum(row['Zwrot VAT'] || row.vat_refund_half || '0');
    amounts.commission = parseNum(row.prowizja || row.commission || '0');
    amounts.tax = parseNum(row.podatek || row.tax || '0');
  }
  
  return amounts;
}

// Parse CSV
function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: CSVRow = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    rows.push(row);
  }
  
  return rows;
}

// Generate row ID for idempotency
function generateRowId(source: string, periodFrom: string, periodTo: string, platform: string, identifier: string, rowIndex: number): string {
  const data = `${source}-${periodFrom}-${periodTo}-${platform}-${identifier}-${rowIndex}`;
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

    const { uber_csv, bolt_csv, freenow_csv, main_csv, period_from, period_to } = await req.json();
    
    console.log('Received import request for period:', period_from, 'to', period_to);
    
    // Check if this is the first import
    const firstImport = await isFirstImport(supabase);
    
    if (firstImport) {
      console.log('⚠️ FIRST IMPORT DETECTED - Database will be reset');
      
      // Delete all drivers (cascade will delete related data)
      const { error: deleteError } = await supabase
        .from('drivers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (deleteError) {
        console.error('Error deleting existing drivers:', deleteError);
        throw new Error('Failed to reset database for first import');
      }
      
      await createAlert(
        supabase,
        'info',
        'system',
        'Pierwszy import - baza zresetowana',
        'Wykryto pierwszy import CSV. Wszyscy istniejący kierowcy zostali usunięci z bazy danych.',
        { period_from, period_to }
      );
    }

    // Fetch deduplication settings
    const { data: dedupData } = await supabase
      .from('rido_dedup_settings')
      .select('*')
      .maybeSingle();
    
    const dedupSettings: DedupSettings = dedupData || {
      prefer_match_by_email: true,
      prefer_match_by_phone: true,
      allow_match_by_platform_ids: true,
      ignore_empty_email_phone: true,
      phone_country_default: 'PL'
    };
    
    // Fetch manual matches for learning
    const { data: manualMatches } = await supabase
      .from('manual_driver_matches')
      .select('*');
    
    const matches = manualMatches || [];

    let added = 0;
    let updated = 0;
    let skipped = 0;
    let newDriversCount = 0;
    let matchedDriversCount = 0;
    const errors: any[] = [];
    
    // Create import job
    const { data: importJob, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        week_start: period_from,
        week_end: period_to,
        platform: 'csv',
        filename: 'import.csv',
        status: 'processing'
      })
      .select()
      .single();
    
    if (jobError) {
      console.error('Error creating import job:', jobError);
      throw jobError;
    }
    
    const importJobId = importJob.id;

    // Process each CSV
    const csvs = [
      { content: uber_csv, source: 'uber' },
      { content: bolt_csv, source: 'bolt' },
      { content: freenow_csv, source: 'freenow' },
      { content: main_csv, source: 'main' },
    ];

    for (const { content, source } of csvs) {
      if (!content) continue;

      const rows = parseCSV(content);
      console.log(`Processing ${rows.length} rows from ${source}`);

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        
        try {
          // Find or create driver
          const { driver, isNew, matchMethod } = await findOrCreateDriver(
            supabase,
            row,
            dedupSettings,
            source,
            importJobId,
            firstImport,
            matches
          );
          
          if (!driver) {
            skipped++;
            continue;
          }
          
          if (isNew) {
            newDriversCount++;
          } else {
            matchedDriversCount++;
          }
          
          // Map amounts
          const amounts = mapRowToAmounts(row, source);
          
          // Generate row ID for idempotency
          const identifier = driver.email || driver.phone || driver.id;
          const rawRowId = generateRowId(source, period_from, period_to, source, identifier, rowIndex);
          
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
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            
            updated++;
          } else {
            // Insert new
            await supabase
              .from('settlements')
              .insert({
                driver_id: driver.id,
                source,
                period_from,
                period_to,
                raw_row_id: rawRowId,
                amounts,
                raw: row,
              });
            
            added++;
          }
        } catch (error) {
          console.error(`Error processing row ${rowIndex}:`, error);
          errors.push({
            row: rowIndex,
            source,
            error: error.message,
            data: row
          });
          
          // Create error alert
          await createAlert(
            supabase,
            'error',
            'import',
            `Błąd w wierszu ${rowIndex}`,
            error.message,
            { row, source, rowIndex },
            undefined,
            importJobId
          );
          
          skipped++;
        }
      }
    }
    
    // Update import job status
    await supabase
      .from('import_jobs')
      .update({ status: errors.length > 0 ? 'completed_with_errors' : 'completed' })
      .eq('id', importJobId);
    
    // Save import history
    const totalRows = 
      (uber_csv ? parseCSV(uber_csv).length : 0) +
      (bolt_csv ? parseCSV(bolt_csv).length : 0) +
      (freenow_csv ? parseCSV(freenow_csv).length : 0) +
      (main_csv ? parseCSV(main_csv).length : 0);
    
    await supabase
      .from('import_history')
      .insert({
        import_job_id: importJobId,
        filename: 'import.csv',
        period_from,
        period_to,
        total_rows: totalRows,
        successful_rows: added + updated,
        error_rows: errors.length,
        new_drivers_count: newDriversCount,
        matched_drivers_count: matchedDriversCount,
        is_first_import: firstImport,
        metadata: { csvData: csvs.filter(c => c.content).map(c => c.source) }
      });

    return new Response(
      JSON.stringify({
        success: true,
        is_first_import: firstImport,
        added,
        updated,
        skipped,
        new_drivers: newDriversCount,
        matched_drivers: matchedDriversCount,
        errors,
        import_job_id: importJobId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in csv-import function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
