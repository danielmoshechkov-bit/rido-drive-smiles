import { useEffect } from 'react';

export interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'product';
  schemaType?: 'WebSite' | 'ItemList' | 'Product' | 'RealEstateListing' | 'Vehicle' | 'Service' | 'LocalBusiness';
  schemaData?: Record<string, unknown>;
}

// Default SEO data
const defaults = {
  siteName: 'GetRido',
  siteUrl: 'https://getrido.pl',
  defaultImage: '/lovable-uploads/a27439d2-e539-4826-82f2-2c73646d08cc.png',
  defaultDescription: 'GetRido – inteligentny portal ogłoszeń nieruchomości, motoryzacji i usług z AI. Kupuj, sprzedawaj i zlecaj w jednym miejscu.',
};

// Pre-defined SEO configurations for different sections
export const seoConfigs = {
  home: {
    title: 'GetRido – Portal Ogłoszeń Nieruchomości, Motoryzacji i Usług z AI',
    description: 'GetRido to inteligentny portal ogłoszeń. Kupuj i sprzedawaj samochody, nieruchomości oraz zamawiaj usługi. Wszystko w jednym miejscu z pomocą AI.',
    keywords: 'ogłoszenia, portal ogłoszeń, samochody, nieruchomości, usługi, sprzedaż, kupno, AI, sztuczna inteligencja, Polska',
  },
  motoryzacja: {
    title: 'Motoryzacja – Ogłoszenia Samochodów i Pojazdów | GetRido',
    description: 'Ogłoszenia motoryzacyjne na GetRido. Kup lub sprzedaj samochód, motocykl, przyczepę. Warsztaty, detailing, folie PPF. Portal flotowy dla firm.',
    keywords: 'samochody, ogłoszenia motoryzacyjne, sprzedaż auta, kupno samochodu, giełda samochodowa, używane auta, warsztaty, detailing, PPF, floty',
  },
  nieruchomosci: {
    title: 'Nieruchomości – Mieszkania, Domy, Działki na Sprzedaż | GetRido',
    description: 'Ogłoszenia nieruchomości na GetRido. Mieszkania, domy, działki na sprzedaż i wynajem. Biura nieruchomości, deweloperzy. Projekty wnętrz i remonty.',
    keywords: 'nieruchomości, mieszkania na sprzedaż, domy, działki, wynajem mieszkań, biuro nieruchomości, deweloper, projekty wnętrz, remonty',
  },
  uslugi: {
    title: 'Usługi – Znajdź Fachowców i Specjalistów | GetRido',
    description: 'Portal usług GetRido. Znajdź sprawdzonych fachowców: hydraulik, elektryk, sprzątanie, przeprowadzki, remonty, detailing, projektanci wnętrz i więcej.',
    keywords: 'usługi, fachowcy, hydraulik, elektryk, sprzątanie, przeprowadzki, remonty, detailing, projektanci wnętrz, zlecenia',
  },
  gielda: {
    title: 'Giełda Samochodowa – Ogłoszenia Pojazdów | GetRido',
    description: 'Giełda samochodowa GetRido. Przeglądaj ogłoszenia samochodów osobowych, dostawczych, motocykli. Kupuj i sprzedawaj pojazdy z pomocą AI.',
    keywords: 'giełda samochodowa, ogłoszenia samochodów, sprzedaż aut, używane samochody, nowe auta, motocykle, pojazdy dostawcze',
  },
  portalNieruchomosci: {
    title: 'Portal Nieruchomości – Mieszkania, Domy, Działki | GetRido',
    description: 'Przeglądaj ogłoszenia nieruchomości na GetRido. Mieszkania na sprzedaż i wynajem, domy, działki budowlane. Wyszukiwarka AI pomoże znaleźć idealne miejsce.',
    keywords: 'portal nieruchomości, mieszkania, domy na sprzedaż, działki, wynajem, apartamenty, lokale użytkowe',
  },
  fleet: {
    title: 'Portal Flotowy – Zarządzanie Flotą Pojazdów | GetRido',
    description: 'System zarządzania flotą pojazdów GetRido. Kontroluj pojazdy, kierowców, dokumenty i rozliczenia w jednym miejscu.',
    keywords: 'zarządzanie flotą, flota pojazdów, system flotowy, kierowcy, rozliczenia floty, GPS, monitoring pojazdów',
  },
  driver: {
    title: 'Portal Kierowcy – Rozliczenia i Dokumenty | GetRido',
    description: 'Portal kierowcy GetRido. Zarządzaj rozliczeniami, dokumentami, harmonogramem. Wszystko czego potrzebuje kierowca w jednym miejscu.',
    keywords: 'portal kierowcy, rozliczenia kierowców, dokumenty kierowcy, flota, praca kierowcy',
  },
  ksiegowosc: {
    title: 'Księgowość Online – Darmowy Program do Faktur | GetRido',
    description: 'Darmowy program do faktur online GetRido. Wystawiaj faktury VAT, proformy, korekty. Ewidencja kosztów i raporty dla Twojej firmy.',
    keywords: 'program do faktur, faktury online, faktury VAT, księgowość online, darmowe faktury, ewidencja kosztów',
  },
};

export function SEOHead({
  title,
  description,
  keywords,
  canonicalUrl,
  ogImage,
  ogType = 'website',
  schemaType,
  schemaData,
}: SEOHeadProps) {
  useEffect(() => {
    // Update document title
    if (title) {
      document.title = title;
    }

    // Update or create meta tags
    const updateMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    // Standard meta tags
    if (description) {
      updateMeta('description', description);
    }
    if (keywords) {
      updateMeta('keywords', keywords);
    }

    // Open Graph tags
    if (title) {
      updateMeta('og:title', title, true);
    }
    if (description) {
      updateMeta('og:description', description, true);
    }
    updateMeta('og:type', ogType, true);
    updateMeta('og:image', ogImage || defaults.defaultImage, true);
    updateMeta('og:site_name', defaults.siteName, true);
    if (canonicalUrl) {
      updateMeta('og:url', canonicalUrl, true);
    }

    // Twitter tags
    updateMeta('twitter:card', 'summary_large_image');
    if (title) {
      updateMeta('twitter:title', title);
    }
    if (description) {
      updateMeta('twitter:description', description);
    }
    updateMeta('twitter:image', ogImage || defaults.defaultImage);

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonicalUrl) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    }

    // JSON-LD Schema
    if (schemaType || schemaData) {
      // Remove existing schema
      const existingSchema = document.querySelector('script[data-seo-schema]');
      if (existingSchema) {
        existingSchema.remove();
      }

      const schema = schemaData || {
        '@context': 'https://schema.org',
        '@type': schemaType || 'WebSite',
        name: title || defaults.siteName,
        description: description || defaults.defaultDescription,
        url: canonicalUrl || defaults.siteUrl,
      };

      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-schema', 'true');
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }

    // Cleanup on unmount
    return () => {
      // Keep meta tags but they'll be updated by next page
    };
  }, [title, description, keywords, canonicalUrl, ogImage, ogType, schemaType, schemaData]);

  return null; // This component doesn't render anything
}

// Utility hook to set SEO for a page
export function useSEO(config: keyof typeof seoConfigs | SEOHeadProps) {
  const seoProps = typeof config === 'string' ? seoConfigs[config] : config;
  
  useEffect(() => {
    if (typeof config === 'string' && seoConfigs[config]) {
      const { title, description, keywords } = seoConfigs[config];
      document.title = title;
      
      const updateMeta = (name: string, content: string) => {
        let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = name;
          document.head.appendChild(meta);
        }
        meta.content = content;
      };
      
      updateMeta('description', description);
      if (keywords) updateMeta('keywords', keywords);
    }
  }, [config]);
  
  return seoProps;
}

export default SEOHead;
