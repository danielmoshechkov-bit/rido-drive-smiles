import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireAdmin,
  SecurityError,
  writeAuditEvent,
} from '../_shared/security.ts';
import { isUuid } from '../_shared/securityPrimitives.ts';

// Check if value looks like a UUID
function isUUID(value: string): boolean {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
}

// Check if value is purely numeric
function isPurelyNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

// Check if value contains @ (likely an email)
function looksLikeEmail(value: string): boolean {
  return value.includes('@');
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== 'POST') {
      throw new SecurityError(405, 'method_not_allowed', 'Dozwolona jest wyłącznie metoda POST');
    }

    const supabase = createServiceClient();
    const identity = await requireAdmin(req, supabase);

    const body = await req.json().catch(() => null);
    const city_id = body?.city_id;

    if (!isUuid(city_id)) {
      throw new SecurityError(400, 'invalid_city', 'Nieprawidłowy identyfikator miasta');
    }

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: 'drivers.sanitize_getrido_id',
      resourceType: 'city',
      resourceId: city_id,
      result: 'attempted',
      correlationId: identity.correlationId,
    });

    // Fetch all drivers with their platform IDs
    const { data: drivers, error: fetchError } = await supabase
      .from('drivers')
      .select(`
        id,
        getrido_id,
        driver_platform_ids (
          platform,
          platform_id
        )
      `)
      .eq('city_id', city_id);

    if (fetchError) {
      throw fetchError;
    }

    if (!drivers || drivers.length === 0) {
      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: 'drivers.sanitize_getrido_id',
        resourceType: 'city',
        resourceId: city_id,
        result: 'succeeded',
        correlationId: identity.correlationId,
        metadata: { total_checked: 0, sanitized_count: 0 },
      });
      return jsonResponse(req, 200, {
        success: true,
        message: 'No drivers found for this city',
        sanitized_count: 0,
        total_checked: 0,
        sanitized_drivers: [],
      });
    }

    console.log(`Found ${drivers.length} drivers to check`);

    let sanitizedCount = 0;
    const sanitizedDrivers: any[] = [];

    for (const driver of drivers) {
      if (!driver.getrido_id) continue;

      const getrido = driver.getrido_id.trim();
      let shouldNullify = false;
      let reason = '';

      // Check if it's a UUID
      if (isUUID(getrido)) {
        shouldNullify = true;
        reason = 'UUID pattern';
      }

      // Check if it's an email
      if (!shouldNullify && looksLikeEmail(getrido)) {
        shouldNullify = true;
        reason = 'looks like email';
      }

      // Check if it's purely numeric
      if (!shouldNullify && isPurelyNumeric(getrido)) {
        shouldNullify = true;
        reason = 'purely numeric';
      }

      // Check if it matches any platform ID
      if (!shouldNullify && driver.driver_platform_ids) {
        for (const platformId of driver.driver_platform_ids) {
          if (getrido === platformId.platform_id) {
            shouldNullify = true;
            reason = `matches ${platformId.platform} ID`;
            break;
          }
        }
      }

      if (shouldNullify) {
        console.log('sanitize_getrido_id_match', { driver_id: driver.id, reason });

        const { error: updateError } = await supabase
          .from('drivers')
          .update({ getrido_id: null })
          .eq('id', driver.id);

        if (updateError) {
          console.error(`❌ Failed to update driver ${driver.id}:`, updateError);
        } else {
          sanitizedCount++;
          sanitizedDrivers.push({ driver_id: driver.id, reason });
        }
      }
    }

    console.log(`✅ Sanitize completed: ${sanitizedCount} drivers updated`);

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: 'drivers.sanitize_getrido_id',
      resourceType: 'city',
      resourceId: city_id,
      result: 'succeeded',
      correlationId: identity.correlationId,
      metadata: { total_checked: drivers.length, sanitized_count: sanitizedCount },
    });

    return jsonResponse(req, 200, {
      success: true,
      sanitized_count: sanitizedCount,
      total_checked: drivers.length,
      sanitized_drivers: sanitizedDrivers,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
