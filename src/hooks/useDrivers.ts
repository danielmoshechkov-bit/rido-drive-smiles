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
  } | null;
}

export const useDrivers = (cityId?: string) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrivers = async () => {
    if (!cityId) {
      setDrivers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
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
            fleets(
              name
            )
          )
        `)
        .eq('city_id', cityId)
        .order('first_name');

      if (error) throw error;
      
      const driversWithPlatforms = (data || []).map(driver => ({
        ...driver,
        platform_ids: driver.driver_platform_ids || [],
        document_statuses: driver.driver_document_statuses || [],
        vehicle_assignment: driver.driver_vehicle_assignments?.[0] ? {
          vehicle_id: driver.driver_vehicle_assignments[0].vehicle_id,
          fleet_id: driver.driver_vehicle_assignments[0].fleet_id,
          fleet_name: driver.driver_vehicle_assignments[0].fleets?.name || null,
          status: driver.driver_vehicle_assignments[0].status
        } : null
      }));

      setDrivers(driversWithPlatforms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching drivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, [cityId]);

  return {
    drivers,
    loading,
    error,
    refetch: fetchDrivers
  };
};