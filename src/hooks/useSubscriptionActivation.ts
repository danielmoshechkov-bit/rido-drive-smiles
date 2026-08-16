import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Oczekiwanie na subskrypcję po powrocie z płatności.
 *
 * Webhook operatora bywa wolniejszy niż przekierowanie: klient wraca do panelu,
 * zanim `checkout.session.completed` dojedzie. Bez odpytywania widziałby brak
 * dostępu mimo opłaconej faktury — i zapłaciłby drugi raz.
 *
 * Odpytujemy co 2 s przez 30 s. Po tym czasie nie mówimy „nie udało się", bo
 * pieniądze najpewniej są; mówimy, że potwierdzenie się opóźnia. Różnica jest
 * istotna: pierwsza wersja komunikatu prowokuje drugą płatność.
 */
const INTERWAL_MS = 2000;
const LIMIT_MS = 30000;

type Stan = 'idle' | 'czekam' | 'aktywna' | 'opoznienie';

export function useSubscriptionActivation(providerId: string | null | undefined) {
  const [stan, setStan] = useState<Stan>('idle');
  const queryClient = useQueryClient();

  // Powrót z portalu operatora (4.8) — inna sytuacja niż powrót z płatności.
  // Klient mógł tam zmienić kartę, anulować albo nic nie zrobić, więc nie ma
  // na co czekać w pętli; wystarczy odświeżyć stan. Odświeżamy DWA razy, bo
  // anulowanie widać u nas dopiero po webhooku `customer.subscription.updated`,
  // a ten potrafi przyjść sekundę po przekierowaniu.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('platnosc') !== 'portal') return;

    const czysty = new URL(window.location.href);
    czysty.searchParams.delete('platnosc');
    window.history.replaceState({}, '', czysty.toString());

    const odswiez = () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-details'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-access'] });
    };

    odswiez();
    const t = setTimeout(odswiez, 4000);
    return () => clearTimeout(t);
  }, [queryClient]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('platnosc') !== 'ok') return;
    if (!providerId) return;

    let anulowane = false;
    let start = Date.now();
    setStan('czekam');

    // Parametry znikają z adresu od razu — odświeżenie strony po udanej
    // płatności nie ma powodu uruchamiać odpytywania od nowa.
    const czysty = new URL(window.location.href);
    czysty.searchParams.delete('platnosc');
    czysty.searchParams.delete('session_id');
    window.history.replaceState({}, '', czysty.toString());

    const sprawdz = async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('billing_subscriptions' as any)
        .select('id, status')
        .eq('subscriber_type', 'service_provider')
        .eq('subscriber_id', providerId)
        .in('status', ['trialing', 'active'])
        .limit(1);
      if (error) return false;
      return Array.isArray(data) && data.length > 0;
    };

    const petla = async () => {
      while (!anulowane) {
        if (await sprawdz()) {
          if (anulowane) return;
          setStan('aktywna');
          toast.success('Płatność potwierdzona — subskrypcja aktywna.');
          return;
        }
        if (Date.now() - start > LIMIT_MS) {
          if (anulowane) return;
          setStan('opoznienie');
          toast.info(
            'Płatność przyjęta. Potwierdzenie od operatora się opóźnia — dostęp pojawi się w ciągu kilku minut. Nie płać ponownie.',
            { duration: 12000 },
          );
          return;
        }
        await new Promise((r) => setTimeout(r, INTERWAL_MS));
      }
    };

    void petla();
    return () => { anulowane = true; };
  }, [providerId]);

  return stan;
}
