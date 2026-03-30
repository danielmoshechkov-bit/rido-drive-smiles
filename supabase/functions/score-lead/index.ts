import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const lead = await req.json()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!.trim()

  let campaign: any = null
  if (lead.campaign_id) {
    const { data } = await supabase.from('agency_campaigns').select('*').eq('id', lead.campaign_id).single()
    campaign = data
  }

  const prompt = `Oceń jakość leadu reklamowego (1-100).

DANE LEADU:
Imię: ${lead.name || 'nie podano'}
Email: ${lead.email || 'nie podano'}
Telefon: ${lead.phone || 'nie podany'}
Miasto: ${lead.city || 'nie podano'}
Firma: ${lead.company || 'nie podano'}
Wiadomość: ${lead.message || 'brak'}
Godzina: ${new Date().toLocaleString('pl-PL')}

ŹRÓDŁO: ${campaign?.name || 'nieznana kampania'} (${campaign?.platform || '?'})
ROAS kampanii: ${campaign?.roas_current || 'brak'}

Odpowiedz WYŁĄCZNIE JSON:
{"score":1-100,"priority":"hot"|"warm"|"cold","recommendation":"instrukcja PL max 100 zn","follow_up_timing":"1h"|"4h"|"24h"|"48h"|"nurturing","reasoning":"uzasadnienie PL max 200 zn"}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
  })
  const data = await resp.json()
  const scoring = JSON.parse(data.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

  const { data: savedLead } = await supabase.from('marketing_leads').insert({
    name: lead.name, email: lead.email, phone: lead.phone, city: lead.city,
    company: lead.company, message: lead.message,
    source_platform: campaign?.platform, source_campaign_id: campaign?.id,
    client_id: lead.client_id || null,
    ai_score: scoring.score, ai_priority: scoring.priority,
    ai_recommendation: scoring.recommendation,
    follow_up_timing: scoring.follow_up_timing, ai_reasoning: scoring.reasoning,
    status: 'new'
  }).select().single()

  return new Response(JSON.stringify({ success: true, lead_id: savedLead?.id, score: scoring }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
