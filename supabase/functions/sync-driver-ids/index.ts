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

// Validate GetRido ID to prevent Uber/Bolt/FreeNow IDs from being saved as GetRido
function isValidGetRidoId(value: string | null, uber_id?: string | null, bolt_id?: string | null, freenow_id?: string | null): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 4) return false;
  // Reject UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return false;
  // Reject purely numeric strings
  if (/^\d+$/.test(v)) return false;
  // Reject emails
  if (v.includes('@')) return false;
  // Reject if identical to platform IDs
  if (v === uber_id || v === bolt_id || v === freenow_id) return false;
  return true;
}

function extractFields(raw: any): {
  getrido_id: string | null;
  uber_id: string | null;
  bolt_id: string | null;
  freenow_id: string | null;
  email: string | null;
  phone: string | null;
  fuel_card: string | null;
} {
  const trim = (val: any) => (val !== undefined && val !== null && String(val).length ? String(val).trim() : null);
  const isNumericLike = (val: string | null) => !!(val && /^[0-9.,]+$/.test(val));
  const validPattern = /^[A-Za-z0-9_-]+$/;
  const isValidGetrido = (val: string | null, fullName?: string | null) => {
    if (!val) return false;
    if (isNumericLike(val)) return false;
    if (!validPattern.test(val)) return false;
    if (fullName && val.replace(/\s+/g, '').toLowerCase() === fullName.replace(/\s+/g, '').toLowerCase()) return false;
    return true;
  };

  const fullName = trim(raw?.full_name || raw?.['Imię i nazwisko'] || raw?.['Imie nazwisko'] || raw?.['Imię Nazwisko'] || null);

  // Array format: scan from RIGHT to LEFT, skip empty/numeric values
  if (Array.isArray(raw)) {
    let candidate: string | null = null;
    // Start from the end and work backwards
    for (let i = raw.length - 1; i >= 0; i--) {
      const val = trim(raw[i]);
      if (!val) continue; // skip empty
      if (isNumericLike(val)) continue; // skip numeric (amounts)
      if (isValidGetrido(val, fullName)) {
        candidate = val;
        console.log(`[Array Extract] len=${raw.length}, found at index ${i}: "${val}"`);
        break;
      }
    }
    return {
      email: trim(raw[0]),
      uber_id: trim(raw[1]),
      phone: trim(raw[2]),
      freenow_id: trim(raw[3]),
      fuel_card: trim(raw[4]),
      bolt_id: null, // Not in old array format
      getrido_id: candidate
    };
  }

  // Object format: prefer explicit keys, else scan col_* from highest to lowest for a valid non-numeric token
  let getrido = trim(raw['getrido ID'] || raw.getrido_id || raw.getRidoId);
  if (!isValidGetrido(getrido, fullName)) {
    const colKeys = Object.keys(raw)
      .filter((k) => /^col_\d+$/.test(k))
      .sort((a, b) => Number(b.split('_')[1]) - Number(a.split('_')[1]));
    for (const k of colKeys) {
      const v = trim(raw[k]);
      if (isValidGetrido(v, fullName)) {
        console.log(`[Object Extract] Using ${k}="${v}" instead of "${getrido}"`);
        getrido = v;
        break;
      }
    }
    if (!isValidGetrido(getrido, fullName)) getrido = null;
  }

  // Validate getrido_id using enhanced validation to prevent platform IDs
  const uber = trim(raw.uber_id || raw['id uber'] || raw.uberId || null);
  const bolt = trim(raw.bolt_id || raw['id bolt'] || raw.boltId || null);
  const freenow = trim(raw.freenow_id || raw['id freenow'] || raw.freeNowId || null);
  
  if (getrido && !isValidGetRidoId(getrido, uber, bolt, freenow)) {
    console.log(`⚠️ Invalid getrido_id: "${getrido}", skipping (may be platform ID)`);
    getrido = null;
  }

  return {
    getrido_id: getrido,
    uber_id: uber,
    bolt_id: bolt,
    freenow_id: freenow,
    email: trim(raw.email || raw['adres mailowy'] || null),
    phone: trim(raw.phone || raw['nr tel'] || raw.telefon || null),
    fuel_card: trim(raw.fuel_card || raw['nr karty paliwowej'] || null)
  };
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
    let foundGetridoIds = 0;
    let foundPlatformIds = 0;

    for (const row of rows || []) {
      const raw = row.raw || {};
      const fields = extractFields(raw);
      
      // Log found IDs for debugging
      if (fields.getrido_id) foundGetridoIds++;
      if (fields.uber_id || fields.bolt_id || fields.freenow_id) foundPlatformIds++;

      const { data: driver } = await supabase.from('drivers').select('*').eq('id', row.driver_id).maybeSingle();
      if (!driver) continue;

      const update: any = {};
      // Safe update for getrido_id
      if (fields.getrido_id && driver.getrido_id !== fields.getrido_id) {
        const candidate = String(fields.getrido_id).trim();
        const nameConcat = `${driver.first_name || ''} ${driver.last_name || ''}`.trim().toLowerCase().replace(/\s+/g, '');
        const candNormalized = candidate.toLowerCase().replace(/\s+/g, '');
        const validPattern = /^[A-Za-z0-9_-]+$/;
        const numericLike = /^[0-9.,]+$/;
        if (validPattern.test(candidate) && !numericLike.test(candidate) && candNormalized !== nameConcat) {
          update.getrido_id = candidate;
        } else {
          console.log(`⏭️ Skipping suspicious getrido_id "${candidate}" for driver ${driver.id}`);
        }
      }
      if (fields.phone && driver.phone !== fields.phone) update.phone = fields.phone;
      if (fields.email) {
        const normalizedEmail = normalizeEmail(fields.email);
        if (normalizedEmail && driver.email?.toLowerCase() !== normalizedEmail) update.email = normalizedEmail;
      }
      if (fields.fuel_card && driver.fuel_card_number !== fields.fuel_card) update.fuel_card_number = fields.fuel_card;

      if (Object.keys(update).length) {
        const { error: uErr } = await supabase.from('drivers').update(update).eq('id', driver.id);
        if (!uErr) {
          updatedDrivers++;
          console.log(`✅ Updated driver ${driver.first_name} ${driver.last_name}:`, Object.keys(update));
        }
      }

      await upsertPlatformIds(supabase, driver.id, { 
        uber_id: fields.uber_id, 
        bolt_id: fields.bolt_id, 
        freenow_id: fields.freenow_id 
      });
      if (fields.uber_id) upsertedPlatformIds++;
      if (fields.bolt_id) upsertedPlatformIds++;
      if (fields.freenow_id) upsertedPlatformIds++;
    }

    console.log(`📊 Sync stats: ${updatedDrivers} drivers updated, ${upsertedPlatformIds} platform IDs upserted, ${foundGetridoIds} GetRido IDs found, ${foundPlatformIds} platform IDs found`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        stats: { 
          updatedDrivers, 
          upsertedPlatformIds, 
          foundGetridoIds, 
          foundPlatformIds, 
          period_from: from, 
          period_to: to 
        } 
      }),
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