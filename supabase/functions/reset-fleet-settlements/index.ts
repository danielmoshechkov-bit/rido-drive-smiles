import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { fleet_id } = await req.json();
    if (!fleet_id) {
      return new Response(JSON.stringify({ error: 'fleet_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Get all driver IDs in this fleet
    const { data: drivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id')
      .eq('fleet_id', fleet_id);

    if (driversErr) throw driversErr;
    const driverIds = (drivers || []).map((d: any) => d.id);

    if (driverIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No drivers found', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Delete ALL driver_debt_transactions for these drivers
    const { error: delTxErr } = await supabase
      .from('driver_debt_transactions')
      .delete()
      .in('driver_id', driverIds);
    if (delTxErr) throw delTxErr;

    // 3. Reset driver_debts to 0 for all drivers
    for (const driverId of driverIds) {
      await supabase
        .from('driver_debts')
        .upsert({
          driver_id: driverId,
          current_balance: 0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'driver_id' });
    }

    // 4. Reset ALL debt snapshots AND actual_payout on settlements
    // CRITICAL: actual_payout must also be zeroed, otherwise splitDebtByWeek
    // reconstructs phantom debts from deriveRawPayoutFromSnapshot()
    for (const driverId of driverIds) {
      await supabase
        .from('settlements')
        .update({
          debt_before: 0,
          debt_after: 0,
          debt_payment: 0,
          actual_payout: 0,
        })
        .eq('driver_id', driverId);
    }

    // 5. Mark this fleet as reset (store in fleet metadata)
    await supabase
      .from('fleets')
      .update({ settlements_reset_at: new Date().toISOString() })
      .eq('id', fleet_id);

    return new Response(JSON.stringify({
      success: true,
      count: driverIds.length,
      message: `Wyzerowano dane rozliczeń dla ${driverIds.length} kierowców`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Reset error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
