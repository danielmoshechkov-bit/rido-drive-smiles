import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LANGS: Record<string, string> = {
  en: 'English', ru: 'Russian', ua: 'Ukrainian',
  de: 'German', vi: 'Vietnamese', kz: 'Kazakh'
}

const SUPPORTED_LANGS = Object.keys(LANGS)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  try {
    const body = await req.json()
    const { section, keys, langs = SUPPORTED_LANGS, force = false } = body

    if (!section || !keys) {
      return json({ error: 'section i keys są wymagane' }, 400)
    }

    const results: Record<string, Record<string, string>> = {}
    let translated = 0, skipped = 0

    for (const lang of langs) {
      if (!SUPPORTED_LANGS.includes(lang)) continue
      results[lang] = {}

      const { data: existing } = await sb
        .from('ui_translations')
        .select('key, value')
        .eq('lang_code', lang)
        .eq('section', section)

      const existingMap = new Map(
        (existing || []).map((r: any) => [r.key, r.value])
      )

      const missingKeys: Record<string, string> = {}
      for (const [k, v] of Object.entries(keys)) {
        if (!force && existingMap.has(k)) {
          results[lang][k] = existingMap.get(k)!
          skipped++
        } else {
          missingKeys[k] = v as string
        }
      }

      if (Object.keys(missingKeys).length === 0) continue

      const kimiKey = Deno.env.get('KIMI_API_KEY')
      if (!kimiKey) {
        for (const [k, v] of Object.entries(missingKeys)) {
          results[lang][k] = v as string
        }
        continue
      }

      const prompt = `Translate this JSON from Polish to ${LANGS[lang]}.
Return ONLY valid JSON object with same keys. Translate only values.
Keep unchanged: GetRido, RidoAI, Marketplace, AI, PPF, Uber, Bolt, IBAN, E100, TAXI, RODO, URLs.
Use natural, fluent ${LANGS[lang]} for a marketplace portal.

${JSON.stringify(missingKeys, null, 2)}`

      const kimiRes = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kimiKey}`
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 2000
        })
      })

      const kimiData = await kimiRes.json()
      const rawText = kimiData.choices?.[0]?.message?.content?.trim() || ''
      const cleanText = rawText.replace(/```json|```/g, '').trim()

      let translatedKeys: Record<string, string> = {}
      try {
        translatedKeys = JSON.parse(cleanText)
      } catch {
        translatedKeys = missingKeys as Record<string, string>
      }

      const upsertData = Object.entries(translatedKeys).map(([k, v]) => ({
        lang_code: lang,
        section,
        key: k,
        value: v,
        model_used: 'kimi',
        translated_at: new Date().toISOString()
      }))

      if (upsertData.length > 0) {
        await sb.from('ui_translations').upsert(upsertData, {
          onConflict: 'lang_code,section,key'
        })
        translated += upsertData.length
      }

      results[lang] = { ...Object.fromEntries(existingMap), ...translatedKeys }
    }

    return json({
      success: true,
      section,
      stats: { translated, skipped, langs: langs.length },
      results
    })

  } catch (err: any) {
    console.error('auto-translate-ui error:', err)
    return json({ error: err.message }, 500)
  }
})
