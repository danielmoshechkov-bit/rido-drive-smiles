import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * CORE hook tłumaczenia treści użytkowników (jeden wspólny silnik).
 * Lazy: tłumaczy tylko na język, który ktoś realnie otworzy. Globalny cache w
 * bazie (translation_cache_global) + cache TanStack Query w pamięci.
 * Nie pokazuje oryginału przed tłumaczeniem — w trakcie ładowania `text=''`
 * i `loading=true` (caller renderuje skeleton).
 *
 * Sygnatura zgodna wstecz z poprzednią wersją: { text, loading }.
 */
export function useContentTranslation(
  entityType: string,
  entityId: string | undefined,
  fieldName: string,
  sourceText: string | undefined,
  sourceLang = 'pl',
): { text: string; loading: boolean; isTranslated: boolean } {
  const { i18n } = useTranslation();
  const targetLang = (i18n.language || 'pl').slice(0, 2);
  const src = (sourceText || '').trim();
  const sl = (sourceLang || 'pl').slice(0, 2);

  const enabled = !!src && !!entityId && targetLang !== sl;

  const { data, isFetching } = useQuery({
    queryKey: ['content-translation', entityType, entityId, fieldName, targetLang, sl, src.length],
    enabled,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('translate-content', {
        body: {
          items: [{ entity_type: entityType, entity_id: entityId, field: fieldName, text: src, source_lang: sl }],
          target_lang: targetLang,
          source_lang: sl,
        },
      });
      if (error) throw error;
      const key = `${entityType}:${entityId}:${fieldName}`;
      return (data?.translations?.[key] as string) || src;
    },
  });

  if (!enabled) {
    return { text: sourceText || '', loading: false, isTranslated: false };
  }
  if (isFetching && data === undefined) {
    // Nie pokazujemy oryginału — caller użyje `loading` do skeletonu
    return { text: '', loading: true, isTranslated: false };
  }
  return { text: data ?? '', loading: false, isTranslated: data !== undefined && data !== src };
}
