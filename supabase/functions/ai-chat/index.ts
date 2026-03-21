import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const CLAUDE_PROVIDER_KEYS = ['claude_haiku', 'claude_sonnet', 'claude_opus']
const GEMINI_PROVIDER_KEYS = ['google_gemini', 'gemini', 'gemini_flash', 'gemini_pro', 'Google Gemini', 'imagen3']

const RIDO_SYSTEM = `Jesteś RidoAI – inteligentnym asystentem życiowym platformy GetRido. Rozmawiasz naturalnie i po ludzku, po polsku. Jesteś pomocny, konkretny i bezpośredni. Nigdy nie ujawniaj jakiego modelu AI używasz.

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

    // Pobierz WSZYSTKICH dostawców żeby znaleźć klucze
    const { data: allProviders } = await supabase
      .from('ai_providers')
      .select('*')

    const uniqueProviders = (providers: any[]) => {
      const seen = new Set<string>()
      return providers.filter((provider) => {
        const id = provider?.id || provider?.provider_key
        if (!provider || !id || seen.has(id)) return false
        seen.add(id)
        return true
      })
    }

    const withKey = (provider: any) => provider?.api_key_encrypted && String(provider.api_key_encrypted).trim() !== ''

    // Szukaj dostawcy: najpierw aktywni z kluczem, potem nieaktywni z kluczem
    const findProvider = (...keys: string[]) => {
      for (const key of keys) {
        const exact = allProviders?.find((p: any) =>
          p.provider_key === key && withKey(p) && p.is_enabled
        )
        if (exact) return exact
      }
      for (const key of keys) {
        const withKey = allProviders?.find((p: any) =>
          p.provider_key === key && p.api_key_encrypted
        )
        if (withKey) return withKey
      }
      return null
    }

    // Znajdź Gemini elastycznie
    const findGemini = () => {
      return findProvider(...GEMINI_PROVIDER_KEYS) ||
        allProviders?.find((p: any) =>
          withKey(p) &&
          (p.display_name?.toLowerCase().includes('gemini') ||
           p.provider_key?.toLowerCase().includes('gemini') ||
           p.display_name?.toLowerCase().includes('imagen'))
        ) || null
    }

    const findClaude = () => findProvider(...CLAUDE_PROVIDER_KEYS)
    const findKimi = () => findProvider('kimi')
    const findOpenAI = () => findProvider('openai_mini', 'openai_gpt4o', 'openai')

    const getTextProviderChain = () => {
      const preferred = mode === 'cowork' || mode === 'rido_code'
        ? [
            findProvider('claude_sonnet'),
            findProvider('claude_haiku'),
            findKimi(),
            findGemini(),
            findOpenAI(),
          ]
        : mode === 'rido_pro'
          ? [
              findProvider('claude_opus'),
              findProvider('claude_sonnet'),
              findProvider('claude_haiku'),
              findKimi(),
              findGemini(),
              findOpenAI(),
            ]
          : [
              findProvider('claude_haiku'),
              findKimi(),
              findGemini(),
              findOpenAI(),
              findClaude(),
            ]

      return uniqueProviders(preferred.filter(withKey))
    }

    // ── INPAINTING ───────────────────────────────────────────────
    if (taskType === 'inpaint') {
      const p = findGemini()
      if (!p?.api_key_encrypted) {
        return jsonResp({ result: '⚠️ Brak klucza Google Gemini. Wejdź w Centrum AI → Dostawcy & API → Google Gemini i wpisz klucz z aistudio.google.com.' })
      }
      usedProvider = p.provider_key
      usedModel = 'gemini-3.1-flash-image-preview'

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${p.api_key_encrypted}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: `Edytuj TYLKO zaznaczony obszar (fioletowa maska). Zmień: ${query}. Reszta obrazu zostaje bez zmian.` },
              { inline_data: { mime_type: 'image/png', data: imageBase64 } },
              { inline_data: { mime_type: 'image/png', data: maskBase64 } }
            ]}],
            generationConfig: { responseModalities: ['IMAGE'] }
          })
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        console.error('Gemini inpaint error:', res.status, errText)
        const result = mapProviderError('Gemini', res.status, errText)
        await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: result, ms: Date.now() - t0 })
        return jsonResp({ result })
      }
      const d = await res.json()
      const imgPart = d?.candidates?.[0]?.content?.parts?.find((x: any) => x.inline_data?.data)
      const img = imgPart?.inline_data?.data
      const mime = imgPart?.inline_data?.mime_type || 'image/png'

      await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: img ? 'success' : 'error', ms: Date.now() - t0 })
      return jsonResp({ result: img ? '✨ Gotowe!' : `❌ Błąd: ${d?.error?.message || 'Brak obrazu'}`, images: img ? [`data:${mime};base64,${img}`] : [] })
    }

    // ── GENEROWANIE OBRAZÓW (Nano Banana) ───────────────────────
    if (taskType === 'image') {
      const p = findGemini()
      if (!p?.api_key_encrypted) {
        return jsonResp({ result: '⚠️ Brak klucza Google Gemini. Wejdź w Centrum AI → Dostawcy & API → Google Gemini i wpisz klucz z aistudio.google.com.' })
      }
      usedProvider = p.provider_key
      usedModel = 'gemini-3.1-flash-image-preview'

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${p.api_key_encrypted}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: query }] }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              imageConfig: { aspectRatio: '1:1' }
            }
          })
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        console.error('Gemini image error:', res.status, errText)
        const result = mapProviderError('Gemini Images', res.status, errText)
        await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: result, ms: Date.now() - t0 })
        return jsonResp({ result, images: [] })
      }
      const d = await res.json()
      const imgPart = d?.candidates?.[0]?.content?.parts?.find((x: any) => x.inline_data?.data)
      const b64 = imgPart?.inline_data?.data
      const mime = imgPart?.inline_data?.mime_type || 'image/png'

      await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: b64 ? 'success' : 'error', ms: Date.now() - t0 })
      return jsonResp({
        result: b64 ? '🎨 Oto Twoja grafika (Nano Banana)!' : `❌ Błąd: ${d?.error?.message || 'Brak obrazu'}`,
        images: b64 ? [`data:${mime};base64,${b64}`] : []
      })
    }

    // ── ROUTING TEKSTU ───────────────────────────────────────────
    const textProviders = getTextProviderChain()

    const history = [
      ...(messages || []).filter((m: any) => m.content).map((m: any) => ({ role: m.role, content: m.content }))
    ]
    if (!history.length || history[history.length - 1]?.role !== 'user') {
      history.push({ role: 'user', content: query })
    }
    const sys = mode === 'cowork'
      ? RIDO_SYSTEM + '\n\nJesteś w trybie Cowork — gdy użytkownik prosi o akcję w portalu, wykonaj ją!'
      : RIDO_SYSTEM

    if (!textProviders.length) {
      return jsonResp({ result: '⚠️ Brak kluczy API. Wejdź w Centrum AI → Dostawcy & API i dodaj klucz Claude lub Gemini.' })
    }

    // OpenAI-compatible (Kimi, OpenAI, Gemini chat)
    const oaiEndpoints: Record<string, string> = {
      kimi: 'https://api.moonshot.cn/v1/chat/completions',
      openai_gpt4o: 'https://api.openai.com/v1/chat/completions',
      openai_mini: 'https://api.openai.com/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
      gemini_flash: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      gemini_pro: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      google_gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    }

    const claudeModels: Record<string, string> = {
      claude_haiku: 'claude-haiku-4-5-20251001',
      claude_sonnet: 'claude-sonnet-4-6',
      claude_opus: 'claude-opus-4-6',
    }

    let lastError = '⚠️ Żaden aktywny dostawca AI nie odpowiedział.'

    for (const p of textProviders) {
      const apiKey = p?.api_key_encrypted
      if (!apiKey) continue

      usedProvider = p.provider_key
      usedModel = p.default_model || p.provider_key

      const isGemini = p.display_name?.toLowerCase().includes('gemini') ||
                       p.provider_key?.toLowerCase().includes('gemini') ||
                       p.display_name?.toLowerCase().includes('imagen')
      const endpoint = oaiEndpoints[p.provider_key] ||
                       (isGemini ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : null)

      if (endpoint) {
        if (isGemini) usedModel = 'gemini-2.5-flash'
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
          lastError = mapProviderError(p.display_name || p.provider_key, res.status, errText)
          console.error('Provider error:', p.provider_key, res.status, errText)
          await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
          continue
        }

        await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
        if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
        const d = await res.json()
        return jsonResp({ result: d.choices?.[0]?.message?.content || 'Brak odpowiedzi' })
      }

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
        lastError = mapProviderError(p.display_name || p.provider_key, res.status, errText)
        console.error('Claude error:', p.provider_key, res.status, errText)
        await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
        continue
      }

      await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
      if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
      const d = await res.json()
      return jsonResp({ result: d.content?.[0]?.text || 'Brak odpowiedzi' })
    }

    if (stream) return sseText(lastError)
    return jsonResp({ result: lastError })

  } catch (err) {
    console.error('ai-chat error:', err)
    await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: String(err), ms: Date.now() - t0 }).catch(() => {})
    return new Response(
      JSON.stringify({ result: `⚠️ Błąd: ${String(err)}` }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})

const jsonResp = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
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
  } catch { /* ignoruj błędy logowania */ }
}

function mapProviderError(providerName: string, status: number, rawError: string) {
  const err = rawError.toLowerCase()
  if (status === 429 || err.includes('rate') || err.includes('too many requests')) {
    return `⚠️ ${providerName}: zbyt wiele zapytań. Spróbuj ponownie za chwilę.`
  }
  if (status === 402 || err.includes('payment required') || err.includes('quota exceeded') || err.includes('billing') || err.includes('credit balance is too low')) {
    return `⚠️ ${providerName}: brak środków lub limit został wyczerpany. Sprawdź billing tego dostawcy.`
  }
  if (status === 401 || status === 403 || err.includes('invalid api key') || err.includes('permission')) {
    return `⚠️ ${providerName}: nieprawidłowy klucz API albo brak uprawnień.`
  }
  return `⚠️ ${providerName}: błąd dostawcy AI (${status}).`
}

function sseText(text: string) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
  return new Response(payload, {
    headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
