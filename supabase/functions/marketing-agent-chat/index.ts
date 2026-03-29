import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { messages, systemPrompt } = await req.json()
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ result: 'Brak klucza Anthropic API. Dodaj go w Ustawieniach Agencji lub jako secret Supabase.' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt || 'Jesteś RidoMarketer — ekspertem AI od reklam cyfrowych. Odpowiadaj po polsku.',
        messages: messages || [],
      }),
    })
    const data = await resp.json()
    const content = data?.content?.[0]?.text || 'Brak odpowiedzi od AI'
    return new Response(JSON.stringify({ result: content }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), result: `Błąd: ${String(err)}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})