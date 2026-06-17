import { supabase } from '@/integrations/supabase/client';

// Limiter współbieżności wywołań edge translate-content. Anthropic ma niski limit
// równoczesnych połączeń — bez tego marketplace (dziesiątki kart naraz) dostaje 429
// i część ogłoszeń zostaje nieprzetłumaczona. Max N naraz, reszta czeka w kolejce.
const MAX_CONCURRENT = 3;
let activeInvokes = 0;
const invokeQueue: Array<() => void> = [];
async function withInvokeLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeInvokes >= MAX_CONCURRENT) {
    await new Promise<void>(resolve => invokeQueue.push(resolve));
  }
  activeInvokes++;
  try {
    return await fn();
  } finally {
    activeInvokes--;
    const next = invokeQueue.shift();
    if (next) next();
  }
}

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

/**
 * Lekka heurystyka wykrywania języka źródłowego (gdy treść może być w dowolnym
 * języku — np. komentarze, wiadomości). Świadomie prosta; dla treści PL-domyślnych
 * podawaj wprost 'pl'. Cyrylica → 'ru' (ru/ua nierozróżnialne pewnie — bierzemy ru).
 */
export function detectSourceLang(text: string): string {
  const s = (text || '').trim();
  if (!s) return 'pl';
  if (/[一-鿿]/.test(s)) return 'zh';
  if (/[؀-ۿ]/.test(s)) return 'ar';
  // ukraiński ma znaki і/ї/є/ґ — rozróżnij od rosyjskiego
  if (/[іїєґ]/i.test(s)) return 'ua';
  if (/[Ѐ-ӿ]/.test(s)) return 'ru';
  if (/[ăâîșț]/i.test(s)) return 'ro';
  if (/[ạảấầẩẫậắằẳẵặ]/i.test(s)) return 'vi';
  if (/[ąćęłńóśźż]/i.test(s)) return 'pl';
  if (/[äöüß]/i.test(s)) return 'de';
  return 'pl';
}

export async function contentHash(text: string): Promise<string> {
  const buf = new TextEncoder().encode((text || '').trim());
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const keyOf = (i: { entity_type: string; entity_id: string; field: string }) =>
  `${i.entity_type}:${i.entity_id}:${i.field}`;

/**
 * Języki bazowe pre-tłumaczone PRZY ZAPISIE (translate-on-write). Gdy pracownik
 * zapisuje treść, jednym wywołaniem edge zasilamy globalny cache na wszystkie 4 —
 * dzięki temu admin/klient z językiem bazowym widzi treść NATYCHMIAST z cache,
 * bez "flasha" języka źródłowego i bez czekania na tłumaczenie on-read.
 */
export const BASE_LANGS = ['pl', 'en', 'ru', 'ua'];

/**
 * Translate-on-write: pre-tłumaczy podane treści na wszystkie języki bazowe i
 * zapisuje do globalnego cache (translation_cache_global). Fire-and-forget — NIE
 * blokuje ścieżki zapisu (woła się bez await z mutacji). Edge `translate-content`
 * dedupuje po hashu i zapisuje komplet języków jednym przebiegiem.
 *
 * @param items   pozycje { entity_type, entity_id, field, text, source_lang? }
 * @param domainHint domena terminologii (domyślnie 'automotive' dla warsztatu)
 */
export async function pretranslateContent(
  items: ContentItem[],
  domainHint = 'automotive',
): Promise<void> {
  const usable = items
    .map(i => ({ ...i, text: (i.text || '').trim() }))
    .filter(i => i.text.length > 1);
  if (!usable.length) return;
  try {
    await withInvokeLimit(() => supabase.functions.invoke('translate-content', {
      body: {
        items: usable.map(i => ({
          entity_type: i.entity_type,
          entity_id: i.entity_id,
          field: i.field,
          text: i.text,
          source_lang: (i.source_lang === 'auto' || !i.source_lang)
            ? detectSourceLang(i.text)
            : i.source_lang,
        })),
        // klucz przebudowy: komplet języków bazowych jednym callem
        target_langs: BASE_LANGS,
        domain_hint: domainHint,
      },
    }));
  } catch (e) {
    // best-effort — przy błędzie i tak zadziała fallback on-read
    console.warn('pretranslateContent failed', e);
  }
}

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
  domainHint?: string,
): Promise<Record<string, string>> {
  const t = (targetLang || 'pl').slice(0, 2);
  const out: Record<string, string> = {};

  const prepared = await Promise.all(items.map(async (it) => {
    const text = (it.text || '').trim();
    const rawSl = it.source_lang || defaultSource || 'pl';
    const sl = (rawSl === 'auto' ? detectSourceLang(text) : rawSl).slice(0, 2);
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
      const { data } = await withInvokeLimit(() => supabase.functions.invoke('translate-content', {
        body: {
          items: misses.map(m => ({
            entity_type: m.entity_type, entity_id: m.entity_id, field: m.field,
            text: m.text, source_lang: m.sl,
          })),
          target_lang: t,
          source_lang: defaultSource,
          domain_hint: domainHint,
        },
      }));
      const tr = (data?.translations || {}) as Record<string, string>;
      for (const m of misses) out[m.key] = tr[m.key] ?? m.text; // fallback: oryginał tylko przy twardym błędzie
    } catch {
      for (const m of misses) out[m.key] = m.text;
    }
  }

  return out;
}
