import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Stan dostępu warsztatu — JEDNO źródło prawdy dla całego gatingu.
 *
 * Świadomie zwraca stan i POWÓD osobno. „Nie zapłaciłeś" i „karta nie zadziałała"
 * to dla klienta dwie różne sytuacje: pierwsza wymaga decyzji o zakupie, druga
 * poprawienia karty. Komunikat, który ich nie rozróżnia, wysyła połowę ludzi
 * w złą stronę.
 *
 * Odczyt idzie wprost z tabeli — polityka `billing_subscriptions_select_own`
 * przepuszcza wyłącznie własne wiersze podmiotu (migracja 4.6).
 */
export type StanDostepu =
  /** Opłacona albo w okresie próbnym — pełny dostęp. */
  | 'aktywna'
  /** Nieudana płatność, ale trwa karencja. PEŁNY dostęp: operator sam ponawia. */
  | 'karencja'
  /** Po karencji albo po rezygnacji — tryb odczytu. */
  | 'zablokowana'
  /** Nigdy nie było subskrypcji w tej linii. */
  | 'brak';

export type PowodBlokady = 'platnosc' | 'wygasla' | null;

export interface DostepWarsztatu {
  stan: StanDostepu;
  powod: PowodBlokady;
  /** Dostęp do pracy: tworzenie i edycja. Odczyt i eksport są zawsze wolne. */
  moznaPracowac: boolean;
  koniecOkresu: string | null;
  loading: boolean;
}

const BRAK: Omit<DostepWarsztatu, 'loading'> = {
  stan: 'brak',
  powod: null,
  moznaPracowac: false,
  koniecOkresu: null,
};

export function useSubscriptionAccess(providerId: string | null | undefined): DostepWarsztatu {
  const query = useQuery({
    queryKey: ['subscription-access', providerId],
    enabled: !!providerId,
    // Stan dostępu zmienia się rzadko, ale po opłaceniu ma wrócić NATYCHMIAST —
    // dlatego krótki czas świeżości i odświeżenie przy powrocie do karty.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Omit<DostepWarsztatu, 'loading'>> => {
      const { data, error } = await supabase
        .from('billing_subscriptions' as any)
        .select('status, current_period_end, product_line')
        .eq('subscriber_type', 'service_provider')
        .eq('subscriber_id', providerId)
        .eq('product_line', 'warsztat')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      const wiersz = (Array.isArray(data) ? data[0] : null) as
        | { status: string; current_period_end: string | null }
        | null;
      if (!wiersz) return BRAK;

      const koniec = wiersz.current_period_end;

      switch (wiersz.status) {
        case 'active':
        case 'trialing':
          return { stan: 'aktywna', powod: null, moznaPracowac: true, koniecOkresu: koniec };

        case 'past_due':
          // Karencja z PEŁNYM dostępem. Operator ponawia pobranie przez kilka
          // dni i połowa nieudanych płatności naprawia się bez udziału klienta —
          // blokada w dniu odrzucenia karty byłaby zbyt agresywna.
          return { stan: 'karencja', powod: 'platnosc', moznaPracowac: true, koniecOkresu: koniec };

        case 'read_only':
          // Do tego stanu dochodzi się WYŁĄCZNIE z `past_due`, czyli po nieudanej
          // płatności — stąd powód, a nie „wygasła".
          return { stan: 'zablokowana', powod: 'platnosc', moznaPracowac: false, koniecOkresu: koniec };

        case 'canceled':
        case 'expired':
          return { stan: 'zablokowana', powod: 'wygasla', moznaPracowac: false, koniecOkresu: koniec };

        default:
          // Nieznany status nie może dawać dostępu: brak wiedzy to nie zgoda.
          return { stan: 'zablokowana', powod: 'wygasla', moznaPracowac: false, koniecOkresu: koniec };
      }
    },
  });

  return {
    ...(query.data ?? BRAK),
    loading: query.isLoading,
  };
}
