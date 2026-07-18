/**
 * Iteracja 2 — landing page nieruchomości.
 * Route: /nieruchomosci/kategoria/:typ/:transakcja?/:lokalizacja?
 *
 * Zadania:
 *  - waliduje slugi przez `parseLandingParams`
 *  - jeśli slug nie mapuje się na realną kombinację z bazy → redirect
 *  - montuje `<SEOHead>` z title/description/canonical/JSON-LD dla landingu
 *  - dla kombinacji z <10 ofertami (indexable=false) — noindex,follow
 *  - przekazuje filtry przez query params do RealEstateMarketplace
 *
 * NIE dodajemy react-helmet-async — używamy istniejącego SEOHead.
 */

import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  parseLandingParams,
  PROPERTY_TYPE_DB_TO_SLUG,
  PROPERTY_TYPE_LABEL_PL,
  TRANSACTION_LABEL_PL,
  isIndexableCombo,
  buildLandingUrl,
} from "@/lib/realestate-landing-routes";
import type { PropertyTypeDb } from "@/lib/listing-attributes";
import { SEOHead } from "@/components/SEOHead";

export default function RealEstateLanding() {
  const params = useParams();
  const parsed = parseLandingParams(params.typ, params.transakcja, params.lokalizacja);

  useEffect(() => {
    if (!parsed) {
      // eslint-disable-next-line no-console
      console.warn("[RealEstateLanding] Nieprawidłowa kombinacja slugów →", params);
    }
  }, [parsed, params]);

  if (!parsed) {
    return <Navigate to="/nieruchomosci" replace />;
  }

  const typeLabel = parsed.propertyType ? PROPERTY_TYPE_LABEL_PL[parsed.propertyType] : "Nieruchomości";
  const trxLabel = parsed.transactionType ? TRANSACTION_LABEL_PL[parsed.transactionType].toLowerCase() : "";
  const cityLabel = parsed.city ? ` w ${parsed.city.charAt(0).toUpperCase() + parsed.city.slice(1)}` : "";
  const title = `${typeLabel} ${trxLabel}${cityLabel} | GetRido`.replace(/\s+/g, " ").trim();
  const description = `Aktualne ogłoszenia: ${typeLabel.toLowerCase()} ${trxLabel}${cityLabel}. Filtry zaawansowane, mapa, kontakt bezpośredni. Portal GetRido.`;
  const canonicalPath = buildLandingUrl({
    propertyType: parsed.propertyType,
    transactionType: parsed.transactionType,
    city: parsed.city,
  });
  const canonicalUrl = `https://getrido.pl${canonicalPath}`;

  const noindex =
    !!parsed.propertyType && !!parsed.transactionType &&
    !isIndexableCombo(parsed.propertyType, parsed.transactionType);

  const search = new URLSearchParams();
  if (parsed.propertyType) search.set("propertyType", parsed.propertyType);
  if (parsed.transactionType) search.set("transactionType", parsed.transactionType);
  if (parsed.city) search.set("city", parsed.city);

  return (
    <>
      <SEOHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        noindex={noindex}
        schemaType="ItemList"
        schemaData={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: title,
          description,
          url: canonicalUrl,
        }}
      />
      <Navigate to={`/nieruchomosci?${search.toString()}`} replace />
    </>
  );
}

// Re-eksport pomocniczy — używany np. do sitemap'y.
export function landingPropertyTypeToSlug(t: PropertyTypeDb): string {
  return PROPERTY_TYPE_DB_TO_SLUG[t];
}
