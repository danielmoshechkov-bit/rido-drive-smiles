// ============================================================================
// voiceLearningGate — CO WOLNO ZAPISAĆ DO BAZY WIEDZY I Z CZEGO WOLNO SIĘ UCZYĆ.
//
// Powstało z dwóch incydentów z 06.08, obu w tym samym miejscu:
// `voice_agent_knowledge` jest wstrzykiwana do promptu KAŻDEJ rozmowy
// (RPC get_voice_context: is_active = true, LIMIT 10), a panel jej nie pokazuje.
//
// INCYDENT 1 — DANE OSOBOWE W PROMPCIE.
//   Trzy aktywne wpisy zawierały dane prawdziwych klientów: tablicę rejestracyjną,
//   fragment numeru telefonu i imię. Każdy klient tego warsztatu dostawał je
//   w prompcie swojej rozmowy. Destylator nie miał żadnego filtru.
//
// INCYDENT 2 — PRZYKŁAD STAŁ SIĘ WARTOŚCIĄ (zasada 22).
//   Wpis podawał przykład „Mamy dostępne 9:00, 11:00 lub 14:00". Agent wyrecytował
//   te godziny jako realną dostępność 38 sekund przed jakimkolwiek sprawdzeniem
//   grafiku, klientce, która prosiła o zupełnie inny dzień.
//
// INCYDENT 3 — UCZENIE Z NIEUDANEJ ROZMOWY.
//   Rozmowa qrgbn9cy skończyła się rozłączeniem klientki bez żadnego zapisu,
//   a destylator zrobił z niej trzy zalecenia — w tym „mogę połączyć Pana z kolegą
//   mówiącym po ukraińsku", czyli obietnicę, której nie realizujemy.
//   Uczymy się z rozmów UDANYCH. Z nieudanych uczy się człowiek, przez przegląd.
//
// Moduł jest CZYSTY — bez sieci i bez bazy, żeby dało się go przetestować offline.
// ============================================================================

/** Placeholder pokazuje FORMĘ, nie treść — o to chodzi w zasadzie 22. */
const P = {
  phone: "[numer telefonu]",
  plate: "[nr rejestracyjny]",
  vin: "[VIN]",
  email: "[e-mail]",
  name: "[imię]",
  time: "[godzina]",
  date: "[data]",
  money: "[kwota]",
};

/** Liczebniki, którymi model zapisuje numer telefonu słownie — tak trafił do bazy. */
const LICZEBNIKI = [
  "zero", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć",
  "dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście", "piętnaście",
  "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście", "dwadzieścia",
  "trzydzieści", "czterdzieści", "pięćdziesiąt", "sześćdziesiąt", "siedemdziesiąt",
  "osiemdziesiąt", "dziewięćdziesiąt", "sto", "dwieście", "trzysta", "czterysta",
  "pięćset", "sześćset", "siedemset", "osiemset", "dziewięćset",
];

const MIESIACE = "stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia";

/**
 * Usuwa z tekstu dane osobowe i konkretne wartości, zostawiając formę.
 *
 * Świadomie AGRESYWNA: fałszywy placeholder w regule uczącej jest nieszkodliwy,
 * a przeoczony numer telefonu trafia do promptu każdego klienta. Przy wątpliwości
 * zamieniamy.
 */
export const redactPersonalData = (input: string): string => {
  if (!input) return input;
  let t = input;

  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, P.email);
  t = t.replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, P.vin);

  // Telefon cyframi: 519474583, 519-474-583, 519 474 583, +48…
  t = t.replace(/(?:\+?48[\s-]?)?\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g, P.phone);

  // Telefon słownie: ciąg co najmniej czterech liczebników pod rząd.
  //
  // SORTOWANIE PO DŁUGOŚCI JEST OBOWIĄZKOWE. Alternatywa w regexie bierze
  // PIERWSZY pasujący wariant, nie najdłuższy — bez sortowania „pięć" wygrywa
  // z „pięćset" i zostaje sierota: „[numer telefonu]set osiemdziesiąt trzy".
  // Złapane na prawdziwym wpisie z bazy, nie w teście wymyślonym.
  const lb = [...LICZEBNIKI].sort((a, b) => b.length - a.length).join("|");
  t = t.replace(
    new RegExp(`\\b(?:${lb})(?:[\\s,]+(?:${lb})){3,}\\b`, "gi"),
    P.phone,
  );

  // Tablica rejestracyjna: 2-3 litery + 4-5 znaków alfanumerycznych z cyfrą.
  t = t.replace(/\b[A-Z]{2,3}\s?(?=[A-Z0-9]{4,6}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{4,6}\b/g, P.plate);

  // Godzina — serce zasady 22.
  t = t.replace(/\b\d{1,2}[:.]\d{2}\b/g, P.time);
  t = t.replace(/\bo\s+(?:pierwszej|drugiej|trzeciej|czwartej|piątej|szóstej|siódmej|ósmej|dziewiątej|dziesiątej|jedenastej|dwunastej|trzynastej|czternastej|piętnastej|szesnastej|siedemnastej|osiemnastej)\b/gi, `o ${P.time}`);

  // Data dzienna: „7 sierpnia", „siedemnastego czerwca", „2026-08-07", „07.08.2026".
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, P.date);
  t = t.replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, P.date);
  t = t.replace(new RegExp(`\\b\\d{1,2}\\s+(?:${MIESIACE})(?:\\s+\\d{4})?\\b`, "gi"), P.date);
  // Liczebnik porządkowy słownie: „siedemnastego czerwca", „szóstego sierpnia".
  // `\w` bez flagi `u` NIE obejmuje polskich liter, więc „szóstego" łapało się
  // od „stego" i zostawało „szó[data]". Klasa znaków jest tu wypisana wprost.
  t = t.replace(new RegExp(`[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+ego\\s+(?:${MIESIACE})`, "gi"), P.date);

  // Kwota. Bez `\b` na końcu: w JS bez flagi `u` litera „ł" nie jest znakiem
  // słownym, więc granica po „zł" nigdy by nie zadziałała.
  t = t.replace(/\b\d+(?:[.,]\d+)?\s*(?:złotych|złote|zł|PLN)/gi, P.money);

  // Imię i nazwisko razem — „Daniel Moshechkov". Bez tego przeżywało redakcję,
  // bo nie stoi w wołaczu po „Panie". Warunek: druga część ma końcówkę typową
  // dla nazwiska, żeby nie zjadać nazw marek („Toyota Corolla") ani miast.
  t = t.replace(
    /\b[A-ZŁŚŻŹĆŃÓĄĘ][a-ząćęłńóśźż]+\s+[A-ZŁŚŻŹĆŃÓĄĘ][a-ząćęłńóśźż]*(?:ski|cki|dzki|wicz|czyk|czak|kow|ków|ov|ova|owa|yna)\b/g,
    P.name,
  );

  // Imię w wołaczu — „Panie Danielu", „Pani Anno".
  t = t.replace(/\bPan(?:ie|i|u)\s+[A-ZŁŚŻŹĆŃÓĄĘ][a-ząćęłńóśźż]+/g, (m) => m.split(/\s+/)[0] + " " + P.name);

  return t;
};

/** Czy tekst nadal zawiera coś, co wygląda na dane osobowe albo konkret. */
export const hasPersonalData = (input: string): boolean =>
  redactPersonalData(input) !== input;

export type CallFacts = {
  /** Czy rozmowa dała zapis (zlecenie). Brak zapisu = rozmowa nieudana. */
  hasOrder: boolean;
  /** Długość rozmowy w sekundach. */
  durationSeconds: number;
  /** Czy w rozmowie doszło do ucięcia odpowiedzi modelu (`output_truncated`). */
  hadTruncation: boolean;
  /** Wypowiedzi agenta — do wykrycia przeprosin. */
  agentMessages: string[];
  /** Powód zakończenia z ElevenLabs, jeśli znany. */
  terminationReason?: string | null;
};

export type GateVerdict = {
  /** Czy wolno zapisać reguły do bazy wiedzy. */
  allow: boolean;
  /** Czy rozmowa ma trafić do przeglądu człowieka. */
  flagForReview: boolean;
  /** Powody — trafiają do logu, żeby dało się to później policzyć. */
  reasons: string[];
};

// UWAGA NA ZAKRES: łapiemy przeprosiny za NASZĄ USTERKĘ, nie za uprzejmość.
//
// Pierwsza wersja miała tu gołe `\bprzepraszam\b` i test na 21 prawdziwych
// rozmowach odrzucił CZTERY UDANE (z zapisem, 111-315 s) za zdania w rodzaju
// „Przepraszam, nie dosłyszałam — czy chodzi o numer rejestracyjny?" albo
// „Przepraszam, nie znam tej marki". To normalna rozmowa, nie awaria.
//
// Zbyt szeroki filtr jest równie szkodliwy jak jego brak: odcina uczenie
// od rozmów, które poszły dobrze, i robi to po cichu.
const PRZEPROSINY = /nie zdążyłem dokończyć|muszę się streścić|problem techniczny|chwilowy problem|straci[łl](?:e|a)m wątek|wystąpił błąd|nie udało mi się/i;

/**
 * BRAMKA: z czego wolno destylować reguły.
 *
 * Uczymy się z rozmów UDANYCH. Rozmowa nieudana nie jest wzorcem do naśladowania —
 * jest materiałem do przeglądu przez człowieka.
 */
export const shouldDistill = (facts: CallFacts): GateVerdict => {
  const reasons: string[] = [];

  if (!facts.hasOrder) reasons.push("brak zapisu (rozmowa nie dała zlecenia)");
  if (facts.durationSeconds < 30) reasons.push(`rozmowa krótsza niż 30 s (${facts.durationSeconds} s)`);
  if (facts.hadTruncation) reasons.push("odpowiedź modelu została ucięta (output_truncated)");

  const przeprosil = facts.agentMessages.some((m) => PRZEPROSINY.test(m || ""));
  if (przeprosil) reasons.push("agent przepraszał — do przeglądu, nie do destylacji");

  return {
    allow: reasons.length === 0,
    // Rozmowa z przeprosinami albo z ucięciem niesie informację, tylko nie w formie
    // zalecenia dla modelu. Człowiek ma ją zobaczyć.
    flagForReview: przeprosil || facts.hadTruncation || (!facts.hasOrder && facts.durationSeconds >= 30),
    reasons,
  };
};
