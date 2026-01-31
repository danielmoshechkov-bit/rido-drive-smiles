import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InventoryCategory {
  id: string;
  user_id?: string;
  entity_id?: string;
  name: string;
  parent_id?: string;
  created_at: string;
}

export function useInventoryCategories(entityId?: string) {
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    let query = supabase
      .from('inventory_categories')
      .select('*')
      .order('name');

    if (entityId) {
      query = query.eq('entity_id', entityId);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching categories:', error);
    } else {
      setCategories(data || []);
    }
    
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const createCategory = async (name: string): Promise<InventoryCategory | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Check if category already exists
    const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from('inventory_categories')
      .insert({
        name: name.trim(),
        user_id: user.id,
        entity_id: entityId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      toast.error('Błąd tworzenia kategorii');
      return null;
    }

    await fetchCategories();
    return data;
  };

  const deleteCategory = async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('inventory_categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting category:', error);
      toast.error('Błąd usuwania kategorii');
      return false;
    }

    await fetchCategories();
    return true;
  };

  return {
    categories,
    loading,
    fetchCategories,
    createCategory,
    deleteCategory,
  };
}
