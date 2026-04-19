import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_SYSTEM_PROMPT = 'Jesteś ekspertem od marketingu lokalnych usług. Tworzysz krótkie, atrakcyjne, profesjonalne opisy firm usługodawców na podstawie surowego, krótkiego opisu od właściciela. Pisz po polsku, naturalnie. Maksymalnie 3-4 zdania (300-500 znaków). Bez emoji, bez wykrzykników, bez CAPS LOCK. Zwracaj WYŁĄCZNIE gotowy opis — bez wstępów typu "Oto opis:", bez cudzysłowów.'
const AI_REQUEST_TIMEOUT_MS = 20000

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { input, company_name, category } = await req.json()
    if (!input || typeof input !== 'string' || input.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'Wprowadź krótki opis (min. 5 znaków)' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Pobierz konfigurację agenta z panelu admina
    const { data: agent } = await sb
      .from('ai_agents_config')
      .select('model, system_prompt, is_active')
      .eq('agent_id', 'provider_description')
      .maybeSingle()

    if (agent && agent.is_active === false) {
      return new Response(JSON.stringify({ error: 'Generator opisów jest wyłączony przez administratora' }), {
        status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const model = agent?.model || 'moonshot-v1-8k'
    const systemPrompt = agent?.system_prompt || DEFAULT_SYSTEM_PROMPT

    const userPrompt = `Krótki opis od właściciela: "${input.trim()}"
${company_name ? `Nazwa firmy: ${company_name}` : ''}
${category ? `Kategoria: ${category}` : ''}

Wygeneruj atrakcyjny opis firmy.`

    let description = ''

    // Routing: kimi vs lovable gateway
    if (model.startsWith('moonshot')) {
      const kimiKey = Deno.env.get('KIMI_API_KEY')
      if (!kimiKey) throw new Error('Brak klucza KIMI_API_KEY w konfiguracji')
      const resp = await fetchWithTimeout('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${kimiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error?.message || 'Błąd Kimi API')
      description = data?.choices?.[0]?.message?.content?.trim() || ''
    } else if (model.startsWith('claude')) {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
      if (!anthropicKey) throw new Error('Brak klucza ANTHROPIC_API_KEY')
      const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model, max_tokens: 400, system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error?.message || 'Błąd Anthropic API')
      description = data?.content?.[0]?.text?.trim() || ''
    } else {
      // Lovable AI Gateway (google/* lub openai/*)
      const lovableKey = Deno.env.get('LOVABLE_API_KEY')
      if (!lovableKey) throw new Error('Brak klucza LOVABLE_API_KEY')
      const resp = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      })
      const data = await resp.json()
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: 'Zbyt wiele zapytań AI. Spróbuj za chwilę.' }), {
          status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: 'Brak środków AI. Doładuj konto.' }), {
          status: 402, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      if (!resp.ok) throw new Error(data?.error?.message || 'Błąd AI Gateway')
      description = data?.choices?.[0]?.message?.content?.trim() || ''
    }

    // Czyszczenie cudzysłowów
    description = description.replace(/^["'„]|["'"]$/g, '').trim()

    if (!description) throw new Error('Pusty wynik z modelu AI')

    return new Response(JSON.stringify({ description, model_used: model }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('generate-provider-description error:', err)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Generator opisu przekroczył limit czasu. Spróbuj ponownie.' }), {
        status: 504, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
