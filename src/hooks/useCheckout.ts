import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Rozpoczęcie płatności za plan — jedno miejsce dla wszystkich przycisków
 * „Kup" w aplikacji: karty na /cennik, karty na /warsztat-info, baner trialu.
 *
 * Kod odmowy z `billing-checkout` tłumaczymy na komunikat, który mówi
 * użytkownikowi, CO ZROBIĆ, a nie co się stało po stronie serwera.
 */
const KOMUNIKATY: Record<string, string> = {
  GATEWAY_NOT_CONFIGURED: 'Płatności są chwilowo niedostępne. Spróbuj za chwilę albo napisz do nas.',
  PLAN_NOT_SYNCED: 'Ten plan jest właśnie aktualizowany. Spróbuj za kilka minut.',
  NO_PROVIDER: 'Ten plan jest dla warsztatów. Załóż profil usługodawcy, aby kupić.',
  ALREADY_SUBSCRIBED: 'Masz już aktywny plan w tej linii. Zmiany planu dokonasz w ustawieniach subskrypcji.',
};

export function useCheckout() {
  const [pending, setPending] = useState<string | null>(null);

  /**
   * Kartę otwieramy SYNCHRONICZNIE, przed zapytaniem — przeglądarka blokuje
   * `window.open` wywołane po `await`, bo nie widzi już gestu użytkownika.
   * Przy błędzie kartę zamykamy, żeby nie zostawiać pustego okna.
   */
  const kup = async (planCode: string) => {
    if (pending) return;
    const karta = window.open('', '_blank');
    setPending(planCode);
    try {
      const { data, error } = await supabase.functions.invoke('billing-checkout', {
        body: { plan_code: planCode },
      });
      if (error) throw error;
      if (data?.error) {
        throw new Error(KOMUNIKATY[data.code as string] ?? data.error);
      }
      if (!data?.url) throw new Error('Nie udało się rozpocząć płatności. Spróbuj ponownie.');

      if (karta) karta.location.href = data.url;
      else window.location.href = data.url;
    } catch (e) {
      karta?.close();
      toast.error(e instanceof Error ? e.message : 'Nie udało się rozpocząć płatności.');
    } finally {
      setPending(null);
    }
  };

  return { kup, pending };
}
