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

      const { data: moze, error } = await (supabase as any)
        .rpc('moze_pracowac', { p_provider: sp.id, p_linia: 'agent' });
      // Błąd odczytu znaczy „nie wiem", a nie „ma dostęp". Przy pieniądzach
      // brak odpowiedzi zamykamy, nie otwieramy.
      if (error) return false;
      return moze === true;
    },
  });

  return { maPakiet: data === true, gotowe: !isLoading };
}
