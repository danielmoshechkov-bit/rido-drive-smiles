import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

const CACHE_KEY = 'rido_ui_trans_cache';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

export function useDynamicTranslations() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const lang = i18n.language;
    if (!lang || lang === 'pl') return; // pl is the source

    const cacheKey = `${CACHE_KEY}_${lang}`;
    
    const loadFromDB = async () => {
      try {
        // Check local cache
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL) {
            mergeToi18n(i18n, lang, data);
            return;
          }
        }

        // Fetch from DB
        const { data } = await supabase
          .from('ui_translations' as any)
          .select('section, key, value')
          .eq('lang_code', lang);

        if (!data || (data as any[]).length === 0) return;

        // Group by section
        const grouped: Record<string, Record<string, string>> = {};
        for (const row of data as any[]) {
          if (!grouped[row.section]) grouped[row.section] = {};
          grouped[row.section][row.key] = row.value;
        }

        // Save to cache
        localStorage.setItem(cacheKey, JSON.stringify({
          data: grouped, ts: Date.now()
        }));

        // Merge with i18n
        mergeToi18n(i18n, lang, grouped);

      } catch (e) {
        console.warn('Dynamic translations load failed:', e);
      }
    };

    loadFromDB();
  }, [i18n.language]);
}

function mergeToi18n(
  i18n: any, 
  lang: string, 
  sections: Record<string, Record<string, string>>
) {
  for (const [section, keys] of Object.entries(sections)) {
    const existing = i18n.getResourceBundle(lang, 'translation') || {};
    
    const updated = {
      ...existing,
      [section]: {
        ...(existing[section] || {}),
        ...keys
      }
    };
    
    i18n.addResourceBundle(lang, 'translation', updated, true, true);
  }
}
