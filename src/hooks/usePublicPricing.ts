import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { featureLabel } from '@/lib/billingUnits';

export type ProductLine = 'warsztat' | 'agent' | 'other';

export interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  product_line: ProductLine;
  price_net: number | null;
  price_gross: number | null;
  price_net_target: number | null;
  price_gross_target: number | null;
  is_custom: boolean;
  trial_days: number;
  sort_order: number;
  /** Gotowe etykiety funkcji, w kolejności z katalogu funkcji. */
  features: string[];
}

interface RawFeature {
  id: string;
  name: string;
  kind: 'boolean' | 'metered';
  unit: string | null;
  sort_order: number;
}

interface RawMatrixRow {
  plan_id: string;
  feature_id: string;
  is_enabled: boolean;
  limit_value: number | null;
  soft_limit_value: number | null;
}

/**
 * Cennik czytany z bazy — źródło dla strony /cennik.
 *
 * Odczyt wprost z tabel, bez edge: `billing_plans`, `billing_features`
 * i `billing_plan_features` mają polityki SELECT dla `anon` (migracja
 * 20260812090000). Plany nieaktywne odfiltrowuje RLS, nie ten kod — dzięki temu
 * wyłączenie planu w panelu zdejmuje go ze strony natychmiast i bez deployu.
 *
 * `as any` przy nazwach tabel: typy Supabase generuje Lovable i nie znają
 * jeszcze tabel billingowych. Kształt pilnujemy interfejsami wyżej.
 */
export function usePublicPricing() {
  const query = useQuery({
    queryKey: ['public-pricing'],
    // Cennik zmienia się rzadko, a strona jest publiczna i indeksowana —
    // nie ma po co odpytywać bazy przy każdym wejściu w zakładkę.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PublicPlan[]> => {
      const [plansRes, featuresRes, matrixRes] = await Promise.all([
        supabase
          .from('billing_plans' as any)
          .select(
            'id, code, name, description, product_line, price_net, price_gross, ' +
              'price_net_target, price_gross_target, is_custom, trial_days, sort_order',
          )
          .order('sort_order'),
        supabase
          .from('billing_features' as any)
          .select('id, name, kind, unit, sort_order')
          .order('sort_order'),
        supabase
          .from('billing_plan_features' as any)
          .select('plan_id, feature_id, is_enabled, limit_value, soft_limit_value'),
      ]);

      if (plansRes.error) throw plansRes.error;
      if (featuresRes.error) throw featuresRes.error;
      if (matrixRes.error) throw matrixRes.error;

      const features = (featuresRes.data ?? []) as unknown as RawFeature[];
      const matrix = (matrixRes.data ?? []) as unknown as RawMatrixRow[];
      const byFeatureId = new Map(features.map((f) => [f.id, f]));

      // Funkcje w kolejności katalogu, nie w kolejności wierszy macierzy —
      // inaczej karty tego samego produktu miałyby różny porządek punktów.
      const labelsByPlan = new Map<string, Array<{ order: number; label: string }>>();
      for (const row of matrix) {
        if (!row.is_enabled) continue;
        const feature = byFeatureId.get(row.feature_id);
        if (!feature) continue; // funkcja wyłączona — RLS jej nie zwrócił
        const list = labelsByPlan.get(row.plan_id) ?? [];
        list.push({ order: feature.sort_order, label: featureLabel(feature, row) });
        labelsByPlan.set(row.plan_id, list);
      }

      return ((plansRes.data ?? []) as unknown as PublicPlan[]).map((p) => ({
        ...p,
        features: (labelsByPlan.get(p.id) ?? [])
          .sort((a, b) => a.order - b.order)
          .map((x) => x.label),
      }));
    },
  });

  return {
    plans: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
  };
}
