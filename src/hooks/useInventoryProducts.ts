import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InventoryProduct {
  id: string;
  entity_id?: string;
  user_id?: string;
  name_sales: string;
  sku?: string;
  vat_rate: string;
  unit: string;
  default_sale_price_net?: number;
  default_sale_price_gross?: number;
  default_purchase_price_net?: number;
  default_purchase_price_gross?: number;
  currency: string;
  barcode?: string;
  category?: string;
  notes?: string;
  attributes?: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed fields
  stock_qty?: number;
  avg_cost?: number;
}

export function useInventoryProducts(entityId?: string) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    let query = (supabase as any)
      .from('inventory_products')
      .select('*')
      .eq('is_active', true)
      .order('name_sales');

    if (entityId) {
      query = query.eq('entity_id', entityId);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      toast.error('Błąd ładowania produktów');
    } else {
      setProducts(data || []);
    }
    
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const createProduct = async (product: Partial<InventoryProduct>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await (supabase as any)
      .from('inventory_products')
      .insert({
        ...product,
        user_id: user.id,
        entity_id: entityId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      toast.error('Błąd tworzenia produktu');
      return null;
    }

    toast.success('Produkt został dodany');
    await fetchProducts();
    return data;
  };

  const updateProduct = async (id: string, updates: Partial<InventoryProduct>) => {
    const { error } = await (supabase as any)
      .from('inventory_products')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating product:', error);
      toast.error('Błąd aktualizacji produktu');
      return false;
    }

    toast.success('Produkt został zaktualizowany');
    await fetchProducts();
    return true;
  };

  const deleteProduct = async (id: string) => {
    // Soft delete - just mark as inactive
    const { error } = await (supabase as any)
      .from('inventory_products')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting product:', error);
      toast.error('Błąd usuwania produktu');
      return false;
    }

    toast.success('Produkt został usunięty');
    await fetchProducts();
    return true;
  };

  const searchProducts = async (query: string): Promise<InventoryProduct[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await (supabase as any)
      .from('inventory_products')
      .select('*')
      .eq('is_active', true)
      .or(`name_sales.ilike.%${query}%,barcode.ilike.%${query}%,sku.ilike.%${query}%`)
      .limit(20);

    if (error) {
      console.error('Error searching products:', error);
      return [];
    }

    return data || [];
  };

  return {
    products,
    loading,
    fetchProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    searchProducts,
  };
}
