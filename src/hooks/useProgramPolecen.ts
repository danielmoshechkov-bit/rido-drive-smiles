import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Czy program poleceń jest włączony.
 *
 * Stan trzyma baza (`referral_settings.is_enabled`), a nie kod — żeby włączenie
 * programu było JEDNĄ zmianą w bazie, bez wdrożenia frontu. Ta sama flaga
 * rządzi wypłatami: `complete_referral_on_first_purchase` i
 * `credit_welcome_bonus` sprawdzają ją, zanim cokolwiek dopiszą do portfela.
 *
 * Domyślnie FAŁSZ — przy błędzie odczytu, braku sesji czy pustej tabeli
 * ustawień nie pokazujemy programu, którego może nie być. Pokazanie kodu
 * polecającego, który nic nie daje, jest gorsze niż jego brak.
 */
export function useProgramPolecen() {
  const { data, isLoading } = useQuery({
    queryKey: ['program-polecen'],
    // Stan zmienia się przez decyzję właściciela, nie w trakcie sesji.
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any).rpc('program_polecen_wlaczony');
      if (error) {
        console.warn('useProgramPolecen:', error.message);
        return false;
      }
      return data === true;
    },
  });

  return { wlaczony: data === true, gotowe: !isLoading };
}
