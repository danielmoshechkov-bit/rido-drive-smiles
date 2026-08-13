import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BillingInterval = 'month' | 'year' | 'one_time';
export type ProductLine = 'warsztat' | 'agent' | 'other';

export const PRODUCT_LINE_LABEL: Record<ProductLine, string> = {
  warsztat: 'Warsztat',
  agent: 'Agent AI',
  other: 'Inne',
};

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  subscriber_type: string;
  product_line: ProductLine;
  price_net: number | null;
  price_gross: number | null;
  /** Cena po zakończeniu promocji wprowadzającej; NULL = cennik się nie zmienia. */
  price_net_target: number | null;
  price_gross_target: number | null;
  vat_rate: number;
  currency: string;
  billing_interval: BillingInterval;
  trial_days: number;
  is_custom: boolean;
  is_active: boolean;
  sort_order: number;
  /** Cena STARTOWA u operatora. Pusta = plan wymaga synchronizacji. */
  stripe_price_id: string | null;
  /** Cena DOCELOWA — na nią przechodzi subskrypcja po wygaśnięciu gwarancji. */
  stripe_price_id_target: string | null;
  stripe_product_id: string | null;
}

export interface PlanFeatureRow {
  plan_id: string;
  feature_id: string;
  is_enabled: boolean;
  /** Limit twardy — po jego przekroczeniu funkcja przestaje działać. */
  limit_value: number | null;
  /** Próg miękki (fair use) — ostrzega, nie blokuje. */
  soft_limit_value: number | null;
}

/**
 * Plany i macierz plan × funkcja.
 *
 * Odczyt idzie przez edge, nie wprost z bazy — inaczej panel widziałby tylko
 * plany aktywne. Polityka `billing_plans_select_all` filtruje po `is_active`,
 * a administrator musi widzieć również wyłączone, bo dezaktywacja zastępuje tu
 * usuwanie i bez tego nie dałoby się planu przywrócić.
 */
export function useBillingPlans() {
  const queryClient = useQueryClient();

  const call = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('billing-admin-plans', {
      body: { action, ...payload },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const query = useQuery({
    queryKey: ['billing-plans'],
    queryFn: async () => {
      const data = await call('list');
      return {
        plans: (data?.plans ?? []) as BillingPlan[],
        matrix: (data?.matrix ?? []) as PlanFeatureRow[],
      };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['billing-plans'] });

  const create = useMutation({
    mutationFn: (input: Partial<BillingPlan>) => call('create', input as Record<string, unknown>),
    onSuccess: () => { invalidate(); toast.success('Plan dodany'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (input: Partial<BillingPlan> & { id: string }) =>
      call('update', input as Record<string, unknown>),
    onSuccess: (data) => {
      invalidate();
      // Zmiana ceny unieważnia zapisany identyfikator ceny u operatora —
      // administrator musi wiedzieć, że plan wymaga ponownej synchronizacji.
      if (data?.price_id_cleared) {
        toast.warning('Cena zmieniona — plan wymaga ponownej synchronizacji ze Stripe');
      } else {
        toast.success('Zapisano');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      call('set_active', { id, is_active }),
    onSuccess: (data, vars) => {
      invalidate();
      const subs = data?.active_subscriptions ?? 0;
      if (!vars.is_active && subs > 0) {
        toast.warning(`Plan wyłączony — ma ${subs} aktywnych subskrypcji`);
      } else {
        toast.success(vars.is_active ? 'Plan włączony' : 'Plan wyłączony');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setFeatures = useMutation({
    mutationFn: ({ plan_id, features }: {
      plan_id: string;
      features: Array<{
        feature_id: string;
        is_enabled: boolean;
        limit_value: number | null;
        soft_limit_value: number | null;
      }>;
    }) => call('set_features', { plan_id, features }),
    onSuccess: (data) => {
      invalidate();
      toast.success(`Zapisano ${data?.saved ?? 0} funkcji w planie`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Synchronizacja cennika z operatorem — tworzy w Stripe produkt i DWIE ceny
   * na plan (startową i docelową). Bez ceny docelowej wygaśnięcie gwarancji
   * po 12 miesiącach oznaczałoby zakładanie cen ręcznie dla każdego klienta.
   */
  const syncStripe = useMutation({
    mutationFn: async (planCode?: string) => {
      const { data, error } = await supabase.functions.invoke('billing-stripe-sync', {
        body: planCode ? { plan_code: planCode } : {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error === 'GATEWAY_NOT_CONFIGURED'
        ? 'Brak konfiguracji Stripe — uzupełnij sekret STRIPE_SECRET_KEY'
        : data.error);
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      const bledy = (data?.wynik ?? []).filter((w: { blad?: string }) => w.blad);
      if (bledy.length) {
        toast.warning(`Zsynchronizowano ${data?.zsynchronizowano ?? 0}, ${bledy.length} z błędem`);
      } else {
        toast.success(`Zsynchronizowano ${data?.zsynchronizowano ?? 0} planów (${data?.tryb})`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * TYMCZASOWE — przycisk „Testuj zakup" w panelu admina.
   *
   * Otwiera sesję Checkout dla wybranego planu, żeby potwierdzić, że kwota
   * dochodzi do operatora poprawnie (brutto, nie netto), zanim na /cennik
   * pojawią się właściwe przyciski. Do usunięcia razem z podpięciem zakupu
   * po stronie klienta.
   */
  const testCheckout = useMutation({
    mutationFn: async (planCode: string) => {
      const { data, error } = await supabase.functions.invoke('billing-checkout', {
        body: { plan_code: planCode },
      });
      if (error) throw error;
      if (data?.error) {
        const opis: Record<string, string> = {
          GATEWAY_NOT_CONFIGURED: 'Brak sekretu STRIPE_SECRET_KEY',
          PLAN_NOT_SYNCED: 'Plan wymaga synchronizacji ze Stripe',
          NO_PROVIDER: 'To konto nie ma warsztatu — checkout ustala podmiot z service_providers',
          ALREADY_SUBSCRIBED: 'Ten warsztat ma już subskrypcję w tej linii produktowej',
        };
        throw new Error(opis[data.code as string] ?? data.error);
      }
      if (!data?.url) throw new Error('Operator nie zwrócił adresu płatności');
      return data.url as string;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    plans: query.data?.plans ?? [],
    matrix: query.data?.matrix ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    create,
    update,
    setActive,
    setFeatures,
    syncStripe,
    testCheckout,
    refetch: query.refetch,
  };
}
