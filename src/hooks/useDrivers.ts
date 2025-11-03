import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city_id: string;
  created_at: string;
  updated_at: string;
  registration_date: string | null;
  billing_method: string | null;
  fuel_card_number: string | null;
  fuel_card_pin: string | null;
  fleet_id?: string | null;
  getrido_id?: string | null;
  payment_method?: string | null;
  iban?: string | null;
  platform_ids?: Array<{
    platform: string;
    platform_id: string;
  }>;
  document_statuses?: Array<{
    document_type: string;
    status: string;
    date_uploaded: string | null;
  }>;
  vehicle_assignment?: {
    vehicle_id: string | null;
    fleet_id: string | null;
    fleet_name: string | null;
    status: string;
    assigned_at?: string;
    unassigned_at?: string | null;
    vehicle?: {
      plate: string;
      brand: string;
      model: string;
      fleet_id: string | null;
    } | null;
  } | null;
}

export const useDrivers = (params?: { cityId?: string; fleetId?: string }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('drivers')
        .select(`
          *,
          driver_platform_ids(
            platform,
            platform_id
          ),
          driver_document_statuses(
            document_type,
            status,
            date_uploaded
          ),
          driver_vehicle_assignments!left(
            vehicle_id,
            fleet_id,
            status,
            assigned_at,
            unassigned_at,
            fleets(
              name
            ),
            vehicles(
              plate,
              brand,
              model,
              fleet_id
            )
          )
        `)
        .order('first_name');
      
      // Apply filters based on provided params
      if (params?.cityId) {
        query = query.eq('city_id', params.cityId);
      }
      
      if (params?.fleetId) {
        query = query.eq('fleet_id', params.fleetId);
      }
      
      const { data, error } = await query;

      if (error) throw error;
      
      const driversWithPlatforms = (data || []).map(driver => {
        const assignments = driver.driver_vehicle_assignments || [];
        
        // Sort assignments by assigned_at descending
        const sorted = [...assignments].sort((a, b) => 
          new Date(b.assigned_at || 0).getTime() - new Date(a.assigned_at || 0).getTime()
        );
        
        // Find active assignment (status='active' AND unassigned_at IS NULL)
        const activeAssignment = sorted.find(a => 
          a.status === 'active' && (a.unassigned_at === null || a.unassigned_at === undefined)
        );
        
        // Use active assignment, or fallback to most recent historical
        const chosenAssignment = activeAssignment || sorted[0] || null;
        
        return {
          ...driver,
          platform_ids: driver.driver_platform_ids || [],
          document_statuses: driver.driver_document_statuses || [],
          vehicle_assignment: chosenAssignment ? {
            vehicle_id: chosenAssignment.vehicle_id,
            fleet_id: chosenAssignment.fleet_id,
            fleet_name: chosenAssignment.fleets?.name || null,
            status: chosenAssignment.status,
            assigned_at: chosenAssignment.assigned_at,
            unassigned_at: chosenAssignment.unassigned_at,
            vehicle: chosenAssignment.vehicles ? {
              plate: chosenAssignment.vehicles.plate,
              brand: chosenAssignment.vehicles.brand,
              model: chosenAssignment.vehicles.model,
              fleet_id: chosenAssignment.vehicles.fleet_id
            } : null
          } : null
        };
      });

      setDrivers(driversWithPlatforms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching drivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, [params?.cityId, params?.fleetId]);

  return {
    drivers,
    loading,
    error,
    refetch: fetchDrivers
  };
};