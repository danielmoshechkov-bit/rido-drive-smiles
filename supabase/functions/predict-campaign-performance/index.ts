import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!.trim()

  const { data: campaigns } = await supabase.from('agency_campaigns').select('*').eq('status', 'active')
  let processed = 0

  for (const campaign of campaigns || []) {
    const { data: history } = await supabase
      .from('campaign_snapshots')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('snapshot_at', { ascending: false })
      .limit(336)

    if (!history || history.length < 3) continue

    const prompt = `Analizujesz kampanię reklamową i przewidujesz wyniki za 7 dni.

KAMPANIA: ${campaign.name} (${campaign.platform})
AKTUALNY ROAS: ${campaign.roas_current}
BUDŻET DZIENNY: ${campaign.daily_budget} PLN

HISTORIA (od najnowszego):
${history.slice(0, 50).map((h: any) => `${h.snapshot_at}: ROAS=${h.roas}, CTR=${h.ctr}%, CPM=${h.cpm}`).join('\n')}

Odpowiedz WYŁĄCZNIE JSON:
{"trend":"growing"|"stable"|"declining"|"volatile","predicted_roas_7d":number,"risk_level":"low"|"medium"|"high"|"critical","recommendation":"max 150 zn PL","confidence":0-100}`

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await resp.json()
      const prediction = JSON.parse(data.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

      await supabase.from('agency_campaigns').update({
        predicted_roas_7d: prediction.predicted_roas_7d,
        trend: prediction.trend,
        risk_level: prediction.risk_level,
        ai_recommendation: prediction.recommendation,
        prediction_confidence: prediction.confidence,
        prediction_updated_at: new Date().toISOString()
      }).eq('id', campaign.id)
      processed++
    } catch (e) {
      console.error('Prediction error for', campaign.id, e)
    }
  }

  return new Response(JSON.stringify({ success: true, processed }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
