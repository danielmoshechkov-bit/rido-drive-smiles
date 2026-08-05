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
};

/** Dziewięć ostatnich cyfr — znosi prefiksy, spacje i myślniki. */
export const normalizePhone = (value: string | null | undefined): string =>
  (value || "").replace(/\D/g, "").slice(-9);

/** Rejestracja bez spacji i wielkością liter znormalizowaną. */
export const normalizePlate = (value: string | null | undefined): string =>
  (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const firstNonEmpty = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (trimmed) return trimmed;
  }
  return null;
};

export const reconcileCall = (input: ReconcileInput): ReconcileResult => {
  const { extracted, callerId, clientsByPhone, vehiclesByPlate } = input;

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
  };
};

/**
 * Czy rozmowa nadaje się do zapisu.
 *
 * ZASADA 9: to jedyne miejsce, które może wstrzymać commit — i wyłącznie wtedy,
 * gdy zapisu NIE DA SIĘ wykonać. Nigdy „bo nazwisko brzmi dziwnie".
 */
export const missingForCommit = (extracted: ExtractedCall, phone: string | null): string[] => {
  const missing: string[] = [];
  if (!extracted.date) missing.push("termin: brak daty");
  if (!extracted.time) missing.push("termin: brak godziny");
  if (!phone) missing.push("brak numeru telefonu (ani z sygnalizacji, ani z rozmowy)");
  return missing;
};
