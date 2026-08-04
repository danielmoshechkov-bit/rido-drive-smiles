import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const LANG_NAMES: Record<string, string> = {
  pl: 'Polish', en: 'English', ru: 'Russian', ua: 'Ukrainian',
  uk: 'Ukrainian', de: 'German', vi: 'Vietnamese', kz: 'Kazakh',
};

interface TextItem {
  entity_type: string;
  entity_id: string;
  field: string;
  text: string;
}

serve(async (req) => {
  return phaseABlockedResponse(req, "workshop-translate-batch");

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { texts, target_lang, source_lang = 'pl' } = body as {
      texts: TextItem[];
      target_lang: string;
      source_lang?: string;
    };

    if (!Array.isArray(texts) || !target_lang) {
      return json({ error: 'texts[] and target_lang required' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Filter empties
    const validTexts = texts.filter(t => t.text && t.text.trim().length > 0);
    if (validTexts.length === 0) return json({ translations: {} });

    // Same target as source → return original
    if (target_lang === source_lang) {
      const out: Record<string, string> = {};
      for (const t of validTexts) {
        out[`${t.entity_type}:${t.entity_id}:${t.field}`] = t.text;
      }
      return json({ translations: out, cached: true });
    }

    // Hash each
    const withHash = await Promise.all(validTexts.map(async t => ({
      ...t,
      hash: await sha256(t.text.trim()),
      key: `${t.entity_type}:${t.entity_id}:${t.field}`,
    })));

    // Bulk lookup cache
    const orFilters = withHash.map(t =>
      `and(entity_type.eq.${t.entity_type},entity_id.eq.${t.entity_id},field.eq.${t.field},target_lang.eq.${target_lang})`
    ).join(',');

    const { data: cached } = await admin
      .from('workshop_translations_cache')
      .select('entity_type,entity_id,field,source_hash,translated_text')
      .eq('target_lang', target_lang)
      .or(orFilters || 'entity_id.eq.__none__');

    const cacheMap = new Map<string, { hash: string; text: string }>();
    for (const c of (cached || [])) {
      cacheMap.set(`${c.entity_type}:${c.entity_id}:${c.field}`, { hash: c.source_hash, text: c.translated_text });
    }

    const result: Record<string, string> = {};
    const toTranslate: typeof withHash = [];

    for (const t of withHash) {
      const hit = cacheMap.get(t.key);
      if (hit && hit.hash === t.hash) {
        result[t.key] = hit.text;
      } else {
        toTranslate.push(t);
      }
    }

    if (toTranslate.length === 0) {
      return json({ translations: result, cached: true });
    }

    // Read model from ai_agents_config
    const { data: agentCfg } = await admin
      .from('ai_agents_config')
      .select('model')
      .eq('agent_id', 'workshop_translation')
      .maybeSingle();

    const model = agentCfg?.model || 'moonshot-v1-8k';
    const isAnthropic = /claude|haiku|sonnet|opus/i.test(model);
    const isGemini = /gemini/i.test(model);

    // Build numbered prompt
    const numbered = toTranslate.map((t, i) => `[${i + 1}] ${t.text}`).join('\n---\n');
    const targetName = LANG_NAMES[target_lang] || target_lang;
    const sourceName = LANG_NAMES[source_lang] || source_lang;

    const userPrompt = `You are a professional automotive workshop translator. Translate each numbered text from ${sourceName} to ${targetName}.

CRITICAL rules:
- Preserve automotive part names, brand names, model codes, and numbers EXACTLY.
- Use proper professional automotive terminology in the target language.
- Translate naturally — do not transliterate brand/part codes.
- Output ONLY a valid JSON object with numeric keys "1","2",… mapping to translated text. No markdown, no commentary.

Texts to translate:
${numbered}`;

    let translatedMap: Record<string, string> = {};
    let provider = 'kimi';

    try {
      if (isAnthropic) {
        provider = 'anthropic';
        const key = Deno.env.get('ANTHROPIC_API_KEY');
        if (!key) throw new Error('ANTHROPIC_API_KEY missing');
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model, max_tokens: 4000,
            messages: [{ role: 'user', content: userPrompt + '\n\nReturn ONLY JSON.' }],
          }),
        });
        const d = await r.json();
        const raw = d.content?.[0]?.text?.trim() || '{}';
        translatedMap = JSON.parse(raw.replace(/```json|```/g, '').trim());
      } else if (isGemini) {
        provider = 'gemini';
        // Use Lovable AI Gateway
        const key = Deno.env.get('LOVABLE_API_KEY');
        if (!key) throw new Error('LOVABLE_API_KEY missing');
        const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
          body: JSON.stringify({
            model: model.startsWith('google/') ? model : `google/${model}`,
            messages: [
              { role: 'system', content: 'You are a professional automotive translator. Reply only with valid JSON.' },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
          }),
        });
        const d = await r.json();
        const raw = d.choices?.[0]?.message?.content?.trim() || '{}';
        translatedMap = JSON.parse(raw.replace(/```json|```/g, '').trim());
      } else {
        // Kimi / Moonshot (default)
        provider = 'kimi';
        const key = Deno.env.get('MOONSHOT_API_KEY') || Deno.env.get('KIMI_API_KEY');
        if (!key) throw new Error('MOONSHOT_API_KEY/KIMI_API_KEY missing');
        const r = await fetch('https://api.moonshot.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are a professional automotive translator. Reply only with valid JSON.' },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 4000,
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
        });
        if (!r.ok) {
          const errText = await r.text();
          console.error('Kimi error:', r.status, errText);
          throw new Error(`Kimi ${r.status}`);
        }
        const d = await r.json();
        const raw = d.choices?.[0]?.message?.content?.trim() || '{}';
        translatedMap = JSON.parse(raw.replace(/```json|```/g, '').trim());
      }
    } catch (e) {
      console.error('Translation failed, falling back to source:', e);
      // Fallback: return source text
      for (const t of toTranslate) result[t.key] = t.text;
      return json({ translations: result, error: String(e), fallback: true });
    }

    // Persist + fill result
    const rows: any[] = [];
    for (let i = 0; i < toTranslate.length; i++) {
      const t = toTranslate[i];
      const translated = translatedMap[String(i + 1)] || translatedMap[i + 1] || t.text;
      result[t.key] = translated;
      rows.push({
        entity_type: t.entity_type,
        entity_id: t.entity_id,
        field: t.field,
        source_lang,
        target_lang,
        source_hash: t.hash,
        source_text: t.text,
        translated_text: translated,
        translated_by: provider,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error: upErr } = await admin
        .from('workshop_translations_cache')
        .upsert(rows, { onConflict: 'entity_type,entity_id,field,target_lang' });
      if (upErr) console.error('Cache upsert error:', upErr);
    }

    return json({ translations: result, translated_count: toTranslate.length, provider });
  } catch (e) {
    console.error('workshop-translate-batch error:', e);
    return json({ error: String(e) }, 500);
  }
});
