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

function detectLang(text: string): string {
  if (/[а-яёА-ЯЁ]/.test(text)) {
    if (/[їієґЇІЄҐ]/.test(text)) return 'ua'
    return 'ru'
  }
  if (/[äöüÄÖÜß]/.test(text) && !/[ąęśćźżóńł]/.test(text)) return 'de'
  if (/[ąęśćźżóńłĄĘŚĆŹŻÓŃŁ]/.test(text)) return 'pl'
  return 'pl'
}

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
    const { listing_id, listing_type, title, description, source_lang } = await req.json()

    if (!listing_id || !title) {
      return json({ error: 'listing_id i title są wymagane' }, 400)
    }

    const detectedLang = source_lang || detectLang(title + ' ' + (description || ''))
    const kimiKey = Deno.env.get('KIMI_API_KEY')
    
    if (!kimiKey) {
      return json({ error: 'KIMI_API_KEY nie skonfigurowany', skipped: true })
    }

    const translated: Record<string, { title: string; description: string }> = {}

    for (const [langCode, langName] of Object.entries(LANGS)) {
      if (langCode === detectedLang) continue

      // Check cache
      const { data: cached } = await sb
        .from('listing_translations')
        .select('title_translated, description_translated')
        .eq('listing_id', listing_id)
        .eq('target_lang', langCode)
        .single()

      if (cached?.title_translated) {
        translated[langCode] = {
          title: cached.title_translated,
          description: cached.description_translated || ''
        }
        continue
      }

      const textToTranslate = `TITLE: ${title}\nDESCRIPTION: ${description || ''}`
      
      try {
        const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${kimiKey}`
          },
          body: JSON.stringify({
            model: 'moonshot-v1-8k',
            messages: [{
              role: 'system',
              content: `Translate marketplace listing from Polish to ${langName}. 
Return format exactly:
TITLE: [translated title]
DESCRIPTION: [translated description]
Keep brand names, model numbers, prices unchanged.`
            }, {
              role: 'user',
              content: textToTranslate
            }],
            temperature: 0.1,
            max_tokens: 1000
          })
        })

        const data = await res.json()
        const text = data.choices?.[0]?.message?.content?.trim() || ''
        
        const titleMatch = text.match(/TITLE:\s*(.+?)(?:\nDESCRIPTION:|$)/s)
        const descMatch = text.match(/DESCRIPTION:\s*(.+?)$/s)
        
        const translatedTitle = titleMatch?.[1]?.trim() || title
        const translatedDesc = descMatch?.[1]?.trim() || description || ''

        const { error: upsertErr } = await sb.from('listing_translations').upsert({
          listing_id,
          listing_type: listing_type || 'general',
          target_lang: langCode,
          title_translated: translatedTitle,
          description_translated: translatedDesc,
          source_lang: detectedLang,
          translated_by: 'kimi',
          translated_at: new Date().toISOString()
        }, {
          onConflict: 'listing_id,listing_type,target_lang',
          ignoreDuplicates: false
        })
        if (upsertErr) {
          console.error(`Upsert error ${langCode}:`, upsertErr.message, upsertErr.details)
        }

        translated[langCode] = { title: translatedTitle, description: translatedDesc }

      } catch (e) {
        console.error(`Translation error ${langCode}:`, e)
      }
    }

    return json({
      success: true,
      listing_id,
      source_lang: detectedLang,
      translated_to: Object.keys(translated),
      count: Object.keys(translated).length
    })

  } catch (err: any) {
    console.error('auto-translate-listing error:', err)
    return json({ error: err.message }, 500)
  }
})
