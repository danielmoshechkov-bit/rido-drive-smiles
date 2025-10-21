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

    // Process Uber data
    if (uberData.length > 0) {
      const { processed, errors } = await processSettlements(
        supabase,
        uberData,
        'uber',
        city_id,
        period_from,
        period_to
      );
      totalProcessed += processed;
      totalErrors += errors;
    }

    // Process Bolt data
    if (boltData.length > 0) {
      const { processed, errors } = await processSettlements(
        supabase,
        boltData,
        'bolt',
        city_id,
        period_from,
        period_to
      );
      totalProcessed += processed;
      totalErrors += errors;
    }

    // Process FreeNow data
    if (freenowData.length > 0) {
      const { processed, errors } = await processSettlements(
        supabase,
        freenowData,
        'freenow',
        city_id,
        period_from,
        period_to
      );
      totalProcessed += processed;
      totalErrors += errors;
    }

    // Process Main data (combined)
    if (mainData.length > 0) {
      const { processed, errors } = await processSettlements(
        supabase,
        mainData,
        'main',
        city_id,
        period_from,
        period_to
      );
      totalProcessed += processed;
      totalErrors += errors;
    }

    console.log('✅ All settlements processed:', { totalProcessed, totalErrors });

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
  const lines = csvText.trim().split('\n');
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
      } else if (char === ',' && !insideQuotes) {
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
  period_to: string
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  // Skip header row
  const rows = data.slice(1);

  console.log(`📝 Processing ${rows.length} rows for platform: ${platform}`);

  for (const row of rows) {
    try {
      // Parse row data (this will vary based on CSV format)
      // For now, we'll create a basic structure
      const settlement = {
        city_id,
        platform,
        period_from,
        period_to,
        driver_id: null, // Will need to be matched
        total_earnings: parseFloat(row[3] || '0') || 0,
        commission_amount: parseFloat(row[4] || '0') || 0,
        net_amount: parseFloat(row[5] || '0') || 0,
        week_start: period_from,
        week_end: period_to,
        amounts: {},
        raw: row,
        source: 'csv_import',
      };

      // Try to find driver by email or platform ID
      // This is a simplified version - you may need more sophisticated matching
      const driverEmail = row[0];
      if (driverEmail) {
        const { data: driver } = await supabase
          .from('drivers')
          .select('id')
          .eq('email', driverEmail)
          .single();

        if (driver) {
          settlement.driver_id = driver.id;
        }
      }

      // Insert settlement
      const { error: insertError } = await supabase
        .from('settlements')
        .insert(settlement);

      if (insertError) {
        console.error(`❌ Error inserting settlement:`, insertError);
        errors++;
      } else {
        processed++;
      }
    } catch (err) {
      console.error(`❌ Error processing row:`, err);
      errors++;
    }
  }

  return { processed, errors };
}
