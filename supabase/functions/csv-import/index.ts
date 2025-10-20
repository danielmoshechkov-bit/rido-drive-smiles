import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CSVRow {
  [key: string]: string;
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
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  if (!digits) return null;
  
  // Add country code if missing
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

// Parse CSV content
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

// Generate hash for idempotency
function generateRowId(source: string, periodFrom: string, periodTo: string, platform: string, identifier: string, rowIndex: number): string {
  const data = `${source}-${periodFrom}-${periodTo}-${platform}-${identifier}-${rowIndex}`;
  return btoa(data).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
}

// Find or create driver
async function findOrCreateDriver(
  supabase: any,
  row: CSVRow,
  dedupSettings: DedupSettings,
  source: string
) {
  const email = normalizeEmail(row.email || row.Email || '');
  const phone = normalizePhone(row.phone || row.Phone || row.telefon || '', dedupSettings.phone_country_default);
  const firstName = (row.first_name || row.firstName || row.imie || '').trim();
  const lastName = (row.last_name || row.lastName || row.nazwisko || '').trim();
  
  // Extract platform IDs
  const uberIds: string[] = [];
  const boltIds: string[] = [];
  const freeNowIds: string[] = [];
  
  if (row.uber_uuid || row['Uber UUID']) {
    uberIds.push(row.uber_uuid || row['Uber UUID']);
  }
  if (row.bolt_id || row['Bolt ID']) {
    boltIds.push(row.bolt_id || row['Bolt ID']);
  }
  if (row.freenow_id || row['FreeNow ID']) {
    freeNowIds.push(row.freenow_id || row['FreeNow ID']);
  }
  
  let driver = null;
  
  // Try to find by email
  if (dedupSettings.prefer_match_by_email && email && !dedupSettings.ignore_empty_email_phone) {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    
    if (data) driver = data;
  }
  
  // Try to find by phone
  if (!driver && dedupSettings.prefer_match_by_phone && phone && !dedupSettings.ignore_empty_email_phone) {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    
    if (data) driver = data;
  }
  
  // Try to find by platform IDs
  if (!driver && dedupSettings.allow_match_by_platform_ids) {
    const allPlatformIds = [...uberIds, ...boltIds, ...freeNowIds];
    
    if (allPlatformIds.length > 0) {
      const { data } = await supabase
        .from('drivers')
        .select('*')
        .limit(100);
      
      if (data) {
        for (const d of data) {
          const platformIds = d.platform_ids || { uber: [], bolt: [], freeNow: [] };
          const hasMatch = 
            uberIds.some(id => platformIds.uber?.includes(id)) ||
            boltIds.some(id => platformIds.bolt?.includes(id)) ||
            freeNowIds.some(id => platformIds.freeNow?.includes(id));
          
          if (hasMatch) {
            driver = d;
            break;
          }
        }
      }
    }
  }
  
  // Create new driver if not found
  if (!driver) {
    const { data, error } = await supabase
      .from('drivers')
      .insert({
        first_name: firstName || null,
        last_name: lastName || null,
        email: email || null,
        phone: phone || null,
        platform_ids: {
          uber: uberIds,
          bolt: boltIds,
          freeNow: freeNowIds,
        },
        city_id: null, // Will be set later if needed
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating driver:', error);
      throw error;
    }
    
    driver = data;
  } else {
    // Update platform IDs if needed
    const currentPlatformIds = driver.platform_ids || { uber: [], bolt: [], freeNow: [] };
    const updatedPlatformIds = {
      uber: [...new Set([...(currentPlatformIds.uber || []), ...uberIds])],
      bolt: [...new Set([...(currentPlatformIds.bolt || []), ...boltIds])],
      freeNow: [...new Set([...(currentPlatformIds.freeNow || []), ...freeNowIds])],
    };
    
    await supabase
      .from('drivers')
      .update({ platform_ids: updatedPlatformIds })
      .eq('id', driver.id);
    
    driver.platform_ids = updatedPlatformIds;
  }
  
  return driver;
}

// Map CSV row to amounts object
function mapRowToAmounts(row: CSVRow, source: string): Record<string, number> {
  const amounts: Record<string, number> = {};
  
  // Helper to parse number
  const parseNum = (val: string): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/[^\d.-]/g, '')) || 0;
  };
  
  // Map based on source
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
    // Main sheet - map all available columns
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { uber_csv, bolt_csv, freenow_csv, main_csv, period_from, period_to } = await req.json();

    // Load dedup settings
    const { data: dedupData } = await supabase
      .from('rido_dedup_settings')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    const dedupSettings: DedupSettings = dedupData || {
      prefer_match_by_email: true,
      prefer_match_by_phone: true,
      allow_match_by_platform_ids: true,
      ignore_empty_email_phone: true,
      phone_country_default: 'PL',
    };

    const results = {
      added: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

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
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        try {
          // Find or create driver
          const driver = await findOrCreateDriver(supabase, row, dedupSettings, source);
          
          // Map amounts
          const amounts = mapRowToAmounts(row, source);
          
          // Generate row ID for idempotency
          const identifier = driver.email || driver.phone || driver.id;
          const rawRowId = generateRowId(source, period_from, period_to, source, identifier, i);
          
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
            
            results.updated++;
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
            
            results.added++;
          }
        } catch (error) {
          console.error(`Error processing row ${i}:`, error);
          results.errors.push(`Row ${i}: ${error.message}`);
          results.skipped++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
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