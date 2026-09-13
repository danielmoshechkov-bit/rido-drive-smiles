/**
 * NOWE POŁĄCZENIA — znacznik „widziane" i licznik do kafelka.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO PRZEGLĄDARKA, A NIE BAZA
 * ═══════════════════════════════════════════════════════════════════════════
 * Baza byłaby lepsza: znacznik przeżyłby zmianę komputera i działałby tak samo
 * dla właściciela i mechanika. Wymaga jednak kolumny (`service_providers`) —
 * czyli migracji, a te w tym projekcie wykonuje człowiek, nie asystent.
 *
 * Dlatego wersja, która działa od razu: data ostatniego wejścia w widok leży
 * w `localStorage`, osobno dla każdego warsztatu. Ograniczenie jest jedno
 * i trzeba je znać: kto otworzy panel na drugim urządzeniu, zobaczy
 * powiadomienie jeszcze raz. Przy jednym komputerze w warsztacie to nie boli;
 * przy dwóch stanowiskach warto przenieść znacznik do bazy — migracja czeka
 * opisana w `docs/BACKLOG.md`.
 *
 * NIE JEST TO „przeczytane per rozmowa". Jedna data na warsztat wystarcza,
 * żeby odpowiedzieć na pytanie „czy przyszło coś, czego jeszcze nie widziałem" —
 * a właśnie na to pytanie odpowiada wykrzyknik przy kafelku.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const klucz = (providerId: string) => `rozmowy-widziane:${providerId}`;

/** Data ostatniego wejścia w widok połączeń. `null`, gdy nigdy nie wchodził. */
export function widzianeDo(providerId: string | null | undefined): string | null {
  if (!providerId) return null;
  try {
    return localStorage.getItem(klucz(providerId));
  } catch {
    // Tryb prywatny albo zablokowane dane witryny — wtedy po prostu nie
    // pamiętamy i powiadomienie pokaże się ponownie. Nic się nie psuje.
    return null;
  }
}

/** Wejście do widoku gasi powiadomienie. */
export function oznaczWidziane(providerId: string | null | undefined): void {
  if (!providerId) return;
  try {
    localStorage.setItem(klucz(providerId), new Date().toISOString());
  } catch { /* jak wyżej */ }
}

export interface NowePolaczenia {
  /** Ile rozmów przyszło od ostatniego wejścia. */
  nowe: number;
  /** Ile z nich wymaga uwagi — to one decydują o czerwieni, nie sama liczba. */
  doUwagi: number;
}

/**
 * Licznik do kafelka. Odpytuje co minutę, bo rozmowa trwa minuty, nie sekundy —
 * częstsze pytanie nic nie wnosi, a kosztuje zapytanie na każdego zalogowanego.
 *
 * Warsztat, który NIGDY nie wchodził w widok, nie dostaje powiadomienia
 * o całej historii: za punkt odniesienia bierzemy wtedy chwilę pierwszego
 * sprawdzenia. Inaczej pierwsze wejście do panelu witałoby go czerwonym
 * wykrzyknikiem z liczbą 65, która nic nie znaczy.
 */
export function useNowePolaczenia(providerId: string | null | undefined) {
  return useQuery<NowePolaczenia>({
    queryKey: ['nowe-polaczenia', providerId],
    enabled: !!providerId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      let od = widzianeDo(providerId);
      if (!od) {
        oznaczWidziane(providerId);
        od = new Date().toISOString();
      }

      const { count: nowe } = await (supabase as any)
        .from('voice_calls')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId)
        .eq('direction', 'inbound')
        .gt('created_at', od);

      const { count: doUwagi } = await (supabase as any)
        .from('voice_calls')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId)
        .eq('direction', 'inbound')
        .eq('status', 'needs_review')
        .gt('created_at', od);

      return { nowe: nowe ?? 0, doUwagi: doUwagi ?? 0 };
    },
  });
}
