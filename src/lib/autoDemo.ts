/**
 * Auto i klient do wprowadzenia — na stałe, bez odpytywania rejestru.
 *
 * Wprowadzenie to prezentacja systemu, a nie prawdziwe przyjęcie auta. Pobieranie
 * danych z rejestru za każdym razem kosztuje sprawdzenie z pakietu, trwa kilka
 * sekund i potrafi się nie udać (literówka w numerze, cisza po stronie rejestru)
 * — a wtedy wprowadzenie staje w miejscu, w którym miało pokazać, jak łatwo jest.
 *
 * Te dane pobraliśmy raz z rejestru i tu zamrażamy. Warsztat, który chce zobaczyć
 * przebieg na własnym aucie, nadal może wpisać swój numer — wtedy idzie zwykłą
 * drogą przez rejestr.
 */
export const POJAZD_DEMO = {
  registration_number: 'WW140TV',
  make: 'TOYOTA',
  model: 'Auris HSD',
  registration_year: 2016,
  engine_size: '1798',
  engine_power_kw: '73',
  fuel_type: 'Hybryda',
  body_style: 'hatchback',
  color: 'Srebrny',
  vin: 'SB1KZ3JE60E123456',
} as const;

/** Czy ten numer to nasze auto pokazowe (bez względu na spacje i wielkość liter). */
export function toAutoDemo(numer: string | null | undefined): boolean {
  return String(numer ?? '').replace(/\s+/g, '').toUpperCase() === POJAZD_DEMO.registration_number;
}

/**
 * Klient do zlecenia próbnego.
 *
 * Imię i nazwisko są zmyślone — to ma być widocznie próbny wpis, a nie cudze
 * dane. Numer telefonu podstawia się osobno: numer WARSZTATU, bo SMS-y z tego
 * przejścia mają trafić do właściciela, nie do przypadkowej osoby.
 */
export const KLIENT_DEMO = {
  first_name: 'Jan',
  last_name: 'Przykładowy',
} as const;

/**
 * Gotowa odpowiedź Rido Wyceny dla pozycji ze zlecenia próbnego.
 *
 * Prawdziwa wycena pyta historię i model AI — to trwa kilkanaście sekund i
 * kosztuje. We wprowadzeniu chodzi o pokazanie, JAK to wygląda, a nie o wynik,
 * więc dla auta pokazowego podajemy widełki od razu. Liczby i opisy są tymi,
 * które model naprawdę zwrócił dla tego auta.
 */
export const WYCENA_DEMO: Record<string, { min: number; max: number; note: string }> = {
  'wymiana wahaczy przednich': {
    min: 250,
    max: 500,
    note: 'Robocizna obejmuje wymianę obu wahaczy przednich (P+L) wraz z demontażem i montażem — po tej operacji geometria kół jest OBOWIĄZKOWA, jej koszt (ok. 100–150 zł) doliczany jest osobno. Czas pracy: 2–3h przy skorodowanych śrubach. Orientacyjny koszt samych wahaczy: 150–450 zł za sztukę.',
  },
  'wymiana sprężyn przednich': {
    min: 300,
    max: 600,
    note: 'Wymiana obu sprężyn przednich wymaga ściągacza sprężyn i demontażu kolumn McPhersona. Przy okazji warto sprawdzić amortyzatory i łożyska górne — ich wymiana przy tej samej robociźnie kosztuje niewiele więcej. Czas pracy: 2–3h.',
  },
  'wymiana klocków hamulcowych przód': {
    min: 80,
    max: 150,
    note: 'Robocizna obejmuje demontaż zacisku, wymianę klocków na obu kołach (P+L) i docieranie. Warto sprawdzić stan prowadnic i tłoczków zacisku — ich serwis to dodatkowy koszt. Czas pracy: 0,5–1h. Orientacyjny koszt samych klocków: 80–200 zł.',
  },
};

/** Widełki dla pozycji, jeśli to jedna z pozycji pokazowych. */
export function wycenaDemo(nazwa: string) {
  return WYCENA_DEMO[String(nazwa ?? '').trim().toLowerCase()] ?? null;
}
