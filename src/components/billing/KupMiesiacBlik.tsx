import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { zapamietajZamowienie, czekajNaWydanie, LIMIT_KARTY_ZAKUPU_MS } from '@/lib/doladowanie';
import { useOdswiezJednostki } from '@/hooks/useDostepneJednostki';

/**
 * Zapłać BLIK-iem za jeden miesiąc — droga bez karty.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO TO NIE JEST PRZYCISK AWARYJNY
 * ═══════════════════════════════════════════════════════════════════════════
 * Tryb dokończenia mówi klientowi „wykup plan, żeby wrócić do pracy" i daje
 * przycisk. Do dziś jedyna droga prowadziła przez Stripe z kartą — a część
 * warsztatów karty nie podepnie. Dla nich blokada nie miała wyjścia:
 * pokazywaliśmy drzwi, które nie otwierają się ich kluczem.
 *
 * Dlatego stoi obok „Podepnij kartę", tej samej wielkości, bez nawiasów
 * i bez słowa „alternatywnie". Po miesiącu blokada wraca i klient płaci
 * ponownie — świadomie, bo tak wybrał.
 *
 * Cena rozstrzyga się PO STRONIE BAZY (`billing_cena_miesiaca`), łącznie
 * z gwarancją ceny startowej. Ten komponent nie zna kwoty i nie ma jej znać —
 * inaczej dałoby się kupić miesiąc za kwotę z żądania.
 */
export function KupMiesiacBlik({
  planCode,
  etykieta = 'Zapłać BLIK-iem za miesiąc',
  wariant = 'outline',
  klasa,
}: {
  planCode: string;
  etykieta?: string;
  wariant?: 'default' | 'outline' | 'secondary';
  klasa?: string;
}) {
  const [wysylka, setWysylka] = useState(false);
  const odswiez = useOdswiezJednostki();

  const zaplac = async () => {
    if (wysylka) return;
    // Kartę otwieramy SYNCHRONICZNIE, przed zapytaniem — przeglądarka blokuje
    // `window.open` wywołane po `await`, bo nie widzi już gestu użytkownika.
    const karta = window.open('', '_blank');
    setWysylka(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-payu-order', {
        body: { plan_code: planCode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('Nie udało się rozpocząć płatności.');

      if (karta) karta.location.href = data.url;
      else window.location.href = data.url;

      // Nadzór w TEJ karcie — PayU otwiera się obok, a ten panel zostaje
      // otwarty i nic go nie odświeży. Patrz `lib/doladowanie`.
      zapamietajZamowienie(data.order_id);
      void czekajNaWydanie({
        orderId: data.order_id,
        limitMs: LIMIT_KARTY_ZAKUPU_MS,
        gdyWydane: () => {
          void odswiez();
          // Po opłaceniu miesiąca wraca pełny dostęp — panel musi to zobaczyć
          // bez przeładowania, inaczej klient patrzy na blokadę, za którą
          // przed chwilą zapłacił.
          window.location.reload();
        },
      });
    } catch (e) {
      karta?.close();
      toast.error(e instanceof Error ? e.message : 'Nie udało się rozpocząć płatności.');
    } finally {
      setWysylka(false);
    }
  };

  return (
    <Button variant={wariant} onClick={zaplac} disabled={wysylka} className={klasa}>
      {wysylka && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {etykieta}
    </Button>
  );
}
