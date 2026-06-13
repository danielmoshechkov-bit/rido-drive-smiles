import { supabase } from '@/integrations/supabase/client';

/**
 * Klient wspólnego silnika tłumaczenia treści (CORE).
 * Szybka ścieżka: bezpośredni odczyt globalnego cache (translation_cache_global,
 * public SELECT). Edge `translate-content` wołany TYLKO na miss — i batchowo.
 * Hash treści musi być identyczny jak po stronie serwera: trim → SHA-256 → hex(0,32).
 */

export interface ContentItem {
  entity_type: string;
  entity_id: string;
  field: string;
  text: string;
  source_lang?: string;
}

export async function contentHash(text: string): Promise<string> {
  const buf = new TextEncoder().encode((text || '').trim());
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const keyOf = (i: { entity_type: string; entity_id: string; field: string }) =>
  `${i.entity_type}:${i.entity_id}:${i.field}`;

/**
 * Zwraca mapę `${entity_type}:${entity_id}:${field}` → przetłumaczony tekst.
 * - target === source lub pusty tekst → tekst źródłowy
 * - trafienie w globalnym cache → natychmiast (bez edge)
 * - miss → jedno batchowe wywołanie translate-content (zapisuje cache)
 */
export async function translateContentBatch(
  items: ContentItem[],
  targetLang: string,
  defaultSource = 'pl',
): Promise<Record<string, string>> {
  const t = (targetLang || 'pl').slice(0, 2);
  const out: Record<string, string> = {};

  const prepared = await Promise.all(items.map(async (it) => {
    const text = (it.text || '').trim();
    const sl = (it.source_lang || defaultSource || 'pl').slice(0, 2);
    return { ...it, text, sl, key: keyOf(it), hash: text ? await contentHash(text) : '' };
  }));

  // Szybka ścieżka — jeden odczyt globalnego cache dla wszystkich hashy
  const hashes = [...new Set(prepared.filter(p => p.text && p.sl !== t).map(p => p.hash))];
  const cacheMap = new Map<string, Record<string, string>>(); // `${hash}:${sl}` → translations
  if (hashes.length) {
    const { data } = await supabase
      .from('translation_cache_global' as any)
      .select('source_text_hash, source_lang, translations')
      .in('source_text_hash', hashes);
    for (const r of ((data || []) as any[])) {
      cacheMap.set(`${r.source_text_hash}:${r.source_lang}`, (r.translations || {}) as Record<string, string>);
    }
  }

  const misses: typeof prepared = [];
  for (const p of prepared) {
    if (!p.text) { out[p.key] = ''; continue; }
    if (p.sl === t) { out[p.key] = p.text; continue; }
    const hit = cacheMap.get(`${p.hash}:${p.sl}`)?.[t];
    if (hit) out[p.key] = hit;
    else misses.push(p);
  }

  if (misses.length) {
    try {
      const { data } = await supabase.functions.invoke('translate-content', {
        body: {
          items: misses.map(m => ({
            entity_type: m.entity_type, entity_id: m.entity_id, field: m.field,
            text: m.text, source_lang: m.sl,
          })),
          target_lang: t,
          source_lang: defaultSource,
        },
      });
      const tr = (data?.translations || {}) as Record<string, string>;
      for (const m of misses) out[m.key] = tr[m.key] ?? m.text; // fallback: oryginał tylko przy twardym błędzie
    } catch {
      for (const m of misses) out[m.key] = m.text;
    }
  }

  return out;
}
