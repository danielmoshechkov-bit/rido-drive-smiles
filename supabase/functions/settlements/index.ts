import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SettlementRequest {
  period_from: string;
  period_to: string;
  city_id: string;
  uber_csv?: string;
  bolt_csv?: string;
  freenow_csv?: string;
  main_csv?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    console.log('🚀 Settlements edge function started');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SettlementRequest = await req.json();
    console.log('📥 Request body:', {
      period_from: body.period_from,
      period_to: body.period_to,
      city_id: body.city_id,
      has_uber: !!body.uber_csv,
      has_bolt: !!body.bolt_csv,
      has_freenow: !!body.freenow_csv,
      has_main: !!body.main_csv,
    });

    const { period_from, period_to, city_id, uber_csv, bolt_csv, freenow_csv, main_csv } = body;

    // Validate required fields
    if (!period_from || !period_to || !city_id) {
      throw new Error('Missing required fields: period_from, period_to, city_id');
    }

    // Parse CSV files
    const uberData = uber_csv ? parseCSV(atob(uber_csv)) : [];
    const boltData = bolt_csv ? parseCSV(atob(bolt_csv)) : [];
    const freenowData = freenow_csv ? parseCSV(atob(freenow_csv)) : [];
    const mainData = main_csv ? parseCSV(atob(main_csv)) : [];

    console.log('📊 Parsed CSV data:', {
      uber_rows: uberData.length,
      bolt_rows: boltData.length,
      freenow_rows: freenowData.length,
      main_rows: mainData.length,
    });

    // Debug: Log first 3 rows of main CSV
    if (mainData.length > 0) {
      console.log('🔍 First 3 rows of main CSV:', mainData.slice(0, 3).map((row, idx) => ({
        row_number: idx,
        columns: row.length,
        data: row
      })));
    }

    // BATCH PROCESSING: Fetch all drivers once
    console.log('🔍 Fetching all drivers for city:', city_id);
    const { data: allDrivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, email, driver_platform_ids(platform, platform_id)')
      .eq('city_id', city_id);

    if (driversError) {
      console.error('❌ Error fetching drivers:', driversError);
      throw driversError;
    }

    console.log('✅ Fetched drivers:', allDrivers?.length || 0);

    // Create maps for fast lookups
    const driversByEmail = new Map<string, any>();
    const driversByUberId = new Map<string, any>();
    const driversByBoltId = new Map<string, any>();
    const driversByFreeNowId = new Map<string, any>();

    allDrivers?.forEach(driver => {
      if (driver.email) {
        driversByEmail.set(driver.email.toLowerCase().trim(), driver);
      }
      
      if (Array.isArray(driver.driver_platform_ids)) {
        driver.driver_platform_ids.forEach((pid: any) => {
          if (pid.platform === 'uber' && pid.platform_id) {
            driversByUberId.set(pid.platform_id.trim(), driver);
          } else if (pid.platform === 'bolt' && pid.platform_id) {
            driversByBoltId.set(pid.platform_id.trim(), driver);
          } else if (pid.platform === 'freenow' && pid.platform_id) {
            driversByFreeNowId.set(pid.platform_id.trim(), driver);
          }
        });
      }
    });

    console.log('🗺️ Created lookup maps:', {
      by_email: driversByEmail.size,
      by_uber_id: driversByUberId.size,
      by_bolt_id: driversByBoltId.size,
      by_freenow_id: driversByFreeNowId.size,
    });

    // Create settlement period in database
    const { data: settlementPeriod, error: periodError } = await supabase
      .from('settlement_periods')
      .insert({
        city_id,
        week_start: period_from,
        week_end: period_to,
        status: 'robocze',
        google_sheet_url: 'https://docs.google.com/spreadsheets/d/1gzBs58BH7c3bzY4l6WnDMOBRvjK3T1brF9ZYdIx5WRc/edit?usp=sharing',
      })
      .select()
      .single();

    if (periodError) {
      console.error('❌ Error creating settlement period:', periodError);
      throw periodError;
    }

    console.log('✅ Settlement period created:', settlementPeriod.id);

    // Process settlements data and insert into database
    let totalProcessed = 0;
    let totalErrors = 0;
    const allUnmatched: any[] = [];

    // Process Uber data
    if (uberData.length > 0) {
      const { processed, errors, unmatched } = await processSettlements(
        supabase,
        uberData,
        'uber',
        city_id,
        period_from,
        period_to,
        driversByEmail,
        driversByUberId
      );
      totalProcessed += processed;
      totalErrors += errors;
      allUnmatched.push(...unmatched);
    }

    // Process Bolt data
    if (boltData.length > 0) {
      const { processed, errors, unmatched } = await processSettlements(
        supabase,
        boltData,
        'bolt',
        city_id,
        period_from,
        period_to,
        driversByEmail,
        driversByBoltId
      );
      totalProcessed += processed;
      totalErrors += errors;
      allUnmatched.push(...unmatched);
    }

    // Process FreeNow data
    if (freenowData.length > 0) {
      const { processed, errors, unmatched } = await processSettlements(
        supabase,
        freenowData,
        'freenow',
        city_id,
        period_from,
        period_to,
        driversByEmail,
        driversByFreeNowId
      );
      totalProcessed += processed;
      totalErrors += errors;
      allUnmatched.push(...unmatched);
    }

    // Process Main data (combined)
    if (mainData.length > 0) {
      const { processed, errors, unmatched } = await processSettlements(
        supabase,
        mainData,
        'main',
        city_id,
        period_from,
        period_to,
        driversByEmail,
        new Map() // No specific platform map for main
      );
      totalProcessed += processed;
      totalErrors += errors;
      allUnmatched.push(...unmatched);
    }

    const duration = Date.now() - startTime;
    console.log('✅ All settlements processed:', { 
      totalProcessed, 
      totalErrors,
      unmatched: allUnmatched.length,
      duration_ms: duration
    });

    // Create alert for unmatched drivers
    if (allUnmatched.length > 0) {
      console.log('⚠️ Creating alert for unmatched drivers');
      await supabase.from('system_alerts').insert({
        type: 'warning',
        category: 'import',
        title: `Nie znaleziono ${allUnmatched.length} kierowców`,
        description: `Podczas importu rozliczeń ${allUnmatched.length} wierszy nie zostało dopasowanych do kierowców.`,
        metadata: {
          period_from,
          period_to,
          unmatched_count: allUnmatched.length,
          unmatched_drivers: allUnmatched.slice(0, 20), // First 20
          settlement_period_id: settlementPeriod.id
        },
        status: 'pending'
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        settlement_period_id: settlementPeriod.id,
        stats: {
          processed: totalProcessed,
          errors: totalErrors,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('💥 Error in settlements function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function parseCSV(csvText: string): string[][] {
  const lines = csvText.trim().split('\n').filter(line => {
    // Filter out empty lines
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.match(/^[;,\s]*$/);
  });
  
  return lines.map(line => {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if ((char === ',' || char === ';') && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());
    return values;
  });
}

async function processSettlements(
  supabase: any,
  data: string[][],
  platform: string,
  city_id: string,
  period_from: string,
  period_to: string,
  driversByEmail: Map<string, any>,
  driversByPlatformId: Map<string, any>
): Promise<{ processed: number; errors: number; unmatched: any[] }> {
  // Skip header row
  const rows = data.slice(1);

  console.log(`📝 Processing ${rows.length} rows for platform: ${platform}`);

  const settlementsToInsert: any[] = [];
  const unmatchedRows: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      // Skip empty rows
      if (row.every(cell => !cell || cell.trim() === '')) {
        continue;
      }

      // Extract data from row based on platform
      let driverEmail = '';
      let platformId = '';
      let totalEarnings = 0;
      let commissionAmount = 0;
      let netAmount = 0;
      
      if (platform === 'main') {
        // Main CSV format: email, platform_id, ..., total, commission, net
        driverEmail = row[0]?.toLowerCase().trim() || '';
        platformId = row[1]?.trim() || '';
        // Adjust these indices based on your actual CSV structure
        totalEarnings = parseFloat(row[row.length - 3] || '0') || 0;
        commissionAmount = parseFloat(row[row.length - 2] || '0') || 0;
        netAmount = parseFloat(row[row.length - 1] || '0') || 0;
        
        // Debug first few rows
        if (i < 3) {
          console.log(`🔍 Row ${i} parsing:`, {
            email: driverEmail,
            platform_id: platformId,
            total: totalEarnings,
            commission: commissionAmount,
            net: netAmount,
            row_length: row.length
          });
        }
      } else {
        // Other platforms format
        driverEmail = row[0]?.toLowerCase().trim() || '';
        platformId = row[1]?.trim() || '';
        totalEarnings = parseFloat(row[3] || '0') || 0;
        commissionAmount = parseFloat(row[4] || '0') || 0;
        netAmount = parseFloat(row[5] || '0') || 0;
      }

      // Find driver - PRIORITY: platform_id first, then email
      let driver = null;

      // 1. Try to match by platform_id
      if (platformId && driversByPlatformId.has(platformId)) {
        driver = driversByPlatformId.get(platformId);
      }

      // 2. Try to match by email
      if (!driver && driverEmail && driversByEmail.has(driverEmail)) {
        driver = driversByEmail.get(driverEmail);
      }

      // If no driver found, add to unmatched
      if (!driver) {
        unmatchedRows.push({
          platform,
          email: driverEmail,
          platform_id: platformId,
          earnings: totalEarnings,
          raw: row.slice(0, 5) // Only first 5 columns for brevity
        });
        continue;
      }

      // Add to batch insert
      settlementsToInsert.push({
        city_id,
        platform,
        period_from,
        period_to,
        driver_id: driver.id,
        total_earnings: totalEarnings,
        commission_amount: commissionAmount,
        net_amount: netAmount,
        week_start: period_from,
        week_end: period_to,
        rental_fee: 0,
        amounts: {},
        source: 'csv_import',
        raw_row_id: `${platform}_${i}`
      });
    } catch (err) {
      console.error(`❌ Error processing row ${i}:`, err);
      unmatchedRows.push({
        platform,
        row_number: i,
        error: err instanceof Error ? err.message : 'Unknown error',
        raw: row.slice(0, 5)
      });
    }
  }

  // BATCH INSERT
  let processed = 0;
  let errors = 0;

  if (settlementsToInsert.length > 0) {
    console.log(`💾 Batch inserting ${settlementsToInsert.length} settlements for ${platform}`);
    const { error: insertError } = await supabase
      .from('settlements')
      .insert(settlementsToInsert);

    if (insertError) {
      console.error(`❌ Batch insert error for ${platform}:`, insertError);
      errors = settlementsToInsert.length;
    } else {
      processed = settlementsToInsert.length;
      console.log(`✅ Successfully inserted ${processed} settlements for ${platform}`);
    }
  }

  return { processed, errors, unmatched: unmatchedRows };
}
