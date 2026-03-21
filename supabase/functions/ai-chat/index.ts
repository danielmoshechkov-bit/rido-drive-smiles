import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const RIDO_SYSTEM = `Jesteś RidoAI – inteligentnym asystentem życiowym platformy GetRido. Rozmawiasz naturalnie i po ludzku, po polsku. Jesteś pomocny, konkretny i bezpośredni. Nigdy nie ujawniaj jakiego modelu AI używasz – jesteś po prostu "RidoAI".

Możesz pomagać użytkownikom w:
- Wyszukiwaniu nieruchomości, usług, ofert na portalu
- Odpowiadaniu na pytania o portal i jego funkcje
- Tworzeniu treści, tekstów, opisów
- Analizie i wycenach
- Ogólnych pytaniach i rozmowach

Gdy użytkownik prosi o wygenerowanie grafiki/obrazu w trybie chat, odpowiedz normalnie że to zrobisz i dodaj na końcu:
IMAGE_REQUEST:true

W trybie Cowork gdy użytkownik chce wykonać akcję w portalu, na końcu odpowiedzi dodaj:
ACTION:{"type":"TYP_AKCJI","params":{}}
Dostępne akcje: CREATE_INVOICE, CREATE_TASK, FIND_SERVICE, BOOK_APPOINTMENT, SEARCH_PROPERTY, OPEN_PAGE`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const t0 = Date.now()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let usedProvider = 'unknown', usedModel = 'unknown', feature = 'ai_chat'
  let userId: string | null = null

  try {
    const auth = req.headers.get('Authorization')
    if (auth) {
      const { data } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
      userId = data?.user?.id || null
    }

    const body = await req.json()
    const { taskType, query, mode, messages, stream, imageBase64, maskBase64 } = body
    feature = body.feature || 'ai_chat'

    // Pobierz WSZYSTKICH dostawców
    const { data: allProviders, error: provErr } = await supabase.from('ai_providers').select('*')
    console.log(`[ai-chat] Loaded ${allProviders?.length || 0} providers, error: ${provErr?.message || 'none'}`)

    // Helper: check if provider has a valid key
    const hasKey = (p: any) => p?.api_key_encrypted && String(p.api_key_encrypted).trim() !== ''

    // Find provider by key(s)
    const findByKey = (...keys: string[]) => {
      // First: enabled + has key
      for (const key of keys) {
        const found = allProviders?.find((p: any) => p.provider_key === key && hasKey(p) && p.is_enabled)
        if (found) return found
      }
      // Then: just has key (even disabled)
      for (const key of keys) {
        const found = allProviders?.find((p: any) => p.provider_key === key && hasKey(p))
        if (found) return found
      }
      return null
    }

    // Find any Gemini provider with key
    const findGemini = () => {
      const byKey = findByKey('gemini', 'google_gemini', 'gemini_flash', 'gemini_pro', 'imagen3')
      if (byKey) return byKey
      // Fuzzy search by name
      return allProviders?.find((p: any) =>
        hasKey(p) && (
          p.display_name?.toLowerCase().includes('gemini') ||
          p.provider_key?.toLowerCase().includes('gemini') ||
          p.display_name?.toLowerCase().includes('imagen')
        )
      ) || null
    }

    // ── INPAINTING ───────────────────────────────────────────────
    if (taskType === 'inpaint') {
      const p = findGemini()
      if (!hasKey(p)) {
        return jsonResp({ result: '⚠️ Brak klucza Google Gemini. Wejdź w Centrum AI → Dostawcy & API.' })
      }
      usedProvider = p.provider_key
      usedModel = 'gemini-2.0-flash-exp'
      console.log(`[ai-chat] Inpaint using ${usedProvider}`)

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${p.api_key_encrypted}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: `Edytuj TYLKO zaznaczony obszar. Zmień: ${query}. Reszta bez zmian.` },
              { inline_data: { mime_type: 'image/png', data: imageBase64 } },
              { inline_data: { mime_type: 'image/png', data: maskBase64 } }
            ]}],
            generationConfig: { responseModalities: ['IMAGE'] }
          })
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        console.error('[ai-chat] Inpaint error:', res.status, errText)
        return jsonResp({ result: mapError('Gemini', res.status, errText) })
      }
      const d = await res.json()
      const img = d?.candidates?.[0]?.content?.parts?.find((x: any) => x.inline_data?.data)?.inline_data?.data
      await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: img ? 'success' : 'error', ms: Date.now() - t0 })
      return jsonResp({ result: img ? '✨ Gotowe!' : '❌ Nie udało się edytować obrazu.', images: img ? [`data:image/png;base64,${img}`] : [] })
    }

    // ── GENEROWANIE OBRAZÓW (Nano Banana) ────────────────────────
    if (taskType === 'image') {
      const p = findGemini()
      if (!hasKey(p)) {
        return jsonResp({ result: '⚠️ Brak klucza Google Gemini. Wejdź w Centrum AI → Dostawcy & API.' })
      }
      usedProvider = p.provider_key
      usedModel = 'gemini-2.5-flash-image'
      console.log(`[ai-chat] Image generation using Nano Banana (gemini-2.5-flash-image)`)

      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.api_key_encrypted}` },
        body: JSON.stringify({
          model: 'gemini-2.5-flash-preview-image-generation',
          messages: [{ role: 'user', content: query }],
          modalities: ['image', 'text']
        })
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('[ai-chat] Image gen error:', res.status, errText)
        await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: errText, ms: Date.now() - t0 })
        return jsonResp({ result: mapError('Gemini Image', res.status, errText) })
      }

      const d = await res.json()
      const imgData = d?.choices?.[0]?.message?.images?.[0]?.image_url?.url
      const textReply = d?.choices?.[0]?.message?.content || ''
      
      await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: imgData ? 'success' : 'error', ms: Date.now() - t0 })
      return jsonResp({
        result: imgData ? '🎨 Oto Twoja grafika!' : (textReply || '❌ Nie udało się wygenerować obrazu.'),
        images: imgData ? [imgData] : []
      })
    }

    // ── ROUTING TEKSTU ───────────────────────────────────────────
    const history = [
      ...(messages || []).filter((m: any) => m.content).map((m: any) => ({ role: m.role, content: m.content }))
    ]
    if (!history.length || history[history.length - 1]?.role !== 'user') {
      history.push({ role: 'user', content: query })
    }
    const sys = mode === 'cowork'
      ? RIDO_SYSTEM + '\n\nJesteś w trybie Cowork — gdy użytkownik prosi o akcję w portalu, wykonaj ją!'
      : RIDO_SYSTEM

    // Build provider chain based on mode
    const chain: any[] = []
    if (mode === 'rido_pro') {
      chain.push(findByKey('claude_opus'), findByKey('claude_sonnet'), findByKey('claude_haiku'))
    } else if (mode === 'cowork' || mode === 'rido_code') {
      chain.push(findByKey('claude_sonnet'), findByKey('claude_haiku'))
    } else {
      chain.push(findByKey('claude_haiku'))
    }
    // Always add general fallbacks
    chain.push(findByKey('kimi'), findGemini(), findByKey('openai_mini', 'openai_gpt4o', 'openai'))

    // Deduplicate and filter to providers with keys
    const seen = new Set<string>()
    const providers = chain.filter((p: any) => {
      if (!p || !hasKey(p)) return false
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })

    console.log(`[ai-chat] Text providers chain: ${providers.map((p: any) => p.provider_key).join(' → ')}`)

    if (!providers.length) {
      const msg = '⚠️ Brak kluczy API. Wejdź w Centrum AI → Dostawcy & API i dodaj klucz Claude lub Gemini.'
      if (stream) return sseText(msg)
      return jsonResp({ result: msg })
    }

    // OpenAI-compatible endpoints
    const oaiEndpoints: Record<string, string> = {
      kimi: 'https://api.moonshot.cn/v1/chat/completions',
      openai_gpt4o: 'https://api.openai.com/v1/chat/completions',
      openai_mini: 'https://api.openai.com/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
    }

    const claudeModels: Record<string, string> = {
      claude_haiku: 'claude-haiku-4-5-20251001',
      claude_sonnet: 'claude-sonnet-4-6',
      claude_opus: 'claude-opus-4-6',
    }

    let lastError = '⚠️ Żaden dostawca AI nie odpowiedział.'

    for (const p of providers) {
      const apiKey = p.api_key_encrypted
      usedProvider = p.provider_key
      usedModel = p.default_model || p.provider_key

      const isGemini = p.display_name?.toLowerCase().includes('gemini') ||
                       p.provider_key?.toLowerCase().includes('gemini') ||
                       p.display_name?.toLowerCase().includes('imagen')
      const isClaude = p.provider_key?.startsWith('claude')

      console.log(`[ai-chat] Trying provider: ${p.provider_key} (isGemini=${isGemini}, isClaude=${isClaude})`)

      try {
        if (isClaude) {
          // Anthropic API
          usedModel = claudeModels[p.provider_key] || 'claude-haiku-4-5-20251001'
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: usedModel,
              max_tokens: 2048,
              system: sys,
              messages: history,
              stream: !!stream
            })
          })

          if (!res.ok) {
            const errText = await res.text()
            lastError = mapError(p.display_name || 'Claude', res.status, errText)
            console.error(`[ai-chat] Claude ${p.provider_key} error ${res.status}:`, errText.substring(0, 200))
            await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
            continue
          }

          console.log(`[ai-chat] ✅ Claude ${p.provider_key} success`)
          await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
          if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
          const d = await res.json()
          return jsonResp({ result: d.content?.[0]?.text || 'Brak odpowiedzi' })

        } else if (isGemini) {
          // Gemini via OpenAI-compatible endpoint
          usedModel = 'gemini-2.5-flash'
          const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: usedModel,
              messages: [{ role: 'system', content: sys }, ...history],
              stream: !!stream,
              max_tokens: 2048
            })
          })

          if (!res.ok) {
            const errText = await res.text()
            lastError = mapError('Gemini', res.status, errText)
            console.error(`[ai-chat] Gemini error ${res.status}:`, errText.substring(0, 200))
            await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
            continue
          }

          console.log(`[ai-chat] ✅ Gemini success`)
          await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
          if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
          const d = await res.json()
          return jsonResp({ result: d.choices?.[0]?.message?.content || 'Brak odpowiedzi' })

        } else {
          // OpenAI-compatible (Kimi, OpenAI, etc.)
          const endpoint = oaiEndpoints[p.provider_key]
          if (!endpoint) {
            console.log(`[ai-chat] No endpoint for ${p.provider_key}, skipping`)
            continue
          }

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: usedModel,
              messages: [{ role: 'system', content: sys }, ...history],
              stream: !!stream,
              max_tokens: 2048
            })
          })

          if (!res.ok) {
            const errText = await res.text()
            lastError = mapError(p.display_name || p.provider_key, res.status, errText)
            console.error(`[ai-chat] ${p.provider_key} error ${res.status}:`, errText.substring(0, 200))
            await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
            continue
          }

          console.log(`[ai-chat] ✅ ${p.provider_key} success`)
          await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
          if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
          const d = await res.json()
          return jsonResp({ result: d.choices?.[0]?.message?.content || 'Brak odpowiedzi' })
        }
      } catch (providerErr) {
        lastError = `⚠️ ${p.display_name || p.provider_key}: błąd połączenia.`
        console.error(`[ai-chat] ${p.provider_key} exception:`, providerErr)
        continue
      }
    }

    console.error(`[ai-chat] All providers failed. Last error: ${lastError}`)
    if (stream) return sseText(lastError)
    return jsonResp({ result: lastError })

  } catch (err) {
    console.error('[ai-chat] Fatal error:', err)
    await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: String(err), ms: Date.now() - t0 }).catch(() => {})
    return new Response(
      JSON.stringify({ result: `⚠️ Błąd serwera: ${String(err)}` }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})

const jsonResp = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
  })

async function logReq(sb: any, o: {
  feature: string; provider: string; model: string; userId: string | null
  status: string; ms?: number; errorMessage?: string
}) {
  try {
    await sb.from('ai_requests_log').insert({
      feature: o.feature, provider: o.provider, model: o.model,
      actor_user_id: o.userId, status: o.status,
      response_time_ms: o.ms || null, error_message: o.errorMessage || null, cache_hit: false
    })
  } catch { /* ignore */ }
}

function mapError(name: string, status: number, raw: string) {
  const err = raw.toLowerCase()
  if (status === 429 || err.includes('rate') || err.includes('too many')) {
    return `⚠️ ${name}: zbyt wiele zapytań. Spróbuj za chwilę.`
  }
  if (status === 402 || err.includes('credit') || err.includes('billing') || err.includes('quota') || err.includes('payment')) {
    return `⚠️ ${name}: brak środków. Doładuj konto dostawcy.`
  }
  if (status === 401 || status === 403 || err.includes('invalid') || err.includes('permission') || err.includes('authentication')) {
    return `⚠️ ${name}: nieprawidłowy klucz API.`
  }
  if (status === 404 || err.includes('not found')) {
    return `⚠️ ${name}: model nie istnieje (${status}).`
  }
  return `⚠️ ${name}: błąd (${status}).`
}

function sseText(text: string) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
  return new Response(payload, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
