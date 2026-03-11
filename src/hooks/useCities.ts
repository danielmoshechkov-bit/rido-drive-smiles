import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface City {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export const useCities = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCities = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cities')
        .select('*')
        .order('name');

      console.log('[useCities] Fetched cities:', data?.length, data?.map(c => c.name));
      if (error) {
        console.error('[useCities] Error:', error);
        throw error;
      }
      setCities(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching cities');
    } finally {
      setLoading(false);
    }
  };

  const addCity = async (name: string) => {
    try {
      const { data, error } = await supabase
        .from('cities')
        .insert([{ name }])
        .select()
        .single();

      if (error) throw error;
      setCities(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Error adding city');
    }
  };

  useEffect(() => {
    fetchCities();
    
    // Subscribe to realtime changes on cities table for automatic sync
    const channel = supabase
      .channel('cities-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cities' },
        () => {
          fetchCities(); // Refetch all cities on any change
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    cities,
    loading,
    error,
    addCity,
    refetch: fetchCities
  };
};