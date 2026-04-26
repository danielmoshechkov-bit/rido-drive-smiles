import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Parse "24h", "12h", "2h", "30m" etc. → minutes
function parseLeadMinutes(token: string): number | null {
  const m = token.trim().toLowerCase().match(/^(\d+)\s*(h|m)?$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2] || 'h'
  return unit === 'm' ? n : n * 60
}

// One column per common token; for unknown tokens we use a generic JSONB flag in a tracking table fallback
// To keep things simple and not require migrations, we re-use existing columns where possible
// (24h_sent for >=12h leads, 2h_sent for <12h leads). This guarantees we never spam more than 2 reminders.
function pickSentFlag(leadMinutes: number): 'reminder_24h_sent' | 'reminder_2h_sent' {
  return leadMinutes >= 12 * 60 ? 'reminder_24h_sent' : 'reminder_2h_sent'
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
    const now = new Date()
    // Look at all upcoming bookings within next 48h that have reminders enabled and not sent yet
    const today = now.toISOString().slice(0, 10)
    const in2days = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data: bookings, error: fetchErr } = await sb
      .from('workshop_client_bookings')
      .select('*, service_providers!inner(company_name, company_phone, company_address, company_city, company_postal_code, short_name)')
      .eq('reminder_enabled', true)
      .eq('status', 'scheduled')
      .gte('appointment_date', today)
      .lte('appointment_date', in2days)

    if (fetchErr) {
      console.error('booking-reminders fetch error:', fetchErr)
      return json({ error: fetchErr.message }, 500)
    }

    let totalSent = 0
    const sentDetails: any[] = []

    for (const b of (bookings || [])) {
      const times: string[] = Array.isArray(b.reminder_times) ? b.reminder_times : []
      if (times.length === 0) continue

      // Compute appointment Date in local tz (Europe/Warsaw assumed via DB stored time)
      const apptIso = `${b.appointment_date}T${b.appointment_time}`
      const apptDate = new Date(apptIso)
      const minutesUntil = (apptDate.getTime() - now.getTime()) / (1000 * 60)
      if (minutesUntil <= 0) continue

      // Find the largest reminder lead that is "due now" (<=15 min window since cron runs every 15 min)
      // Catch-up logic: send if we're past the planned trigger time, but still before the appointment,
      // and the corresponding "sent" flag is still false. This protects against cron downtime / late edits.
      // Min remaining safety: don't send less than 5 min before the appointment.
      const due = times
        .map(parseLeadMinutes)
        .filter((m): m is number => m !== null)
        .filter((leadMin) => {
          const flag = pickSentFlag(leadMin)
          if (b[flag]) return false
          if (minutesUntil < 5) return false
          // Trigger if we are at or past the scheduled lead point (minutesUntil <= leadMin)
          return minutesUntil <= leadMin
        })
        .sort((a, c) => c - a)

      if (due.length === 0) continue

      const leadMin = due[0]
      const flag = pickSentFlag(leadMin)
      const provider = (b as any).service_providers
      const address = [
        provider?.company_address,
        [provider?.company_postal_code, provider?.company_city].filter(Boolean).join(' ')
      ].filter(Boolean).join(', ')

      const msg = buildSmsText(
        provider?.short_name || provider?.company_name,
        b.appointment_date,
        b.appointment_time,
        address,
        b.service_description,
        leadMin,
        b.confirmation_token,
      )

      const { error: smsErr } = await sb.functions.invoke('workshop-send-sms', {
        body: {
          phone: b.phone,
          message: msg,
          sms_type: leadMin >= 12 * 60 ? 'booking_reminder_24h' : 'booking_reminder_2h',
          provider_id: b.provider_id,
        }
      })

      if (!smsErr) {
        await sb.from('workshop_client_bookings')
          .update({ [flag]: true })
          .eq('id', b.id)
        totalSent++
        sentDetails.push({ id: b.id, leadMin, phone: b.phone })
      } else {
        console.error(`Reminder SMS failed for ${b.id}:`, smsErr)
      }
    }

    return json({ success: true, total_sent: totalSent, sent: sentDetails, scanned: bookings?.length ?? 0 })
  } catch (err: any) {
    console.error('booking-reminders error:', err)
    return json({ error: err.message }, 500)
  }
})

function buildSmsText(
  companyName: string | undefined,
  date: string,
  time: string,
  address: string | undefined,
  serviceDescription: string | undefined,
  leadMinutes: number
): string {
  const name = removeDiacritics(companyName || 'Warsztat')
  const d = formatDate(date)
  const t = time?.slice(0, 5) || ''
  const addr = removeDiacritics((address || '').replace(/\s+/g, ' ').trim())
  const service = removeDiacritics((serviceDescription || '').replace(/\s+/g, ' ').trim())

  const leadLabel = leadMinutes >= 60
    ? `${Math.round(leadMinutes / 60)}h`
    : `${leadMinutes}min`

  let msg = leadMinutes <= 4 * 60
    ? `Witam, tu ${name}. Przypominamy: wizyta juz za ${leadLabel}, ${d} o godz. ${t}.`
    : `Witam, tu ${name}. Przypominamy o wizycie dnia ${d} o godz. ${t}.`
  if (service) msg += ` Usluga: ${service}.`
  if (addr) msg += ` Adres: ${addr}.`
  msg += ' Zapraszamy!'

  return msg.slice(0, 160)
}

function removeDiacritics(s: string): string {
  const map: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
    'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
  }
  return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, c => map[c] || c)
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
