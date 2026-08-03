import { useEffect } from 'react';

// GetRido — automatyczne SEO dla całego portalu.
// Ustawia <title>, opis, canonical, OG/Twitter i JSON-LD dla dowolnej podstrony.

export interface SeoOptions {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  type?: string;
  jsonLd?: Record<string, any> | Record<string, any>[];
  noindex?: boolean;
}

const BASE_URL = 'https://getrido.pl';
const JSONLD_ID = 'getrido-jsonld';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useSeo(options: SeoOptions | null) {
  const key = options ? JSON.stringify(options) : '';

  useEffect(() => {
    if (!options) return;
    const {
      title,
      description,
      canonicalPath,
      image,
      type = 'website',
      jsonLd,
      noindex,
    } = options;

    const prevTitle = document.title;
    document.title = title.length > 60 ? `${title.slice(0, 57)}...` : title;

    if (description) {
      setMeta('name', 'description', description.slice(0, 158));
      setMeta('property', 'og:description', description.slice(0, 158));
      setMeta('name', 'twitter:description', description.slice(0, 158));
    }
    setMeta('property', 'og:title', title);
    setMeta('name', 'twitter:title', title);
    setMeta('property', 'og:type', type);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow');

    const url = `${BASE_URL}${canonicalPath ?? window.location.pathname}`;
    setLink('canonical', url);
    setMeta('property', 'og:url', url);
    if (image) {
      const abs = image.startsWith('http') ? image : `${BASE_URL}${image}`;
      setMeta('property', 'og:image', abs);
      setMeta('name', 'twitter:image', abs);
    }

    document.getElementById(JSONLD_ID)?.remove();
    if (jsonLd) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = JSONLD_ID;
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.title = prevTitle;
      document.getElementById(JSONLD_ID)?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

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
