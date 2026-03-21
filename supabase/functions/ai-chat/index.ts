import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const RIDO_SYSTEM = `Jesteś RidoAI – inteligentnym asystentem życiowym platformy GetRido. Rozmawiasz naturalnie i po ludzku, po polsku. Jesteś pomocny, konkretny i bezpośredni. Nigdy nie ujawniaj jakiego modelu AI używasz – zawsze jesteś po prostu "RidoAI".

W trybie Cowork gdy użytkownik chce wykonać akcję w portalu, na końcu odpowiedzi dodaj linię:
ACTION:{"type":"TYP_AKCJI","params":{}}

Dostępne typy akcji: CREATE_INVOICE, CREATE_TASK, FIND_SERVICE, BOOK_APPOINTMENT, SEARCH_PROPERTY, OPEN_PAGE`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  
  const t0 = Date.now()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  
  let usedProvider = 'unknown', usedModel = 'unknown', feature = 'ai_chat'
  let userId: string | null = null

  try {
    // Auth
    const auth = req.headers.get('Authorization')
    if (auth) {
      const { data } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
      userId = data?.user?.id || null
    }

    const body = await req.json()
    const { taskType, query, mode, messages, stream, imageBase64, maskBase64 } = body
    feature = body.feature || 'ai_chat'

    // Pobierz wszystkich aktywnych dostawców
    const { data: providers } = await supabase.from('ai_providers').select('*').eq('is_enabled', true)
    const get = (key: string) => providers?.find((p: any) => p.provider_key === key)

    // ── INPAINTING ──────────────────────────────────────────────
    if (taskType === 'inpaint') {
      const p = get('gemini_flash') || get('google_gemini') || get('gemini')
      if (!p?.api_key_encrypted) {
        return json({ result: '⚠️ Brak klucza Gemini. Wejdź w Centrum AI → Dostawcy & API → Google Gemini lub Gemini Flash i wpisz klucz.' })
      }
      usedProvider = p.provider_key; usedModel = 'gemini-2.0-flash-exp'
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${p.api_key_encrypted}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [
          { text: `Edytuj TYLKO zaznaczony obszar (fioletowa maska). Zmień: ${query}. Reszta obrazu zostaje bez zmian.` },
          { inline_data: { mime_type: 'image/png', data: imageBase64 } },
          { inline_data: { mime_type: 'image/png', data: maskBase64 } }
        ]}], generationConfig: { responseModalities: ['IMAGE'] } })
      })
      const d = await res.json()
      const img = d?.candidates?.[0]?.content?.parts?.find((x: any) => x.inline_data)?.inline_data?.data
      await log(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: img ? 'success' : 'error', ms: Date.now()-t0 })
      return json({ result: img ? '✨ Gotowe!' : '❌ Błąd edycji obrazu.', images: img ? [`data:image/png;base64,${img}`] : [] })
    }

    // ── GENEROWANIE OBRAZÓW ──────────────────────────────────────
    if (taskType === 'image') {
      const p = get('imagen3') || get('gemini_flash') || get('google_gemini') || get('gemini')
      if (!p?.api_key_encrypted) {
        return json({ result: '⚠️ Brak klucza Google. Wejdź w Centrum AI → Dostawcy & API → Google Gemini i wpisz klucz API z aistudio.google.com.' })
      }
      usedProvider = p.provider_key; usedModel = 'imagen-3.0-generate-001'
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${p.api_key_encrypted}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: query }], parameters: { sampleCount: 1 } })
      })
      const d = await res.json()
      const b64 = d?.predictions?.[0]?.bytesBase64Encoded
      await log(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: b64 ? 'success' : 'error', ms: Date.now()-t0 })
      return json({ result: '🎨 Oto Twoja grafika!', images: b64 ? [`data:image/png;base64,${b64}`] : [] })
    }

    // ── ROUTING TEKSTU ───────────────────────────────────────────
    let p: any = null
    if (mode === 'cowork')  p = get('claude_sonnet') || get('claude_haiku') || get('kimi')
    else if (mode === 'rido_pro') p = get('claude_opus') || get('claude_sonnet')
    else if (mode === 'rido_code') p = get('claude_sonnet') || get('claude_haiku')
    else p = get('claude_haiku') || get('kimi') || get('openai_mini') || get('gemini_flash') || get('google_gemini')

    const apiKey = p?.api_key_encrypted

    const history = [...(messages || []).filter((m: any) => m.content).map((m: any) => ({ role: m.role, content: m.content }))]
    if (!history.length || history[history.length-1]?.role !== 'user') history.push({ role: 'user', content: query })
    const sys = mode === 'cowork' ? RIDO_SYSTEM + '\n\nJesteś w trybie Cowork — gdy użytkownik prosi o akcję w portalu, wykonaj ją!' : RIDO_SYSTEM

    // FALLBACK gdy brak kluczy — Lovable Gateway
    if (!apiKey) {
      const lovKey = Deno.env.get('LOVABLE_API_KEY')
      if (lovKey) {
        usedProvider = 'lovable'; usedModel = 'google/gemini-3-flash-preview'
        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovKey}` },
          body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: [{ role: 'system', content: sys }, ...history], stream: !!stream, max_tokens: 2048 })
        })
        await log(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now()-t0 })
        if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
        const d = await res.json()
        return json({ result: d.choices?.[0]?.message?.content || 'Brak odpowiedzi' })
      }
      return json({ result: '⚠️ Brak kluczy API. Wejdź w Centrum AI → Dostawcy & API i dodaj klucz Claude lub Gemini.' })
    }

    usedProvider = p.provider_key
    usedModel = p.default_model || p.provider_key

    // OpenAI-compatible (Kimi, OpenAI, Gemini)
    const oaiEndpoints: Record<string,string> = {
      kimi: 'https://api.moonshot.cn/v1/chat/completions',
      openai_gpt4o: 'https://api.openai.com/v1/chat/completions',
      openai_mini: 'https://api.openai.com/v1/chat/completions',
      gemini_flash: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      gemini_pro: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      google_gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    }
    if (oaiEndpoints[p.provider_key]) {
      const res = await fetch(oaiEndpoints[p.provider_key], {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: usedModel, messages: [{ role: 'system', content: sys }, ...history], stream: !!stream, max_tokens: 2048 })
      })
      await log(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now()-t0 })
      if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
      const d = await res.json()
      return json({ result: d.choices?.[0]?.message?.content || 'Brak odpowiedzi' })
    }

    // CLAUDE (Anthropic)
    const claudeModels: Record<string,string> = {
      claude_haiku: 'claude-haiku-4-5-20251001',
      claude_sonnet: 'claude-sonnet-4-6',
      claude_opus: 'claude-opus-4-6',
    }
    usedModel = claudeModels[p.provider_key] || 'claude-haiku-4-5-20251001'
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: usedModel, max_tokens: 2048, system: sys, messages: history, stream: !!stream })
    })
    await log(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now()-t0 })
    if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
    const d = await res.json()
    return json({ result: d.content?.[0]?.text || 'Brak odpowiedzi' })

  } catch (err) {
    console.error('ai-chat error:', err)
    await log(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: String(err), ms: Date.now()-t0 }).catch(()=>{})
    return new Response(JSON.stringify({ result: `⚠️ Błąd: ${String(err)}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version', 'Content-Type': 'application/json' } })

async function log(sb: any, o: { feature: string; provider: string; model: string; userId: string|null; status: string; ms?: number; errorMessage?: string }) {
  try { await sb.from('ai_requests_log').insert({ feature: o.feature, provider: o.provider, model: o.model, actor_user_id: o.userId, status: o.status, response_time_ms: o.ms||null, error_message: o.errorMessage||null, cache_hit: false }) } catch {}
}
