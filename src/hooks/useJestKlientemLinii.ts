import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LiniaProduktowa } from '@/hooks/useSubscriptionAccess';

/**
 * Czy zalogowany klient jest JUŻ klientem danej linii produktowej.
 *
 * Powstało dla napisu na przyciskach cennika: „Wypróbuj 30 dni" pokazywało się
 * komuś, kto od dawna jest w okresie próbnym. Przycisk działał poprawnie —
 * `usePlanAction` prowadził do płatności — ale napis obiecywał co innego, niż
 * robił. Klient w trialu mógł uznać, że przedłuża darmowy okres, i nie kliknąć.
 *
 * Rozstrzyga `jest_klientem_linii`, nie `moze_pracowac`: komuś, komu okres
 * próbny WYGASŁ, też nie należy proponować kolejnego triala, choć pracować
 * już nie może. Pytanie brzmi „czy trial mu się należy", a nie „czy ma dostęp".
 *
 * ⚠️ Zapytanie leci WYŁĄCZNIE przy istniejącej sesji. `/cennik` jest stroną
 * publiczną i celem kampanii — większość wejść to niezalogowani i nie wolno
 * płacić za nich zapytaniem do bazy.
 */
export function useJestKlientemLinii(linia: LiniaProduktowa = 'warsztat') {
  const query = useQuery({
    queryKey: ['jest-klientem-linii', linia],
    // Stan zmienia się rzadko (rejestracja, zakup), a napis na przycisku nie
    // musi być świeższy niż sesja.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data: sesja } = await supabase.auth.getSession();
      if (!sesja.session) return false;

      const { data: warsztat } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', sesja.session.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Zalogowany BEZ warsztatu nadal ma prawo do okresu próbnego — to on
      // jest adresatem napisu „Wypróbuj 30 dni".
      if (!warsztat?.id) return false;

      const { data, error } = await (supabase as any).rpc('jest_klientem_linii', {
        p_provider: warsztat.id,
        p_linia: linia,
      });
      if (error) {
        // Nie wiemy — pokazujemy napis domyślny. Zły napis jest przykry,
        // pusty przycisk gorszy.
        console.warn('useJestKlientemLinii:', error.message);
        return false;
      }
      return data === true;
    },
  });

  return { jestKlientem: query.data === true, gotowe: !query.isLoading };
}
