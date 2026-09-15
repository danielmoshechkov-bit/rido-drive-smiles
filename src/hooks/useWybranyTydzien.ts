import { create } from 'zustand';
import { getAvailableWeeks, getWeekDates } from '@/lib/utils';

/**
 * Tydzień wybrany w module rozliczeń — wspólny dla całego panelu floty.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * Plan rozliczeń ustawia się w DWÓCH miejscach: w popoverze „i" w tabeli
 * rozliczeń i na karcie kierowcy na Liście kierowców. Przypisanie ma datę
 * obowiązywania, więc oba miejsca MUSZĄ zapisywać od tego samego tygodnia —
 * inaczej ustawienie zrobione na liście ląduje w innym tygodniu niż to
 * z tabeli i wygląda, jakby się nie zapisało.
 *
 * Tak było do 15.09.2026: tabela zapisywała od oglądanego tygodnia, a karta
 * kierowcy od bieżącego poniedziałku. Dmytro dostał przez to trzy wiersze
 * historii z trzema różnymi datami.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO BEZ ZAPAMIĘTYWANIA MIĘDZY SESJAMI
 * ═══════════════════════════════════════════════════════════════════════════
 * Stan żyje w pamięci, nie w `localStorage`. Zapamiętany tydzień sprzed dwóch
 * miesięcy byłby gorszy niż jego brak: użytkownik otwiera panel, idzie prosto
 * na Listę kierowców, ustawia plan — i zapis cicho ląduje w starym tygodniu.
 * Po odświeżeniu strony wracamy więc do tygodnia domyślnego (najnowszego
 * zamkniętego — tego samego, który pokaże tabela), dopóki ktoś nie wybierze
 * innego w tabeli rozliczeń.
 */

export interface WybranyTydzien {
  rok: number;
  numer: number;
  /** Poniedziałek, YYYY-MM-DD. */
  start: string;
  /** Niedziela, YYYY-MM-DD. */
  koniec: string;
}

interface StanTygodnia {
  tydzien: WybranyTydzien | null;
  ustawTydzien: (tydzien: WybranyTydzien) => void;
}

export const useWybranyTydzienStore = create<StanTygodnia>((set) => ({
  tydzien: null,
  ustawTydzien: (tydzien) => set({ tydzien }),
}));

/**
 * Tydzień, który pokaże tabela rozliczeń, gdy nikt jeszcze nic nie wybrał:
 * NAJNOWSZY ZAMKNIĘTY tydzień, nie kalendarzowy bieżący.
 *
 * To nie jest drobiazg. `getAvailableWeeks` odcina tygodnie niezakończone, więc
 * we wtorek tabela pokazuje tydzień poprzedni — a kalendarzowy „bieżący" nie da
 * się w niej nawet wybrać. Gdyby karta kierowcy brała kalendarzowy, przypisanie
 * zrobione PRZED wejściem do tabeli lądowałoby w tygodniu, którego w tabeli nie
 * widać: znowu „ustawiłem plan, a w rozliczeniach go nie ma".
 */
export function domyslnyTydzien(): WybranyTydzien {
  const rok = new Date().getFullYear();
  const dostepne = getAvailableWeeks(rok);
  if (dostepne.length > 0) {
    const najnowszy = dostepne[0]; // lista przychodzi od najnowszego
    return { rok, numer: najnowszy.number, start: najnowszy.start, koniec: najnowszy.end };
  }
  // Pierwsze dni stycznia: żaden tydzień tego roku jeszcze się nie zamknął.
  const poprzedni = getAvailableWeeks(rok - 1);
  if (poprzedni.length > 0) {
    const najnowszy = poprzedni[0];
    return { rok: rok - 1, numer: najnowszy.number, start: najnowszy.start, koniec: najnowszy.end };
  }
  const ostatni = getWeekDates(rok)[0];
  return { rok, numer: ostatni.number, start: ostatni.start, koniec: ostatni.end };
}

/** Pełny opis tygodnia (numer + zakres) dla podanego poniedziałka. */
export function tydzienZDaty(poniedzialek: string): WybranyTydzien {
  const rok = Number(poniedzialek.slice(0, 4));
  const trafiony = getWeekDates(rok).find((t) => t.start === poniedzialek);
  if (trafiony) {
    return { rok, numer: trafiony.number, start: trafiony.start, koniec: trafiony.end };
  }
  // Data spoza siatki tygodni (nie poniedziałek?) — nie zgadujemy numeru.
  // Zakres liczymy od podanego dnia, a numer bierzemy z tygodnia bieżącego,
  // żeby zdanie nie kłamało o czymś, czego nie wiemy.
  const koniec = new Date(poniedzialek);
  koniec.setDate(koniec.getDate() + 6);
  return {
    rok,
    numer: domyslnyTydzien().numer,
    start: poniedzialek,
    koniec: koniec.toISOString().split('T')[0],
  };
}

/**
 * Tydzień, od którego zapisze się zmiana planu.
 * Wybrany w module rozliczeń, a gdy nikt jeszcze nic nie wybrał — ten, który
 * tabela rozliczeń pokaże domyślnie (najnowszy zamknięty).
 */
export function useTydzienZapisu(): WybranyTydzien {
  const tydzien = useWybranyTydzienStore((s) => s.tydzien);
  return tydzien ?? domyslnyTydzien();
}

/**
 * Pełne zdanie do pokazania nad zapisem:
 * „Zapis zadziała od tygodnia 36 (7-13 września)".
 *
 * Zakres z jednego miesiąca skracamy („7-13 września"), zakres na przełomie
 * podajemy w całości („28 września - 4 października").
 */
export function zdanieOTygodniu(tydzien: WybranyTydzien): string {
  const start = new Date(tydzien.start);
  const koniec = new Date(tydzien.koniec);

  // `month: 'long'` SAMO daje mianownik („wrzesień"). Dopiero razem z dniem
  // Intl odmienia go poprawnie („13 września"), więc formatujemy całą datę.
  const zDniem = (d: Date) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });

  const zakres = start.getMonth() === koniec.getMonth()
    ? `${start.getDate()}-${zDniem(koniec)}`
    : `${zDniem(start)} - ${zDniem(koniec)}`;

  return `Zapis zadziała od tygodnia ${tydzien.numer} (${zakres})`;
}
