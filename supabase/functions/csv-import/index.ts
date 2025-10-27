import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Column mapping interface
interface CsvColumnMapping {
  identification: {
    email: string;
    phone: string;
    full_name: string;
    uber_id: string;
    bolt_id: string;
    freenow_id: string;
    getrido_id: string;
    fuel_card: string;
  };
  amounts: {
    uber: string;
    uber_cashless: string;
    uber_cash: string;
    bolt_gross: string;
    bolt_net: string;
    bolt_commission: string;
    bolt_cash: string;
    freenow_gross: string;
    freenow_net: string;
    freenow_commission: string;
    freenow_cash: string;
    total_cash: string;
    total_commission: string;
    tax: string;
    fuel: string;
    fuel_vat: string;
    fuel_vat_refund: string;
  };
}

// Convert column letter (A, B, AA, AB) to 0-based index
function letterToIndex(letter: string): number {
  if (!letter || letter === '') return -1;
  
  letter = letter.toUpperCase();
  let result = 0;
  
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  
  return result - 1;
}

// Resolve column mapping value to index
function resolveColumnIndex(
  mappingValue: string, 
  headerValues: string[]
): number {
  if (!mappingValue) return -1;
  
  // Check if it's a letter (column name like A, B, AA)
  if (/^[A-Za-z]+$/.test(mappingValue)) {
    return letterToIndex(mappingValue);
  }
  
  // Check if it's a number (1-based index)
  if (/^[0-9]+$/.test(mappingValue)) {
    return parseInt(mappingValue, 10) - 1;
  }
  
  // Otherwise, treat as header name and search for it
  const searchTerm = mappingValue.toLowerCase();
  const index = headerValues.findIndex(h => 
    h.toLowerCase().includes(searchTerm)
  );
  
  return index;
}

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

// Validate if getrido_id looks valid (not UUID, not email, not purely numeric)
function isValidGetRidoId(
  value: string | null | undefined,
  uber_id?: string | null,
  bolt_id?: string | null,
  freenow_id?: string | null
): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Reject UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return false;
  }

  // Reject emails
  if (trimmed.includes('@')) {
    return false;
  }

  // Reject purely numeric
  if (/^\d+$/.test(trimmed)) {
    return false;
  }

  // Reject if identical to any platform ID
  if (uber_id && trimmed === uber_id) return false;
  if (bolt_id && trimmed === bolt_id) return false;
  if (freenow_id && trimmed === freenow_id) return false;

  return true;
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
  
  // Update getrido_id if present in CSV and different AND valid
  if (getrido_id && existingDriver.getrido_id !== getrido_id) {
    // Validate before updating
    if (isValidGetRidoId(getrido_id, row.uber_id, row.bolt_id, row.freenow_id)) {
      updateData.getrido_id = getrido_id;
      console.log(`📝 Updating getrido_id: ${existingDriver.getrido_id} -> ${getrido_id}`);
    } else {
      console.log(`⚠️ Skipping invalid getrido_id: "${getrido_id}" (UUID/email/numeric/platform ID)`);
    }
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

// Upsert platform IDs for existing drivers
async function upsertPlatformIds(
  supabase: any,
  driverId: string,
  uber_id: string | null,
  bolt_id: string | null,
  freenow_id: string | null
) {
  const operations: Promise<any>[] = [];
  if (uber_id) {
    operations.push(
      supabase.from('driver_platform_ids').upsert(
        { driver_id: driverId, platform: 'uber', platform_id: uber_id },
        { onConflict: 'driver_id,platform' }
      )
    );
  }
  if (bolt_id) {
    operations.push(
      supabase.from('driver_platform_ids').upsert(
        { driver_id: driverId, platform: 'bolt', platform_id: bolt_id },
        { onConflict: 'driver_id,platform' }
      )
    );
  }
  if (freenow_id) {
    operations.push(
      supabase.from('driver_platform_ids').upsert(
        { driver_id: driverId, platform: 'freenow', platform_id: freenow_id },
        { onConflict: 'driver_id,platform' }
      )
    );
  }
  if (operations.length > 0) {
    const results = await Promise.all(operations);
    const errors = results.filter((r: any) => r.error).map((r: any) => r.error);
    if (errors.length) {
      console.error('⚠️ Platform IDs upsert errors:', errors);
    } else {
      console.log(`✅ Upserted platform IDs for driver ${driverId}`);
    }
  }
}

// Ensure driver_app_users mapping between auth user and driver
async function ensureDriverUserMapping(
  supabase: any,
  driverId: string,
  cityId: string,
  email?: string | null,
  authUserId?: string | null
) {
  try {
    const { data: existingMap } = await supabase
      .from('driver_app_users')
      .select('user_id')
      .eq('driver_id', driverId)
      .maybeSingle();
    if (existingMap?.user_id) {
      console.log(`🔗 Mapping already exists for driver ${driverId} -> user ${existingMap.user_id}`);
      return;
    }

    let userId = authUserId || null;

    if (!userId && email) {
      const { data: list } = await supabase.auth.admin.listUsers();
      const found = list?.users?.find((u: any) => u.email?.toLowerCase() === String(email).toLowerCase());
      if (found) {
        userId = found.id;
      }
    }

    if (!userId) {
      console.log(`⚠️ No auth user found to map for driver ${driverId}`);
      return;
    }

    const { error } = await supabase
      .from('driver_app_users')
      .upsert({ user_id: userId, driver_id: driverId, city_id: cityId }, { onConflict: 'user_id' });
    if (error) {
      console.error('❌ Failed to upsert driver_app_users mapping:', error);
    } else {
      console.log(`✅ Upserted driver_app_users mapping user ${userId} -> driver ${driverId}`);
    }
  } catch (e) {
    console.error('💥 ensureDriverUserMapping error', e);
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
      await upsertPlatformIds(supabase, existingDriver.id, uber_id, bolt_id, freenow_id);
      await ensureDriverUserMapping(supabase, existingDriver.id, cityId, email, null);
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
        await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
        await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
        return { driver, isNew: false, matchMethod: 'manual_uber_id' };
      }
    }
    if (match.match_key === 'bolt_id' && bolt_id && match.match_value === bolt_id) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.log('Matched driver by manual bolt_id match:', driver.id);
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
        await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
        return { driver, isNew: false, matchMethod: 'manual_bolt_id' };
      }
    }
    if (match.match_key === 'freenow_id' && freenow_id && match.match_value === freenow_id) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.log('Matched driver by manual freenow_id match:', driver.id);
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
        await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
        return { driver, isNew: false, matchMethod: 'manual_freenow_id' };
      }
    }
    if (match.match_key === 'email' && email && match.match_value.toLowerCase() === email) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.log('Matched driver by manual email match:', driver.id);
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
        await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
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
      await upsertPlatformIds(supabase, platformData.drivers.id, uber_id, bolt_id, freenow_id);
      await ensureDriverUserMapping(supabase, platformData.drivers.id, cityId, email, null);
      return { driver: platformData.drivers, isNew: false, matchMethod: 'uber_id' };
    }
  }
  
  // 4. Try to match by Bolt ID (skip if first import)
  if (!firstImport && bolt_id) {
    const { data: platformData } = await supabase
      .from('driver_platform_ids')
      .select('driver_id, drivers(*)')
      .eq('platform', 'bolt')
      .eq('platform_id', bolt_id)
      .maybeSingle();
    
    if (platformData && platformData.drivers) {
      console.log('Found driver by Bolt ID:', platformData.drivers.id);
      await updateDriverData(supabase, platformData.drivers, row, getrido_id, email, fuel_card);
      await upsertPlatformIds(supabase, platformData.drivers.id, uber_id, bolt_id, freenow_id);
      await ensureDriverUserMapping(supabase, platformData.drivers.id, cityId, email, null);
      return { driver: platformData.drivers, isNew: false, matchMethod: 'bolt_id' };
    }
  }
  
  // 5. Try to match by FreeNow ID (skip if first import)
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
      await upsertPlatformIds(supabase, platformData.drivers.id, uber_id, bolt_id, freenow_id);
      await ensureDriverUserMapping(supabase, platformData.drivers.id, cityId, email, null);
      return { driver: platformData.drivers, isNew: false, matchMethod: 'freenow_id' };
    }
  }
  
  // 6. Try to match by email (skip if first import)
  if (!firstImport && email) {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .ilike('email', email)
      .limit(1);
    
    if (data && data.length > 0) {
      console.log('Found driver by email:', data[0].id);
      await updateDriverData(supabase, data[0], row, getrido_id, email, fuel_card);
      await upsertPlatformIds(supabase, data[0].id, uber_id, bolt_id, freenow_id);
      await ensureDriverUserMapping(supabase, data[0].id, cityId, email, null);
      return { driver: data[0], isNew: false, matchMethod: 'email' };
    }
  }
  
  // 7. Try to match by normalized name (skip if first import)
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
          await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
          await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
          return { driver, isNew: false, matchMethod: 'name' };
        }
      }
    }
  }
  
  // 8. No match found - create new driver
  console.log('No existing driver found, creating new one');
  
  // Determine login
  const login = email || `driver_${getrido_id || uber_id || bolt_id || freenow_id}@rido.local`;
  
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
  
  // Ensure driver_app_users mapping for new driver
  await ensureDriverUserMapping(supabase, newDriver.id, cityId, email, authUserId);

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

// Parse CSV with semicolon delimiter and dynamic column mapping
async function parseCSV(csvText: string, supabase: any): Promise<CSVRow[]> {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const clean = (v: string) => v.replace(/^"|"$/g, '').trim();

  // Get header values
  const headerValues = lines[0].split(';').map(clean);

  // Load column mapping from database
  const { data: mappingData } = await supabase
    .from('rido_settings')
    .select('value')
    .eq('key', 'csv_column_mapping')
    .maybeSingle();

  // Default mapping - using Polish column names from CSV
  const defaultMapping: CsvColumnMapping = {
    identification: {
      email: 'adres mailowy',
      uber_id: 'id uber',
      phone: 'nr tel',
      freenow_id: 'id freenow',
      fuel_card: 'nr karty paliwowej',
      full_name: 'Imie nazwisko',
      bolt_id: '',
      getrido_id: 'getrido ID',
    },
    amounts: {
      uber: 'Uber',
      uber_cashless: 'Uber bezgotówka',
      uber_cash: 'uber gotówka',
      bolt_gross: 'bolt brutto',
      bolt_net: 'bolt netto',
      bolt_commission: 'bolt prowizja',
      bolt_cash: 'bolt gotówka',
      freenow_gross: 'freenow brutto',
      freenow_net: 'freenow netto',
      freenow_commission: 'freenow prowizja',
      freenow_cash: 'freenow gotówka',
      total_cash: 'razem gotówka',
      total_commission: 'razem prowizja',
      tax: 'podatek 8%/49',
      fuel: 'paliwo',
      fuel_vat: 'vat z paliwa',
      fuel_vat_refund: 'zwrot vat z paliwa',
    },
  };

  const mapping = (mappingData?.value || defaultMapping) as CsvColumnMapping;

  // Resolve all column indexes
  const indexes = {
    email: resolveColumnIndex(mapping.identification.email, headerValues),
    uber_id: resolveColumnIndex(mapping.identification.uber_id, headerValues),
    phone: resolveColumnIndex(mapping.identification.phone, headerValues),
    freenow_id: resolveColumnIndex(mapping.identification.freenow_id, headerValues),
    fuel_card: resolveColumnIndex(mapping.identification.fuel_card, headerValues),
    full_name: resolveColumnIndex(mapping.identification.full_name, headerValues),
    bolt_id: resolveColumnIndex(mapping.identification.bolt_id, headerValues),
    getrido_id: resolveColumnIndex(mapping.identification.getrido_id, headerValues),
  };

  // NO fallback for getrido_id - if not found in X or named column, leave it null
  // This prevents accidentally using wrong columns (like last column which might be anything)

  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by semicolon and remove quotes
    const values = line.split(';').map(clean);

    // Skip empty rows
    if (values.every(v => !v)) continue;

    // Extract values with validation for getrido_id
    const uber_id_val = indexes.uber_id >= 0 ? (values[indexes.uber_id] || null) : null;
    const bolt_id_val = indexes.bolt_id >= 0 ? (values[indexes.bolt_id] || null) : null;
    const freenow_id_val = indexes.freenow_id >= 0 ? (values[indexes.freenow_id] || null) : null;
    const getrido_id_candidate = indexes.getrido_id >= 0 ? (values[indexes.getrido_id] || null) : null;
    
    // Validate getrido_id before setting it
    const getrido_id_val = isValidGetRidoId(getrido_id_candidate, uber_id_val, bolt_id_val, freenow_id_val)
      ? getrido_id_candidate
      : null;
    
    if (getrido_id_candidate && !getrido_id_val) {
      console.log(`⚠️ Row ${i}: Rejected invalid getrido_id "${getrido_id_candidate}"`);
    }

    const row: CSVRow = {
      email: indexes.email >= 0 ? (values[indexes.email] || null) : null,
      uber_id: uber_id_val,
      phone: indexes.phone >= 0 ? (values[indexes.phone] || null) : null,
      freenow_id: freenow_id_val,
      fuel_card: indexes.fuel_card >= 0 ? (values[indexes.fuel_card] || null) : null,
      full_name: indexes.full_name >= 0 ? (values[indexes.full_name] || '') : '',
      bolt_id: bolt_id_val,
      getrido_id: getrido_id_val,
    };

    // Attach header values for later mapping by header names
    ;(row as any).__headers = headerValues;

    // Add all columns for amounts mapping and fallback access
    for (let j = 0; j < values.length; j++) {
      (row as any)[`col_${j}`] = values[j];
    }

    rows.push(row);
  }

  return rows;
}

// Map row to settlement amounts using dynamic column mapping
async function mapRowToAmounts(row: CSVRow, supabase: any): Promise<Record<string, number>> {
  const parseNum = (val: any): number => {
    if (!val) return 0;
    const str = String(val).replace(/[^\d.-]/g, '').replace(',', '.');
    return parseFloat(str) || 0;
  };

  // Load column mapping from database
  const { data: mappingData } = await supabase
    .from('rido_settings')
    .select('value')
    .eq('key', 'csv_column_mapping')
    .maybeSingle();

  // Default mapping - using Polish column names from CSV
  const defaultMapping: CsvColumnMapping = {
    identification: {
      email: 'adres mailowy',
      uber_id: 'id uber',
      phone: 'nr tel',
      freenow_id: 'id freenow',
      fuel_card: 'nr karty paliwowej',
      full_name: 'Imie nazwisko',
      bolt_id: '',
      getrido_id: 'getrido ID',
    },
    amounts: {
      uber: 'Uber',
      uber_cashless: 'Uber bezgotówka',
      uber_cash: 'uber gotówka',
      bolt_gross: 'bolt brutto',
      bolt_net: 'bolt netto',
      bolt_commission: 'bolt prowizja',
      bolt_cash: 'bolt gotówka',
      freenow_gross: 'freenow brutto',
      freenow_net: 'freenow netto',
      freenow_commission: 'freenow prowizja',
      freenow_cash: 'freenow gotówka',
      total_cash: 'razem gotówka',
      total_commission: 'razem prowizja',
      tax: 'podatek 8%/49',
      fuel: 'paliwo',
      fuel_vat: 'vat z paliwa',
      fuel_vat_refund: 'zwrot vat z paliwa',
    },
  };

  // Merge loaded mapping with default to enforce snake_case keys
  const loaded = mappingData?.value || {};
  const mapping: CsvColumnMapping = {
    identification: { ...defaultMapping.identification, ...(loaded.identification || {}) },
    amounts: { ...defaultMapping.amounts, ...(loaded.amounts || {}) }
  };

  // Build amounts object dynamically using ONLY snake_case keys from defaultMapping
  // This ensures all data is stored with canonical snake_case keys
  const amounts: Record<string, number> = {};
  
  // Iterate over defaultMapping.amounts keys (guaranteed snake_case)
  for (const key of Object.keys(defaultMapping.amounts)) {
    const mappingValue = mapping.amounts[key as keyof typeof mapping.amounts];
    const headerValues = (row as any).__headers || [];
    const colIndex = resolveColumnIndex(mappingValue, headerValues);
    if (colIndex >= 0) {
      amounts[key] = parseNum((row as any)[`col_${colIndex}`]);
    } else {
      amounts[key] = 0;
    }
  }

  return amounts;
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
    const rows = await parseCSV(csv_text, supabase);
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
        
        // Map amounts using dynamic column mapping
        const amounts = await mapRowToAmounts(row, supabase);
        
        // Generate row ID for idempotency
        const rawRowId = generateRowId(driver.id, period_from, period_to, i);
        
        // Check if settlement already exists
        const { data: existing } = await supabase
          .from('settlements')
          .select('id')
          .eq('raw_row_id', rawRowId)
          .maybeSingle();
        
        // Store raw with col_X fields for backward compatibility
        const rawData = { ...row };
        
        if (existing) {
          // Update existing
          await supabase
            .from('settlements')
            .update({
              amounts,
              raw: rawData,
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
