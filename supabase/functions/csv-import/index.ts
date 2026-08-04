import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createServiceClient,
  consumeRateLimit,
  errorResponse,
  handleCors,
  jsonResponse,
  requireAdmin,
  readJsonBody,
  SecurityError,
  writeAuditEvent,
} from '../_shared/security.ts';
import { isUuid } from '../_shared/securityPrimitives.ts';

const MAX_CSV_BYTES = 5_000_000;
const MAX_CSV_ROWS = 10_000;
const IMPORT_LEASE_SECONDS = 1_800;

interface ImportExecutionContext {
  executionId: string;
  actorId: string;
  tenantScopeId: string;
  idempotencyKeyHash: string;
  payloadFingerprint: string;
  correlationId: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function readIdempotencyKey(req: Request): string | null {
  const value = req.headers.get('x-idempotency-key')?.trim() ?? '';
  if (!value) return null;
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(value)) {
    throw new SecurityError(400, 'invalid_idempotency_key', 'Nieprawidłowy klucz idempotencji');
  }
  return value;
}

async function claimImportExecution(
  supabase: any,
  req: Request,
  actorId: string,
  tenantScopeId: string,
  correlationId: string,
  payload: { csvText: string; periodFrom: string; periodTo: string },
): Promise<{ context?: ImportExecutionContext; replaySummary?: Record<string, unknown> }> {
  const payloadFingerprint = await sha256Hex(JSON.stringify([
    'settlements_csv_v1',
    tenantScopeId,
    payload.periodFrom,
    payload.periodTo,
    payload.csvText,
  ]));
  const suppliedKey = readIdempotencyKey(req);
  const idempotencyKeyHash = await sha256Hex(
    suppliedKey ? `client_v1:${suppliedKey}` : `payload_v1:${payloadFingerprint}`,
  );
  const { data, error } = await supabase.rpc('phase_f_claim_import_execution', {
    p_operation: 'settlements_csv',
    p_actor_id: actorId,
    p_tenant_scope_id: tenantScopeId,
    p_idempotency_key_hash: idempotencyKeyHash,
    p_payload_fingerprint: payloadFingerprint,
    p_lease_seconds: IMPORT_LEASE_SECONDS,
    p_correlation_id: correlationId,
  });
  if (error) {
    console.error('csv_import_claim_failed', safeImportErrorCode(error));
    throw new SecurityError(503, 'import_idempotency_unavailable', 'Nie można bezpiecznie rozpocząć importu');
  }

  const decision = typeof data?.decision === 'string' ? data.decision : '';
  if (decision === 'succeeded' && data?.result_summary && typeof data.result_summary === 'object') {
    return { replaySummary: data.result_summary as Record<string, unknown> };
  }
  if (decision === 'in_progress') {
    throw new SecurityError(409, 'import_in_progress', 'Ten import jest już przetwarzany');
  }
  if (decision === 'payload_mismatch') {
    throw new SecurityError(409, 'idempotency_payload_mismatch', 'Klucz idempotencji został użyty dla innych danych');
  }
  if (decision === 'actor_mismatch') {
    throw new SecurityError(403, 'idempotency_actor_mismatch', 'Import należy do innego administratora');
  }
  if (decision === 'retry_exhausted') {
    throw new SecurityError(409, 'import_retry_exhausted', 'Import wymaga ręcznego sprawdzenia przed ponowieniem');
  }
  if (decision !== 'claimed' || !isUuid(data?.execution_id)) {
    throw new SecurityError(503, 'import_idempotency_unavailable', 'Nie można bezpiecznie rozpocząć importu');
  }

  return {
    context: {
      executionId: data.execution_id,
      actorId,
      tenantScopeId,
      idempotencyKeyHash,
      payloadFingerprint,
      correlationId,
    },
  };
}

async function finalizeImportExecution(
  supabase: any,
  context: ImportExecutionContext,
  succeeded: boolean,
  resultSummary: Record<string, unknown> | null,
  errorCode: string | null,
): Promise<void> {
  const { data, error } = await supabase.rpc('phase_f_finalize_import_execution', {
    p_execution_id: context.executionId,
    p_operation: 'settlements_csv',
    p_actor_id: context.actorId,
    p_tenant_scope_id: context.tenantScopeId,
    p_idempotency_key_hash: context.idempotencyKeyHash,
    p_payload_fingerprint: context.payloadFingerprint,
    p_correlation_id: context.correlationId,
    p_succeeded: succeeded,
    p_result_summary: resultSummary,
    p_error_code: errorCode,
  });
  if (error || data !== true) {
    console.error('csv_import_finalize_failed', safeImportErrorCode(error));
    throw new SecurityError(503, 'import_finalize_failed', 'Nie można bezpiecznie zakończyć importu');
  }
}

function safeImportErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[a-z0-9_]{1,32}$/i.test(code)) {
      return code;
    }
  }
  return 'unknown_error';
}

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
    // Uber fields
    uber_payout_d: string;
    uber_cash_f: string;
    uber_base: string;
    uber_tax_8: string;
    uber_net: string;
    
    // Bolt fields
    bolt_projected_d: string;
    bolt_payout_s: string;
    bolt_tax_8: string;
    bolt_net: string;
    
    // FreeNow fields
    freenow_base_s: string;
    freenow_commission_t: string;
    freenow_cash_f: string;
    freenow_tax_8: string;
    freenow_net: string;
    
    // Shared fields
    total_cash: string;
    total_commission: string;
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
    console.error('csv_import_first_import_check_failed', safeImportErrorCode(error));
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
    console.error('csv_import_alert_write_failed', safeImportErrorCode(error));
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
    } else {
      console.info('csv_import_invalid_getrido_id_skipped');
    }
  }
  
  // Update phone if present in CSV and different
  if (row.phone && existingDriver.phone !== row.phone) {
    updateData.phone = row.phone;
  }
  
  // Update fuel card if present in CSV and different
  if (fuel_card && existingDriver.fuel_card_number !== fuel_card) {
    updateData.fuel_card_number = fuel_card;
  }
  
  // Update email if present in CSV and different
  if (email && existingDriver.email !== email) {
    updateData.email = email;
  }
  
  // Execute update if there are changes
  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase
      .from('drivers')
      .update(updateData)
      .eq('id', existingDriver.id);
    
    if (error) {
      console.error('csv_import_driver_update_failed', safeImportErrorCode(error));
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
      console.error('csv_import_platform_id_upsert_failed', errors.length);
    }
  }
}

// Ensure driver_app_users mapping between auth user and driver
async function ensureDriverUserMapping(
  supabase: any,
  driverId: string,
  cityId: string,
  _email?: string | null,
  authUserId?: string | null
) {
  try {
    const { data: existingMap } = await supabase
      .from('driver_app_users')
      .select('user_id')
      .eq('driver_id', driverId)
      .maybeSingle();
    if (existingMap?.user_id) {
      return;
    }

    // Import danych nie może łączyć kont wyłącznie na podstawie emaila z CSV.
    // Mapowanie jest dozwolone tylko dla identyfikatora pochodzącego z osobnego,
    // uwierzytelnionego procesu tworzenia lub zapraszania konta.
    if (!authUserId) {
      return;
    }

    const { error } = await supabase
      .from('driver_app_users')
      .upsert({ user_id: authUserId, driver_id: driverId, city_id: cityId }, { onConflict: 'user_id' });
    if (error) {
      console.error('csv_import_driver_mapping_failed', safeImportErrorCode(error));
    }
  } catch (e) {
    console.error('csv_import_driver_mapping_exception', safeImportErrorCode(e));
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
      'Wiersz importu zawiera nieprawidłowy adres email',
      { code: 'invalid_email' },
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
      'Wiersz importu nie zawiera wymaganego identyfikatora kierowcy',
      { code: 'missing_driver_identifier' },
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
      console.info('csv_import_driver_matched', 'getrido_id');
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
        console.info('csv_import_driver_matched', 'manual_uber_id');
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
        await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
        return { driver, isNew: false, matchMethod: 'manual_uber_id' };
      }
    }
    if (match.match_key === 'bolt_id' && bolt_id && match.match_value === bolt_id) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.info('csv_import_driver_matched', 'manual_bolt_id');
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
        await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
        return { driver, isNew: false, matchMethod: 'manual_bolt_id' };
      }
    }
    if (match.match_key === 'freenow_id' && freenow_id && match.match_value === freenow_id) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.info('csv_import_driver_matched', 'manual_freenow_id');
        await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
        await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
        await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
        return { driver, isNew: false, matchMethod: 'manual_freenow_id' };
      }
    }
    if (match.match_key === 'email' && email && match.match_value.toLowerCase() === email) {
      const { data: driver } = await supabase.from('drivers').select('*').eq('id', match.driver_id).single();
      if (driver) {
        console.info('csv_import_driver_matched', 'manual_email');
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
      console.info('csv_import_driver_matched', 'uber_id');
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
      console.info('csv_import_driver_matched', 'bolt_id');
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
      console.info('csv_import_driver_matched', 'freenow_id');
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
      console.info('csv_import_driver_matched', 'email');
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
          console.info('csv_import_driver_matched', 'normalized_name');
          await updateDriverData(supabase, driver, row, getrido_id, email, fuel_card);
          await upsertPlatformIds(supabase, driver.id, uber_id, bolt_id, freenow_id);
          await ensureDriverUserMapping(supabase, driver.id, cityId, email, null);
          return { driver, isNew: false, matchMethod: 'name' };
        }
      }
    }
  }
  
  // 8. No match found - create new driver
  console.info('csv_import_driver_create_started');
  
  // Import tworzy wyłącznie rekord domenowy kierowcy. Konto logowania musi
  // powstać później przez osobny, audytowany proces jednorazowego zaproszenia.
  const { data: newDriver, error: insertError } = await supabase
    .from('drivers')
    .insert({
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
    const errorCode = safeImportErrorCode(insertError);
    console.error('csv_import_driver_create_failed', errorCode);
    await createAlert(
      supabase,
      'error',
      'import',
      'Błąd tworzenia kierowcy',
      'Nie udało się utworzyć rekordu kierowcy podczas importu',
      { code: errorCode },
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
    'Utworzono rekord kierowcy; konto oczekuje na bezpieczne zaproszenie',
    { first_import: firstImport, account_state: 'pending_invite' },
    newDriver.id,
    importJobId
  );
  
  console.info('csv_import_driver_created');
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
      console.info('csv_import_invalid_getrido_id_skipped', i);
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

  // Default mapping - using column letters from template
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
      uber_payout_d: 'H',
      uber_cash_f: 'I',
      uber_base: '',
      uber_tax_8: '',
      uber_net: '',
      
      bolt_projected_d: 'J',
      bolt_payout_s: 'K',
      bolt_tax_8: '',
      bolt_net: '',
      
      freenow_base_s: 'N',
      freenow_commission_t: 'O',
      freenow_cash_f: 'M',
      freenow_tax_8: '',
      freenow_net: '',
      
      total_cash: 'F',
      total_commission: 'razem prowizja',
      fuel: 'P',
      fuel_vat: 'vat z paliwa',
      fuel_vat_refund: 'U',
    },
  };

  // Merge loaded mapping with default
  const loaded = mappingData?.value || {};
  const mapping: CsvColumnMapping = {
    identification: { ...defaultMapping.identification, ...(loaded.identification || {}) },
    amounts: { ...defaultMapping.amounts, ...(loaded.amounts || {}) }
  };

  // Helper to get column value
  const getColValue = (mappingValue: string): number => {
    if (!mappingValue) return 0;
    const headerValues = (row as any).__headers || [];
    const colIndex = resolveColumnIndex(mappingValue, headerValues);
    return colIndex >= 0 ? parseNum((row as any)[`col_${colIndex}`]) : 0;
  };

  // Extract raw values from CSV
  const uberPayoutD = getColValue(mapping.amounts.uber_payout_d);
  const uberCashF = getColValue(mapping.amounts.uber_cash_f);
  
  const boltProjectedD = getColValue(mapping.amounts.bolt_projected_d);
  const boltPayoutS = getColValue(mapping.amounts.bolt_payout_s);
  
  const freenowBaseS = getColValue(mapping.amounts.freenow_base_s);
  const freenowCommissionT = getColValue(mapping.amounts.freenow_commission_t);
  const freenowCashF = getColValue(mapping.amounts.freenow_cash_f);
  
  const totalCash = getColValue(mapping.amounts.total_cash);
  const fuel = getColValue(mapping.amounts.fuel);
  const fuelVatRefund = getColValue(mapping.amounts.fuel_vat_refund);

  // Calculate Uber with 8% tax
  const uberBase = uberPayoutD + uberCashF;
  const uberTax8 = uberBase * 0.08;
  const uberNet = uberPayoutD - uberTax8;

  // Calculate Bolt with 8% tax
  const boltTax8 = boltProjectedD * 0.08;
  const boltNet = boltPayoutS - boltTax8;

  // Calculate FreeNow with 8% tax
  const freenowTax8 = freenowBaseS * 0.08;
  const freenowNet = freenowBaseS - freenowTax8 - freenowCommissionT - freenowCashF;

  // Build amounts object with calculated values
  const amounts: Record<string, number> = {
    // Uber
    uber_payout_d: uberPayoutD,
    uber_cash_f: uberCashF,
    uber_base: uberBase,
    uber_tax_8: uberTax8,
    uber_net: uberNet,
    
    // Bolt
    bolt_projected_d: boltProjectedD,
    bolt_payout_s: boltPayoutS,
    bolt_tax_8: boltTax8,
    bolt_net: boltNet,
    
    // FreeNow
    freenow_base_s: freenowBaseS,
    freenow_commission_t: freenowCommissionT,
    freenow_cash_f: freenowCashF,
    freenow_tax_8: freenowTax8,
    freenow_net: freenowNet,
    
    // Shared
    total_cash: totalCash,
    total_commission: 0,
    fuel: fuel,
    fuel_vat: 0,
    fuel_vat_refund: fuelVatRefund,
  };

  return amounts;
}

// Legacy key is used only to migrate matching pre-hardening rows in place.
function generateLegacyRowId(driverId: string, periodFrom: string, periodTo: string, rowIndex: number): string {
  const data = `${driverId}-${periodFrom}-${periodTo}-${rowIndex}`;
  return btoa(data).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
}

// The historical base64 key was truncated before period/row data for UUID driver IDs.
// A complete SHA-256 key prevents cross-period collisions and remains deterministic.
async function generateRowId(
  driverId: string,
  periodFrom: string,
  periodTo: string,
  rowIndex: number,
): Promise<{ current: string; legacy: string }> {
  const canonical = JSON.stringify([driverId, periodFrom, periodTo, rowIndex]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return {
    current: `csv_v2_${hex}`,
    legacy: generateLegacyRowId(driverId, periodFrom, periodTo, rowIndex),
  };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  let supabaseForFinalize: any = null;
  let executionContext: ImportExecutionContext | null = null;
  try {
    if (req.method !== 'POST') {
      throw new SecurityError(405, 'method_not_allowed', 'Dozwolona jest wyłącznie metoda POST');
    }

    const supabase = createServiceClient();
    supabaseForFinalize = supabase;
    const identity = await requireAdmin(req, supabase);
    await consumeRateLimit(supabase, {
      scope: 'admin.csv_import.user.hourly',
      subjectId: identity.userId,
      limit: 5,
      windowSeconds: 3_600,
    });
    await consumeRateLimit(supabase, {
      scope: 'admin.csv_import.user.daily',
      subjectId: identity.userId,
      limit: 20,
      windowSeconds: 86_400,
    });
    const body = await readJsonBody(req, 5_100_000);
    const csv_text = typeof body?.csv_text === 'string' ? body.csv_text : '';
    const period_from = typeof body?.period_from === 'string' ? body.period_from : '';
    const period_to = typeof body?.period_to === 'string' ? body.period_to : '';
    const city_id = body?.city_id;
    const force_first_import = body?.force_first_import === true;

    if (!csv_text || !period_from || !period_to || !isUuid(city_id)) {
      throw new SecurityError(400, 'invalid_import_payload', 'Nieprawidłowe dane importu CSV');
    }
    if (new TextEncoder().encode(csv_text).byteLength > MAX_CSV_BYTES) {
      throw new SecurityError(413, 'csv_too_large', 'Plik CSV przekracza bezpieczny limit rozmiaru');
    }
    const fromDate = Date.parse(`${period_from}T00:00:00Z`);
    const toDate = Date.parse(`${period_to}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period_from) || !/^\d{4}-\d{2}-\d{2}$/.test(period_to) ||
      !Number.isFinite(fromDate) || !Number.isFinite(toDate) || fromDate > toDate) {
      throw new SecurityError(400, 'invalid_import_period', 'Nieprawidłowy zakres dat importu');
    }

    if (force_first_import) {
      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: 'settlements.csv_import',
        resourceType: 'city',
        resourceId: city_id,
        result: 'denied',
        correlationId: identity.correlationId,
        metadata: { reason: 'force_first_import_disabled' },
      });
      throw new SecurityError(409, 'force_first_import_disabled', 'Wymuszone czyszczenie bazy podczas importu jest wyłączone');
    }

    const claim = await claimImportExecution(
      supabase,
      req,
      identity.userId,
      city_id,
      identity.correlationId,
      { csvText: csv_text, periodFrom: period_from, periodTo: period_to },
    );
    if (claim.replaySummary) {
      return jsonResponse(req, 200, {
        success: true,
        stats: claim.replaySummary,
        idempotent_replay: true,
      });
    }
    if (!claim.context) {
      throw new SecurityError(503, 'import_idempotency_unavailable', 'Nie można bezpiecznie rozpocząć importu');
    }
    executionContext = claim.context;

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: 'settlements.csv_import',
      resourceType: 'city',
      resourceId: city_id,
      result: 'attempted',
      correlationId: identity.correlationId,
      metadata: { period_from, period_to, csv_bytes: new TextEncoder().encode(csv_text).byteLength },
    });

    // Flaga firstImport steruje wyłącznie dopasowaniem rekordów. Import nigdy
    // nie usuwa istniejących kierowców ani kont.
    const firstImport = await isFirstImport(supabase);

    // Fetch manual matches
    const { data: manualMatches } = await supabase
      .from('manual_driver_matches')
      .select('*');
    
    const matches = manualMatches || [];

    // Create import job
    const { data: importJob, error: jobError } = await supabase
      .from('import_jobs')
      .upsert({
        id: executionContext.executionId,
        created_by: identity.userId,
        week_start: period_from,
        week_end: period_to,
        platform: 'csv',
        filename: 'settlements.csv',
        status: 'processing',
        city_id: city_id
      }, { onConflict: 'id' })
      .select()
      .single();
    
    if (jobError) {
      console.error('csv_import_job_create_failed', safeImportErrorCode(jobError));
      throw jobError;
    }
    
    const importJobId = importJob.id;
    
    // Parse CSV
    const rows = await parseCSV(csv_text, supabase);
    if (rows.length > MAX_CSV_ROWS) {
      throw new SecurityError(413, 'csv_too_many_rows', 'Plik CSV przekracza bezpieczny limit liczby wierszy');
    }
    console.info('csv_import_rows_parsed', rows.length);
    
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
        
        // Generate a collision-resistant row ID and look for the legacy key only
        // within the same driver/period before migrating it in place.
        const rowIds = await generateRowId(driver.id, period_from, period_to, i);
        const { data: existingRows, error: existingLookupError } = await supabase
          .from('settlements')
          .select('id, raw_row_id')
          .eq('driver_id', driver.id)
          .eq('period_from', period_from)
          .eq('period_to', period_to)
          .in('raw_row_id', [rowIds.current, rowIds.legacy])
          .limit(2);

        if (existingLookupError) {
          throw existingLookupError;
        }

        const existingCurrent = existingRows?.find((record: any) => record.raw_row_id === rowIds.current);
        const existingLegacy = existingRows?.find((record: any) => record.raw_row_id === rowIds.legacy);
        
        // Store raw with col_X fields for backward compatibility
        const rawData = { ...row };

        if (existingLegacy && !existingCurrent) {
          const { error: updateError } = await supabase
            .from('settlements')
            .update({
              amounts,
              raw: rawData,
              raw_row_id: rowIds.current,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingLegacy.id);

          if (updateError) {
            throw updateError;
          }
          updated++;
        } else {
          // The unique raw_row_id index is the final concurrency boundary.
          const { error: upsertError } = await supabase
            .from('settlements')
            .upsert({
              city_id,
              driver_id: driver.id,
              period_from,
              period_to,
              platform: 'main',
              source: 'csv_import',
              amounts,
              raw: rawData,
              raw_row_id: rowIds.current,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'raw_row_id' });

          if (upsertError) {
            throw upsertError;
          }
          if (existingCurrent) updated++;
          else added++;
        }
        
      } catch (err) {
        const errorCode = safeImportErrorCode(err);
        console.error('csv_import_row_failed', i, errorCode);
        errors++;
        
        await createAlert(
          supabase,
          'error',
          'import',
          `Błąd przetwarzania wiersza ${i + 2}`,
          'Nie udało się przetworzyć wiersza importu',
          { row_index: i + 2, code: errorCode },
          undefined,
          importJobId
        );
      }
    }
    
    // Update import job status
    const { error: importJobUpdateError } = await supabase
      .from('import_jobs')
      .update({ status: 'completed' })
      .eq('id', importJobId);
    if (importJobUpdateError) {
      throw importJobUpdateError;
    }
    
    // Create import history record
    const { error: importHistoryError } = await supabase
      .from('import_history')
      .upsert({
        import_job_id: importJobId,
        security_execution_id: executionContext.executionId,
        period_from,
        period_to,
        total_rows: rows.length,
        successful_rows: added + updated,
        error_rows: errors,
        new_drivers_count: newDriversCount,
        matched_drivers_count: matchedDriversCount,
        is_first_import: firstImport,
        filename: 'settlements.csv'
      }, { onConflict: 'security_execution_id' });
    if (importHistoryError) {
      throw importHistoryError;
    }

    const stats = {
      total: rows.length,
      added,
      updated,
      errors,
      newDrivers: newDriversCount,
      matchedDrivers: matchedDriversCount,
      isFirstImport: firstImport,
    };

    await finalizeImportExecution(supabase, executionContext, true, stats, null);
    executionContext = null;

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: 'settlements.csv_import',
      resourceType: 'import_job',
      resourceId: importJobId,
      result: 'succeeded',
      correlationId: identity.correlationId,
      metadata: stats,
    });

    return jsonResponse(req, 200, { success: true, stats });

  } catch (error) {
    let responseError = error;
    if (executionContext && supabaseForFinalize) {
      try {
        await finalizeImportExecution(
          supabaseForFinalize,
          executionContext,
          false,
          null,
          safeImportErrorCode(error),
        );
      } catch {
        responseError = new SecurityError(503, 'import_finalize_failed', 'Nie można bezpiecznie zakończyć importu');
      }
    }
    return errorResponse(req, responseError);
  }
});
