import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { brief } = await req.json()
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ variants: [], error: 'Brak klucza Anthropic API' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const prompt = `Na podstawie poniższego briefu wygeneruj dokładnie 3 warianty reklamy. Odpowiedz TYLKO w formacie JSON (array 3 obiektów).
Każdy obiekt: { "headline": "...", "primary_text": "...", "description": "...", "cta": "...", "targeting_suggestions": "..." }

Brief:
- Platforma: ${brief.platform}
- Cel: ${brief.goal}
- Produkt: ${brief.product}
- Grupa docelowa: ${brief.audience || 'ogólna'}
- Budżet: ${brief.budget || 'nieokreślony'} zł/dzień
- Ton: ${brief.tone}
- USP: ${brief.usp || 'brak'}
- CTA: ${brief.cta || 'Dowiedz się więcej'}`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    const text = data?.content?.[0]?.text || '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const variants = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    return new Response(JSON.stringify({ variants }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ variants: [], error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})