import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { translateContentBatch } from '@/lib/contentTranslation';

export interface TranslatableField {
  entity_type: string;  // 'order' | 'item' | 'finding' | 'note' | 'estimate' ...
  entity_id: string;
  field: string;        // 'title' | 'description' | 'name' | 'content'
  text: string;
}

/**
 * Batch tłumaczenie treści warsztatu przez wspólny CORE (translate-content +
 * globalny cache, terminologia automotive). Sygnatura zachowana wstecz.
 * Dwukierunkowo: każdy widzi w swoim języku (admin PL ↔ mechanik UA ↔ klient EN).
 */
export function useWorkshopTranslations(fields: TranslatableField[], sourceLang = 'pl') {
  const { i18n } = useTranslation();
  const targetLang = (i18n.language || 'pl').slice(0, 2);
  const src = (sourceLang || 'pl').slice(0, 2);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    const cacheKey = `${targetLang}|${src}|${fields.map(f => `${f.entity_type}:${f.entity_id}:${f.field}:${(f.text || '').length}`).join(',')}`;
    if (cacheKey === lastKeyRef.current) return;
    lastKeyRef.current = cacheKey;

    // Pre-fill originałami (gdy target===source) — w innym razie czekamy na tłumaczenie
    const initial: Record<string, string> = {};
    for (const f of fields) initial[`${f.entity_type}:${f.entity_id}:${f.field}`] = (targetLang === src) ? (f.text || '') : '';
    setTranslations(initial);

    if (!fields.length || targetLang === src) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const map = await translateContentBatch(
          fields.map(f => ({ ...f, source_lang: src })),
          targetLang, src, 'automotive',
        );
        if (!cancelled) setTranslations(prev => ({ ...prev, ...map }));
      } catch (e) {
        console.warn('workshop translation error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fields, targetLang, src]);

  const t = (entity_type: string, entity_id: string, field: string, fallback?: string) =>
    translations[`${entity_type}:${entity_id}:${field}`] ?? fallback ?? '';

  return { t, translations, loading, targetLang };
}

/**
 * Fire-and-forget tłumaczenie odwrotne: gdy pracownik pisze w swoim języku,
 * wstępnie zasila globalny cache tłumaczeniem na język admina (domyślnie PL).
 */
export async function pushReverseTranslation(
  fields: TranslatableField[],
  sourceLang: string,
  targetLang = 'pl',
) {
  if (!fields.length || sourceLang === targetLang) return;
  try {
    await translateContentBatch(
      fields.map(f => ({ ...f, source_lang: sourceLang })),
      targetLang, sourceLang, 'automotive',
    );
  } catch (e) {
    console.warn('reverse translation failed', e);
  }
}
