// ============================================================================
// voiceSnapshot — BUDOWA MIGAWKI POBIERANEJ PRZY ODEBRANIU POŁĄCZENIA.
//
// Czysty moduł: bez sieci i bez bazy. Wszystko, co potrzebne, przychodzi
// w argumentach — dzięki temu slot math da się przetestować offline, a to
// jedyna część, w której pomyłka jest niewidoczna aż do rozmowy z klientem.
//
// KONTRAKT JEST GENERYCZNY (kryterium: „czy zadziała dla fryzjera bez zmiany
// kodu?"). Mówimy `zasoby`, `usługi`, `dni` — nigdy `stanowiska`, `naprawy`,
// `pojazdy`. Pola branżowe idą do `branza: {}`, nie do korzenia.
//
// DWIE ZASADY, KTÓRE TU MIESZKAJĄ:
//
// 1. MODEL NIE LICZY, TYLKO WYBIERA (zasada 22 w praktyce). Dni mają nazwy
//    i gotową formę do wypowiedzenia — „wtorek, dziewiętnastego sierpnia" —
//    bo model odmieniał „dziewiętnaście sierpnia" trzy razy w jednej rozmowie.
//    Godziny są już przefiltrowane, więc nie ma czego przeliczać.
//
// 2. CZAS DO WYLICZEŃ ≠ CZAS DO POWIEDZENIA. `czas_blokady_min` istnieje
//    zawsze (inaczej nie da się zarezerwować miejsca), `czas_do_powiedzenia`
//    tylko wtedy, gdy ktoś naprawdę podał czas przy usłudze. Agent mówi
//    o czasie WYŁĄCZNIE gdy `czas_znany`. Domyślne 60 minut rezerwuje miejsce
//    w grafiku, nie informuje klienta.
// ============================================================================

const DNI_TYGODNIA = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Liczebniki porządkowe w dopełniaczu — model odmieniał je źle, więc podajemy gotowe. */
const DZIEN_SLOWNIE = [
  "", "pierwszego", "drugiego", "trzeciego", "czwartego", "piątego", "szóstego",
  "siódmego", "ósmego", "dziewiątego", "dziesiątego", "jedenastego", "dwunastego",
  "trzynastego", "czternastego", "piętnastego", "szesnastego", "siedemnastego",
  "osiemnastego", "dziewiętnastego", "dwudziestego", "dwudziestego pierwszego",
  "dwudziestego drugiego", "dwudziestego trzeciego", "dwudziestego czwartego",
  "dwudziestego piątego", "dwudziestego szóstego", "dwudziestego siódmego",
  "dwudziestego ósmego", "dwudziestego dziewiątego", "trzydziestego",
  "trzydziestego pierwszego",
];
const MIESIAC_SLOWNIE = ["", "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
/** „we wtorek", nie „w wtorek" — przed w- i f- przyimek się wydłuża. */
const DZIEN_NAZWA = ["niedzielę", "poniedziałek", "wtorek", "środę", "czwartek", "piątek", "sobotę"];
const PRZYIMEK = ["w", "w", "we", "we", "w", "w", "w"];

export type GodzinyDnia = { open: string; close: string; closed?: boolean };
export type Usluga = {
  id: string;
  nazwa: string;
  cena_od: number | null;
  cena_do: number | null;
  /** Z `provider_services.duration_minutes`. null = warsztat nie podał. */
  duration_minutes: number | null;
  kategoria?: string | null;
};
export type Zasob = { id: string; nazwa: string; typ: string };
export type Zajetosc = { data: string; godzina: string };

export const minuty = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** „wtorek, dziewiętnastego sierpnia" — gotowe do przeczytania, bez odmieniania. */
export const doWypowiedzenia = (iso: string): string => {
  const d = new Date(iso + "T12:00:00Z");
  const dzien = d.getUTCDay();
  const nr = d.getUTCDate();
  return `${DZIEN_NAZWA[dzien]}, ${DZIEN_SLOWNIE[nr]} ${MIESIAC_SLOWNIE[d.getUTCMonth() + 1]}`;
};
export const przyimekZDniem = (iso: string): string => {
  const d = new Date(iso + "T12:00:00Z");
  return `${PRZYIMEK[d.getUTCDay()]} ${doWypowiedzenia(iso)}`;
};

export const kluczDnia = (iso: string): string =>
  DNI_TYGODNIA[new Date(iso + "T12:00:00Z").getUTCDay()];

/**
 * OSTATNI MOŻLIWY START DLA USŁUGI.
 *
 * Liczony PER USŁUGA, nie globalnie: usługa ośmiogodzinna musi zacząć rano
 * niezależnie od tego, co warsztat wpisał w „najpóźniejszą godzinę przyjęcia".
 * To pole jest GÓRNYM OGRANICZENIEM, nie jedyną regułą.
 */
export const ostatniStart = (
  zamkniecie: string,
  czasBlokadyMin: number,
  najpozniejszePrzyjecie?: string | null,
): number => {
  const zZamkniecia = minuty(zamkniecie) - czasBlokadyMin;
  const zUstawien = najpozniejszePrzyjecie ? minuty(najpozniejszePrzyjecie) : Infinity;
  return Math.min(zZamkniecia, zUstawien);
};

/** Ile minut blokuje usługa i czy wolno o tym mówić klientowi. */
export const czasUslugi = (u: Usluga, domyslnyCzasMin: number | null) => {
  if (typeof u.duration_minutes === "number" && u.duration_minutes > 0) {
    return { czas_blokady_min: u.duration_minutes, czas_znany: true };
  }
  return { czas_blokady_min: domyslnyCzasMin && domyslnyCzasMin > 0 ? domyslnyCzasMin : 60, czas_znany: false };
};

const CZAS_SLOWNIE: Array<[number, string]> = [
  [30, "około pół godziny"], [60, "około godziny"], [90, "około półtorej godziny"],
  [120, "około dwóch godzin"], [180, "około trzech godzin"], [240, "około czterech godzin"],
];
/** Forma gotowa do przeczytania; poza siatką mówimy zachowawczo „kilka godzin". */
export const czasDoWypowiedzenia = (min: number): string => {
  const trafienie = CZAS_SLOWNIE.find(([m]) => m === min);
  if (trafienie) return trafienie[1];
  if (min < 30) return "krótko";
  if (min >= 300) return "cały dzień";
  return "kilka godzin";
};

/**
 * WOLNE GODZINY W DNIU dla usługi o zadanym czasie blokady.
 *
 * Pojemność = liczba zasobów. Slot jest wolny, dopóki liczba rezerwacji
 * w tej godzinie jest mniejsza niż liczba zasobów — tak samo jak dziś liczy
 * to `check_availability`, tylko bez zapytania w trakcie rozmowy.
 */
export const wolneGodziny = (
  godziny: GodzinyDnia,
  czasBlokadyMin: number,
  pojemnosc: number,
  zajete: string[],
  krokMin = 30,
  najpozniejszePrzyjecie?: string | null,
  maks = 3,
): string[] => {
  if (godziny.closed) return [];
  const start = minuty(godziny.open);
  const koniec = ostatniStart(godziny.close, czasBlokadyMin, najpozniejszePrzyjecie);
  if (koniec < start) return [];
  const obciazenie: Record<string, number> = {};
  for (const g of zajete) obciazenie[g] = (obciazenie[g] || 0) + 1;
  const out: string[] = [];
  for (let t = start; t <= koniec && out.length < maks; t += krokMin) {
    const etykieta = hhmm(t);
    if ((obciazenie[etykieta] || 0) < Math.max(1, pojemnosc)) out.push(etykieta);
  }
  return out;
};

export type Dzien = {
  klucz: string;
  data: string;
  do_wypowiedzenia: string;
  otwarte: boolean;
  godziny?: string;
  wolne?: string[];
  powod?: string;
};

/**
 * NAZWANE DNI. „dzisiaj", „jutro", „pojutrze" dostają etykiety, reszta idzie
 * pod nazwą dnia tygodnia. Model wybiera z listy zamiast liczyć daty — to
 * usuwa całą rodzinę błędów naraz (zły dzień, zły rok, zła odmiana).
 */
export const zbudujDni = (
  odIso: string,
  ile: number,
  godzinyTygodnia: Record<string, GodzinyDnia>,
  slotyDlaDnia: (iso: string, g: GodzinyDnia) => string[],
): Dzien[] => {
  const ETYKIETY = ["dzisiaj", "jutro", "pojutrze"];
  const out: Dzien[] = [];
  const baza = new Date(odIso + "T12:00:00Z");
  for (let i = 0; i < ile; i++) {
    const d = new Date(baza);
    d.setUTCDate(baza.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const g = godzinyTygodnia[kluczDnia(iso)];
    const wpis: Dzien = {
      klucz: ETYKIETY[i] ?? `${DNI_TYGODNIA[d.getUTCDay()]}_${d.getUTCDate()}`,
      data: iso,
      do_wypowiedzenia: doWypowiedzenia(iso),
      otwarte: !!g && !g.closed,
    };
    if (!wpis.otwarte) {
      wpis.powod = "zamknięte";
    } else {
      wpis.godziny = `${g.open}-${g.close}`;
      wpis.wolne = slotyDlaDnia(iso, g);
    }
    out.push(wpis);
  }
  return out;
};
