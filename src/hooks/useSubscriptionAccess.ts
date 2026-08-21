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

export type PowodBlokady =
  /** Karta odrzucona — klient jest klientem, tylko płatność nie przeszła. */
  | 'platnosc'
  /** Kupił, subskrypcja się skończyła. */
  | 'wygasla'
  /** Skończył okres próbny i NIGDY nie kupił. Najczęstszy przypadek na starcie. */
  | 'trial'
  /** Warsztat bez triala i bez subskrypcji — konto sprzed wprowadzenia okresów próbnych. */
  | 'brak'
  | null;

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
  powod: 'brak',
  moznaPracowac: false,
  koniecOkresu: null,
};

/**
 * Linia produktowa. Panel usługodawcy jest DZIŚ darmowy, ale docelowo ma być
 * osobnym produktem — dlatego linia jest parametrem od początku. Gdy zapadnie
 * decyzja o opłacie, wystarczy dodać plan w panelu i przypisać funkcje.
 */
export type LiniaProduktowa = 'warsztat' | 'uslugi';

export function useSubscriptionAccess(
  providerId: string | null | undefined,
  linia: LiniaProduktowa = 'warsztat',
): DostepWarsztatu {
  const query = useQuery({
    queryKey: ['subscription-access', providerId, linia],
    enabled: !!providerId,
    // Stan dostępu zmienia się rzadko, ale po opłaceniu ma wrócić NATYCHMIAST —
    // dlatego krótki czas świeżości i odświeżenie przy powrocie do karty.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Omit<DostepWarsztatu, 'loading'>> => {
      // DWA źródła, bo trial i subskrypcja płatna żyją w różnych tabelach.
      // Trial zakłada `register-marketplace-user` w `paid_service_subscriptions`;
      // `billing_subscriptions` dostaje wiersz dopiero po zakupie. Czytanie
      // wyłącznie tej drugiej blokowałoby KAŻDEGO klienta w okresie próbnym.
      const [platna, trial] = await Promise.all([
        supabase
          .from('billing_subscriptions' as any)
          .select('status, current_period_end, trial_ends_at')
          .eq('subscriber_type', 'service_provider')
          .eq('subscriber_id', providerId)
          .eq('product_line', linia)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('paid_service_subscriptions' as any)
          .select('status, expires_at')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (platna.error) throw platna.error;

      // Rzutowanie przez `unknown`, bo `billing_subscriptions` nie ma jeszcze
      // w wygenerowanym `types.ts` — klient zwraca wtedy `SelectQueryError`,
      // który z docelowym kształtem się nie pokrywa. Tabela w bazie ISTNIEJE;
      // to rozjazd wygenerowanego pliku, nie zapytania. Pliku nie tykamy ręcznie
      // (jest generowany), więc niezgodność zdejmujemy tutaj i nazywamy powód.
      const wiersz = (Array.isArray(platna.data) ? platna.data[0] : null) as unknown as
        | { status: string; current_period_end: string | null; trial_ends_at: string | null }
        | null;

      // Subskrypcja płatna ma pierwszeństwo: gdy istnieje, trial jest nieistotny.
      if (wiersz) {
        const koniec = wiersz.current_period_end;
        switch (wiersz.status) {
          case 'active':
            return { stan: 'aktywna', powod: null, moznaPracowac: true, koniecOkresu: koniec };

          case 'trialing': {
            // OKRES PRÓBNY KOŃCZY SIĘ DATĄ.
            //
            // Do wariantu A `trialing` znaczyło tu „pełny dostęp" bez patrzenia
            // na datę — i było to nieszkodliwe, bo prawie żaden warsztat nie
            // miał wiersza w `billing_subscriptions`; decydowała gałąź zapasowa
            // niżej, która datę sprawdza.
            //
            // Wariant A zakłada taki wiersz KAŻDEMU warsztatowi. Bez tej
            // poprawki wszystkie dostałyby okres próbny bez końca — czyli stan
            // gorszy niż przed zmianą. To samo rozstrzygnięcie stoi w bazie
            // (`moze_pracowac`, migracja 20260821090000); dwa miejsca muszą
            // mówić to samo, bo rozjazd znaczy „przycisk widać, a zapis pada".
            //
            // Brak daty = wiersz sprzed wprowadzenia terminów. Zostaje
            // bezterminowy: zmiana warunków wstecz byłaby nieuczciwa.
            // Ta sama kolejność pól co w `moze_pracowac`: `trial_ends_at` jest
            // polem właściwym, `current_period_end` bierzemy zapasowo, bo Stripe
            // wypełnia je zawsze. Gdyby front patrzył tylko na drugie, a baza na
            // pierwsze, rozjechałyby się przy subskrypcjach ze Stripe — przycisk
            // byłby widoczny, a zapis odrzucony przez RLS.
            const koniecProbnego = wiersz.trial_ends_at ?? koniec;
            const trwa = !koniecProbnego || new Date(koniecProbnego) > new Date();
            return trwa
              ? { stan: 'aktywna', powod: null, moznaPracowac: true, koniecOkresu: koniecProbnego }
              : { stan: 'zablokowana', powod: 'trial', moznaPracowac: false, koniecOkresu: koniecProbnego };
          }

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
      }

      // Brak subskrypcji płatnej — decyduje okres próbny.
      //
      // WAŻNE: datę wygaśnięcia czytamy TUTAJ, bo nikt inny jej nie egzekwuje.
      // `activate-workshop-trial` i `register-marketplace-user` zapisują
      // `expires_at` i na tym koniec — nie ma zadania, które po tej dacie
      // cokolwiek zmienia. Do czasu podetapu 3.7 gating jest jedynym miejscem,
      // w którym trial faktycznie się kończy.
      // Nie filtrujemy po `metadata->>module`, bo `activate-workshop-trial`
      // sprawdza istnienie triala BEZ filtra — dla niego jeden wiersz na konto
      // oznacza „ten użytkownik ma już okres próbny". Filtrowanie tutaj
      // rozjechałoby się z zapisem: komuś odmówiono by założenia drugiego triala,
      // a jednocześnie pierwszy nie dawałby mu dostępu.
      // Jak wyżej: `paid_service_subscriptions` brak w wygenerowanych typach.
      const t = (Array.isArray(trial.data) ? trial.data[0] : null) as unknown as
        | { status: string; expires_at: string | null }
        | null;

      if (t && t.status === 'trial') {
        const trwa = !t.expires_at || new Date(t.expires_at) > new Date();
        return trwa
          ? { stan: 'aktywna', powod: null, moznaPracowac: true, koniecOkresu: t.expires_at }
          : { stan: 'zablokowana', powod: 'trial', moznaPracowac: false, koniecOkresu: t.expires_at };
      }

      return BRAK;
    },
  });

  return {
    ...(query.data ?? BRAK),
    loading: query.isLoading,
  };
}
