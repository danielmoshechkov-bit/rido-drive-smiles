import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

export interface TranslatableField {
  entity_type: string;  // 'order' | 'item' | 'finding' | 'note'
  entity_id: string;
  field: string;        // 'title' | 'description' | 'name' | 'content'
  text: string;
}

/**
 * Batch translate workshop content (orders, items, findings, notes) into the
 * current i18n language. Returns a map keyed by `${entity_type}:${entity_id}:${field}`
 * containing the translated text. Falls back to the original text while loading.
 */
export function useWorkshopTranslations(fields: TranslatableField[], sourceLang = 'pl') {
  const { i18n } = useTranslation();
  const targetLang = (i18n.language || 'pl').slice(0, 2);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    // Build cache key from inputs so we don't re-run unnecessarily
    const cacheKey = `${targetLang}|${fields.map(f => `${f.entity_type}:${f.entity_id}:${f.field}:${(f.text || '').length}`).join(',')}`;
    if (cacheKey === lastKeyRef.current) return;
    lastKeyRef.current = cacheKey;

    // Pre-fill with originals
    const initial: Record<string, string> = {};
    for (const f of fields) initial[`${f.entity_type}:${f.entity_id}:${f.field}`] = f.text || '';
    setTranslations(initial);

    if (!fields.length) return;
    if (targetLang === sourceLang) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('workshop-translate-batch', {
          body: { texts: fields, target_lang: targetLang, source_lang: sourceLang },
        });
        if (cancelled) return;
        if (error) {
          console.warn('translation invoke error', error);
          return;
        }
        if (data?.translations) {
          setTranslations(prev => ({ ...prev, ...data.translations }));
        }
      } catch (e) {
        console.warn('translation error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fields, targetLang, sourceLang]);

  const t = (entity_type: string, entity_id: string, field: string, fallback?: string) =>
    translations[`${entity_type}:${entity_id}:${field}`] ?? fallback ?? '';

  return { t, translations, loading, targetLang };
}

/**
 * Fire-and-forget reverse translation: when an employee writes a note in their language,
 * push it to the cache pre-translated to the admin's language (default PL).
 */
export async function pushReverseTranslation(
  fields: TranslatableField[],
  sourceLang: string,
  targetLang = 'pl'
) {
  if (!fields.length || sourceLang === targetLang) return;
  try {
    await supabase.functions.invoke('workshop-translate-batch', {
      body: { texts: fields, target_lang: targetLang, source_lang: sourceLang },
    });
  } catch (e) {
    console.warn('reverse translation failed', e);
  }
}
