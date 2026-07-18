/**
 * Iteracja 2 — wyliczanie `seller_type` z RELACJI, nie z kolumny.
 *
 * ZASADA (review od użytkownika):
 *   seller_type NIE jest polem na ogłoszeniu. To FILTR ZAUFANIA — musi
 *   wynikać z tego, kim wystawiający JEST w systemie, nie z tego co
 *   sobie wpisał w formularzu. Inaczej "prywatna oferta" nic nie znaczy.
 *
 * Logika:
 *   - agency_id != null lub rekord w real_estate_agents.company_id → 'agency'
 *   - profil dewelopera (real_estate_agents.is_developer) → 'developer'
 *   - reszta → 'private'
 *
 * Wyliczenie odbywa się PO STRONIE KLIENTA po JOIN-ie z real_estate_agents
 * (aktualne pobranie w RealEstateMarketplace i tak jest client-side).
 * Gdy przejdziemy na server-side (patrz TODO w RealEstateMarketplace),
 * przeniesiemy to do widoku SQL zwracającego seller_type jako kolumnę
 * wyliczaną — wartość nadal pochodzi z relacji, nigdy z formularza.
 */

export type SellerType = "private" | "agency" | "developer";

export interface SellerTypeInput {
  agency_id?: string | null;
  agent?: {
    company_id?: string | null;
    is_developer?: boolean | null;
    user_type?: string | null;
  } | null;
}

export function deriveSellerType(input: SellerTypeInput): SellerType {
  if (input.agent?.is_developer || input.agent?.user_type === "developer") {
    return "developer";
  }
  if (input.agency_id || input.agent?.company_id) {
    return "agency";
  }
  return "private";
}

export const SELLER_TYPE_LABEL_PL: Record<SellerType, string> = {
  private: "Prywatny",
  agency: "Biuro nieruchomości",
  developer: "Deweloper",
};
