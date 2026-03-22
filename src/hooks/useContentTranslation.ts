import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

const memCache: Record<string, string> = {};

export function useContentTranslation(
  entityType: string,
  entityId: string | undefined,
  fieldName: string,
  sourceText: string | undefined,
): { text: string; loading: boolean } {
  const { i18n } = useTranslation();
  const targetLang = i18n.language;
  const cacheKey = `${entityType}:${entityId}:${fieldName}:${targetLang}`;
  
  const [text, setText] = useState<string>(sourceText || '');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    abortRef.current = false;
    if (!sourceText || !entityId) { setText(sourceText || ''); return; }
    if (targetLang === 'pl') { setText(sourceText); return; }
    if (memCache[cacheKey]) { setText(memCache[cacheKey]); return; }
    
    setLoading(true);
    supabase.functions.invoke('translate', {
      body: {
        entity_type: entityType,
        entity_id: entityId,
        field_name: fieldName,
        source_text: sourceText,
        target_lang: targetLang,
        source_lang: 'pl',
      }
    }).then(({ data }) => {
      if (abortRef.current) return;
      const translated = data?.text || sourceText;
      memCache[cacheKey] = translated;
      setText(translated);
      setLoading(false);
    }).catch(() => { if (!abortRef.current) { setText(sourceText); setLoading(false); } });

    return () => { abortRef.current = true; };
  }, [entityId, fieldName, sourceText, targetLang, cacheKey]);

  return { text, loading };
}
