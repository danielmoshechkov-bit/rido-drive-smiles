import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const LANGS = ['pl', 'en', 'ru', 'uk', 'de'];

serve(async (req) => {
  return phaseABlockedResponse(req, "workshop-translate");

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { text, source_lang = 'pl', target_lang } = await req.json();
    if (!text || typeof text !== 'string') return json({ error: 'text required' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const hash = await sha256(text.trim().toLowerCase());

    // Check cache
    const { data: cached } = await admin
      .from('translation_cache_global')
      .select('translations, id, hit_count')
      .eq('source_text_hash', hash)
      .eq('source_lang', source_lang)
      .maybeSingle();

    if (cached && cached.translations) {
      await admin.from('translation_cache_global').update({ hit_count: (cached.hit_count || 0) + 1 }).eq('id', cached.id);
      const t = cached.translations as Record<string, string>;
      return json({
        translations: t,
        text: target_lang ? (t[target_lang] || text) : text,
        cached: true,
      });
    }

    const KIMI = Deno.env.get('MOONSHOT_API_KEY') || Deno.env.get('KIMI_API_KEY');
    if (!KIMI) return json({ error: 'No translation API key' }, 500);

    const targets = LANGS.filter(l => l !== source_lang);
    const prompt = `Translate this automotive workshop text from ${source_lang} to these languages: ${targets.join(', ')}. Preserve all technical automotive terminology, part names, brand names and numbers exactly. Return ONLY a JSON object with keys = language codes, values = translations. No markdown, no explanation.

Text: ${text}`;

    const resp = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KIMI}` },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: 'You are a professional automotive translator. Reply only with the requested JSON.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('Kimi error:', resp.status, err);
      // Fallback: return source for all langs
      const fallback: Record<string, string> = {};
      for (const l of LANGS) fallback[l] = text;
      return json({ translations: fallback, text, cached: false, fallback: true });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    parsed[source_lang] = text;
    for (const l of LANGS) if (!parsed[l]) parsed[l] = text;

    // Save cache
    await admin.from('translation_cache_global').upsert(
      { source_text_hash: hash, source_lang, source_text: text, translations: parsed, hit_count: 1 },
      { onConflict: 'source_text_hash,source_lang' }
    );

    return json({
      translations: parsed,
      text: target_lang ? (parsed[target_lang] || text) : text,
      cached: false,
    });
  } catch (e) {
    console.error('workshop-translate error:', e);
    return json({ error: String(e) }, 500);
  }
});
