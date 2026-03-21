import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const RIDO_STYLE = `Jesteś RidoAI – inteligentnym asystentem życiowym platformy GetRido.
Rozmawiasz naturalnie i po ludzku, po polsku.
W trybie Cowork gdy użytkownik chce wykonać akcję w portalu, na końcu odpowiedzi dodaj:
ACTION:{"type":"AKCJA","params":{}}
Dostępne akcje: CREATE_INVOICE, CREATE_TASK, FIND_SERVICE, BOOK_APPOINTMENT, SEARCH_PROPERTY, OPEN_PAGE`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json()
    const { taskType, query, mode, messages, stream, imageBase64, maskBase64 } = body

    const { data: providers } = await supabase.from('ai_providers').select('*').eq('is_enabled', true)

    const getP = (key: string) => providers?.find((p: any) => p.provider_key === key)

    // INPAINTING
    if (taskType === 'inpaint') {
      const p = getP('gemini_flash')
      const apiKey = p?.api_key_encrypted
      if (!apiKey) return new Response(JSON.stringify({ result: '⚠️ Brak dostawcy dla edycji obrazów.' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [
          { text: `Edytuj TYLKO zaznaczony obszar. Zmień: ${query}. Reszta obrazu zostaje bez zmian.` },
          { inline_data: { mime_type: 'image/png', data: imageBase64 } },
          { inline_data: { mime_type: 'image/png', data: maskBase64 } }
        ]}], generationConfig: { responseModalities: ['IMAGE'] } })
      })
      const d = await res.json()
      const imgData = d?.candidates?.[0]?.content?.parts?.find((p: any) => p.inline_data)?.inline_data?.data
      return new Response(JSON.stringify({ result: imgData ? '✨ Gotowe!' : 'Błąd edycji.', images: imgData ? [`data:image/png;base64,${imgData}`] : [] }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // GENEROWANIE OBRAZÓW
    if (taskType === 'image') {
      const p = getP('imagen3') || getP('gemini_flash')
      const apiKey = p?.api_key_encrypted
      if (!apiKey) return new Response(JSON.stringify({ result: '⚠️ Dodaj klucz Gemini w Centrum AI → Dostawcy & API.' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: query }], parameters: { sampleCount: 1 } })
      })
      const d = await res.json()
      const b64 = d?.predictions?.[0]?.bytesBase64Encoded
      return new Response(JSON.stringify({ result: '🎨 Oto Twoja grafika!', images: b64 ? [`data:image/png;base64,${b64}`] : [] }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ROUTING TEKSTU
    const featureMap: Record<string, string> = { cowork: 'cowork', rido_pro: 'chat_pro', rido_code: 'chat_complex', rido_vision: 'vision' }
    const feature = featureMap[mode || ''] || (query?.split(' ').length > 15 ? 'chat_complex' : 'chat_simple')
    const p = getP('claude_haiku') || getP('kimi') || getP('openai_mini') || getP('gemini_flash')

    const apiKey = p?.api_key_encrypted
    if (!apiKey) {
      // Fallback to Lovable AI Gateway
      const lovableKey = Deno.env.get('LOVABLE_API_KEY')
      if (lovableKey) {
        const history = [...(messages || []).filter((m: any) => m.content).map((m: any) => ({ role: m.role, content: m.content }))]
        if (!history.length || history[history.length-1]?.role !== 'user') history.push({ role: 'user', content: query })
        const systemPrompt = mode === 'cowork' ? RIDO_STYLE + '\n\nJesteś w trybie Cowork.' : RIDO_STYLE

        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovableKey}` },
          body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: [{ role: 'system', content: systemPrompt }, ...history], stream: !!stream, max_tokens: 2048 })
        })
        if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
        const d = await res.json()
        return new Response(JSON.stringify({ result: d.choices?.[0]?.message?.content || 'Brak odpowiedzi' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ result: '⚠️ Brak klucza API. Wejdź w Centrum AI → Dostawcy & API i dodaj klucz.' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const history = [...(messages || []).filter((m: any) => m.content).map((m: any) => ({ role: m.role, content: m.content }))]
    if (!history.length || history[history.length-1]?.role !== 'user') history.push({ role: 'user', content: query })

    const systemPrompt = mode === 'cowork' ? RIDO_STYLE + '\n\nJesteś w trybie Cowork.' : RIDO_STYLE

    const openAIKeys = ['kimi','openai_gpt4o','openai_mini','gemini_flash','gemini_pro']
    if (p && openAIKeys.includes(p.provider_key)) {
      const endpoints: Record<string,string> = {
        kimi: 'https://api.moonshot.cn/v1/chat/completions',
        openai_gpt4o: 'https://api.openai.com/v1/chat/completions',
        openai_mini: 'https://api.openai.com/v1/chat/completions',
        gemini_flash: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        gemini_pro: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      }
      const res = await fetch(endpoints[p.provider_key], {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: p.default_model, messages: [{ role: 'system', content: systemPrompt }, ...history], stream: !!stream, max_tokens: 2048 })
      })
      if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
      const d = await res.json()
      return new Response(JSON.stringify({ result: d.choices?.[0]?.message?.content || 'Brak odpowiedzi' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // CLAUDE
    const models: Record<string,string> = { claude_haiku: 'claude-haiku-4-5-20251001', claude_sonnet: 'claude-sonnet-4-6', claude_opus: 'claude-opus-4-6' }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: models[p!.provider_key] || 'claude-haiku-4-5-20251001', max_tokens: 2048, system: systemPrompt, messages: history, stream: !!stream })
    })
    if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
    const d = await res.json()
    return new Response(JSON.stringify({ result: d.content?.[0]?.text || 'Brak odpowiedzi' }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('ai-chat error:', err)
    return new Response(JSON.stringify({ result: `⚠️ Błąd: ${String(err)}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})