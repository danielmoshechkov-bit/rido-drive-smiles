/**
 * Iteracja 2 — landing pages nieruchomości.
 * Route: /nieruchomosci/kategoria/:typ/:transakcja?/:lokalizacja?
 *
 * Zadanie:
 *  - waliduje slugi przez `parseLandingParams`
 *  - jeśli slug nie mapuje się na realną kombinację z bazy → 404-style redirect
 *    na główny listing (nie budujemy pustych landingów — kara SEO)
 *  - jeśli OK → przekierowuje na /nieruchomosci?propertyType=...&transactionType=...&city=...
 *    (rzeczywisty listing czyta te query params i renderuje wyniki)
 *
 * Nie kopiujemy tu logiki renderowania — cała jest w RealEstateMarketplace,
 * dzięki temu zero duplikacji i zero szans na rozjazd.
 */

import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { parseLandingParams, PROPERTY_TYPE_DB_TO_SLUG } from "@/lib/realestate-landing-routes";
import type { PropertyTypeDb } from "@/lib/listing-attributes";

// slug PL dla propertyType nadal używa formy w liczbie pojedynczej z bazy —
// listing na /nieruchomosci trzyma stan wewnętrzny w formie DB, więc
// przekazujemy DB-value w query paramach.

export default function RealEstateLanding() {
  const params = useParams();
  const parsed = parseLandingParams(params.typ, params.transakcja, params.lokalizacja);

  useEffect(() => {
    if (!parsed) {
      // eslint-disable-next-line no-console
      console.warn("[RealEstateLanding] Nieprawidłowa kombinacja slugów, redirect →", params);
    }
  }, [parsed, params]);

  if (!parsed) {
    return <Navigate to="/nieruchomosci" replace />;
  }

  const search = new URLSearchParams();
  if (parsed.propertyType) search.set("propertyType", parsed.propertyType);
  if (parsed.transactionType) search.set("transactionType", parsed.transactionType);
  if (parsed.city) search.set("city", parsed.city);

  // Prefiks jest tylko po to, żeby RealEstateMarketplace mógł odczytać SEO
  // metadane z URL, sam listing zostaje ten sam.
  return <Navigate to={`/nieruchomosci?${search.toString()}`} replace />;
}

// Re-eksport pomocniczy — używany np. do sitemap'y.
export function landingPropertyTypeToSlug(t: PropertyTypeDb): string {
  return PROPERTY_TYPE_DB_TO_SLUG[t];
}
