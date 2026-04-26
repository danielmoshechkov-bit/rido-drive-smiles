// Cron-driven: dodaje hot/warm leady (ai_priority='hot' lub ai_score>=70) do call_queue jeśli nie są jeszcze w kolejce
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Hot leady z ostatnich 24h, które mają telefon i nie są w kolejce
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: leads } = await supabase
      .from('marketing_leads')
      .select('id, phone, ai_priority, ai_score, status')
      .gte('created_at', since)
      .not('phone', 'is', null)
      .or('ai_priority.eq.hot,ai_score.gte.70')
      .in('status', ['new', 'contacted'])
      .limit(100)

    if (!leads?.length) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    let added = 0
    let skipped = 0

    for (const lead of leads) {
      // Sprawdź czy już jest w kolejce (queued/calling)
      const { data: existing } = await (supabase as any)
        .from('call_queue').select('id')
        .eq('lead_id', lead.id)
        .in('status', ['queued', 'calling'])
        .limit(1)
      
      if (existing?.length) { skipped++; continue }

      const { error } = await supabase.functions.invoke('add-to-call-queue', {
        body: { lead_id: lead.id }
      })
      if (!error) added++
    }

    return new Response(JSON.stringify({ success: true, added, skipped, total: leads.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
