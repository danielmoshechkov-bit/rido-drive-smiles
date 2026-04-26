// Public webhook to receive leads from external agencies/Zapier/Make
// URL: /functions/v1/external-lead-webhook?source_id=UUID&secret=XXX
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const url = new URL(req.url)
    const sourceId = url.searchParams.get('source_id')
    const secret = url.searchParams.get('secret') || req.headers.get('x-webhook-secret')

    if (!sourceId) {
      return new Response(JSON.stringify({ error: 'Missing source_id' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { data: source, error: sErr } = await supabase
      .from('external_lead_sources')
      .select('*')
      .eq('id', sourceId)
      .maybeSingle()

    if (sErr || !source) {
      return new Response(JSON.stringify({ error: 'Source not found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (source.webhook_secret !== secret) {
      return new Response(JSON.stringify({ error: 'Invalid secret' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!source.is_active) {
      return new Response(JSON.stringify({ error: 'Source is inactive' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))

    // Accept array of leads or single lead
    const leads = Array.isArray(body) ? body : (Array.isArray(body.leads) ? body.leads : [body])
    let imported = 0
    let skipped = 0

    for (const item of leads) {
      const name = item.name || item.full_name || item.imie ||
        `${item.first_name || ''} ${item.last_name || ''}`.trim() || null
      const phone = (item.phone || item.telefon || item.phone_number || '').toString().trim() || null
      const email = (item.email || item.mail || '').toString().trim().toLowerCase() || null
      const city = item.city || item.miasto || null
      const message = item.message || item.wiadomosc || item.note || `Webhook: ${source.source_name}`

      if (!phone && !email) { skipped++; continue }

      // Dedupe by phone
      if (phone) {
        const { data: dup } = await supabase
          .from('marketing_leads')
          .select('id').eq('client_id', source.client_id).eq('phone', phone).limit(1)
        if (dup?.length) { skipped++; continue }
      }

      const { error: insErr } = await supabase.from('marketing_leads').insert({
        client_id: source.client_id,
        name, phone, email, city, message,
        source_platform: 'external',
        status: 'new',
      })

      if (insErr) { skipped++; continue }
      imported++
    }

    await supabase.from('external_lead_sources').update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: 'success',
      last_sync_message: `Webhook: ${imported} imported, ${skipped} skipped`,
      total_imported: (source.total_imported || 0) + imported,
    }).eq('id', sourceId)

    await supabase.from('lead_import_logs').insert({
      source_id: sourceId,
      leads_found: leads.length,
      leads_imported: imported,
      leads_skipped: skipped,
    })

    return new Response(JSON.stringify({ success: true, imported, skipped }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
