import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

interface Translation {
  title: string;
  description: string;
  isTranslated: boolean;
}

export function useListingTranslation(
  listingId: string,
  originalTitle: string,
  originalDescription: string,
  listingType: 'general' | 'vehicle' | 'real_estate' = 'general'
): Translation {
  const { i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || 'pl';
  const [translation, setTranslation] = useState<Translation>({
    title: originalTitle,
    description: originalDescription,
    isTranslated: false,
  });

  useEffect(() => {
    // Reset when original changes
    setTranslation({
      title: originalTitle,
      description: originalDescription,
      isTranslated: false,
    });

    if (!lang || lang === 'pl' || !listingId) return;

    // Check sessionStorage cache first
    const cacheKey = `trans_${listingId}_${listingType}_${lang}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { t, d } = JSON.parse(cached);
        setTranslation({ title: t, description: d, isTranslated: true });
        return;
      }
    } catch {}

    let cancelled = false;

    const fetchTranslation = async () => {
      const { data } = await supabase
        .from('listing_translations' as any)
        .select('title_translated, description_translated')
        .eq('listing_id', listingId)
        .eq('listing_type', listingType)
        .eq('target_lang', lang)
        .maybeSingle();

      if (cancelled) return;

      if (data && (data as any).title_translated) {
        const t = (data as any).title_translated;
        const d = (data as any).description_translated || originalDescription;
        setTranslation({ title: t, description: d, isTranslated: true });
        // Cache in sessionStorage
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ t, d }));
        } catch {}
      } else {
        // Queue for translation in background
        supabase.functions.invoke('translation-queue-add', {
          body: {
            listing_id: listingId,
            listing_type: listingType,
            title: originalTitle,
            description: originalDescription,
            source_lang: 'pl',
            source: 'api',
            priority: 7,
          },
        }).catch(() => {});
      }
    };

    fetchTranslation();

    return () => { cancelled = true; };
  }, [listingId, lang, originalTitle, originalDescription, listingType]);

  return translation;
}
