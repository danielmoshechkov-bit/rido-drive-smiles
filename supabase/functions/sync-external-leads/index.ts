// Polling sync for Google Sheets + Telegram (per-client tokens)
// Triggered by pg_cron every 15 minutes
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function syncSheets(supabase: any, source: any) {
  if (!source.sheets_spreadsheet_id || !source.sheets_access_token) {
    return { found: 0, imported: 0, skipped: 0, error: 'Missing spreadsheet_id or access_token' }
  }
  const startRow = (source.sheets_last_row_imported || 1) + 1
  const range = `${source.sheets_tab_name || 'Arkusz1'}!A${startRow}:Z1000`
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${source.sheets_spreadsheet_id}/values/${range}`,
    { headers: { Authorization: `Bearer ${source.sheets_access_token}` } }
  )
  if (!r.ok) return { found: 0, imported: 0, skipped: 0, error: `Sheets API ${r.status}` }
  const data = await r.json()
  const rows: string[][] = data.values || []
  const mapping = source.sheets_column_mapping || { '0': 'name', '1': 'phone', '2': 'email' }

  let imported = 0, skipped = 0
  for (const row of rows) {
    const lead: Record<string, string> = {}
    for (const [idx, field] of Object.entries(mapping)) {
      lead[field as string] = row[parseInt(idx)] || ''
    }
    if (!lead.phone && !lead.email) { skipped++; continue }
    if (lead.phone) {
      const { data: dup } = await supabase
        .from('marketing_leads').select('id')
        .eq('client_id', source.client_id).eq('phone', lead.phone).limit(1)
      if (dup?.length) { skipped++; continue }
    }
    const { error } = await supabase.from('marketing_leads').insert({
      client_id: source.client_id,
      name: lead.name || null,
      phone: lead.phone || null,
      email: (lead.email || '').toLowerCase() || null,
      city: lead.city || null,
      message: lead.message || `Sheets: ${source.source_name}`,
      source_platform: 'external',
      status: 'new',
    })
    if (error) { skipped++; continue }
    imported++
  }

  await supabase.from('external_lead_sources').update({
    sheets_last_row_imported: (source.sheets_last_row_imported || 1) + rows.length,
  }).eq('id', source.id)

  return { found: rows.length, imported, skipped }
}

async function syncTelegram(supabase: any, source: any) {
  if (!source.telegram_bot_token) {
    return { found: 0, imported: 0, skipped: 0, error: 'Missing telegram_bot_token' }
  }
  const offset = (source.telegram_last_update_id || 0) + 1
  const r = await fetch(
    `https://api.telegram.org/bot${source.telegram_bot_token}/getUpdates?offset=${offset}&timeout=5&allowed_updates=["message"]`
  )
  if (!r.ok) return { found: 0, imported: 0, skipped: 0, error: `Telegram ${r.status}` }
  const data = await r.json()
  const updates = data.result || []
  let imported = 0, skipped = 0
  let maxId = source.telegram_last_update_id || 0

  for (const u of updates) {
    maxId = Math.max(maxId, u.update_id)
    const msg = u.message
    if (!msg?.text) { skipped++; continue }
    if (source.telegram_chat_id && String(msg.chat.id) !== String(source.telegram_chat_id)) {
      skipped++; continue
    }
    // Parse: "Imię: Jan\nTelefon: 500...\nEmail: jan@..."
    const text = msg.text as string
    const grab = (re: RegExp) => (text.match(re)?.[1] || '').trim()
    const name = grab(/(?:imi[eę]|name)[:\s]+([^\n]+)/i) || msg.from?.first_name || null
    const phone = grab(/(?:telefon|phone|tel)[:\s]+([+\d\s-]+)/i) || null
    const email = grab(/(?:email|mail)[:\s]+([^\s\n]+)/i)?.toLowerCase() || null
    const city = grab(/(?:miasto|city)[:\s]+([^\n]+)/i) || null

    if (!phone && !email) { skipped++; continue }
    if (phone) {
      const { data: dup } = await supabase
        .from('marketing_leads').select('id')
        .eq('client_id', source.client_id).eq('phone', phone).limit(1)
      if (dup?.length) { skipped++; continue }
    }
    const { error } = await supabase.from('marketing_leads').insert({
      client_id: source.client_id,
      name, phone, email, city,
      message: text.slice(0, 1000),
      source_platform: 'external',
      status: 'new',
    })
    if (error) { skipped++; continue }
    imported++
  }

  if (maxId > (source.telegram_last_update_id || 0)) {
    await supabase.from('external_lead_sources').update({
      telegram_last_update_id: maxId,
    }).eq('id', source.id)
  }

  return { found: updates.length, imported, skipped }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { data: sources } = await supabase
      .from('external_lead_sources')
      .select('*')
      .eq('is_active', true)
      .in('source_type', ['google_sheets', 'telegram_bot'])

    const results: any[] = []

    for (const source of sources || []) {
      let res: any = { found: 0, imported: 0, skipped: 0 }
      try {
        if (source.source_type === 'google_sheets') res = await syncSheets(supabase, source)
        else if (source.source_type === 'telegram_bot') res = await syncTelegram(supabase, source)
      } catch (e) {
        res = { found: 0, imported: 0, skipped: 0, error: String(e) }
      }

      await supabase.from('external_lead_sources').update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: res.error ? 'error' : 'success',
        last_sync_message: res.error || `${res.imported} imported, ${res.skipped} skipped`,
        total_imported: (source.total_imported || 0) + (res.imported || 0),
      }).eq('id', source.id)

      await supabase.from('lead_import_logs').insert({
        source_id: source.id,
        leads_found: res.found || 0,
        leads_imported: res.imported || 0,
        leads_skipped: res.skipped || 0,
        error_message: res.error || null,
      })

      results.push({ source_id: source.id, type: source.source_type, ...res })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
