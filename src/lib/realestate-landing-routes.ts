/**
 * Iteracja 2 — mapowanie slugów landing-page nieruchomości ↔ wartości z bazy.
 *
 * ŹRÓDŁO PRAWDY: kolumny `real_estate_listings.property_type` i
 * `real_estate_listings.transaction_type` — obie po polsku, w kebab-case
 * (np. `lokal-uzytkowy`, `wynajem-krotkoterminowy`).
 *
 * Slugi landing-page też są po polsku dla SEO, ale w liczbie mnogiej
 * (`mieszkania`, `domy`, `lokale`) — mapowanie w jednym miejscu.
 *
 * KOMBINACJE: pokazujemy landing TYLKO dla par typ+transakcja, które
 * mają realne oferty w bazie (patrz `REAL_ESTATE_LANDING_COMBOS`).
 * Puste landingi = tysiące pustych stron = kara od Google.
 * Listę aktualizujemy okresowo cronem, na razie hard-coded z ostatniego
 * zapytania:
 *   SELECT property_type, transaction_type, COUNT(*)
 *   FROM real_estate_listings GROUP BY 1,2 ORDER BY 3 DESC;
 */

import type { PropertyTypeDb } from "./listing-attributes";

export type TransactionTypeDb = "sprzedaz" | "wynajem" | "wynajem-krotkoterminowy";

// ---------- Property type slug ↔ DB ----------

export const PROPERTY_TYPE_SLUG_TO_DB: Record<string, PropertyTypeDb> = {
  mieszkania: "mieszkanie",
  domy: "dom",
  dzialki: "dzialka",
  lokale: "lokal",
  "lokale-uzytkowe": "lokal-uzytkowy",
  "hale-magazyny": "hala-magazyn",
  pokoje: "pokoj",
  kawalerki: "kawalerka",
  "rynek-pierwotny": "rynek-pierwotny",
};

export const PROPERTY_TYPE_DB_TO_SLUG: Record<PropertyTypeDb, string> = Object.fromEntries(
  Object.entries(PROPERTY_TYPE_SLUG_TO_DB).map(([slug, db]) => [db, slug]),
) as Record<PropertyTypeDb, string>;

export const PROPERTY_TYPE_LABEL_PL: Record<PropertyTypeDb, string> = {
  mieszkanie: "Mieszkania",
  dom: "Domy",
  dzialka: "Działki",
  lokal: "Lokale",
  "lokal-uzytkowy": "Lokale użytkowe",
  "hala-magazyn": "Hale i magazyny",
  pokoj: "Pokoje",
  kawalerka: "Kawalerki",
  "rynek-pierwotny": "Rynek pierwotny",
};

// ---------- Transaction type slug ↔ DB ----------

export const TRANSACTION_SLUG_TO_DB: Record<string, TransactionTypeDb> = {
  sprzedaz: "sprzedaz",
  wynajem: "wynajem",
  krotkoterminowy: "wynajem-krotkoterminowy",
};

export const TRANSACTION_DB_TO_SLUG: Record<TransactionTypeDb, string> = Object.fromEntries(
  Object.entries(TRANSACTION_SLUG_TO_DB).map(([slug, db]) => [db, slug]),
) as Record<TransactionTypeDb, string>;

export const TRANSACTION_LABEL_PL: Record<TransactionTypeDb, string> = {
  sprzedaz: "Na sprzedaż",
  wynajem: "Na wynajem",
  "wynajem-krotkoterminowy": "Wynajem krótkoterminowy",
};

// ---------- Realne kombinacje w bazie ----------
// Ostatnia aktualizacja: 2026-07 (10 kombinacji, min. 1 oferta).
// Kolejność wg liczności — używane przez sitemap generator.
export const REAL_ESTATE_LANDING_COMBOS: ReadonlyArray<{
  type: PropertyTypeDb;
  transaction: TransactionTypeDb;
}> = [
  { type: "lokal", transaction: "wynajem" },
  { type: "hala-magazyn", transaction: "wynajem" },
  { type: "lokal-uzytkowy", transaction: "wynajem" },
  { type: "dom", transaction: "sprzedaz" },
  { type: "lokal", transaction: "sprzedaz" },
  { type: "dom", transaction: "wynajem" },
  { type: "mieszkanie", transaction: "sprzedaz" },
  { type: "mieszkanie", transaction: "wynajem" },
  { type: "dzialka", transaction: "sprzedaz" },
  { type: "hala-magazyn", transaction: "sprzedaz" },
];

export function isValidLandingCombo(type: PropertyTypeDb, transaction: TransactionTypeDb): boolean {
  return REAL_ESTATE_LANDING_COMBOS.some((c) => c.type === type && c.transaction === transaction);
}

// ---------- Parser URL → filtry ----------

export interface RealEstateLandingParams {
  propertyType: PropertyTypeDb | null;
  transactionType: TransactionTypeDb | null;
  city: string | null;
}

/**
 * Zamienia parametry route (:typ/:transakcja?/:lokalizacja?) na obiekt filtrów
 * lub `null`, jeśli slug nie mapuje się na realną wartość w bazie.
 */
export function parseLandingParams(
  typSlug: string | undefined,
  transakcjaSlug: string | undefined,
  lokalizacjaSlug: string | undefined,
): RealEstateLandingParams | null {
  const propertyType = typSlug ? PROPERTY_TYPE_SLUG_TO_DB[typSlug] ?? null : null;
  if (typSlug && !propertyType) return null;

  const transactionType = transakcjaSlug ? TRANSACTION_SLUG_TO_DB[transakcjaSlug] ?? null : null;
  if (transakcjaSlug && !transactionType) return null;

  if (propertyType && transactionType && !isValidLandingCombo(propertyType, transactionType)) {
    return null;
  }

  const city = lokalizacjaSlug ? decodeURIComponent(lokalizacjaSlug).replace(/-/g, " ") : null;

  return { propertyType, transactionType, city };
}

/**
 * Buduje kanoniczny URL landing-page dla danej kombinacji.
 */
export function buildLandingUrl(params: {
  propertyType?: PropertyTypeDb | null;
  transactionType?: TransactionTypeDb | null;
  city?: string | null;
}): string {
  const parts: string[] = ["/nieruchomosci"];
  if (params.propertyType) {
    parts.push("kategoria", PROPERTY_TYPE_DB_TO_SLUG[params.propertyType]);
    if (params.transactionType) {
      parts.push(TRANSACTION_DB_TO_SLUG[params.transactionType]);
      if (params.city) parts.push(encodeURIComponent(params.city.toLowerCase().replace(/\s+/g, "-")));
    }
  }
  return parts.join("/");
}
