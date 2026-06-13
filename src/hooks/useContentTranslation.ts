import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { translateContentBatch, type ContentItem } from '@/lib/contentTranslation';

/**
 * CORE hook tłumaczenia pojedynczego pola treści (jeden wspólny silnik).
 * Lazy: tłumaczy tylko na język, który ktoś realnie otworzy. Globalny cache w
 * bazie + cache TanStack Query w pamięci. Nie pokazuje oryginału przed
 * tłumaczeniem — w trakcie ładowania `text=''` i `loading=true`.
 * Sygnatura zgodna wstecz: { text, loading }.
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
      const map = await translateContentBatch(
        [{ entity_type: entityType, entity_id: entityId!, field: fieldName, text: src, source_lang: sl }],
        targetLang, sl,
      );
      return map[`${entityType}:${entityId}:${fieldName}`] ?? src;
    },
  });

  if (!enabled) return { text: sourceText || '', loading: false, isTranslated: false };
  if (isFetching && data === undefined) return { text: '', loading: true, isTranslated: false };
  return { text: data ?? '', loading: false, isTranslated: data !== undefined && data !== src };
}

/**
 * CORE hook batch — tłumaczy listę pól naraz (jedno wywołanie, jeden cache read).
 * Zwraca getter `t(entity_type, entity_id, field, fallback)`. Idealny do list
 * (recenzje, pozycje wyceny, wiadomości) gdzie nie można wołać hooka per-item.
 * Treść o nieznanym języku: podaj source_lang:'auto'.
 */
export function useContentTranslations(items: ContentItem[]) {
  const { i18n } = useTranslation();
  const targetLang = (i18n.language || 'pl').slice(0, 2);
  const sig = items.map(i => `${i.entity_type}:${i.entity_id}:${i.field}:${(i.text || '').length}`).join('|');

  const { data, isFetching } = useQuery({
    queryKey: ['content-translations', targetLang, sig],
    enabled: items.length > 0 && targetLang !== 'pl',
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    queryFn: () => translateContentBatch(items, targetLang, 'pl'),
  });

  const t = (entity_type: string, entity_id: string, field: string, fallback = '') => {
    if (targetLang === 'pl') return fallback;
    return data?.[`${entity_type}:${entity_id}:${field}`] ?? (isFetching ? '' : fallback);
  };

  return { t, translations: data || {}, loading: isFetching, targetLang };
}
