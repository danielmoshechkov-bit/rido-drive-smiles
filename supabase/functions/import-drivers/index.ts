import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DriverImportRow {
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  getrido_id?: string;
  uber_id?: string;
  freenow_id?: string;
  bolt_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Import drivers edge function started');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { csv_content, city_id, mode = 'upsert' } = body;

    if (!csv_content || !city_id) {
      throw new Error('Missing required fields: csv_content, city_id');
    }

    // Decode base64 CSV
    const uint8Array = Uint8Array.from(atob(csv_content), c => c.charCodeAt(0));
    const csvText = new TextDecoder('utf-8').decode(uint8Array);
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      throw new Error('CSV jest pusty lub ma tylko nagłówki');
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    console.log('📊 Headers:', headers);

    // Find column indexes - based on system.csv format
    const emailIdx = headers.findIndex(h => h.includes('adres mailowy') || h.includes('email'));
    const phoneIdx = headers.findIndex(h => h.includes('nr tel') || h.includes('telefon') || h.includes('phone'));
    const fullNameIdx = headers.findIndex(h => h.includes('imie nazwisko') || h.includes('imię nazwisko'));
    const getRidoIdIdx = headers.findIndex(h => h.includes('getrido id') || h.includes('getrido_id'));
    const uberIdIdx = headers.findIndex(h => h === 'id uber' || h.includes('uber id'));
    const freenowIdIdx = headers.findIndex(h => h === 'id freenow' || h.includes('freenow id'));
    const boltIdIdx = headers.findIndex(h => h === 'id bolt' || h.includes('bolt id'));

    console.log('📊 Column indexes:', { emailIdx, phoneIdx, fullNameIdx, getRidoIdIdx, uberIdIdx, freenowIdIdx, boltIdIdx });

    let importedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.every(cell => !cell?.trim())) continue;

      try {
        const fullName = fullNameIdx >= 0 ? row[fullNameIdx]?.trim() : '';
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const email = emailIdx >= 0 ? row[emailIdx]?.trim().toLowerCase() : '';
        const phone = phoneIdx >= 0 ? cleanPhone(row[phoneIdx]?.trim()) : '';
        let getRidoId = getRidoIdIdx >= 0 ? row[getRidoIdIdx]?.trim() : '';
        const uberId = uberIdIdx >= 0 ? row[uberIdIdx]?.trim() : '';
        const freenowId = freenowIdIdx >= 0 ? row[freenowIdIdx]?.trim() : '';
        const boltId = boltIdIdx >= 0 ? row[boltIdIdx]?.trim() : '';

        if (!firstName && !lastName && !email && !phone) {
          console.log(`⚠️ Row ${i}: Empty row, skipping`);
          continue;
        }

        // Generate getrido_id if not provided
        if (!getRidoId) {
          getRidoId = generateGetRidoId();
        }

        // Check if driver exists by email, phone, or getrido_id
        let existingDriver = null;

        if (email) {
          const { data } = await supabase
            .from('drivers')
            .select('id')
            .eq('email', email)
            .eq('city_id', city_id)
            .maybeSingle();
          if (data) existingDriver = data;
        }

        if (!existingDriver && phone) {
          const { data } = await supabase
            .from('drivers')
            .select('id')
            .eq('phone', phone)
            .eq('city_id', city_id)
            .maybeSingle();
          if (data) existingDriver = data;
        }

        if (!existingDriver && getRidoId) {
          const { data } = await supabase
            .from('drivers')
            .select('id')
            .eq('getrido_id', getRidoId)
            .eq('city_id', city_id)
            .maybeSingle();
          if (data) existingDriver = data;
        }

        let driverId: string;

        if (existingDriver) {
          // Update existing driver
          const { error: updateError } = await supabase
            .from('drivers')
            .update({
              first_name: firstName,
              last_name: lastName,
              email: email || null,
              phone: phone || null,
              getrido_id: getRidoId || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingDriver.id);

          if (updateError) {
            console.error(`❌ Row ${i}: Update error:`, updateError);
            errors.push(`Row ${i}: ${updateError.message}`);
            errorCount++;
            continue;
          }

          driverId = existingDriver.id;
          updatedCount++;
          console.log(`✅ Row ${i}: Updated driver ${firstName} ${lastName}`);
        } else {
          // Create new driver
          const { data: newDriver, error: insertError } = await supabase
            .from('drivers')
            .insert({
              first_name: firstName,
              last_name: lastName,
              email: email || null,
              phone: phone || null,
              getrido_id: getRidoId,
              city_id: city_id
            })
            .select('id')
            .single();

          if (insertError) {
            console.error(`❌ Row ${i}: Insert error:`, insertError);
            errors.push(`Row ${i}: ${insertError.message}`);
            errorCount++;
            continue;
          }

          driverId = newDriver.id;
          importedCount++;
          console.log(`✅ Row ${i}: Created driver ${firstName} ${lastName} with getrido_id=${getRidoId}`);
        }

        // Upsert platform IDs
        const platformIds: { driver_id: string; platform: string; platform_id: string }[] = [];

        if (uberId) {
          platformIds.push({ driver_id: driverId, platform: 'uber', platform_id: uberId });
        }
        if (freenowId) {
          platformIds.push({ driver_id: driverId, platform: 'freenow', platform_id: freenowId });
        }
        if (boltId) {
          platformIds.push({ driver_id: driverId, platform: 'bolt', platform_id: boltId });
        }

        if (platformIds.length > 0) {
          // Delete existing platform IDs for this driver first, then insert new ones
          await supabase
            .from('driver_platform_ids')
            .delete()
            .eq('driver_id', driverId);

          const { error: platformError } = await supabase
            .from('driver_platform_ids')
            .insert(platformIds);

          if (platformError) {
            console.warn(`⚠️ Row ${i}: Platform IDs error:`, platformError);
          } else {
            console.log(`✅ Row ${i}: Added ${platformIds.length} platform IDs`);
          }
        }

      } catch (rowError) {
        console.error(`❌ Row ${i}: Error:`, rowError);
        errors.push(`Row ${i}: ${rowError instanceof Error ? rowError.message : 'Unknown error'}`);
        errorCount++;
      }
    }

    console.log('✅ Import completed:', { importedCount, updatedCount, errorCount });

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          imported: importedCount,
          updated: updatedCount,
          errors: errorCount,
          total: importedCount + updatedCount + errorCount
        },
        errors: errors.slice(0, 10) // Return first 10 errors
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

// ========== HELPERS ==========

function parseCSV(csvText: string): string[][] {
  const lines = csvText.trim().split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.match(/^[;,\s]*$/);
  });
  
  if (lines.length === 0) return [];
  
  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const separator = semicolonCount >= commaCount ? ';' : ',';
  
  console.log(`📝 CSV separator: '${separator}'`);
  
  return lines.map(line => parseCSVLine(line, separator));
}

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
        i++;
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

function cleanPhone(phone: string): string {
  if (!phone) return '';
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  // Remove leading + if present, add 48 if starts with something else
  if (cleaned.startsWith('+48')) {
    cleaned = cleaned.substring(1); // Remove +, keep 48
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (!cleaned.startsWith('48') && cleaned.length === 9) {
    cleaned = '48' + cleaned;
  }
  return cleaned;
}

function generateGetRidoId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
