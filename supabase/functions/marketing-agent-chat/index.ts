import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { messages, systemPrompt } = await req.json()
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey || apiKey.trim() === '') {
      console.error('ANTHROPIC_API_KEY is missing or empty')
      return new Response(JSON.stringify({ result: 'Brak klucza Anthropic API. Dodaj go w Ustawieniach Agencji lub jako secret Supabase.' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt || 'Jesteś RidoMarketer — ekspertem AI od reklam cyfrowych. Odpowiadaj po polsku.',
        messages: messages || [],
      }),
    })
    const data = await resp.json()
    if (!resp.ok) {
      console.error('Anthropic API error:', JSON.stringify(data))
      return new Response(JSON.stringify({ result: `Błąd API: ${data?.error?.message || resp.statusText}` }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const content = data?.content?.[0]?.text || 'Brak odpowiedzi od AI'
    return new Response(JSON.stringify({ result: content }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ error: String(err), result: `Błąd: ${String(err)}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})