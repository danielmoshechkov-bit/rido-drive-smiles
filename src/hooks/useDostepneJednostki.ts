import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dostepneJednostkiCechy, type Dostepne } from '@/lib/dostepneJednostki';

/**
 * Licznik JEDNEJ jednostki rozliczanej — wspólny dla całego interfejsu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO TO ISTNIEJE
 * ═══════════════════════════════════════════════════════════════════════════
 * Wymaganie produktowe: po zakupie stan pokazuje się NATYCHMIAST we wszystkich
 * licznikach, a po zużyciu jednostka schodzi NATYCHMIAST. Bez odświeżania,
 * bez wylogowania, bez różnic między jednym licznikiem a drugim.
 *
 * Dwa razy złamaliśmy to na tej samej rzeczy:
 *   • pasek i modal miały wspólną funkcję, ale OSOBNE pamięci podręczne —
 *     pokazywały 28 i 29 w tej samej chwili,
 *   • po powrocie z bramki nikt nie unieważniał licznika — kredyty pojawiały
 *     się dopiero po wylogowaniu.
 *
 * Dlatego licznik jest TU, a nie w komponentach: jeden klucz na jednostkę,
 * jedno miejsce do unieważnienia. Nowa jednostka rozliczana (minuty agenta,
 * pytania AI, cokolwiek) dostaje to zachowanie samym dopisaniem klucza cechy —
 * bez powtarzania logiki i bez ryzyka, że któryś licznik znów się rozjedzie.
 */

/** Klucz pamięci podręcznej dla danej cechy — jeden dla całej aplikacji. */
export const kluczJednostki = (cecha: string) => ['jednostki', cecha] as const;

export function useDostepneJednostki(cecha: string) {
  const { data, isLoading } = useQuery({
    queryKey: kluczJednostki(cecha),
    queryFn: async (): Promise<Dostepne> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      return dostepneJednostkiCechy(user.id, cecha);
    },
  });

  return { dostepne: data ?? 0, gotowe: !isLoading };
}

/**
 * Odświeżenie liczników po zakupie albo zużyciu.
 *
 * Bez argumentu odświeża WSZYSTKIE jednostki — tak wołamy po powrocie
 * z bramki płatności, bo nie wiadomo, czego dotyczył zakup, a odświeżenie
 * kilku liczb nic nie kosztuje.
 */
export function useOdswiezJednostki() {
  const qc = useQueryClient();
  return (cecha?: string) =>
    qc.invalidateQueries({ queryKey: cecha ? kluczJednostki(cecha) : ['jednostki'] });
}
