// Add lead to manual call queue + generate AI call script via Claude
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function generateScript(lead: any, client: any): Promise<any> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return {
      opening: `Dzień dobry ${lead.name || ''}, mówi ${client?.contact_name || 'doradca'} z ${client?.company_name || 'firmy'}.`,
      discovery_question: 'Czy mogę zająć Panu/Pani chwilę?',
      key_benefits: [],
      objection_handlers: {},
      closing: 'Czy moglibyśmy umówić się na krótkie spotkanie?',
    }
  }

  const prompt = `Stwórz krótki skrypt rozmowy telefonicznej sprzedażowej (po polsku).

FIRMA: ${client?.company_name || ''} (${client?.industry || ''}, ${client?.city || ''})
LEAD: ${lead.name || 'klient'}, score: ${lead.ai_score || '?'}/100, priorytet: ${lead.ai_priority || 'warm'}
WIADOMOŚĆ OD LEADU: ${lead.message || 'brak'}

Zwróć TYLKO JSON (bez markdown):
{
  "opening": "Dzień dobry...",
  "discovery_question": "Co najbardziej...",
  "key_benefits": ["b1","b2","b3"],
  "objection_handlers": {"za drogo":"...","nie mam czasu":"...","muszę się zastanowić":"..."},
  "closing": "Czy moglibyśmy..."
}`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await r.json()
  const text = data?.content?.[0]?.text || '{}'
  const m = text.match(/\{[\s\S]*\}/)
  try { return m ? JSON.parse(m[0]) : {} } catch { return {} }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { lead_id, scheduled_for, priority_override } = await req.json()
    if (!lead_id) {
      return new Response(JSON.stringify({ error: 'lead_id required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { data: lead } = await supabase
      .from('marketing_leads')
      .select('*, client:agency_clients(*)')
      .eq('id', lead_id)
      .maybeSingle()

    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!lead.phone) {
      return new Response(JSON.stringify({ error: 'Lead has no phone' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Skip duplicate active queue entry
    const { data: existing } = await supabase
      .from('call_queue').select('id')
      .eq('lead_id', lead_id)
      .in('status', ['queued', 'calling'])
      .limit(1)
    if (existing?.length) {
      return new Response(JSON.stringify({ success: true, already_queued: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const script = await generateScript(lead, lead.client)

    const priority = priority_override || lead.ai_priority || 'warm'
    let when = scheduled_for ? new Date(scheduled_for) : new Date()
    if (!scheduled_for) {
      if (priority === 'hot') {
        // now
      } else if (priority === 'warm') {
        when.setHours(when.getHours() + 2)
      } else {
        when.setDate(when.getDate() + 1)
        when.setHours(10, 0, 0, 0)
      }
    }

    const ownerId = lead.client?.added_by || lead.client?.assigned_to || null

    const { data: inserted, error: insErr } = await supabase.from('call_queue').insert({
      lead_id: lead.id,
      client_id: lead.client_id,
      owner_user_id: ownerId,
      phone_to_call: lead.phone,
      lead_name: lead.name,
      ai_score: lead.ai_score,
      ai_priority: priority,
      ai_script: script,
      scheduled_for: when.toISOString(),
      status: 'queued',
    }).select().maybeSingle()

    if (insErr) throw insErr

    return new Response(JSON.stringify({ success: true, queue_id: inserted?.id, scheduled_for: when.toISOString() }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
