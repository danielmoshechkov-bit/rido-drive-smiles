import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BillingFeature {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: 'boolean' | 'metered';
  unit: string | null;
  is_active: boolean;
  sort_order: number;
}

/**
 * Katalog funkcji billingowych.
 *
 * Odczyt idzie wprost z bazy — polityka RLS przepuszcza `platform_admin`,
 * a katalog aktywnych funkcji widzi każdy zalogowany (front pokazuje ofertę).
 * Zapis WYŁĄCZNIE przez edge `billing-admin-features`: tabele billing_* mają
 * odebrane granty INSERT/UPDATE/DELETE dla roli `authenticated`, więc próba
 * zapisu z przeglądarki i tak odbiłaby się od bazy.
 */
export function useBillingFeatures() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['billing-features'],
    queryFn: async (): Promise<BillingFeature[]> => {
      const { data, error } = await supabase
        .from('billing_features' as any)
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as unknown as BillingFeature[];
    },
  });

  const call = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('billing-admin-features', {
      body: { action, ...payload },
    });
    if (error) throw error;
    // Edge zwraca błędy walidacji w ciele odpowiedzi, nie tylko statusem —
    // bez tego użytkownik zobaczyłby „sukces" przy odrzuconym zapisie.
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['billing-features'] });

  const create = useMutation({
    mutationFn: (input: Partial<BillingFeature>) => call('create', input as Record<string, unknown>),
    onSuccess: () => { invalidate(); toast.success('Funkcja dodana'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (input: Partial<BillingFeature> & { id: string }) =>
      call('update', input as Record<string, unknown>),
    onSuccess: () => { invalidate(); toast.success('Zapisano'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      call('set_active', { id, is_active }),
    onSuccess: (data, vars) => {
      invalidate();
      const affected = data?.affected_plans ?? 0;
      if (!vars.is_active && affected > 0) {
        toast.warning(`Funkcja wyłączona — dotyczy ${affected} ${affected === 1 ? 'planu' : 'planów'}`);
      } else {
        toast.success(vars.is_active ? 'Funkcja włączona' : 'Funkcja wyłączona');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Lista planów zawierających funkcję — do okna potwierdzenia przed wyłączeniem. */
  const usageInfo = (id: string) => call('usage_info', { id });

  return {
    features: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    create,
    update,
    setActive,
    usageInfo,
    refetch: query.refetch,
  };
}
