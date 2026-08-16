import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Szczegóły subskrypcji do ekranu „Twój plan" (4.8).
 *
 * Cenę bierzemy z `price_snapshot`, NIE z bieżącego cennika. To ta sama zasada,
 * co przy sporze o fakturę: klient płaci tyle, ile było w chwili zakupu, a nie
 * tyle, ile dziś stoi w `billing_plans`. Pokazanie mu aktualnej ceny planu
 * byłoby wprowadzaniem w błąd — zwłaszcza że ceny startowe są niższe od
 * docelowych i właśnie to jest dla niego wartością.
 */
export interface SzczegolySubskrypcji {
  nazwaPlanu: string | null;
  kodPlanu: string | null;
  status: string | null;
  /** Cena netto zamrożona przy zakupie; null, gdy snapshot pusty. */
  cenaNetto: number | null;
  odnowienie: string | null;
  gwarancjaCenyDo: string | null;
  /** Czy jest czym zarządzać w portalu operatora. */
  maPlatnosci: boolean;
}

export function useSubscriptionDetails(providerId: string | null | undefined) {
  return useQuery({
    queryKey: ['subscription-details', providerId],
    enabled: !!providerId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SzczegolySubskrypcji | null> => {
      const { data, error } = await supabase
        .from('billing_subscriptions' as any)
        .select(
          'status, current_period_end, price_snapshot, price_guarantee_until, provider, provider_subscription_id, plan:billing_plans(name, code, price_net)',
        )
        .eq('subscriber_type', 'service_provider')
        .eq('subscriber_id', providerId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      const w = (Array.isArray(data) ? data[0] : null) as any;
      if (!w) return null;

      const snapshot = (w.price_snapshot ?? {}) as Record<string, unknown>;
      const zeSnapshotu = Number(snapshot.price_net ?? snapshot.cena_netto ?? NaN);

      return {
        nazwaPlanu: w.plan?.name ?? null,
        kodPlanu: w.plan?.code ?? null,
        status: w.status ?? null,
        // Dopiero gdy snapshot nic nie mówi, sięgamy po cenę planu — i tylko
        // dlatego, że pusty ekran jest gorszy niż przybliżenie.
        cenaNetto: Number.isFinite(zeSnapshotu)
          ? zeSnapshotu
          : w.plan?.price_net != null
            ? Number(w.plan.price_net)
            : null,
        odnowienie: w.current_period_end ?? null,
        gwarancjaCenyDo: w.price_guarantee_until ?? null,
        maPlatnosci: w.provider === 'stripe' && !!w.provider_subscription_id,
      };
    },
  });
}
