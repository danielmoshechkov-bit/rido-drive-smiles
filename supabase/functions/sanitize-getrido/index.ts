import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { city_id } = await req.json();

    if (!city_id) {
      throw new Error('city_id is required');
    }

    console.log(`🧹 Sanitize GetRido ID started for city: ${city_id}`);

    // Fetch all drivers with their platform IDs
    const { data: drivers, error: fetchError } = await supabase
      .from('drivers')
      .select(`
        id,
        getrido_id,
        email,
        first_name,
        last_name,
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
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No drivers found for this city',
          sanitized_count: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
        console.log(
          `🔧 Nullifying getrido_id for driver ${driver.id} (${driver.first_name} ${driver.last_name}): "${getrido}" - ${reason}`
        );

        const { error: updateError } = await supabase
          .from('drivers')
          .update({ getrido_id: null })
          .eq('id', driver.id);

        if (updateError) {
          console.error(`❌ Failed to update driver ${driver.id}:`, updateError);
        } else {
          sanitizedCount++;
          sanitizedDrivers.push({
            driver_id: driver.id,
            name: `${driver.first_name} ${driver.last_name}`,
            old_getrido_id: getrido,
            reason,
          });
        }
      }
    }

    console.log(`✅ Sanitize completed: ${sanitizedCount} drivers updated`);

    return new Response(
      JSON.stringify({
        success: true,
        sanitized_count: sanitizedCount,
        total_checked: drivers.length,
        sanitized_drivers: sanitizedDrivers,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Sanitize error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
