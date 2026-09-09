import { useQuery } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDostepneJednostki } from '@/hooks/useDostepneJednostki';

/**
 * Czwarty licznik w nagłówku: minuty rozmów agenta głosowego.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO OSOBNY KOMPONENT, A NIE DOPISEK W `TopBarCredits`
 * ═══════════════════════════════════════════════════════════════════════════
 * Trzy liczniki w nagłówku (pojazdy, SMS, Rido AI) działają i mają za sobą
 * historię napraw — między innymi błąd, który wywalał cały widok. Minuty
 * dokładamy OBOK, bez dotykania tamtego pliku: nowa rzecz nie ma jak zepsuć
 * starej, a wycofanie jej to usunięcie jednego znacznika.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO NIE POKAZUJEMY GO WSZYSTKIM
 * ═══════════════════════════════════════════════════════════════════════════
 * Agenta głosowego ma dziś garstka warsztatów. Pozostałym „0 minut" niczego
 * nie mówi — to licznik produktu, którego nie mają, a nagłówek ma dziś cztery
 * inne rzeczy po prawej stronie i na wąskim ekranie zaczyna się robić ciasno.
 * Kafelek pojawia się więc dopiero wtedy, gdy warsztat ma przydzielony numer.
 *
 * Liczba pochodzi z tego samego źródła co pozostałe liczniki
 * (`useDostepneJednostki` → `check_usage`) — sprawdzone na produkcji, że dla
 * warsztatu z numerem daje dokładnie to samo, co `voice_saldo_minut`, z której
 * korzysta bramka odbierania połączeń. Jeden licznik, jedna liczba.
 *
 * Kafelek NIE JEST klikalny. Doładowanie minut istnieje w cenniku
 * (`billing_addon_products.voice_minutes`), ale ma `is_active = false` —
 * kliknięcie prowadziłoby donikąd. Gdy sprzedaż ruszy, dokładamy tu okno
 * zakupu, tak jak przy trzech pozostałych licznikach.
 */
export function LicznikMinutAgenta() {
  // Czy ten warsztat w ogóle ma agenta. Polityka RLS na `voice_numbers`
  // przepuszcza wyłącznie numery własnych warsztatów, więc zapytanie nie
  // wymaga przekazywania identyfikatora ani sprawdzania uprawnień tutaj.
  const { data: maAgenta } = useQuery({
    queryKey: ['voice-numbers', 'czy-ma-agenta'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('voice_numbers')
        .select('id')
        .eq('status', 'aktywny')
        .limit(1);
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },
  });

  const { dostepne: minuty } = useDostepneJednostki('voice_minutes');

  if (!maAgenta) return null;

  return (
    <div
      // `hidden sm:flex` — na telefonie nagłówek ma już komplet ikon i czwarta
      // by go rozepchnęła. Saldo minut jest wtedy w zakładce „Asystent głosowy".
      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border"
      title="Minuty rozmów agenta głosowego"
    >
      <Phone className="h-4 w-4 text-foreground" />
      <span className="text-sm font-semibold text-foreground">
        {minuty === null ? '∞' : (minuty ?? 0)}
      </span>
    </div>
  );
}
