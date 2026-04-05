import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRIORITY_MAP: Record<string, number> = {
  manual: 10,
  api: 7,
  crm: 5,
  baselinker: 3,
  import: 1
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), {
      status: s,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  try {
    const body = await req.json()
    const listings = Array.isArray(body) ? body : [body]

    let added = 0
    let skipped = 0
    const errors: string[] = []

    const CHUNK = 100
    for (let i = 0; i < listings.length; i += CHUNK) {
      const chunk = listings.slice(i, i + CHUNK)
      const toInsert = []

      for (const item of chunk) {
        if (!item.listing_id || !item.title) {
          errors.push(`Missing listing_id or title`)
          skipped++
          continue
        }

        // Check if already queued
        const { data: existing } = await sb
          .from('translation_queue')
          .select('id')
          .eq('listing_id', item.listing_id)
          .in('status', ['pending', 'processing'])
          .maybeSingle()

        if (existing) { skipped++; continue }

        // Check if fully translated
        const targetLangs = item.target_langs || ['en', 'ru', 'ua', 'de', 'vi', 'kz']
        const { count } = await sb
          .from('listing_translations')
          .select('*', { count: 'exact', head: true })
          .eq('listing_id', item.listing_id)

        if ((count || 0) >= targetLangs.length) { skipped++; continue }

        const source = item.source || 'manual'
        toInsert.push({
          listing_id: item.listing_id,
          listing_type: item.listing_type || 'general',
          title: item.title,
          description: item.description || '',
          source_lang: item.source_lang || 'pl',
          target_langs: targetLangs,
          priority: item.priority ?? (PRIORITY_MAP[source] || 5),
          source,
          status: 'pending',
          attempts: 0
        })
      }

      if (toInsert.length > 0) {
        const { error } = await sb.from('translation_queue').insert(toInsert)
        if (error) errors.push(error.message)
        else added += toInsert.length
      }
    }

    // For small batches, trigger worker immediately
    if (added > 0 && added <= 5) {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/translation-queue-worker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ trigger: 'immediate' })
      }).catch(() => {})
    }

    return json({
      success: true,
      added,
      skipped,
      total_sent: listings.length,
      queue_triggered: added > 0 && added <= 5,
      errors: errors.slice(0, 10)
    })
  } catch (err: any) {
    console.error('translation-queue-add error:', err)
    return json({ error: err.message }, 500)
  }
})
