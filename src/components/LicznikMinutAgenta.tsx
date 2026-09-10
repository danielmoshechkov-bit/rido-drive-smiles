import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDostepneJednostki } from '@/hooks/useDostepneJednostki';
import { DoladowanieModal } from '@/components/billing/DoladowanieModal';

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
 *
 * Warunkiem jest WŁĄCZONY AGENT (`voice_agent_configs.is_active`), a nie sam
 * przydzielony numer. Numer dostaje się przy zakładaniu, zanim ktokolwiek
 * włączy wyłącznik — a licznik minut przy wyłączonym agencie pokazywałby stan
 * czegoś, co nie działa. To ten sam warunek, który przełącza wyłącznik
 * w zakładce „Asystent głosowy" i który pokazuje kafelek na Pulpicie: jedno
 * pytanie, jedna odpowiedź w trzech miejscach.
 *
 * Liczba pochodzi z tego samego źródła co pozostałe liczniki
 * (`useDostepneJednostki` → `check_usage`) — sprawdzone na produkcji, że dla
 * warsztatu z numerem daje dokładnie to samo, co `voice_saldo_minut`, z której
 * korzysta bramka odbierania połączeń. Jeden licznik, jedna liczba.
 *
 * Kliknięcie otwiera doładowanie — ten sam suwak i ta sama droga przez PayU,
 * co przy SMS-ach, sprawdzeniach VIN i Rido AI (`DoladowanieModal` czyta
 * warunki sprzedaży z `billing_addon_products`, a cenę rozstrzyga serwer).
 *
 * ⚠️ WYMAGA WŁĄCZENIA PRODUKTU W BAZIE: `billing_addon_products.voice_minutes`
 * ma dziś `is_active = false`, więc do czasu jej włączenia okno powie, że
 * doładowanie jest niedostępne. Bez tego warsztat, któremu skończą się minuty,
 * nie ma jak ich kupić — agent przestaje odbierać i nic z tym nie zrobi.
 */
export function LicznikMinutAgenta() {
  const [doladowanie, setDoladowanie] = useState(false);

  // Czy warsztat WŁĄCZYŁ agenta. Polityka RLS na `voice_agent_configs`
  // przepuszcza wyłącznie konfiguracje własnych warsztatów, więc zapytanie nie
  // wymaga przekazywania identyfikatora ani sprawdzania uprawnień tutaj.
  const { data: agentWlaczony } = useQuery({
    queryKey: ['voice-agent-configs', 'czy-wlaczony'],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('voice_agent_configs')
        .select('is_active')
        .eq('is_active', true)
        .limit(1);
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },
  });

  const { dostepne: minuty } = useDostepneJednostki('voice_minutes');

  if (!agentWlaczony) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDoladowanie(true)}
        // Ta sama konwencja co trzy pozostałe liczniki: widoczny zawsze,
        // klikalny, otwiera doładowanie. Bez chowania na wąskim ekranie —
        // odkrywalność paska rozstrzygamy osobno, nie chowaniem po cichu.
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer border border-border"
        title="Minuty rozmów agenta — kliknij, żeby doładować"
      >
        <Phone className="h-4 w-4 text-foreground" />
        <span className="text-sm font-semibold text-foreground">
          {minuty === null ? '∞' : (minuty ?? 0)}
        </span>
      </button>

      <DoladowanieModal
        open={doladowanie}
        onOpenChange={setDoladowanie}
        productCode="voice_minutes"
        tytul="Dokup minuty rozmów"
        jednostka="minut rozmów"
      />
    </>
  );
}
