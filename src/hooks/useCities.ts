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

      if (error) throw error;
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
  }, []);

  return {
    cities,
    loading,
    error,
    addCity,
    refetch: fetchCities
  };
};