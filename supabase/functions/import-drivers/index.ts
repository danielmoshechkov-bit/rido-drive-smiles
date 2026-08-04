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

const MAX_CSV_BASE64_LENGTH = 7_000_000;
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
  csvContent: string,
): Promise<{ context?: ImportExecutionContext; replaySummary?: Record<string, unknown> }> {
  const payloadFingerprint = await sha256Hex(JSON.stringify([
    'drivers_csv_v1',
    tenantScopeId,
    csvContent,
  ]));
  const suppliedKey = readIdempotencyKey(req);
  const idempotencyKeyHash = await sha256Hex(
    suppliedKey ? `client_v1:${suppliedKey}` : `payload_v1:${payloadFingerprint}`,
  );
  const { data, error } = await supabase.rpc('phase_f_claim_import_execution', {
    p_operation: 'drivers_csv',
    p_actor_id: actorId,
    p_tenant_scope_id: tenantScopeId,
    p_idempotency_key_hash: idempotencyKeyHash,
    p_payload_fingerprint: payloadFingerprint,
    p_lease_seconds: IMPORT_LEASE_SECONDS,
    p_correlation_id: correlationId,
  });
  if (error) {
    console.error('driver_import_claim_failed', safeImportErrorCode(error));
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
    p_operation: 'drivers_csv',
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
    console.error('driver_import_finalize_failed', safeImportErrorCode(error));
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
      scope: 'admin.driver_import.user.hourly',
      subjectId: identity.userId,
      limit: 5,
      windowSeconds: 3_600,
    });
    await consumeRateLimit(supabase, {
      scope: 'admin.driver_import.user.daily',
      subjectId: identity.userId,
      limit: 20,
      windowSeconds: 86_400,
    });

    const body = await readJsonBody(req, 7_100_000);
    const csv_content = typeof body?.csv_content === 'string' ? body.csv_content : '';
    const city_id = body?.city_id;

    if (!csv_content || !isUuid(city_id)) {
      throw new SecurityError(400, 'invalid_import_payload', 'Nieprawidłowe dane importu kierowców');
    }
    if (csv_content.length > MAX_CSV_BASE64_LENGTH) {
      throw new SecurityError(413, 'csv_too_large', 'Plik CSV przekracza bezpieczny limit rozmiaru');
    }

    const claim = await claimImportExecution(
      supabase,
      req,
      identity.userId,
      city_id,
      identity.correlationId,
      csv_content,
    );
    if (claim.replaySummary) {
      return jsonResponse(req, 200, {
        success: true,
        stats: claim.replaySummary,
        errors: [],
        idempotent_replay: true,
      });
    }
    if (!claim.context) {
      throw new SecurityError(503, 'import_idempotency_unavailable', 'Nie można bezpiecznie rozpocząć importu');
    }
    executionContext = claim.context;

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: 'drivers.csv_import',
      resourceType: 'city',
      resourceId: city_id,
      result: 'attempted',
      correlationId: identity.correlationId,
      metadata: { csv_base64_length: csv_content.length },
    });

    // Decode base64 CSV
    let decoded: string;
    try {
      decoded = atob(csv_content);
    } catch {
      throw new SecurityError(400, 'invalid_csv_encoding', 'Nieprawidłowe kodowanie pliku CSV');
    }
    const uint8Array = Uint8Array.from(decoded, c => c.charCodeAt(0));
    const csvText = new TextDecoder('utf-8').decode(uint8Array);
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      throw new SecurityError(400, 'csv_empty', 'CSV jest pusty lub ma tylko nagłówki');
    }
    if (rows.length > MAX_CSV_ROWS) {
      throw new SecurityError(413, 'csv_too_many_rows', 'Plik CSV przekracza bezpieczny limit liczby wierszy');
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());

    // Find column indexes - based on system.csv format
    const emailIdx = headers.findIndex(h => h.includes('adres mailowy') || h.includes('email'));
    const phoneIdx = headers.findIndex(h => h.includes('nr tel') || h.includes('telefon') || h.includes('phone'));
    const fullNameIdx = headers.findIndex(h => h.includes('imie nazwisko') || h.includes('imię nazwisko'));
    const getRidoIdIdx = headers.findIndex(h => h.includes('getrido id') || h.includes('getrido_id'));
    const uberIdIdx = headers.findIndex(h => h === 'id uber' || h.includes('uber id'));
    const freenowIdIdx = headers.findIndex(h => h === 'id freenow' || h.includes('freenow id'));
    const boltIdIdx = headers.findIndex(h => h === 'id bolt' || h.includes('bolt id'));

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
          console.info('driver_import_empty_row_skipped', i);
          continue;
        }

        // Generate getrido_id if not provided
        if (!getRidoId) {
          getRidoId = await generateGetRidoId(executionContext.payloadFingerprint, i);
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
            console.error('driver_import_row_update_failed', i, safeImportErrorCode(updateError));
            errors.push(`Row ${i}: aktualizacja nie powiodła się`);
            errorCount++;
            continue;
          }

          driverId = existingDriver.id;
          updatedCount++;
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
            console.error('driver_import_row_insert_failed', i, safeImportErrorCode(insertError));
            errors.push(`Row ${i}: utworzenie rekordu nie powiodło się`);
            errorCount++;
            continue;
          }

          driverId = newDriver.id;
          importedCount++;
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
          // Upsert before pruning stale entries so a transient write failure does
          // not erase all identifiers. The unique (driver_id, platform) constraint
          // makes retries of the same row converge safely.
          const { error: platformError } = await supabase
            .from('driver_platform_ids')
            .upsert(platformIds, { onConflict: 'driver_id,platform' });

          if (platformError) {
            console.warn('driver_import_platform_upsert_failed', i, safeImportErrorCode(platformError));
          } else {
            const importedPlatforms = platformIds.map(item => item.platform);
            const { error: pruneError } = await supabase
              .from('driver_platform_ids')
              .delete()
              .eq('driver_id', driverId)
              .not('platform', 'in', `(${importedPlatforms.join(',')})`);
            if (pruneError) {
              console.warn('driver_import_platform_prune_failed', i, safeImportErrorCode(pruneError));
            }
          }
        }

      } catch (rowError) {
        console.error('driver_import_row_failed', i, safeImportErrorCode(rowError));
        errors.push(`Row ${i}: przetwarzanie nie powiodło się`);
        errorCount++;
      }
    }

    console.info('driver_import_completed', importedCount, updatedCount, errorCount);

    const stats = {
      imported: importedCount,
      updated: updatedCount,
      errors: errorCount,
      total: importedCount + updatedCount + errorCount,
    };
    await finalizeImportExecution(supabase, executionContext, true, stats, null);
    executionContext = null;

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: 'drivers.csv_import',
      resourceType: 'city',
      resourceId: city_id,
      result: 'succeeded',
      correlationId: identity.correlationId,
      metadata: stats,
    });

    return jsonResponse(req, 200, {
      success: true,
      stats,
      errors: errors.slice(0, 10),
    });

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

async function generateGetRidoId(payloadFingerprint: string, rowIndex: number): Promise<string> {
  const digest = await sha256Hex(JSON.stringify(['driver_import_v1', payloadFingerprint, rowIndex]));
  return `IMP${digest.slice(0, 13).toUpperCase()}`;
}
