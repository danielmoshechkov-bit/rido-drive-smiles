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
  listingType = 'general'
): Translation {
  const { i18n } = useTranslation();
  const lang = i18n.language;
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

      if (data?.title_translated) {
        setTranslation({
          title: (data as any).title_translated,
          description: (data as any).description_translated || originalDescription,
          isTranslated: true,
        });
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
