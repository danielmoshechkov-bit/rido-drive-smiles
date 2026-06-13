// ============================================================================
// translate-content — CORE silnika tłumaczenia treści użytkowników.
// Lazy + globalny cache (translation_cache_global, dedup po hashu treści).
// Identyczna fraza tłumaczy się RAZ dla całej platformy.
//
// Wejście:
//   {
//     items: [{ entity_type, entity_id, field, text, source_lang? }],
//     target_lang?: string,            // pojedynczy język (odczyt lazy)
//     target_langs?: string[],         // wiele języków (prewarm)
//     source_lang?: string,            // domyślny dla itemów bez własnego
//     domain_hint?: string             // np. 'automotive'
//   }
// Wyjście (gdy target_lang):
//   { translations: { "<entity_type>:<entity_id>:<field>": "<tekst>" }, provider, cached }
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { translateTexts, resolveModel, detectSourceLang } from '../_shared/translationProvider.ts';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

interface Item {
  entity_type: string;
  entity_id: string;
  field: string;
  text: string;
  source_lang?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const items: Item[] = Array.isArray(body.items) ? body.items : [];
    const defaultSource: string = (body.source_lang || 'pl').slice(0, 2);
    const domainHint: string | undefined = body.domain_hint;

    // Wielo-target (prewarm) vs pojedynczy target (lazy read)
    const targets: string[] = Array.isArray(body.target_langs) && body.target_langs.length
      ? body.target_langs.map((l: string) => (l || '').slice(0, 2))
      : [(body.target_lang || '').slice(0, 2)].filter(Boolean);

    if (!items.length || !targets.length) {
      return json({ translations: {}, error: 'items[] and target_lang(s) required' }, 400);
    }

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const model = await resolveModel(sb, 'content_translation');

    const keyOf = (it: Item) => `${it.entity_type}:${it.entity_id}:${it.field}`;

    // Wynik per pojedynczy target (zwracany przy lazy read). Dla wielu targetów
    // zwracamy mapę pierwszego targetu + licznik — prewarm i tak czyta z cache.
    const primaryTarget = targets[0];
    const result: Record<string, string> = {};
    const providerErrors: string[] = [];
    let translatedCount = 0;
    let providerUsed = '';

    // Przygotuj itemy z hashem i językiem źródłowym
    const prepared = await Promise.all(items.map(async (it) => {
      const text = (it.text || '').trim();
      const rawSl = it.source_lang || defaultSource || 'pl';
      const sl = (rawSl === 'auto' ? detectSourceLang(text) : rawSl).slice(0, 2);
      return { ...it, text, sl, hash: text ? await sha256(text) : '' };
    }));

    // Zbierz wszystkie hashe do jednego zapytania cache
    const hashes = [...new Set(prepared.filter(p => p.hash).map(p => p.hash))];
    const cacheByHashLang = new Map<string, { source_text: string; translations: Record<string, string> }>();
    if (hashes.length) {
      const { data: rows } = await sb
        .from('translation_cache_global')
        .select('source_text_hash, source_lang, source_text, translations')
        .in('source_text_hash', hashes);
      for (const r of (rows || [])) {
        cacheByHashLang.set(`${r.source_text_hash}:${r.source_lang}`, {
          source_text: r.source_text,
          translations: (r.translations || {}) as Record<string, string>,
        });
      }
    }

    // Dla każdego targetu: ustal co jest miss, zdedupuj po (hash, sl), przetłumacz, zapisz.
    for (const target of targets) {
      // Mapa miss: klucz `${hash}:${sl}` → { text, sl, hash }
      const missByContent = new Map<string, { text: string; sl: string; hash: string }>();

      for (const p of prepared) {
        if (!p.text) { if (target === primaryTarget) result[keyOf(p)] = ''; continue; }
        if (p.sl === target) { if (target === primaryTarget) result[keyOf(p)] = p.text; continue; }
        const cached = cacheByHashLang.get(`${p.hash}:${p.sl}`);
        const hit = cached?.translations?.[target];
        if (hit) {
          if (target === primaryTarget) result[keyOf(p)] = hit;
        } else {
          missByContent.set(`${p.hash}:${p.sl}`, { text: p.text, sl: p.sl, hash: p.hash });
        }
      }

      // Grupuj miss po języku źródłowym (każda grupa = jedno wywołanie modelu)
      const bySource = new Map<string, { text: string; hash: string }[]>();
      for (const m of missByContent.values()) {
        const arr = bySource.get(m.sl) || [];
        arr.push({ text: m.text, hash: m.hash });
        bySource.set(m.sl, arr);
      }

      for (const [sl, group] of bySource) {
        const { translations, provider, ok, error } = await translateTexts({
          texts: group.map(g => g.text),
          sourceLang: sl,
          targetLang: target,
          model,
          domainHint,
        });
        providerUsed = provider;
        if (!ok && error) providerErrors.push(error);
        for (let i = 0; i < group.length; i++) {
          const g = group[i];
          const tr = translations[i] ?? g.text;
          // Zapisz do globalnego cache tylko gdy provider odpowiedział poprawnie
          if (ok) {
            await sb.rpc('cache_global_translation', {
              p_hash: g.hash, p_source_lang: sl, p_source_text: g.text,
              p_target_lang: target, p_translated: tr,
            });
            // Zaktualizuj lokalną mapę cache (gdyby ten sam hash był w kolejnym targecie)
            const ck = `${g.hash}:${sl}`;
            const existing = cacheByHashLang.get(ck) || { source_text: g.text, translations: {} };
            existing.translations[target] = tr;
            cacheByHashLang.set(ck, existing);
            translatedCount++;
          }
        }
      }

      // Wypełnij result dla primaryTarget z (już zaktualizowanego) cache
      if (target === primaryTarget) {
        for (const p of prepared) {
          if (result[keyOf(p)] !== undefined) continue;
          if (!p.text) { result[keyOf(p)] = ''; continue; }
          const cached = cacheByHashLang.get(`${p.hash}:${p.sl}`);
          result[keyOf(p)] = cached?.translations?.[target] ?? p.text;
        }
      }
    }

    return json({
      translations: result,
      provider: providerUsed || undefined,
      model,
      translated_count: translatedCount,
      cached: translatedCount === 0,
      errors: providerErrors.length ? providerErrors.slice(0, 3) : undefined,
    });
  } catch (e) {
    console.error('translate-content error:', e);
    return json({ translations: {}, error: String(e) }, 500);
  }
});
