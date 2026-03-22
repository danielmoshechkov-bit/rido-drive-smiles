import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { entity_type, entity_id, fields } = await req.json()
    const results = []

    for (const field of fields) {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          entity_type,
          entity_id,
          field_name: field.field_name,
          source_text: field.source_text,
          target_lang: 'en',
          source_lang: 'pl'
        })
      })
      const d = await r.json()
      results.push({ field: field.field_name, batch_count: d.batch_count || 0, cached: d.cached })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Translate-batch error:', err)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
