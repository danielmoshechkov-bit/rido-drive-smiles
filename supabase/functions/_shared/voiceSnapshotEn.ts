// ============================================================================
// voiceSnapshotEn.ts — ANGIELSKIE POLA SNAPSHOTU. OSOBNY MODUŁ, CELOWO.
//
// DLACZEGO OSOBNY, A NIE UOGÓLNIENIE `voiceSnapshot.ts`:
// moduł polski ma 22 asercje i powstawał przez trzy dni poprawek — „dziewiętnaście
// sierpnia" zamiast „dziewiętnastego" wyszło dopiero na prawdziwej rozmowie
// z klientką. Uogólnienie tamtych funkcji na dwa języki znaczyłoby przepisanie
// kodu, który JEST JUŻ SPRAWDZONY NA PRODUKCJI, żeby dołożyć język,
// który jeszcze nikogo nie obsłużył. Zła kolejność ryzyka.
//
// Ten moduł NICZEGO nie importuje z polskiego i niczego w nim nie zmienia.
// Dokłada pola `*_en` obok istniejących. Skasowanie tego pliku wraca do stanu
// sprzed — bez ruszania polszczyzny.
//
// DECYZJA O LICZBACH: po angielsku podajemy je SUROWO („18 August", „150 to 250").
// Angielska odmiana liczebnika porządkowego to trzy końcówki (st/nd/rd/th)
// i model radzi sobie z nią bez pomocy. Po polsku, rosyjsku i ukraińsku
// odmiana jest na tyle złożona, że pole gotowe jest konieczne — tam zostaje
// dotychczasowe podejście.
// ============================================================================

const DNI_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MIESIACE_EN = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/** „Tuesday, 18 August" — bez liczebnika porządkowego, model dołoży „the eighteenth". */
export const doWypowiedzeniaEn = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DNI_EN[d.getUTCDay()]}, ${d.getUTCDate()} ${MIESIACE_EN[d.getUTCMonth()]}`;
};

/**
 * CZAS TRWANIA. Ta sama siatka co po polsku — i ta sama zasada: poza siatką
 * mówimy zachowawczo, zamiast podawać liczbę, której nikt nie sprawdził.
 */
const CZAS_SLOWNIE_EN: Array<[number, string]> = [
  [15, "about fifteen minutes"], [30, "about half an hour"], [45, "about forty-five minutes"],
  [60, "about an hour"], [90, "about an hour and a half"], [120, "about two hours"],
  [180, "about three hours"], [240, "about four hours"],
];
export const czasDoWypowiedzeniaEn = (min: number): string => {
  // DOKŁADNIE TA SAMA LOGIKA CO PO POLSKU: trafienie w siatkę albo zdanie
  // zachowawcze. Pierwsza wersja tego modułu używała przedziałów i dla 75 minut
  // mówiła „about two hours" — czyli podawała klientowi liczbę, której nikt nie
  // sprawdził. Asercja „ta sama siatka co po polsku" to złapała.
  const trafienie = CZAS_SLOWNIE_EN.find(([m]) => m === min);
  if (trafienie) return trafienie[1];
  if (min < 30) return "a short while";
  if (min >= 300) return "a full day";
  return "a few hours";
};

/**
 * CENA. Surowe liczby — inaczej niż po polsku, gdzie każda kwota jest rozpisana
 * słowami w dopełniaczu, bo model mylił „dwustu pięćdziesięciu" z „trzystu".
 * Po angielsku „150 to 250 zloty" nie ma jak się przekręcić w odmianie.
 *
 * Waluta zostaje ZŁOTÓWKĄ, nie przeliczamy. Anglojęzyczny klient w polskim
 * warsztacie płaci złotówkami i musi usłyszeć tę walutę, a nie funty.
 */
export const cenaDoWypowiedzeniaEn = (od: number, do_: number | null): string => {
  if (!od && !do_) return "0 zloty";
  if (do_ == null || do_ === od) return `${od} zloty`;
  return `${od} to ${do_} zloty`;
};

/** Powody zamknięcia dnia — te same dwa stany co po polsku. */
export const powodEn = (powodPl: string): string =>
  powodPl === "zamknięte" ? "closed" : powodPl === "brak wolnych terminów" ? "no free slots" : powodPl;
