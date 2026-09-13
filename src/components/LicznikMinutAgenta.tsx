import { useState } from 'react';
import { Phone } from 'lucide-react';
import { useDostepneJednostki } from '@/hooks/useDostepneJednostki';
import { usePakietAgenta } from '@/hooks/usePakietAgenta';
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
 * Warunkiem jest OPŁACONY PAKIET. Wcześniej stał tu włączony przełącznik
 * agenta, a jeszcze wcześniej sam przydzielony numer — obie te rzeczy dawały
 * się mieć bez pakietu, więc licznik pokazywał saldo produktu, którego nikt
 * nie kupił. Pytamy tym samym `moze_pracowac('agent')`, co zakładka i bramka
 * na serwerze: jedno pytanie, jedna odpowiedź w trzech miejscach.
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
 * Produkt doładowania jest włączony od 10.09.2026 (paczki 30/60/90 minut po
 * 1,15 zł netto za minutę). Bez niego warsztat, któremu skończą się minuty,
 * nie miałby jak ich kupić — agent przestaje odbierać i nic z tym nie zrobi.
 */
export function LicznikMinutAgenta() {
  const [doladowanie, setDoladowanie] = useState(false);

  /**
   * Licznik widzi WYŁĄCZNIE warsztat z opłaconym pakietem.
   *
   * Wcześniej warunkiem był włączony przełącznik agenta, a jeszcze wcześniej
   * sam przydzielony numer. Obie te rzeczy dawały się dziś mieć bez pakietu,
   * więc licznik pokazywał saldo produktu, którego nikt nie kupił. Pytamy tym
   * samym `moze_pracowac('agent')`, co zakładka i bramka na serwerze.
   */
  const { maPakiet } = usePakietAgenta();

  const { dostepne: minuty } = useDostepneJednostki('voice_minutes');

  if (!maPakiet) return null;

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
