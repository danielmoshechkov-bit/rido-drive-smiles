import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

interface CSVRow {
  [key: string]: string
}

interface ImportJobResult {
  ok: boolean
  job_id?: string
  inserted?: number
  errors?: string[]
}

interface ComputeResult {
  ok: boolean
  rows?: number
  errors?: string[]
}

// Helper function to get Monday of the week for a given date
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday as first day
  return new Date(d.setDate(diff))
}

// Helper function to get Sunday of the week for a given date
function getWeekEnd(date: Date): Date {
  const weekStart = getWeekStart(date)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  return weekEnd
}

// Parse CSV content
function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
  const rows: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
    const row: CSVRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

function parseExcel(fileBuffer: ArrayBuffer): CSVRow[] {
  try {
    const workbook = XLSX.read(fileBuffer);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (data.length < 2) return [];
    
    const headers = (data[0] as any[]).map(h => String(h).trim());
    const rows: CSVRow[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const values = (data[i] as any[]).map(v => String(v || '').trim());
      const row: CSVRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }
    
    return rows;
  } catch (error) {
    console.error('Excel parsing error:', error);
    return [];
  }
}

// Parse date string to UTC timestamp
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  
  try {
    // Try various date formats
    const formats = [
      // ISO format
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      // European format DD/MM/YYYY HH:mm:ss
      /^\d{1,2}\/\d{1,2}\/\d{4}/,
      // US format MM/DD/YYYY HH:mm:ss
      /^\d{1,2}\/\d{1,2}\/\d{4}/,
      // Simple date YYYY-MM-DD
      /^\d{4}-\d{2}-\d{2}$/
    ]
    
    // For now, assume Warsaw timezone and convert to UTC
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    
    return date
  } catch (error) {
    console.error('Error parsing date:', dateStr, error)
    return null
  }
}

// Parse numeric value
function parseNumeric(value: string): number {
  if (!value) return 0
  
  // Remove currency symbols and spaces
  const cleaned = value.replace(/[€$£,\s]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  
  return isNaN(num) ? 0 : num
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (action === 'import') {
      return await handleImport(req, supabase)
    } else if (action === 'compute') {
      return await handleCompute(req, supabase)
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action parameter' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
  } catch (error) {
    console.error('Request error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function handleImport(req: Request, supabase: any): Promise<Response> {
  try {
    console.log('=== IMPORT START ===')

    // Parse form data
    const formData = await req.formData()
    const platform = formData.get('platform')?.toString()
    const weekStart = formData.get('week_start')?.toString()
    const weekEnd = formData.get('week_end')?.toString()
    const cityId = formData.get('city_id')?.toString()
    const file = formData.get('file') as File

    console.log('Import parameters:', { platform, weekStart, weekEnd, cityId, fileName: file?.name })

    // Validate inputs
    if (!platform || !weekStart || !weekEnd || !cityId || !file) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create import job record
    console.log('Creating import job...')
    const { data: jobData, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        platform: platform,
        filename: file.name,
        week_start: weekStart,
        week_end: weekEnd,
        city_id: cityId,
        status: 'processing'
      })
      .select('id')
      .single()

    if (jobError) {
      console.error('Error creating import job:', jobError)
      return new Response(
        JSON.stringify({ error: 'Failed to create import job' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const jobId = jobData.id
    console.log('Created import job:', jobId)

    // Read file content
    console.log('Reading file content...')
    const fileBuffer = await file.arrayBuffer()
    const csvContent = new TextDecoder().decode(fileBuffer)

    // Parse file content (CSV or Excel)
    console.log('Parsing file content...');
    let parsedRows: CSVRow[];
    const fileName = file.name?.toLowerCase() || '';
    
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      parsedRows = parseExcel(fileBuffer);
      console.log(`Parsed ${parsedRows.length} rows from Excel file`);
    } else {
      parsedRows = parseCSV(csvContent);
      console.log(`Parsed ${parsedRows.length} rows from CSV file`);
    }

    // Fetch platform column mapping configuration
    console.log(`Fetching column mapping for platform: ${platform}`)
    const { data: configData, error: configError } = await supabase
      .from('platform_import_config')
      .select('columns')
      .eq('platform', platform)
      .single()

    if (configError) {
      console.error('Error fetching platform config:', configError)
      await supabase
        .from('import_jobs')
        .update({ status: 'error' })
        .eq('id', jobId)
      
      return new Response(
        JSON.stringify({ error: 'Platform configuration not found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const columnMapping = configData.columns
    console.log('Column mapping:', columnMapping)

    // Check if this is the new driver settlement format
    const isDriverFormat = parsedRows.length > 0 && parsedRows[0]['Identyfikator'];
    
    let platformIdToDriverId = new Map<string, string>();
    let identifierToDriverId = new Map<string, string>();
    
    if (isDriverFormat) {
      // For driver format, get driver UUIDs directly from CSV
      console.log('Processing driver settlement format with UUIDs');
      
      // Fetch all drivers to validate UUIDs
      const { data: allDrivers, error: driverError } = await supabase
        .from('drivers')
        .select('id, first_name, last_name');
        
      if (driverError) {
        console.error('Error fetching drivers:', driverError);
      }
      
      const driverIdToInfo = new Map<string, { first_name: string, last_name: string }>();
      if (allDrivers) {
        for (const driver of allDrivers) {
          driverIdToInfo.set(driver.id, { first_name: driver.first_name, last_name: driver.last_name });
        }
      }
      
      // Map identifiers from CSV to driver IDs
      for (const row of parsedRows) {
        const identifier = row['Identyfikator'];
        if (identifier && driverIdToInfo.has(identifier)) {
          identifierToDriverId.set(identifier, identifier);
        }
      }
      
      console.log(`Found ${identifierToDriverId.size} driver UUID mappings`);
    } else {
      // Original platform format - get driver platform IDs
      console.log(`Fetching driver platform IDs for platform: ${platform}`);
      const { data: driverPlatformIds, error: driverError } = await supabase
        .from('driver_platform_ids')
        .select('driver_id, platform_id')
        .eq('platform', platform);

      if (driverError) {
        console.error('Error fetching driver platform IDs:', driverError);
      }

      if (driverPlatformIds) {
        for (const item of driverPlatformIds) {
          platformIdToDriverId.set(item.platform_id, item.driver_id);
        }
      }
      console.log(`Found ${platformIdToDriverId.size} platform ID mappings`);
    }

    // Process rows based on format
    console.log('Processing rows and mapping to database format...');
    const ridesToInsert: any[] = [];
    const driverSettlements: any[] = [];
    const errors: any[] = [];
    
    if (isDriverFormat) {
      // Process driver settlement format
      console.log('Processing driver settlement format...');
      
      for (let rowIndex = 0; rowIndex < parsedRows.length; rowIndex++) {
        const row = parsedRows[rowIndex];
        
        try {
          const identifier = row['Identyfikator'];
          const imie = row['imie'] || row['Imie'] || '';
          const nazwisko = row['nazwisko'] || row['Nazwisko'] || '';
          const kwotaPrzelewu = parseNumeric(row['kwota_przelewu'] || row['Kwota_przelewu'] || '0');
          const gotowka = parseNumeric(row['gotowka'] || row['Gotowka'] || '0');
          
          if (!identifier) {
            errors.push({
              job_id: jobId,
              row_no: rowIndex + 2,
              code: 'MISSING_IDENTIFIER',
              message: 'Missing driver identifier',
              raw: row
            });
            continue;
          }
          
          const driverId = identifierToDriverId.get(identifier);
          if (!driverId) {
            errors.push({
              job_id: jobId,
              row_no: rowIndex + 2,
              code: 'UNKNOWN_DRIVER_UUID',
              message: `Driver not found for UUID: ${identifier}`,
              raw: row
            });
            continue;
          }
          
          // Calculate values according to specification
          // przychod_laczny = bezgotowka + gotowka (where gotowka is negative in CSV, so subtract it)
          const bezgotowka = kwotaPrzelewu;
          const przychod_laczny = kwotaPrzelewu - gotowka; // D - F
          // For now, wyplata = przychod_laczny (can be adjusted later with fees)
          const wyplata = przychod_laczny;
          
          const settlementData = {
            job_id: jobId,
            driver_id: driverId,
            week_start: weekStart,
            week_end: weekEnd,
            bezgotowka: bezgotowka,
            gotowka: Math.abs(gotowka), // Store as positive for display
            przychod_laczny: przychod_laczny,
            wyplata: wyplata,
            platform: platform
          };
          
          driverSettlements.push(settlementData);
          
        } catch (error) {
          errors.push({
            job_id: jobId,
            row_no: rowIndex + 2,
            code: 'PARSE_ERROR',
            message: `Error parsing driver settlement row: ${error.message}`,
            raw: row
          });
        }
      }
    } else {
      // Original ride format processing
      for (let rowIndex = 0; rowIndex < parsedRows.length; rowIndex++) {
        const row = parsedRows[rowIndex];
        
        try {
          // Map CSV columns to our expected format using the configuration
          const mappedData: any = {};
          for (const [ourColumn, csvColumn] of Object.entries(columnMapping)) {
            mappedData[ourColumn] = row[csvColumn] || '';
          }
          
          // Parse dates
          const startedAt = parseDate(mappedData.started_at);
          const completedAt = parseDate(mappedData.completed_at);
          
          // Parse numeric values
          const grossAmount = parseNumeric(mappedData.gross_amount);
          const commissionAmount = parseNumeric(mappedData.commission_amount);
          const cashCollected = parseNumeric(mappedData.cash_collected);
          const adjustments = parseNumeric(mappedData.adjustments);
          
          // Get driver ID from platform mapping
          const driverPlatformId = mappedData.driver_platform_id;
          const driverId = platformIdToDriverId.get(driverPlatformId);
          
          if (!driverId) {
            errors.push({
              job_id: jobId,
              row_no: rowIndex + 2, // +2 because we skip header and arrays are 0-based
              code: 'UNKNOWN_DRIVER',
              message: `Driver not found for platform ID: ${driverPlatformId}`,
              raw: row
            });
            continue;
          }
          
          // Create ride object
          const rideData = {
            job_id: jobId,
            driver_id: driverId,
            driver_platform_id: driverPlatformId,
            platform: platform,
            trip_uuid: mappedData.trip_uuid || `${jobId}-${rowIndex}`,
            started_at: startedAt,
            completed_at: completedAt,
            gross_amount: grossAmount,
            commission_amount: commissionAmount,
            cash_collected: cashCollected,
            adjustments: adjustments,
            city: mappedData.city || null,
            extra: {} // Store any additional data here if needed
          };
          
          ridesToInsert.push(rideData);
          
        } catch (error) {
          errors.push({
            job_id: jobId,
            row_no: rowIndex + 2,
            code: 'PARSE_ERROR',
            message: `Error parsing row: ${error.message}`,
            raw: row
          });
        }
      }
    }

    // Insert data based on format
    let insertedCount = 0;
    
    if (isDriverFormat && driverSettlements.length > 0) {
      console.log(`Inserting ${driverSettlements.length} driver settlements...`);
      const { data: insertedSettlements, error: insertError } = await supabase
        .from('driver_settlements')
        .insert(driverSettlements)
        .select('id');

      if (insertError) {
        console.error('Error inserting driver settlements:', insertError);
        await supabase
          .from('import_jobs')
          .update({ status: 'error' })
          .eq('id', jobId);
        
        return new Response(
          JSON.stringify({ error: 'Failed to insert driver settlements data' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      insertedCount = insertedSettlements?.length || 0;
      console.log(`Successfully inserted ${insertedCount} driver settlements`);
    } else if (ridesToInsert.length > 0) {
      console.log(`Inserting ${ridesToInsert.length} rides...`);
      const { data: insertedRides, error: insertError } = await supabase
        .from('rides_raw')
        .insert(ridesToInsert)
        .select('id');

      if (insertError) {
        console.error('Error inserting rides:', insertError);
        await supabase
          .from('import_jobs')
          .update({ status: 'error' })
          .eq('id', jobId);
        
        return new Response(
          JSON.stringify({ error: 'Failed to insert rides data' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      insertedCount = insertedRides?.length || 0;
      console.log(`Successfully inserted ${insertedCount} rides`);
    }

    // Insert errors if any
    if (errors.length > 0) {
      console.log(`Inserting ${errors.length} errors...`)
      const { error: errorInsertError } = await supabase
        .from('import_errors')
        .insert(errors)

      if (errorInsertError) {
        console.error('Error inserting errors:', errorInsertError)
      }
    }

    // Update job status
    console.log('Updating import job status to done...')
    const { error: updateError } = await supabase
      .from('import_jobs')
      .update({ status: 'done' })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error updating job status:', updateError)
    }

    console.log('=== IMPORT COMPLETE ===')

    return new Response(
      JSON.stringify({ 
        ok: true, 
        job_id: jobId,
        inserted: insertedCount,
        errors: errors.length
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Import error:', error)
    return new Response(
      JSON.stringify({ error: 'Import failed' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}

async function handleCompute(req: Request, supabase: any): Promise<Response> {
  try {
    console.log('=== COMPUTE START ===')
    
    const body = await req.json()
    const jobId = body.job_id
    
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'Missing job_id in request body' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    console.log('Computing settlements for job:', jobId)
    
    // Get job details
    const { data: jobData, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    
    if (jobError || !jobData) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    console.log('Job data:', jobData)
    
    // Delete existing settlements for this job_id
    console.log('Deleting existing settlements for job...')
    const { error: deleteError } = await supabase
      .from('settlements_weekly')
      .delete()
      .eq('job_id', jobId)
    
    if (deleteError) {
      console.error('Error deleting existing settlements:', deleteError)
    }
    
    // Aggregate rides data for weekly settlements
    console.log('Aggregating rides data...')
    const { data: ridesData, error: ridesError } = await supabase
      .from('rides_raw')
      .select(`
        driver_id,
        platform,
        gross_amount,
        commission_amount,
        cash_collected,
        adjustments
      `)
      .eq('job_id', jobId)
    
    if (ridesError) {
      console.error('Error fetching rides data:', ridesError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rides data' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    console.log(`Found ${ridesData?.length || 0} rides for job`)
    
    // Group by driver_id and platform
    const settlements = new Map()
    
    if (ridesData) {
      for (const ride of ridesData) {
        const key = `${ride.driver_id}_${ride.platform}`
        
        if (!settlements.has(key)) {
          settlements.set(key, {
            driver_id: ride.driver_id,
            platform: ride.platform,
            trips_count: 0,
            gross_sum: 0,
            commission_sum: 0,
            cash_sum: 0,
            adjustments_sum: 0
          })
        }
        
        const settlement = settlements.get(key)
        settlement.trips_count += 1
        settlement.gross_sum += ride.gross_amount || 0
        settlement.commission_sum += ride.commission_amount || 0
        settlement.cash_sum += ride.cash_collected || 0
        settlement.adjustments_sum += ride.adjustments || 0
      }
    }
    
    // Convert to array and add job details
    const settlementsToInsert = Array.from(settlements.values()).map(settlement => ({
      ...settlement,
      job_id: jobId,
      week_start: jobData.week_start,
      week_end: jobData.week_end,
      net_result: settlement.gross_sum - settlement.commission_sum + settlement.adjustments_sum
    }))
    
    console.log(`Inserting ${settlementsToInsert.length} weekly settlements...`)
    
    // Insert weekly settlements
    let insertedCount = 0
    if (settlementsToInsert.length > 0) {
      const { data: insertedSettlements, error: insertError } = await supabase
        .from('settlements_weekly')
        .insert(settlementsToInsert)
        .select('id')
      
      if (insertError) {
        console.error('Error inserting weekly settlements:', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to insert weekly settlements' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      
      insertedCount = insertedSettlements?.length || 0
      console.log(`Successfully inserted ${insertedCount} weekly settlements`)
    }
    
    console.log('=== COMPUTE COMPLETE ===')
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        rows: insertedCount
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
    
  } catch (error) {
    console.error('Compute error:', error)
    return new Response(
      JSON.stringify({ error: 'Compute failed' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}