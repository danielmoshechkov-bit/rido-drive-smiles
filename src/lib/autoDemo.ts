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
