import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ProviderCategory {
  id: string;
  name: string;
  sort_order: number;
  photo_url: string | null;
}

/**
 * Własne kategorie usługodawcy (Warsztat, Myjnia, Detailing…). Usługi wiążą się
 * z kategorią po nazwie — `provider_services.category`.
 */
export function useProviderCategories(providerId: string | null) {
  const qc = useQueryClient();
  const key = ['provider-service-categories', providerId];

  const query = useQuery<ProviderCategory[]>({
    queryKey: key,
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('provider_service_categories')
        .select('id, name, sort_order, photo_url')
        .eq('provider_id', providerId!)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as ProviderCategory[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['provider-offer', providerId] });
  };

  const add = useMutation({
    mutationFn: async (name: string) => {
      const clean = name.trim();
      if (!clean) throw new Error('Podaj nazwę kategorii');
      const { error } = await (supabase as any)
        .from('provider_service_categories')
        .insert({ provider_id: providerId, name: clean, sort_order: (query.data?.length ?? 0) });
      if (error) throw error;
      return clean;
    },
    onSuccess: (name) => { invalidate(); toast.success(`Dodano kategorię „${name}"`); },
    onError: (e: any) => toast.error(e.message.includes('duplicate') ? 'Taka kategoria już jest' : e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, oldName, name }: { id: string; oldName: string; name: string }) => {
      const clean = name.trim();
      if (!clean) throw new Error('Podaj nazwę kategorii');
      const { error } = await (supabase as any)
        .from('provider_service_categories')
        .update({ name: clean, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      // Usługi trzymają nazwę kategorii — przepisujemy je razem z kategorią.
      await (supabase as any).from('provider_services')
        .update({ category: clean }).eq('provider_id', providerId).eq('category', oldName);
    },
    onSuccess: () => { invalidate(); toast.success('Zmieniono nazwę kategorii'); },
    onError: (e: any) => toast.error(e.message),
  });

  const setPhoto = useMutation({
    mutationFn: async ({ id, photo_url }: { id: string; photo_url: string | null }) => {
      const { error } = await (supabase as any)
        .from('provider_service_categories')
        .update({ photo_url, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { count } = await (supabase as any)
        .from('provider_services')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId).eq('category', name);
      if (count) throw new Error(`W tej kategorii są usługi (${count}) — najpierw je przenieś lub usuń`);
      const { error } = await (supabase as any).from('provider_service_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Kategoria usunięta'); },
    onError: (e: any) => toast.error(e.message),
  });

  return { categories: query.data ?? [], isLoading: query.isLoading, add, rename, remove, setPhoto };
}
