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
  ALREADY_SUBSCRIBED: 'Masz już aktywny plan w tej linii produktowej.',
};

/** Kody, przy których sam komunikat nie wystarcza — klient musi wiedzieć, gdzie iść. */
const AKCJE: Record<string, { label: string; href: string }> = {
  ALREADY_SUBSCRIBED: { label: 'Przejdź do panelu', href: '/uslugi/panel' },
  NO_PROVIDER: { label: 'Załóż warsztat', href: '/warsztat-info' },
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
        const kod = data.code as string;
        const akcja = AKCJE[kod];
        if (akcja) {
          // Komunikat z przyciskiem: „masz już plan" bez wskazania, gdzie go
          // zmienić, zostawia klienta z problemem, a nie z rozwiązaniem.
          toast.error(KOMUNIKATY[kod] ?? data.error, {
            duration: 10000,
            action: { label: akcja.label, onClick: () => { window.location.href = akcja.href; } },
          });
          karta?.close();
          return;
        }
        throw new Error(KOMUNIKATY[kod] ?? data.error);
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
