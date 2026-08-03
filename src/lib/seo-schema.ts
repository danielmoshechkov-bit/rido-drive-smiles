const BASE_URL = 'https://getrido.pl';

// Gotowy JSON-LD LocalBusiness dla usługodawcy
export function buildLocalBusinessJsonLd(p: {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  image?: string | null;
  lat?: number | null;
  lng?: number | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  services?: { name: string; priceFrom?: number | null }[];
  workingHours?: Record<string, { open?: string; close?: string; closed?: boolean }> | null;
}) {
  const DAY_MAP: Record<string, string> = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
  };

  const openingHours = Object.entries(p.workingHours || {})
    .filter(([day, v]) => DAY_MAP[day] && v && !v.closed && v.open && v.close)
    .map(([day, v]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${DAY_MAP[day]}`,
      opens: v!.open,
      closes: v!.close,
    }));

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${BASE_URL}/uslugi/uslugodawca/${p.id}`,
    name: p.name,
    description: p.description || undefined,
    url: `${BASE_URL}/uslugi/uslugodawca/${p.id}`,
    telephone: p.phone || undefined,
    email: p.email || undefined,
    image: p.image || undefined,
    sameAs: p.website ? [p.website] : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: p.address || undefined,
      addressLocality: p.city || undefined,
      postalCode: p.postalCode || undefined,
      addressCountry: 'PL',
    },
    geo: p.lat && p.lng ? { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng } : undefined,
    aggregateRating:
      p.ratingCount && p.ratingCount > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: p.ratingAvg ?? 0,
            reviewCount: p.ratingCount,
          }
        : undefined,
    openingHoursSpecification: openingHours.length ? openingHours : undefined,
    hasOfferCatalog: p.services?.length
      ? {
          '@type': 'OfferCatalog',
          name: `Usługi — ${p.name}`,
          itemListElement: p.services.slice(0, 30).map((s) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name: s.name },
            price: s.priceFrom ?? undefined,
            priceCurrency: 'PLN',
          })),
        }
      : undefined,
  };
}
