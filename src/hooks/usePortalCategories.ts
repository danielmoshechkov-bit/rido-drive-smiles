import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PortalCategory {
  id: string;
  portal_context: string;
  name: string;
  slug: string;
  image_url: string | null;
  link_url: string;
  sort_order: number;
  is_visible: boolean;
  service_category_id: string | null;
}

export function usePortalCategories(context: 'motoryzacja' | 'nieruchomosci' | 'uslugi') {
  const [categories, setCategories] = useState<PortalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { data, error: fetchError } = await supabase
          .from('portal_categories')
          .select('*')
          .eq('portal_context', context)
          .eq('is_visible', true)
          .order('sort_order', { ascending: true });

        if (fetchError) {
          console.error('Error fetching portal categories:', fetchError);
          setError(fetchError.message);
          return;
        }

        setCategories(data || []);
      } catch (err) {
        console.error('Exception fetching portal categories:', err);
        setError('Failed to load categories');
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [context]);

  return { categories, loading, error };
}
