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
    // Read selected model from admin panel
    let selectedModel = 'moonshot-v1-8k'
    let selectedProvider: 'kimi' | 'anthropic' | 'lovable' = 'kimi'

    const { data: agentConfig } = await sb
      .from('ai_agents_config')
      .select('model, is_active')
      .eq('agent_id', 'listing_translation')
      .maybeSingle()

    if (agentConfig?.model) {
      selectedModel = agentConfig.model
      if (selectedModel.startsWith('claude')) {
        selectedProvider = 'anthropic'
      } else if (selectedModel.startsWith('google/') || selectedModel.startsWith('openai/')) {
        selectedProvider = 'lovable'
      } else {
        selectedProvider = 'kimi'
      }
    }

    console.log(`Using provider=${selectedProvider} model=${selectedModel}`)

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

    const ids = batch.map((b: any) => b.id)
    await sb.from('translation_queue')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .in('id', ids)

    let processed = 0
    let failed = 0

    for (let i = 0; i < batch.length; i += MAX_PARALLEL) {
      const chunk = batch.slice(i, i + MAX_PARALLEL)

      const results = await Promise.allSettled(
        chunk.map((item: any) => translateOne(sb, item, selectedModel, selectedProvider))
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

    return json({ success: true, processed, failed, remaining: count || 0, provider: selectedProvider, model: selectedModel })
  } catch (err: any) {
    console.error('translation-queue-worker error:', err)
    return json({ error: err.message }, 500)
  }
})

async function translateOne(
  sb: any, item: any, model: string, provider: 'kimi' | 'anthropic' | 'lovable'
) {
  console.log('translateOne START:', item.listing_id, 'type:', item.listing_type, 'provider:', provider)

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
      skippedCount++
      continue
    }

    const langName = LANG_NAMES[lang] || lang
    let result: { title: string; description: string } | null = null

    if (provider === 'anthropic') {
      result = await callAnthropicWithRetry(item.title, item.description || '', langName, model)
    } else if (provider === 'lovable') {
      result = await callLovableWithRetry(item.title, item.description || '', langName, model)
    } else {
      result = await callKimiWithRetry(item.title, item.description || '', langName, model)
    }

    if (!result) {
      failedCount++
      continue
    }

    const row = {
      listing_id: item.listing_id,
      listing_type: item.listing_type || 'general',
      target_lang: lang,
      title_translated: result.title,
      description_translated: result.description,
      source_lang: item.source_lang || 'pl',
      translated_by: provider,
      translated_at: new Date().toISOString()
    }

    const { error: upsertError } = await sb
      .from('listing_translations')
      .upsert(row, {
        onConflict: 'listing_id,listing_type,target_lang',
        ignoreDuplicates: false
      })

    if (upsertError) {
      console.error(`Upsert FAILED ${item.listing_id}/${lang}:`, JSON.stringify(upsertError))
      const { error: insertError } = await sb.from('listing_translations').insert(row)
      if (insertError) {
        console.error(`Insert ALSO FAILED:`, JSON.stringify(insertError))
        failedCount++
      } else {
        savedCount++
      }
    } else {
      savedCount++
    }
  }

  console.log(`translateOne DONE: ${item.listing_id} saved=${savedCount} skipped=${skippedCount} failed=${failedCount}`)

  if (savedCount === 0 && skippedCount === 0) {
    throw new Error(`No translations saved for ${item.listing_id} (failed=${failedCount})`)
  }

  return { success: true, listing_id: item.listing_id, saved: savedCount }
}

const TRANSLATE_PROMPT = (langName: string) =>
  `Translate marketplace listing to ${langName}.\nReturn EXACTLY:\nTITLE: [translation]\nDESC: [translation]\nKeep brand names, model numbers, prices, URLs unchanged.`

function parseTranslation(text: string, fallbackTitle: string, fallbackDesc: string) {
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\nDESC:|$)/s)
  const descMatch = text.match(/DESC:\s*(.+?)$/s)
  return {
    title: titleMatch?.[1]?.trim() || fallbackTitle,
    description: descMatch?.[1]?.trim() || fallbackDesc
  }
}

// ── Kimi / Moonshot ──
async function callKimiWithRetry(
  title: string, description: string, targetLangName: string, model: string, attempt = 1
): Promise<{ title: string; description: string } | null> {
  const apiKey = Deno.env.get('KIMI_API_KEY')
  if (!apiKey) throw new Error('KIMI_API_KEY not configured')

  try {
    const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: TRANSLATE_PROMPT(targetLangName) },
          { role: 'user', content: `TITLE: ${title}\nDESC: ${description}` }
        ],
        temperature: 0.1,
        max_tokens: 800
      })
    })

    console.log(`Kimi status: ${res.status} lang=${targetLangName} attempt=${attempt}`)

    if (res.status === 429) {
      if (attempt >= 3) return null
      const retryAfter = parseInt(res.headers.get('retry-after') || '60')
      await sleep(Math.min(retryAfter * 1000, 60000))
      return callKimiWithRetry(title, description, targetLangName, model, attempt + 1)
    }

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`Kimi error ${res.status}:`, errBody.substring(0, 300))
      throw new Error(`Kimi API error: ${res.status}`)
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    if (!text) return null

    return parseTranslation(text, title, description)
  } catch (e: any) {
    console.error(`Kimi error attempt=${attempt}:`, e.message)
    if (attempt >= 3) return null
    await sleep(5000)
    return callKimiWithRetry(title, description, targetLangName, model, attempt + 1)
  }
}

// ── Anthropic / Claude ──
async function callAnthropicWithRetry(
  title: string, description: string, targetLangName: string, model: string, attempt = 1
): Promise<{ title: string; description: string } | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `${TRANSLATE_PROMPT(targetLangName)}\n\nTITLE: ${title}\nDESC: ${description}`
        }]
      })
    })

    console.log(`Anthropic status: ${res.status} lang=${targetLangName} attempt=${attempt}`)

    if (res.status === 429) {
      if (attempt >= 3) return null
      await sleep(60000)
      return callAnthropicWithRetry(title, description, targetLangName, model, attempt + 1)
    }

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`Anthropic error ${res.status}:`, errBody.substring(0, 300))
      throw new Error(`Anthropic API error: ${res.status}`)
    }

    const data = await res.json()
    const text = data.content?.[0]?.text?.trim() || ''
    if (!text) return null

    return parseTranslation(text, title, description)
  } catch (e: any) {
    console.error(`Anthropic error attempt=${attempt}:`, e.message)
    if (attempt >= 3) return null
    await sleep(5000)
    return callAnthropicWithRetry(title, description, targetLangName, model, attempt + 1)
  }
}

// ── Lovable AI Gateway (Gemini / GPT) ──
async function callLovableWithRetry(
  title: string, description: string, targetLangName: string, model: string, attempt = 1
): Promise<{ title: string; description: string } | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured')

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: TRANSLATE_PROMPT(targetLangName) },
          { role: 'user', content: `TITLE: ${title}\nDESC: ${description}` }
        ],
        temperature: 0.1,
        max_tokens: 800
      })
    })

    console.log(`Lovable status: ${res.status} lang=${targetLangName} attempt=${attempt}`)

    if (res.status === 429 || res.status === 402) {
      if (attempt >= 3) return null
      await sleep(30000)
      return callLovableWithRetry(title, description, targetLangName, model, attempt + 1)
    }

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`Lovable error ${res.status}:`, errBody.substring(0, 300))
      throw new Error(`Lovable API error: ${res.status}`)
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    if (!text) return null

    return parseTranslation(text, title, description)
  } catch (e: any) {
    console.error(`Lovable error attempt=${attempt}:`, e.message)
    if (attempt >= 3) return null
    await sleep(5000)
    return callLovableWithRetry(title, description, targetLangName, model, attempt + 1)
  }
}
