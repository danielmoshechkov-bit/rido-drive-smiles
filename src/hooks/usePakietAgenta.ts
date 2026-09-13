import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Czy warsztat ma OPŁACONY pakiet Agenta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZASADA, KTÓRĄ TO EGZEKWUJE: NIE MA PAKIETU = NIE MA AGENTA
 * ═══════════════════════════════════════════════════════════════════════════
 * Sekwencja jest jedna: pakiet → aktywacja numeru → ustawienia → licznik →
 * przekierowanie → odbieranie. Bez pierwszego kroku nie dzieje się nic
 * z pozostałych.
 *
 * Do 13.09.2026 zasada istniała wyłącznie w głowie: zakładkę „Asystent głosowy"
 * widział każdy z trzydziestu warsztatów, ustawienia były otwarte, a aktywacja
 * numeru nie pytała o nic. Dwa warsztaty testowe odbierały telefony i zużywały
 * nasze minuty u ElevenLabs, nie mając żadnego pakietu.
 *
 * Pytamy tą samą funkcją, której używa bramka w funkcjach brzegowych
 * (`moze_pracowac`) — żeby panel i serwer nie mogły odpowiedzieć inaczej.
 * `linia = 'agent'`, bo pakiet warsztatu do agenta nie uprawnia.
 */
export function usePakietAgenta() {
  const { data, isLoading } = useQuery({
    queryKey: ['pakiet-agenta'],
    // Odpowiedź zmienia się po zakupie — krótko, żeby przełączenie widoku
    // po powrocie z płatności nie kazało odświeżać strony.
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return false;

      // Warsztat ustalamy tak samo jak wszędzie indziej: najstarszy konta.
      const { data: sp } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', u.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!sp?.id) return false;

      /**
       * 🔴 OSADZENIE MUSI WSKAZAĆ KLUCZ OBCY Z NAZWY.
       *
       * `billing_subscriptions` ma DWA klucze obce do `billing_plans`:
       * `plan_id` i `plan_od_nastepnego_okresu`. Przy zapisie
       * `plan:billing_plans(...)` PostgREST nie wie, o który chodzi, i odsyła
       * **HTTP 300 / PGRST201** — czyli `error`, czyli `return false` niżej,
       * czyli OFERTA MIMO OPŁACONEGO PAKIETU. Bez żadnego objawu w bazie:
       * subskrypcja jest, minuty są, panel pokazuje cennik.
       *
       * Tak było 13.09.2026 przy pierwszym prawdziwym zakupie Agenta kartą.
       * Sprawdzone zachowaniem, nie odczytem: to samo zapytanie z jawnym
       * kluczem zwraca 200, bez klucza 300.
       *
       * Pytamy o linię produktową PLANU, nie o kolumnę `product_line` na
       * subskrypcji, choć wyzwalacz `trg_billing_subscriptions_product_line`
       * ją wypełnia. Powód jest jeden: linia jest własnością planu i tam jest
       * prawdziwa zawsze, także dla wierszy starszych od wyzwalacza.
       */
      const { data: subskrypcje, error } = await (supabase as any)
        .from('billing_subscriptions')
        .select('id, status, current_period_end, plan:billing_plans!billing_subscriptions_plan_id_fkey!inner(product_line)')
        .eq('subscriber_type', 'service_provider')
        .eq('subscriber_id', sp.id)
        .in('status', ['active', 'trialing'])
        .eq('plan.product_line', 'agent');

      // Błąd odczytu znaczy „nie wiem", a nie „ma dostęp". Przy pieniądzach
      // brak odpowiedzi zamykamy, nie otwieramy.
      if (error) return false;

      const teraz = Date.now();
      return (subskrypcje ?? []).some((s: { current_period_end: string | null }) =>
        !s.current_period_end || new Date(s.current_period_end).getTime() > teraz);
    },
  });

  return { maPakiet: data === true, gotowe: !isLoading };
}
