import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALL_LANGS = ['en','ru','ua','de','vi','ro','tr','zh','ar','fr','es','it','sk','cs']
const LANG_NAMES: Record<string,string> = {
  pl:'Polish', en:'English', ru:'Russian', ua:'Ukrainian', de:'German',
  vi:'Vietnamese', ro:'Romanian', tr:'Turkish', zh:'Chinese (Simplified)',
  ar:'Arabic', fr:'French', es:'Spanish', it:'Italian', sk:'Slovak', cs:'Czech'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { 
    status, headers: { ...cors, 'Content-Type': 'application/json' } 
  })

  try {
    const { entity_type, entity_id, field_name, source_text, target_lang, source_lang = 'pl' } = await req.json()
    if (!source_text || !entity_id) return json({ text: source_text || '', cached: true })
    if (target_lang === source_lang) return json({ text: source_text, cached: true })

    // Hash source text for change detection
    const enc = new TextEncoder()
    const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(source_text))
    const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16)

    // Check cache
    const { data: cached } = await sb
      .from('translations_cache')
      .select('translated_text,source_hash')
      .eq('entity_type', entity_type)
      .eq('entity_id', entity_id)
      .eq('field_name', field_name)
      .eq('target_lang', target_lang)
      .single()

    if (cached?.source_hash === hash) {
      return json({ text: cached.translated_text, cached: true })
    }

    // Check which langs already cached
    const { data: existing } = await sb
      .from('translations_cache')
      .select('target_lang,source_hash')
      .eq('entity_type', entity_type)
      .eq('entity_id', entity_id)
      .eq('field_name', field_name)

    const existingValid = new Set((existing || []).filter(r => r.source_hash === hash).map(r => r.target_lang))

    // If source changed, clear old translations
    if ((existing || []).some(r => r.source_hash !== hash)) {
      await sb.from('translations_cache')
        .delete()
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .eq('field_name', field_name)
      existingValid.clear()
    }

    // Determine which langs to translate — batch all if cache empty
    const toLang = existingValid.size === 0
      ? ALL_LANGS.filter(l => l !== source_lang)
      : [target_lang].filter(l => !existingValid.has(l))

    if (toLang.length === 0) {
      const { data: r } = await sb
        .from('translations_cache')
        .select('translated_text')
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .eq('field_name', field_name)
        .eq('target_lang', target_lang)
        .single()
      return json({ text: r?.translated_text || source_text, cached: true })
    }

    // Get Kimi API key
    const { data: provider } = await sb
      .from('ai_providers')
      .select('api_key_encrypted')
      .eq('provider_key', 'kimi')
      .single()

    if (!provider?.api_key_encrypted) {
      return json({ text: source_text, cached: false, error: 'no_translation_key' })
    }

    // Batch prompt
    const langList = toLang.map(l => `"${l}": "${LANG_NAMES[l] || l}"`).join(', ')
    const prompt = `Translate the following text into these languages: {${langList}}.
Return ONLY a valid JSON object. Keys = language codes, values = translations.
No markdown, no explanations, no extra text.
Text: """${source_text}"""`

    const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.api_key_encrypted}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: 'You are a professional translator. Always respond with valid JSON only. No markdown.' },
          { role: 'user', content: prompt }
        ]
      })
    })

    const data = await res.json()
    let translations: Record<string, string> = {}
    try {
      const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
      translations = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      translations[target_lang] = source_text
    }

    // Save batch to cache
    const rows = Object.entries(translations)
      .filter(([l, t]) => l && t && l !== source_lang)
      .map(([l, t]) => ({
        entity_type,
        entity_id,
        field_name,
        source_lang,
        target_lang: l,
        source_hash: hash,
        translated_text: String(t),
        translated_by: 'kimi',
      }))

    if (rows.length > 0) {
      await sb.from('translations_cache').upsert(rows, {
        onConflict: 'entity_type,entity_id,field_name,target_lang'
      })
    }

    return json({ text: translations[target_lang] || source_text, cached: false, batch_count: rows.length })
  } catch (err) {
    console.error('Translation error:', err)
    return json({ text: '', error: 'internal_error' }, 500)
  }
})
