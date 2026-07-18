/**
 * Iteracja 2 — słownik cech dodatkowych ogłoszeń nieruchomości.
 *
 * ŹRÓDŁO PRAWDY dla:
 *  - kolumny `real_estate_listings.attributes` (jsonb)
 *  - generowania UI filtrów zaawansowanych
 *  - walidacji zapisu (nieznany klucz → błąd)
 *
 * Zasady:
 *  - klucze: snake_case, po angielsku, bez ogonków — nigdy nie renderowane
 *  - etykiety PL osobno (`labelPl`)
 *  - `appliesTo` = do których property_type z bazy dana cecha ma sens
 *    (pusta = wszystkie)
 *  - `type = 'bool'` → wartość w attributes to `true` (obecność klucza = ma cechę)
 *  - `type = 'enum'` → jedna z `values`
 *  - `type = 'multi'` → tablica wartości z `values`
 *
 * NIE przenosimy tu pól, które już są kolumnami (price, area, rooms, floor,
 * build_year, has_balcony, has_elevator, has_parking, has_garden, lat/lng).
 * Attributes to długi ogon boolean/enum/multi.
 */

// Wartości property_type z bazy — musi się zgadzać z rzeczywistymi wartościami
// w kolumnie real_estate_listings.property_type. Sprawdzone zapytaniem:
//   SELECT DISTINCT property_type FROM real_estate_listings;
export type PropertyTypeDb =
  | "mieszkanie"
  | "dom"
  | "dzialka"
  | "lokal"
  | "lokal-uzytkowy"
  | "hala-magazyn"
  | "pokoj"
  | "kawalerka"
  | "rynek-pierwotny";

export type AttributeType = "bool" | "enum" | "multi";

export interface AttributeDefinition {
  /** klucz w jsonb; snake_case, EN, bez ogonków */
  key: string;
  /** etykieta pokazywana w UI (PL) */
  labelPl: string;
  type: AttributeType;
  /** dozwolone wartości dla enum/multi; klucz technicznyi + PL label */
  values?: Array<{ value: string; labelPl: string }>;
  /** grupa w UI filtrów (nagłówek accordionu) */
  group: "amenities" | "building" | "finishing" | "utilities" | "policy";
  /** puste = dotyczy wszystkich typów nieruchomości */
  appliesTo?: PropertyTypeDb[];
}

const RESIDENTIAL: PropertyTypeDb[] = ["mieszkanie", "dom", "kawalerka", "pokoj", "rynek-pierwotny"];
const COMMERCIAL: PropertyTypeDb[] = ["lokal", "lokal-uzytkowy", "hala-magazyn"];

export const LISTING_ATTRIBUTES: readonly AttributeDefinition[] = [
  // --- amenities (uzupełnienie do istniejących kolumn has_*) ---
  { key: "terrace", labelPl: "Taras", type: "bool", group: "amenities" },
  { key: "loggia", labelPl: "Loggia", type: "bool", group: "amenities", appliesTo: RESIDENTIAL },
  { key: "basement", labelPl: "Piwnica", type: "bool", group: "amenities", appliesTo: RESIDENTIAL },
  { key: "garage", labelPl: "Garaż", type: "bool", group: "amenities" },
  { key: "parking_spot", labelPl: "Miejsce parkingowe", type: "bool", group: "amenities" },
  { key: "storage_room", labelPl: "Komórka lokatorska", type: "bool", group: "amenities", appliesTo: RESIDENTIAL },
  { key: "guarded", labelPl: "Osiedle zamknięte / ochrona", type: "bool", group: "amenities" },

  // --- building ---
  {
    key: "building_material",
    labelPl: "Materiał budynku",
    type: "enum",
    group: "building",
    appliesTo: RESIDENTIAL,
    values: [
      { value: "brick", labelPl: "Cegła" },
      { value: "concrete_slab", labelPl: "Wielka płyta" },
      { value: "aerated_concrete", labelPl: "Beton komórkowy" },
      { value: "silikat", labelPl: "Silikat" },
      { value: "wood", labelPl: "Drewno" },
      { value: "other", labelPl: "Inny" },
    ],
  },
  {
    key: "windows",
    labelPl: "Okna",
    type: "enum",
    group: "building",
    values: [
      { value: "pvc", labelPl: "PCV" },
      { value: "wood", labelPl: "Drewniane" },
      { value: "aluminium", labelPl: "Aluminiowe" },
    ],
  },

  // --- finishing ---
  {
    key: "finishing_state",
    labelPl: "Stan wykończenia",
    type: "enum",
    group: "finishing",
    values: [
      { value: "to_finish", labelPl: "Do wykończenia" },
      { value: "to_renovate", labelPl: "Do remontu" },
      { value: "good", labelPl: "Dobry" },
      { value: "very_good", labelPl: "Bardzo dobry" },
      { value: "high_standard", labelPl: "Wysoki standard" },
    ],
  },
  {
    key: "ownership_form",
    labelPl: "Forma własności",
    type: "enum",
    group: "finishing",
    values: [
      { value: "full_ownership", labelPl: "Pełna własność" },
      { value: "cooperative_ownership", labelPl: "Spółdzielcze własnościowe" },
      { value: "cooperative_lease", labelPl: "Spółdzielcze lokatorskie" },
      { value: "share", labelPl: "Udział" },
    ],
  },
  {
    key: "furnishing",
    labelPl: "Wyposażenie",
    type: "multi",
    group: "finishing",
    appliesTo: RESIDENTIAL,
    values: [
      { value: "furniture", labelPl: "Umeblowane" },
      { value: "kitchen_furniture", labelPl: "Meble kuchenne" },
      { value: "washer", labelPl: "Pralka" },
      { value: "dishwasher", labelPl: "Zmywarka" },
      { value: "fridge", labelPl: "Lodówka" },
      { value: "oven", labelPl: "Piekarnik" },
      { value: "tv", labelPl: "TV" },
      { value: "internet", labelPl: "Internet" },
      { value: "air_conditioning", labelPl: "Klimatyzacja" },
    ],
  },

  // --- utilities ---
  {
    key: "heating",
    labelPl: "Ogrzewanie",
    type: "enum",
    group: "utilities",
    values: [
      { value: "urban", labelPl: "Miejskie" },
      { value: "gas", labelPl: "Gazowe" },
      { value: "electric", labelPl: "Elektryczne" },
      { value: "heat_pump", labelPl: "Pompa ciepła" },
      { value: "solid_fuel", labelPl: "Piec / kominek" },
      { value: "other", labelPl: "Inne" },
    ],
  },
  {
    key: "media",
    labelPl: "Media",
    type: "multi",
    group: "utilities",
    values: [
      { value: "electricity", labelPl: "Prąd" },
      { value: "water", labelPl: "Woda" },
      { value: "gas", labelPl: "Gaz" },
      { value: "sewage", labelPl: "Kanalizacja" },
      { value: "septic_tank", labelPl: "Szambo" },
      { value: "fiber", labelPl: "Światłowód" },
    ],
  },

  // --- policy (najem) ---
  {
    key: "pets_allowed",
    labelPl: "Zwierzęta dozwolone",
    type: "bool",
    group: "policy",
    appliesTo: RESIDENTIAL,
  },
  {
    key: "for_students",
    labelPl: "Dla studentów",
    type: "bool",
    group: "policy",
    appliesTo: RESIDENTIAL,
  },
  {
    key: "for_companies",
    labelPl: "Dla firm",
    type: "bool",
    group: "policy",
    appliesTo: RESIDENTIAL,
  },
] as const;

export const ATTRIBUTE_MAP: Readonly<Record<string, AttributeDefinition>> = Object.freeze(
  Object.fromEntries(LISTING_ATTRIBUTES.map((a) => [a.key, a])),
);

export const ATTRIBUTE_GROUPS: Record<AttributeDefinition["group"], string> = {
  amenities: "Udogodnienia",
  building: "Budynek",
  finishing: "Wykończenie i własność",
  utilities: "Media i ogrzewanie",
  policy: "Zasady najmu",
};

/**
 * Filtry, które w UI mają sens dla danego typu nieruchomości.
 * `null` = brak filtru po typie → pokazujemy wszystko.
 */
export function attributesForType(propertyType: PropertyTypeDb | null): readonly AttributeDefinition[] {
  if (!propertyType) return LISTING_ATTRIBUTES;
  return LISTING_ATTRIBUTES.filter((a) => !a.appliesTo || a.appliesTo.includes(propertyType));
}

// ---------- Walidacja ----------

export class UnknownAttributeError extends Error {
  constructor(public readonly key: string) {
    super(`Nieznany klucz attribute: "${key}". Dodaj definicję w src/lib/listing-attributes.ts.`);
  }
}

export class InvalidAttributeValueError extends Error {
  constructor(public readonly key: string, public readonly value: unknown) {
    super(`Nieprawidłowa wartość dla attribute "${key}": ${JSON.stringify(value)}`);
  }
}

/**
 * Waliduje obiekt attributes przed zapisem do bazy.
 * Rzuca dla nieznanych kluczy — nie chowamy błędów w bazie.
 */
export function validateAttributes(input: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const def = ATTRIBUTE_MAP[key];
    if (!def) throw new UnknownAttributeError(key);
    if (value === null || value === undefined || value === false || (Array.isArray(value) && value.length === 0)) {
      continue; // pusto = nie zapisujemy
    }
    if (def.type === "bool") {
      if (value !== true) throw new InvalidAttributeValueError(key, value);
      clean[key] = true;
    } else if (def.type === "enum") {
      if (typeof value !== "string" || !def.values?.some((v) => v.value === value)) {
        throw new InvalidAttributeValueError(key, value);
      }
      clean[key] = value;
    } else if (def.type === "multi") {
      if (!Array.isArray(value)) throw new InvalidAttributeValueError(key, value);
      const allowed = new Set(def.values?.map((v) => v.value) ?? []);
      for (const v of value) if (typeof v !== "string" || !allowed.has(v)) throw new InvalidAttributeValueError(key, v);
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Sprawdza czy pojedyncze ogłoszenie pasuje do wybranego zestawu filtrów.
 *
 * ZASADA (iter. 2 review): brak klucza w attributes = "nie wiem", NIE "nie ma".
 * Oferta bez wypełnionego attributes PRZECHODZI filtry — sortujemy ją niżej
 * przez `attributeMatchScore()`. Dzięki temu włączenie checkboxa nie zeruje
 * listy 296 istniejących ofert z pustym {}.
 * Wyjątek: enum-y z jawnie sprzeczną wartością filtrujemy twardo.
 */
export function listingMatchesAttributes(
  listingAttrs: Record<string, unknown> | null | undefined,
  selected: Record<string, unknown>,
): boolean {
  const attrs = listingAttrs ?? {};
  for (const [key, want] of Object.entries(selected)) {
    const have = (attrs as Record<string, unknown>)[key];
    if (have === undefined || have === null) continue; // "nie wiem" — nie odrzucamy

    if (Array.isArray(want)) {
      if (!Array.isArray(have)) return false;
      const haveSet = new Set(have as string[]);
      for (const w of want) if (!haveSet.has(w as string)) return false;
    } else if (typeof want === "boolean") {
      if (want && have !== true) return false;
    } else {
      if (have !== want) return false;
    }
  }
  return true;
}

/**
 * Ile z wybranych cech oferta ma UDOKUMENTOWANE. Używane do sortowania —
 * puste 296 ofert lądują na dole, ale nie znikają.
 */
export function attributeMatchScore(
  listingAttrs: Record<string, unknown> | null | undefined,
  selected: Record<string, unknown>,
): number {
  const attrs = listingAttrs ?? {};
  let score = 0;
  for (const key of Object.keys(selected)) {
    const have = (attrs as Record<string, unknown>)[key];
    if (have !== undefined && have !== null && have !== false) score += 1;
  }
  return score;
}
