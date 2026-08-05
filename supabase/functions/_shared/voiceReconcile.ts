// ============================================================================
// voiceReconcile — dopasowanie danych z rozmowy do tego, co już jest w bazie.
//
// ZASADA 9: dopasowanie POPRAWIA dane, nigdy nie WSTRZYMUJE zapisu.
//
// Powód, dla którego ten moduł w ogóle istnieje — pięć rozmów testowych,
// pięć różnych wersji tego samego nazwiska z ASR:
//   Macioskowski · Mosleczko · Noszeczkow · Moszeczkow · Mosaczkowski
// oraz dwa błędne numery telefonu z pięciu ("12194747458", "12 919 474 583").
// `system__caller_id` pochodzi z sygnalizacji SIP i jest FAKTEM, nie zgadywanką
// modelu — dlatego ma pierwszeństwo nad wszystkim, co usłyszał ASR.
//
// Moduł jest CZYSTY: bez sieci i bez bazy. Dane wejściowe podaje wołający.
// Dzięki temu daje się przetestować offline na zapisanych transkryptach.
// ============================================================================

export type ExtractedCall = {
  complaint: string | null;
  date: string | null;
  time: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  brand: string | null;
  model: string | null;
  plate: string | null;
};

export type KnownClient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

export type KnownVehicle = {
  id: string;
  owner_client_id: string | null;
  brand: string | null;
  model: string | null;
  plate: string | null;
};

export type ReconcileInput = {
  extracted: ExtractedCall;
  /** Z sygnalizacji SIP (system__caller_id). Fakt, nie ASR. */
  callerId: string | null;
  /** Kandydaci wyszukani po znormalizowanym telefonie. */
  clientsByPhone: KnownClient[];
  /** Kandydaci wyszukani po znormalizowanej rejestracji. */
  vehiclesByPlate: KnownVehicle[];
  /** Wszystkie pojazdy tenanta — do wykrycia rejestracji podobnej, nie identycznej. */
  allVehicles?: Array<{ id: string; plate: string | null }>;
};

export type ReconcileResult = {
  clientId: string | null;
  vehicleId: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  brand: string | null;
  model: string | null;
  plate: string | null;
  /** Czym się kierowaliśmy — do wyświetlenia obsłudze i do diagnostyki. */
  clientSource: "by_caller_id" | "by_asr_phone" | "by_vehicle_owner" | "new" | "none";
  vehicleSource: "by_plate" | "new" | "none";
  /** Sprzeczność, którą zapisujemy mimo wszystko (zasada 9). */
  needsReview: boolean;
  reviewReason: string | null;
  /** Rejestracja nie przeszła walidacji formatu — agent powinien dopytać. */
  plateSuspicious: boolean;
  /** Podobne rejestracje z bazy. Do DOPYTANIA, nigdy do automatycznego scalenia. */
  plateCandidates: PlateCandidate[];
};

/** Dziewięć ostatnich cyfr — znosi prefiksy, spacje i myślniki. */
export const normalizePhone = (value: string | null | undefined): string =>
  (value || "").replace(/\D/g, "").slice(-9);

/** Rejestracja bez spacji i wielkością liter znormalizowaną. */
export const normalizePlate = (value: string | null | undefined): string =>
  (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// ---------------------------------------------------------------------------
// REJESTRACJA JAKO GŁÓWNY IDENTYFIKATOR POJAZDU
//
// Nazwisko wypada z sekwencji, więc pojazd rozpoznajemy po rejestracji — a ta
// przychodzi z ASR. Rozmowa 05.08 20:40 dała "Bamboo Exchange" zamiast "BMW X5",
// więc na przekręcenia trzeba być przygotowanym również tutaj.
// ---------------------------------------------------------------------------

/**
 * Polskie tablice po normalizacji: 1-3 litery wyróżnika, potem 4-5 znaków
 * alfanumerycznych. Celowo permisywne — tablice indywidualne i zabytkowe łamią
 * węższe wzorce, a my chcemy odrzucać śmieci z ASR, nie nietypowe rejestracje.
 */
export const isPlausiblePlate = (plate: string): boolean =>
  /^[A-Z]{1,3}[A-Z0-9]{4,5}$/.test(plate) && plate.length >= 5 && plate.length <= 8;

/**
 * Pary, które ASR i ludzkie ucho mylą najczęściej. Sprowadzamy każdą do jednego
 * przedstawiciela, żeby "WY996EU" i "WY99GEU" dały tę samą postać kanoniczną.
 */
const CONFUSABLE: Record<string, string> = {
  O: "0", I: "1", L: "1", B: "8", S: "5", Z: "2", G: "6", Q: "0", D: "0",
};

/** Postać kanoniczna do PORÓWNAŃ. Nigdy nie zapisujemy jej do bazy. */
export const plateFingerprint = (plate: string): string =>
  normalizePlate(plate).split("").map((c) => CONFUSABLE[c] ?? c).join("");

/** Odległość edycyjna z wczesnym wyjściem — interesuje nas tylko 0 albo 1. */
const editDistanceAtMostOne = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
};

export type PlateCandidate = { plate: string; vehicleId: string; reason: "confusable" | "typo" };

/**
 * Rejestracje z bazy podobne do usłyszanej — do DOPYTANIA, nie do scalenia.
 *
 * Automatyczne scalenie przypisałoby wizytę do cudzego auta. Zwracamy kandydatów
 * i zostawiamy decyzję: w rozmowie agentowi, po rozmowie obsłudze.
 */
export const findSimilarPlates = (
  plate: string,
  known: Array<{ id: string; plate: string | null }>,
): PlateCandidate[] => {
  const target = normalizePlate(plate);
  if (!target) return [];
  const targetPrint = plateFingerprint(target);
  const out: PlateCandidate[] = [];
  for (const row of known) {
    const candidate = normalizePlate(row.plate);
    if (!candidate || candidate === target) continue;
    if (plateFingerprint(candidate) === targetPrint) {
      out.push({ plate: candidate, vehicleId: row.id, reason: "confusable" });
    } else if (editDistanceAtMostOne(candidate, target)) {
      out.push({ plate: candidate, vehicleId: row.id, reason: "typo" });
    }
  }
  return out;
};

const firstNonEmpty = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (trimmed) return trimmed;
  }
  return null;
};

export const reconcileCall = (input: ReconcileInput): ReconcileResult => {
  const { extracted, callerId, clientsByPhone, vehiclesByPlate, allVehicles } = input;

  // Telefon: numer z sygnalizacji SIP bije to, co usłyszał ASR. Gdy go nie ma
  // (rozmowa z panelu, numer zastrzeżony) — zostaje wersja z rozmowy.
  const callerNorm = normalizePhone(callerId);
  const asrNorm = normalizePhone(extracted.phone);
  const phone = callerNorm || asrNorm || null;

  // Pojazd po rejestracji. Rejestracja jest krótka i literowana, więc myli się
  // rzadziej niż nazwisko — a przypisany do niej pojazd niesie markę, model
  // i właściciela prosto z bazy.
  const plateNorm = normalizePlate(extracted.plate);
  const vehicle = plateNorm
    ? vehiclesByPlate.find((v) => normalizePlate(v.plate) === plateNorm) || null
    : null;

  // Klient po numerze. Najpierw po tym z sygnalizacji, potem po tym z ASR.
  const byCaller = callerNorm
    ? clientsByPhone.find((c) => normalizePhone(c.phone) === callerNorm) || null
    : null;
  const byAsr = !byCaller && asrNorm
    ? clientsByPhone.find((c) => normalizePhone(c.phone) === asrNorm) || null
    : null;

  let client: KnownClient | null = byCaller || byAsr;
  let clientSource: ReconcileResult["clientSource"] = byCaller
    ? "by_caller_id"
    : byAsr
    ? "by_asr_phone"
    : "none";

  let needsReview = false;
  let reviewReason: string | null = null;

  // PRZYPADEK (c) ze specyfikacji: rejestracja wskazuje pojazd znanego klienta,
  // ale telefon się nie zgadza. Dane pojazdu wygrywają — bo rejestracja jest
  // pewniejsza niż numer podyktowany głosem — ale wiersz idzie do sprawdzenia.
  // ZAPISUJEMY MIMO TO. Kolejka weryfikacji jest dla rozmów, których NIE DA SIĘ
  // zapisać, a nie dla danych, które wyglądają dziwnie.
  if (vehicle?.owner_client_id && (!client || client.id !== vehicle.owner_client_id)) {
    if (client) {
      needsReview = true;
      reviewReason = "Numer telefonu wskazuje innego klienta niż właściciel pojazdu o tej rejestracji.";
    }
    client = client && client.id === vehicle.owner_client_id
      ? client
      : { id: vehicle.owner_client_id, first_name: null, last_name: null, phone: null };
    clientSource = "by_vehicle_owner";
  }

  if (!client) clientSource = "new";

  // Imię i nazwisko: baza przed ASR, bo ASR mylił nazwisko w pięciu rozmowach
  // na pięć. Gdy klienta nie znamy — zostaje wersja z rozmowy (przypadek d).
  const firstName = firstNonEmpty(client?.first_name, extracted.first_name);
  const lastName = firstNonEmpty(client?.last_name, extracted.last_name);

  // Marka i model: z bazy, gdy pojazd rozpoznany. Inaczej z rozmowy.
  const brand = firstNonEmpty(vehicle?.brand, extracted.brand);
  const model = firstNonEmpty(vehicle?.model, extracted.model);

  // Rejestracja niezgodna z formatem polskich tablic albo podobna do istniejącej —
  // agent ma dopytać, a nie zgadywać. Scalanie zostawiamy człowiekowi.
  const plateSuspicious = !!plateNorm && !isPlausiblePlate(plateNorm);
  const plateCandidates = !vehicle && plateNorm && allVehicles?.length
    ? findSimilarPlates(plateNorm, allVehicles)
    : [];

  return {
    clientId: client?.id || null,
    vehicleId: vehicle?.id || null,
    firstName,
    lastName,
    phone,
    brand,
    model,
    plate: plateNorm || null,
    clientSource,
    vehicleSource: vehicle ? "by_plate" : plateNorm ? "new" : "none",
    needsReview,
    reviewReason,
    plateSuspicious,
    plateCandidates,
  };
};

/**
 * Czy rozmowa nadaje się do zapisu.
 *
 * ZASADA 9: to jedyne miejsce, które może wstrzymać commit — i wyłącznie wtedy,
 * gdy zapisu NIE DA SIĘ wykonać. Nigdy „bo nazwisko brzmi dziwnie".
 */
export const missingForCommit = (extracted: ExtractedCall, phone: string | null): string[] => {
  // NAZWISKO NIE JEST WYMAGANE. Agent o nie nie pyta — ASR dał pięć różnych wersji
  // w pięciu rozmowach ("Wandym Oszadkow", "Mosaczkowski", "Noszeczkow", "Mosleczko",
  // "Moseczkow"), a identyfikacja i tak idzie po telefonie i rejestracji.
  // Przy dopasowaniu nazwisko uzupełnia się z bazy; dla nowego klienta zostaje puste.
  const missing: string[] = [];
  if (!extracted.date) missing.push("termin: brak daty");
  if (!extracted.time) missing.push("termin: brak godziny");
  if (!phone) missing.push("brak numeru telefonu (ani z sygnalizacji, ani z rozmowy)");
  return missing;
};
