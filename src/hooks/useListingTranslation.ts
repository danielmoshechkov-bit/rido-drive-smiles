import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { translateContentBatch } from '@/lib/contentTranslation';

interface Translation {
  title: string;
  description: string;
  isTranslated: boolean;
  loading: boolean;
}

/**
 * Tłumaczenie ogłoszenia (tytuł + opis) przez wspólny CORE (translate-content
 * + globalny cache). Sygnatura zachowana wstecz — komponenty nie wymagają zmian.
 * entity_type w core = listingType ('general' | 'vehicle' | 'real_estate').
 * Lazy + globalny cache; w trakcie ładowania nie pokazujemy oryginału.
 */
export function useListingTranslation(
  listingId: string,
  originalTitle: string,
  originalDescription: string,
  listingType: 'general' | 'vehicle' | 'real_estate' = 'general',
): Translation {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'pl').slice(0, 2);
  const enabled = !!listingId && lang !== 'pl' && (!!originalTitle || !!originalDescription);

  const { data, isFetching } = useQuery({
    queryKey: ['listing-translation', listingType, listingId, lang, (originalTitle || '').length, (originalDescription || '').length],
    enabled,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    queryFn: async () => {
      const map = await translateContentBatch([
        { entity_type: listingType, entity_id: listingId, field: 'title', text: originalTitle || '', source_lang: 'pl' },
        { entity_type: listingType, entity_id: listingId, field: 'description', text: originalDescription || '', source_lang: 'pl' },
      ], lang, 'pl');
      return {
        title: map[`${listingType}:${listingId}:title`] ?? (originalTitle || ''),
        description: map[`${listingType}:${listingId}:description`] ?? (originalDescription || ''),
      };
    },
  });

  if (!enabled) {
    return { title: originalTitle, description: originalDescription, isTranslated: false, loading: false };
  }
  if (isFetching && data === undefined) {
    // Nie pokazujemy oryginału przed tłumaczeniem (krótkie ładowanie)
    return { title: '', description: '', isTranslated: false, loading: true };
  }
  return {
    title: data?.title ?? originalTitle,
    description: data?.description ?? originalDescription,
    isTranslated: !!data && data.title !== originalTitle,
    loading: false,
  };
}
