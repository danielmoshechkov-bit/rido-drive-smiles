import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting fleet alerts generation...');

    // Get all active fleets
    const { data: fleets, error: fleetsError } = await supabase
      .from('fleets')
      .select('id, name');

    if (fleetsError) throw fleetsError;

    let alertsCreated = 0;

    for (const fleet of fleets || []) {
      console.log(`Processing fleet: ${fleet.name} (${fleet.id})`);

      // Check vehicle expiry dates (OC, przeglądy)
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select(`
          id,
          plate,
          brand,
          model,
          fleet_id,
          vehicle_policies(valid_to, type),
          vehicle_inspections(valid_to)
        `)
        .eq('fleet_id', fleet.id)
        .eq('status', 'aktywne');

      if (vehiclesError) {
        console.error(`Error fetching vehicles for fleet ${fleet.id}:`, vehiclesError);
        continue;
      }

      const today = new Date();
      const yellowThreshold = new Date(today);
      yellowThreshold.setDate(yellowThreshold.getDate() + 30);
      const redThreshold = new Date(today);
      redThreshold.setDate(redThreshold.getDate() + 7);

      for (const vehicle of vehicles || []) {
        // Check OC policies
        const policies = (vehicle as any).vehicle_policies || [];
        for (const policy of policies) {
          if (policy.valid_to) {
            const validTo = new Date(policy.valid_to);
            if (validTo <= redThreshold) {
              // Red alert - expires in < 7 days
              await supabase.from('system_alerts').insert({
                type: 'vehicle_expiry',
                category: 'expiry',
                title: `PILNE: ${policy.type} wygasa za ${Math.ceil((validTo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))} dni`,
                description: `Pojazd ${vehicle.plate} (${vehicle.brand} ${vehicle.model}) - ${policy.type} wygasa ${policy.valid_to}`,
                status: 'pending',
                fleet_id: fleet.id,
                metadata: { vehicle_id: vehicle.id, document_type: policy.type, valid_to: policy.valid_to }
              });
              alertsCreated++;
            } else if (validTo <= yellowThreshold) {
              // Yellow alert - expires in < 30 days
              await supabase.from('system_alerts').insert({
                type: 'vehicle_expiry',
                category: 'expiry',
                title: `${policy.type} wygasa za ${Math.ceil((validTo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))} dni`,
                description: `Pojazd ${vehicle.plate} (${vehicle.brand} ${vehicle.model}) - ${policy.type} wygasa ${policy.valid_to}`,
                status: 'pending',
                fleet_id: fleet.id,
                metadata: { vehicle_id: vehicle.id, document_type: policy.type, valid_to: policy.valid_to }
              });
              alertsCreated++;
            }
          }
        }

        // Check inspections
        const inspections = (vehicle as any).vehicle_inspections || [];
        for (const inspection of inspections) {
          if (inspection.valid_to) {
            const validTo = new Date(inspection.valid_to);
            if (validTo <= redThreshold) {
              await supabase.from('system_alerts').insert({
                type: 'vehicle_expiry',
                category: 'expiry',
                title: `PILNE: Przegląd wygasa za ${Math.ceil((validTo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))} dni`,
                description: `Pojazd ${vehicle.plate} (${vehicle.brand} ${vehicle.model}) - przegląd wygasa ${inspection.valid_to}`,
                status: 'pending',
                fleet_id: fleet.id,
                metadata: { vehicle_id: vehicle.id, document_type: 'przegląd', valid_to: inspection.valid_to }
              });
              alertsCreated++;
            } else if (validTo <= yellowThreshold) {
              await supabase.from('system_alerts').insert({
                type: 'vehicle_expiry',
                category: 'expiry',
                title: `Przegląd wygasa za ${Math.ceil((validTo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))} dni`,
                description: `Pojazd ${vehicle.plate} (${vehicle.brand} ${vehicle.model}) - przegląd wygasa ${inspection.valid_to}`,
                status: 'pending',
                fleet_id: fleet.id,
                metadata: { vehicle_id: vehicle.id, document_type: 'przegląd', valid_to: inspection.valid_to }
              });
              alertsCreated++;
            }
          }
        }
      }

      // Check driver debts for this fleet
      const { data: assignments, error: assignmentsError } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          driver_id,
          drivers!inner(first_name, last_name, driver_debts(current_balance))
        `)
        .eq('fleet_id', fleet.id)
        .eq('status', 'active');

      if (assignmentsError) {
        console.error(`Error fetching assignments for fleet ${fleet.id}:`, assignmentsError);
        continue;
      }

      for (const assignment of assignments || []) {
        const driver = (assignment as any).drivers;
        const debts = driver.driver_debts || [];
        
        for (const debt of debts) {
          if (debt.current_balance < 0) {
            // Driver is in debt
            await supabase.from('system_alerts').insert({
              type: 'driver_debt',
              category: 'debt',
              title: `Kierowca w minusie: ${driver.first_name} ${driver.last_name}`,
              description: `Kierowca ma dług: ${Math.abs(debt.current_balance).toFixed(2)} PLN`,
              status: 'pending',
              fleet_id: fleet.id,
              driver_id: assignment.driver_id,
              metadata: { balance: debt.current_balance }
            });
            alertsCreated++;
          }
        }
      }
    }

    console.log(`Fleet alerts generation completed. Created ${alertsCreated} alerts.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        alertsCreated,
        message: `Successfully created ${alertsCreated} fleet alerts`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in fleet-alerts function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
