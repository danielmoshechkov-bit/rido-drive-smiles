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
       * 🔴 PYTAMY O PLAN, NIE O KOLUMNĘ `product_line`.
       *
       * Naturalne byłoby zawołać `moze_pracowac(warsztat, 'agent')` — tej samej
       * funkcji używa bramka na serwerze. Nie robimy tego, bo ona czyta
       * `billing_subscriptions.product_line`, a webhook Stripe TEJ KOLUMNY NIE
       * USTAWIA przy pierwszym zakupie: buduje wiersz bez niej, a kolumna ma
       * wartość domyślną `'other'`. Pierwszy w historii zakup pakietu Agent
       * poszedłby właśnie tą ścieżką i panel po opłaceniu dalej pokazywałby
       * ofertę.
       *
       * Linia produktowa jest własnością PLANU i tam jest zawsze prawdziwa.
       * Pytamy więc przez złączenie z `billing_plans` — to działa niezależnie
       * od tego, czy ktoś kiedyś wypełni tę kolumnę.
       *
       * Sama kolumna nadal wymaga naprawy w webhooku: bez niej nie zadziała
       * bramka odmowy po wyczerpaniu minut (`voice_odmowic_brak_minut` filtruje
       * po `product_line`). Opisane w docs/BACKLOG.md.
       */
      const { data: subskrypcje, error } = await (supabase as any)
        .from('billing_subscriptions')
        .select('id, status, current_period_end, plan:billing_plans!inner(product_line)')
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
