import { supabase } from '@/integrations/supabase/client';

/**
 * Synchronizes vehicle_rentals with driver_vehicle_assignments
 * Ensures that finalized rentals have active vehicle assignments
 */
export async function syncRentalAssignments(fleetId: string) {
  try {
    // Get all finalized/active rentals that don't have matching active assignments
    const { data: rentals, error: rentalsError } = await supabase
      .from('vehicle_rentals')
      .select('id, driver_id, vehicle_id, status, rental_start')
      .eq('fleet_id', fleetId)
      .in('status', ['finalized', 'active', 'fleet_signed']);

    if (rentalsError) {
      console.error('Error fetching rentals for sync:', rentalsError);
      return;
    }

    if (!rentals || rentals.length === 0) return;

    // Get existing active assignments for this fleet
    const { data: assignments, error: assignError } = await supabase
      .from('driver_vehicle_assignments')
      .select('driver_id, vehicle_id')
      .eq('fleet_id', fleetId)
      .eq('status', 'active');

    if (assignError) {
      console.error('Error fetching assignments:', assignError);
      return;
    }

    // Create a set of existing active assignments (driver_id + vehicle_id)
    const existingAssignments = new Set(
      (assignments || []).map(a => `${a.driver_id}_${a.vehicle_id}`)
    );

    // Find rentals without matching assignments
    const missingAssignments = rentals.filter(r => 
      r.driver_id && r.vehicle_id && 
      !existingAssignments.has(`${r.driver_id}_${r.vehicle_id}`)
    );

    if (missingAssignments.length === 0) return;

    console.log(`🔄 SYNC: Found ${missingAssignments.length} rentals without assignments, fixing...`);

    // Create missing assignments
    for (const rental of missingAssignments) {
      // First deactivate any existing assignments for this vehicle
      await supabase
        .from('driver_vehicle_assignments')
        .update({ status: 'inactive', unassigned_at: new Date().toISOString() })
        .eq('vehicle_id', rental.vehicle_id)
        .eq('status', 'active');

      // Create new active assignment
      const { error: insertError } = await supabase
        .from('driver_vehicle_assignments')
        .insert({
          driver_id: rental.driver_id,
          vehicle_id: rental.vehicle_id,
          fleet_id: fleetId,
          status: 'active',
          assigned_at: rental.rental_start || new Date().toISOString()
        });

      if (insertError) {
        console.error('Error creating assignment for rental:', rental.id, insertError);
      } else {
        console.log(`✅ Created assignment for rental ${rental.id}: driver ${rental.driver_id} -> vehicle ${rental.vehicle_id}`);
      }
    }
  } catch (error) {
    console.error('Error in rental sync:', error);
  }
}

/**
 * Sync a single rental to vehicle assignment
 */
export async function syncSingleRentalAssignment(
  rentalId: string, 
  driverId: string, 
  vehicleId: string, 
  fleetId: string
) {
  try {
    // Check if assignment already exists
    const { data: existing } = await supabase
      .from('driver_vehicle_assignments')
      .select('id')
      .eq('driver_id', driverId)
      .eq('vehicle_id', vehicleId)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      console.log('Assignment already exists for this driver-vehicle pair');
      return true;
    }

    // Deactivate any existing assignments for this vehicle
    await supabase
      .from('driver_vehicle_assignments')
      .update({ status: 'inactive', unassigned_at: new Date().toISOString() })
      .eq('vehicle_id', vehicleId)
      .eq('status', 'active');

    // Create new active assignment
    const { error } = await supabase
      .from('driver_vehicle_assignments')
      .insert({
        driver_id: driverId,
        vehicle_id: vehicleId,
        fleet_id: fleetId,
        status: 'active',
        assigned_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error creating vehicle assignment:', error);
      return false;
    }

    console.log(`✅ Synced rental ${rentalId} to vehicle assignment`);
    return true;
  } catch (error) {
    console.error('Error syncing rental assignment:', error);
    return false;
  }
}
