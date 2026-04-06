import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const today = now.toISOString().slice(0, 10)
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // 24h reminders: bookings tomorrow, not yet sent
    const { data: reminders24h } = await sb
      .from('workshop_client_bookings')
      .select('*, service_providers!inner(company_name, phone, address)')
      .eq('reminder_enabled', true)
      .eq('reminder_24h_sent', false)
      .eq('status', 'scheduled')
      .eq('appointment_date', tomorrow)

    // 2h reminders: bookings today within next 2-3 hours, not yet sent
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000)
    const timeFrom = `${twoHoursLater.getHours().toString().padStart(2, '0')}:${twoHoursLater.getMinutes().toString().padStart(2, '0')}:00`
    const timeTo = `${threeHoursLater.getHours().toString().padStart(2, '0')}:${threeHoursLater.getMinutes().toString().padStart(2, '0')}:00`

    const { data: reminders2h } = await sb
      .from('workshop_client_bookings')
      .select('*, service_providers!inner(company_name, phone, address)')
      .eq('reminder_enabled', true)
      .eq('reminder_2h_sent', false)
      .eq('status', 'scheduled')
      .eq('appointment_date', today)
      .gte('appointment_time', timeFrom)
      .lte('appointment_time', timeTo)

    let sent24 = 0, sent2 = 0

    // Send 24h reminders
    for (const b of (reminders24h || [])) {
      const provider = (b as any).service_providers
      const msg = buildSmsText(provider?.company_name, b.appointment_date, b.appointment_time, provider?.phone, provider?.address)
      
      const { error } = await sb.functions.invoke('workshop-send-sms', {
        body: {
          phone: b.phone,
          message: msg,
          sms_type: 'booking_reminder_24h',
          provider_id: b.provider_id,
          sender: 'GetRido'
        }
      })

      if (!error) {
        await sb.from('workshop_client_bookings')
          .update({ reminder_24h_sent: true })
          .eq('id', b.id)
        sent24++
      } else {
        console.error(`24h SMS failed for ${b.id}:`, error)
      }
    }

    // Send 2h reminders
    for (const b of (reminders2h || [])) {
      const provider = (b as any).service_providers
      const msg = buildSmsText(provider?.company_name, b.appointment_date, b.appointment_time, provider?.phone, provider?.address)
      
      const { error } = await sb.functions.invoke('workshop-send-sms', {
        body: {
          phone: b.phone,
          message: msg,
          sms_type: 'booking_reminder_2h',
          provider_id: b.provider_id,
          sender: 'GetRido'
        }
      })

      if (!error) {
        await sb.from('workshop_client_bookings')
          .update({ reminder_2h_sent: true })
          .eq('id', b.id)
        sent2++
      } else {
        console.error(`2h SMS failed for ${b.id}:`, error)
      }
    }

    return json({ success: true, sent_24h: sent24, sent_2h: sent2 })
  } catch (err: any) {
    console.error('booking-reminders error:', err)
    return json({ error: err.message }, 500)
  }
})

function buildSmsText(
  companyName: string | undefined,
  date: string,
  time: string,
  phone: string | undefined,
  address: string | undefined
): string {
  // No Polish diacritics to fit in 1 SMS (160 chars GSM-7)
  const name = removeDiacritics(companyName || 'Warsztat')
  const d = formatDate(date)
  const t = time?.slice(0, 5) || ''
  const addr = removeDiacritics(address || '')
  const tel = phone || ''

  let msg = `Witam, tu ${name}. Przypominamy o wizycie dnia ${d} o godz. ${t}.`
  if (addr) msg += ` Adres: ${addr}.`
  if (tel) msg += ` Tel: ${tel}.`
  msg += ' Zapraszamy!'

  // Trim to 160 chars
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