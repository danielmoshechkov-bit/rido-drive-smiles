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
  platform_ids?: Array<{
    platform: string;
    platform_id: string;
  }>;
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
          driver_platform_ids!inner(
            platform,
            platform_id
          )
        `)
        .eq('city_id', cityId)
        .order('first_name');

      if (error) throw error;
      
      const driversWithPlatforms = (data || []).map(driver => ({
        ...driver,
        platform_ids: driver.driver_platform_ids || []
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