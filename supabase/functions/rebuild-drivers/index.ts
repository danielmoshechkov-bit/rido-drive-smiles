import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert column letter to index
function letterToIndex(letter: string): number {
  if (!letter || letter === '') return -1;
  letter = letter.toUpperCase();
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result - 1;
}

// Parse CSV
function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ';' && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentCell);
      if (currentRow.some(cell => cell.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else if (char === '\r' && !insideQuotes) {
      // Skip \r
    } else {
      currentCell += char;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some(cell => cell.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// Validate GetRido ID
function isValidGetRidoId(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 4) return false;
  // Reject UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return false;
  // Reject purely numeric strings
  if (/^\d+$/.test(v)) return false;
  // Reject emails
  if (v.includes('@')) return false;
  return true;
}

// Parse full name
function parseFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(' ').filter(p => p);
  const first_name = parts[0] || '';
  const last_name = parts.slice(1).join(' ') || '';
  return { first_name, last_name };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { city_id, main_csv, options } = await req.json();

    if (!city_id || !main_csv) {
      throw new Error('city_id and main_csv are required');
    }

    const {
      force_replace_getrido = true,
      clear_platform_ids = true,
      dry_run = false
    } = options || {};

    console.log(`🔧 Rebuild drivers: city=${city_id}, force_replace_getrido=${force_replace_getrido}, clear_platform_ids=${clear_platform_ids}, dry_run=${dry_run}`);

    // Decode CSV
    const csvText = atob(main_csv);
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      throw new Error('CSV must have at least header and one data row');
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const dataRows = rows.slice(1);

    // Column indices (defaults from csv-import)
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail'));
    const uberIdx = letterToIndex('B'); // Uber ID at B
    const phoneIdx = letterToIndex('C'); // Phone at C
    const freenowIdx = letterToIndex('D'); // FreeNow ID at D
    const fuelCardIdx = letterToIndex('E'); // Fuel card at E
    const fullNameIdx = letterToIndex('F'); // Full name at F
    const getRidoIdx = letterToIndex('X'); // GetRido ID at X (23)

    console.log(`📋 Column indices: email=${emailIdx}, uber=${uberIdx}, phone=${phoneIdx}, freenow=${freenowIdx}, fuel=${fuelCardIdx}, name=${fullNameIdx}, getrido=${getRidoIdx}`);

    let updatedDrivers = 0;
    let createdDrivers = 0;
    let upsertedPlatformIds = 0;
    let skippedRows = 0;
    const collisions: any[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      // Extract data
      const email = emailIdx >= 0 && row[emailIdx] ? row[emailIdx].trim().toLowerCase() : null;
      const uber_id = uberIdx >= 0 && row[uberIdx] ? row[uberIdx].trim() : null;
      const phone = phoneIdx >= 0 && row[phoneIdx] ? row[phoneIdx].trim() : null;
      const freenow_id = freenowIdx >= 0 && row[freenowIdx] ? row[freenowIdx].trim() : null;
      const fuel_card = fuelCardIdx >= 0 && row[fuelCardIdx] ? row[fuelCardIdx].trim() : null;
      const full_name = fullNameIdx >= 0 && row[fullNameIdx] ? row[fullNameIdx].trim() : '';
      let getrido_id = getRidoIdx >= 0 && row[getRidoIdx] ? row[getRidoIdx].trim() : null;

      // Validate GetRido ID
      if (getrido_id && !isValidGetRidoId(getrido_id)) {
        console.log(`⚠️ Row ${i + 2}: Invalid GetRido ID "${getrido_id}", skipping`);
        getrido_id = null;
      }

      // Parse name
      const { first_name, last_name } = parseFullName(full_name);

      // Skip if no identifiers
      if (!getrido_id && !phone && !email && !freenow_id && !uber_id) {
        console.log(`⚠️ Row ${i + 2}: No identifiers, skipping`);
        skippedRows++;
        continue;
      }

      // Try to match driver
      let existingDriver: any = null;
      let matchMethod = '';

      // Priority 1: GetRido ID
      if (getrido_id) {
        const { data } = await supabase
          .from('drivers')
          .select('*')
          .eq('getrido_id', getrido_id)
          .eq('city_id', city_id)
          .maybeSingle();
        if (data) {
          existingDriver = data;
          matchMethod = 'getrido_id';
        }
      }

      // Priority 2: Phone
      if (!existingDriver && phone) {
        const { data } = await supabase
          .from('drivers')
          .select('*')
          .eq('phone', phone)
          .eq('city_id', city_id)
          .maybeSingle();
        if (data) {
          existingDriver = data;
          matchMethod = 'phone';
        }
      }

      // Priority 3: Email
      if (!existingDriver && email) {
        const { data } = await supabase
          .from('drivers')
          .select('*')
          .ilike('email', email)
          .eq('city_id', city_id)
          .maybeSingle();
        if (data) {
          existingDriver = data;
          matchMethod = 'email';
        }
      }

      // Priority 4: FreeNow ID
      if (!existingDriver && freenow_id) {
        const { data } = await supabase
          .from('driver_platform_ids')
          .select('driver_id, drivers(*)')
          .eq('platform', 'freenow')
          .eq('platform_id', freenow_id)
          .maybeSingle();
        if (data?.drivers) {
          existingDriver = data.drivers;
          matchMethod = 'freenow_id';
        }
      }

      // Priority 5: Uber ID
      if (!existingDriver && uber_id) {
        const { data } = await supabase
          .from('driver_platform_ids')
          .select('driver_id, drivers(*)')
          .eq('platform', 'uber')
          .eq('platform_id', uber_id)
          .maybeSingle();
        if (data?.drivers) {
          existingDriver = data.drivers;
          matchMethod = 'uber_id';
        }
      }

      if (existingDriver) {
        // UPDATE existing driver
        console.log(`✏️ Row ${i + 2}: Updating driver ${existingDriver.id} (matched by ${matchMethod})`);

        if (!dry_run) {
          const updateData: any = {};

          // Update getrido_id if force_replace or empty
          if (getrido_id && (force_replace_getrido || !existingDriver.getrido_id)) {
            updateData.getrido_id = getrido_id;
          }

          // Always update name from column F
          if (first_name) updateData.first_name = first_name;
          if (last_name) updateData.last_name = last_name;

          // Update other fields if present
          if (phone && existingDriver.phone !== phone) updateData.phone = phone;
          if (email && existingDriver.email !== email) updateData.email = email;
          if (fuel_card && existingDriver.fuel_card_number !== fuel_card) {
            updateData.fuel_card_number = fuel_card;
          }

          if (Object.keys(updateData).length > 0) {
            const { error } = await supabase
              .from('drivers')
              .update(updateData)
              .eq('id', existingDriver.id);
            if (error) {
              console.error(`❌ Error updating driver ${existingDriver.id}:`, error);
            } else {
              updatedDrivers++;
            }
          }

          // Handle platform IDs
          if (clear_platform_ids) {
            // Delete existing platform IDs
            await supabase
              .from('driver_platform_ids')
              .delete()
              .eq('driver_id', existingDriver.id);

            // Insert new ones
            const idsToInsert = [];
            if (uber_id) idsToInsert.push({ driver_id: existingDriver.id, platform: 'uber', platform_id: uber_id });
            if (freenow_id) idsToInsert.push({ driver_id: existingDriver.id, platform: 'freenow', platform_id: freenow_id });

            if (idsToInsert.length > 0) {
              const { error } = await supabase
                .from('driver_platform_ids')
                .insert(idsToInsert);
              if (!error) upsertedPlatformIds += idsToInsert.length;
            }
          } else {
            // Upsert platform IDs
            const idsToUpsert = [];
            if (uber_id) idsToUpsert.push({ driver_id: existingDriver.id, platform: 'uber', platform_id: uber_id });
            if (freenow_id) idsToUpsert.push({ driver_id: existingDriver.id, platform: 'freenow', platform_id: freenow_id });

            for (const id of idsToUpsert) {
              const { error } = await supabase
                .from('driver_platform_ids')
                .upsert(id, { onConflict: 'driver_id,platform' });
              if (!error) upsertedPlatformIds++;
            }
          }

          // Remove any 'getrido' platform entries
          await supabase
            .from('driver_platform_ids')
            .delete()
            .eq('driver_id', existingDriver.id)
            .eq('platform', 'getrido');
        }
      } else {
        // CREATE new driver
        console.log(`➕ Row ${i + 2}: Creating new driver "${full_name}"`);

        if (!dry_run) {
          // Create auth user
          const tempEmail = email || `${phone || Date.now()}@rido.internal`;
          const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: tempEmail,
            password: 'Test12345!',
            email_confirm: true,
          });

          if (authError) {
            console.error(`❌ Error creating auth user:`, authError);
            skippedRows++;
            continue;
          }

          // Create driver record
          const { data: newDriver, error: driverError } = await supabase
            .from('drivers')
            .insert({
              city_id,
              first_name,
              last_name,
              email: email || null,
              phone: phone || null,
              fuel_card_number: fuel_card || null,
              getrido_id: getrido_id || null,
            })
            .select()
            .single();

          if (driverError) {
            console.error(`❌ Error creating driver:`, driverError);
            skippedRows++;
            continue;
          }

          createdDrivers++;

          // Create driver_app_users mapping
          await supabase
            .from('driver_app_users')
            .insert({
              user_id: authUser.user.id,
              driver_id: newDriver.id,
              city_id,
            });

          // Insert platform IDs
          const idsToInsert = [];
          if (uber_id) idsToInsert.push({ driver_id: newDriver.id, platform: 'uber', platform_id: uber_id });
          if (freenow_id) idsToInsert.push({ driver_id: newDriver.id, platform: 'freenow', platform_id: freenow_id });

          if (idsToInsert.length > 0) {
            const { error } = await supabase
              .from('driver_platform_ids')
              .insert(idsToInsert);
            if (!error) upsertedPlatformIds += idsToInsert.length;
          }
        }
      }
    }

    const report = {
      updated_drivers: updatedDrivers,
      created_drivers: createdDrivers,
      upserted_platform_ids: upsertedPlatformIds,
      skipped_rows: skippedRows,
      collisions,
      dry_run,
    };

    console.log(`✅ Rebuild complete:`, report);

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
