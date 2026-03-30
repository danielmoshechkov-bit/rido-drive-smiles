import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      return new Response(JSON.stringify({ result: 'Brak klucza Anthropic API.' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Build enriched context from database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch campaign data
    const { data: campaigns } = await supabase
      .from('agency_campaigns')
      .select('name, platform, status, daily_budget, roas_current, spend_today, predicted_roas_7d, trend, risk_level, ai_recommendation')
      .order('roas_current', { ascending: true })
      .limit(50)

    // Fetch recent agent actions (feedback loop)
    const { data: recentActions } = await supabase
      .from('agent_actions')
      .select('action_type, description, status, outcome_roas_before, outcome_roas_after, proposed_at')
      .order('proposed_at', { ascending: false })
      .limit(20)

    // Fetch knowledge base
    const { data: knowledgeBase } = await supabase
      .from('platform_knowledge')
      .select('platform, category, title, summary, published_at')
      .eq('is_active', true)
      .order('relevance_score', { ascending: false })
      .limit(15)

    // Fetch clients summary
    const { data: clients } = await supabase
      .from('agency_clients')
      .select('company_name, status, monthly_budget, total_spent, total_leads')
      .limit(20)

    const now = new Date().toISOString()
    const enrichedPrompt = `${systemPrompt || 'Jesteś RidoMarketer — ekspertem AI od reklam cyfrowych dla platformy GetRido.'}

AKTUALNE DANE KAMPANII (${now}):
${campaigns?.length ? JSON.stringify(campaigns, null, 2) : 'Brak danych kampanii — poproś użytkownika o połączenie API Meta/Google.'}

KLIENCI AGENCJI:
${clients?.length ? JSON.stringify(clients, null, 2) : 'Brak klientów.'}

OSTATNIE AKCJE (feedback loop — ucz się co działało):
${recentActions?.length ? JSON.stringify(recentActions, null, 2) : 'Brak historii akcji.'}

BAZA WIEDZY O PLATFORMACH REKLAMOWYCH (aktualizowana automatycznie):
${knowledgeBase?.length ? knowledgeBase.map(k => `[${k.platform}/${k.category}] ${k.title}: ${k.summary}`).join('\n') : 'Baza wiedzy pusta — uruchom Knowledge Update Bot.'}

INSTRUKCJE:
- Zawsze odnoś się do aktualnych danych kampanii
- Gdy proponujesz akcję, podaj szacowany efekt w % i uzasadnienie
- Porównuj z poprzednimi akcjami — ucz się co działało
- Odpowiadaj po polsku, konkretnie z liczbami
- Formatuj odpowiedzi używając markdown (nagłówki, listy, pogrubienia)
- Jeśli proponujesz konkretną akcję, zaznacz ją tagiem [AKCJA]: opis`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: enrichedPrompt,
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
