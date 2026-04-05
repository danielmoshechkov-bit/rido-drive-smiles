import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 10
const MAX_PARALLEL = 3

const LANG_NAMES: Record<string, string> = {
  en: 'English', ru: 'Russian', ua: 'Ukrainian',
  de: 'German', vi: 'Vietnamese', kz: 'Kazakh'
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), {
      status: s,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  try {
    const { data: batch, error } = await sb
      .from('translation_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw error
    if (!batch || batch.length === 0) {
      return json({ success: true, message: 'Queue empty', processed: 0 })
    }

    // Mark as processing
    const ids = batch.map((b: any) => b.id)
    await sb.from('translation_queue')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .in('id', ids)

    let processed = 0
    let failed = 0

    for (let i = 0; i < batch.length; i += MAX_PARALLEL) {
      const chunk = batch.slice(i, i + MAX_PARALLEL)

      const results = await Promise.allSettled(
        chunk.map((item: any) => translateOne(sb, item))
      )

      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        const item = chunk[j]
        const newAttempts = (item.attempts || 0) + 1

        if (result.status === 'fulfilled' && result.value.success) {
          await sb.from('translation_queue').update({
            status: 'done',
            attempts: newAttempts,
            completed_at: new Date().toISOString()
          }).eq('id', item.id)
          processed++
        } else {
          const errMsg = result.status === 'rejected'
            ? result.reason?.message
            : result.value?.error
          const newStatus = newAttempts >= (item.max_attempts || 3) ? 'failed' : 'pending'
          await sb.from('translation_queue').update({
            status: newStatus,
            attempts: newAttempts,
            error_msg: (errMsg || '').substring(0, 500)
          }).eq('id', item.id)
          failed++
        }
      }

      if (i + MAX_PARALLEL < batch.length) await sleep(2000)
    }

    const { count } = await sb
      .from('translation_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    return json({ success: true, processed, failed, remaining: count || 0 })
  } catch (err: any) {
    console.error('translation-queue-worker error:', err)
    return json({ error: err.message }, 500)
  }
})

async function translateOne(sb: any, item: any) {
  const kimiKey = Deno.env.get('KIMI_API_KEY')
  if (!kimiKey) throw new Error('KIMI_API_KEY not configured')

  console.log('translateOne START:', item.listing_id, 'type:', item.listing_type, 'title:', (item.title || '').substring(0, 40))

  const langs = item.target_langs || ['en', 'ru', 'ua', 'de', 'vi', 'kz']
  let savedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const lang of langs) {
    const { data: existing } = await sb
      .from('listing_translations')
      .select('id')
      .eq('listing_id', item.listing_id)
      .eq('listing_type', item.listing_type || 'general')
      .eq('target_lang', lang)
      .maybeSingle()

    if (existing) {
      console.log(`Already exists: ${item.listing_id}/${lang}`)
      skippedCount++
      continue
    }

    const langName = LANG_NAMES[lang] || lang
    console.log(`Calling Kimi for ${item.listing_id} -> ${langName}`)
    const result = await callKimiWithRetry(kimiKey, item.title, item.description || '', langName)

    if (!result) {
      console.error(`Kimi returned null for ${item.listing_id}/${lang}`)
      failedCount++
      continue
    }

    console.log(`Kimi OK for ${item.listing_id}/${lang}: "${(result.title || '').substring(0, 30)}"`)

    const row = {
      listing_id: item.listing_id,
      listing_type: item.listing_type || 'general',
      target_lang: lang,
      title_translated: result.title,
      description_translated: result.description,
      source_lang: item.source_lang || 'pl',
      translated_by: 'kimi',
      translated_at: new Date().toISOString()
    }

    // Try upsert first
    const { error: upsertError } = await sb
      .from('listing_translations')
      .upsert(row, {
        onConflict: 'listing_id,listing_type,target_lang',
        ignoreDuplicates: false
      })

    if (upsertError) {
      console.error(`Upsert FAILED ${item.listing_id}/${lang}:`, JSON.stringify(upsertError))
      // Fallback: plain insert
      const { error: insertError } = await sb
        .from('listing_translations')
        .insert(row)

      if (insertError) {
        console.error(`Insert ALSO FAILED ${item.listing_id}/${lang}:`, JSON.stringify(insertError))
        failedCount++
      } else {
        console.log(`Insert fallback OK: ${item.listing_id}/${lang}`)
        savedCount++
      }
    } else {
      console.log(`Upsert OK: ${item.listing_id}/${lang}`)
      savedCount++
    }
  }

  console.log(`translateOne DONE: ${item.listing_id} saved=${savedCount} skipped=${skippedCount} failed=${failedCount}`)

  if (savedCount === 0 && skippedCount === 0) {
    throw new Error(`No translations saved for ${item.listing_id} (failed=${failedCount})`)
  }

  return { success: true, listing_id: item.listing_id, saved: savedCount }
}

async function callKimiWithRetry(
  apiKey: string, title: string, description: string, targetLangName: string, attempt = 1
): Promise<{ title: string; description: string } | null> {
  try {
    const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [{
          role: 'system',
          content: `Translate marketplace listing to ${targetLangName}.\nReturn EXACTLY:\nTITLE: [translation]\nDESC: [translation]\nKeep brand names, model numbers, prices, URLs unchanged.`
        }, {
          role: 'user',
          content: `TITLE: ${title}\nDESC: ${description}`
        }],
        temperature: 0.1,
        max_tokens: 800
      })
    })

    if (res.status === 429) {
      if (attempt >= 3) return null
      const retryAfter = parseInt(res.headers.get('retry-after') || '60')
      await sleep(Math.min(retryAfter * 1000, 60000))
      return callKimiWithRetry(apiKey, title, description, targetLangName, attempt + 1)
    }

    if (!res.ok) throw new Error(`Kimi API error: ${res.status}`)

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    const titleMatch = text.match(/TITLE:\s*(.+?)(?:\nDESC:|$)/s)
    const descMatch = text.match(/DESC:\s*(.+?)$/s)

    return {
      title: titleMatch?.[1]?.trim() || title,
      description: descMatch?.[1]?.trim() || description
    }
  } catch (e) {
    if (attempt >= 3) return null
    await sleep(5000)
    return callKimiWithRetry(apiKey, title, description, targetLangName, attempt + 1)
  }
}
