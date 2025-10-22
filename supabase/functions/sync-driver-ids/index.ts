import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

async function upsertPlatformIds(
  supabase: any,
  driverId: string,
  ids: { uber_id?: string | null; bolt_id?: string | null; freenow_id?: string | null }
) {
  const ops: Promise<any>[] = [];
  if (ids.uber_id) ops.push(supabase.from('driver_platform_ids').upsert({ driver_id: driverId, platform: 'uber', platform_id: ids.uber_id }, { onConflict: 'driver_id,platform' }));
  if (ids.bolt_id) ops.push(supabase.from('driver_platform_ids').upsert({ driver_id: driverId, platform: 'bolt', platform_id: ids.bolt_id }, { onConflict: 'driver_id,platform' }));
  if (ids.freenow_id) ops.push(supabase.from('driver_platform_ids').upsert({ driver_id: driverId, platform: 'freenow', platform_id: ids.freenow_id }, { onConflict: 'driver_id,platform' }));
  if (ops.length) await Promise.all(ops);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const city_id = body.city_id as string | undefined;
    const period_from = body.period_from as string | undefined;
    const period_to = body.period_to as string | undefined;

    if (!city_id) throw new Error('city_id is required');

    // Resolve period (latest csv_import settlements if not specified)
    let from = period_from;
    let to = period_to;
    if (!from || !to) {
      const { data: latest } = await supabase
        .from('settlements')
        .select('period_from, period_to')
        .eq('city_id', city_id)
        .eq('source', 'csv_import')
        .order('period_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) throw new Error('Brak rozliczeń z CSV dla podanego miasta');
      from = latest.period_from;
      to = latest.period_to;
    }

    console.log('🔄 Sync driver IDs from settlements', { city_id, period_from: from, period_to: to });

    const { data: rows, error } = await supabase
      .from('settlements')
      .select('id, driver_id, raw')
      .eq('city_id', city_id)
      .eq('source', 'csv_import')
      .eq('period_from', from)
      .eq('period_to', to);

    if (error) throw error;

    let updatedDrivers = 0;
    let upsertedPlatformIds = 0;

    for (const row of rows || []) {
      const raw = (row.raw || {}) as Record<string, any>;
      const getrido_id = (raw.getrido_id || '').toString().trim() || null;
      const uber_id = (raw.uber_id || '').toString().trim() || null;
      const freenow_id = (raw.freenow_id || '').toString().trim() || null;
      const bolt_id = (raw.bolt_id || '').toString().trim() || null;
      const phone = (raw.phone || '').toString().trim() || null;
      const email = normalizeEmail((raw.email || null) as string | null);
      const fuel_card = (raw.fuel_card || '').toString().trim() || null;

      const { data: driver } = await supabase.from('drivers').select('*').eq('id', row.driver_id).maybeSingle();
      if (!driver) continue;

      const update: any = {};
      if (getrido_id && driver.getrido_id !== getrido_id) update.getrido_id = getrido_id;
      if (phone && driver.phone !== phone) update.phone = phone;
      if (email && driver.email?.toLowerCase() !== email) update.email = email;
      if (fuel_card && driver.fuel_card_number !== fuel_card) update.fuel_card_number = fuel_card;

      if (Object.keys(update).length) {
        const { error: uErr } = await supabase.from('drivers').update(update).eq('id', driver.id);
        if (!uErr) updatedDrivers++;
      }

      const beforeCount = upsertedPlatformIds;
      await upsertPlatformIds(supabase, driver.id, { uber_id, bolt_id, freenow_id });
      if (uber_id) upsertedPlatformIds++;
      if (bolt_id) upsertedPlatformIds++;
      if (freenow_id) upsertedPlatformIds++;
    }

    return new Response(
      JSON.stringify({ success: true, stats: { updatedDrivers, upsertedPlatformIds, period_from: from, period_to: to } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('sync-driver-ids error', e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});