import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const { url, login, password } = await req.json()
    if (!url) return json({ ok: false, message: 'Brak URL' })

    const headers: Record<string, string> = { 'User-Agent': 'GetRido/1.0' }
    if (login && password) {
      headers['Authorization'] = 'Basic ' + btoa(`${login}:${password}`)
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
      const body = await res.text()
      return json({ ok: false, message: `HTTP ${res.status}: Nie można pobrać pliku` })
    }

    const text = await res.text()
    if (!text.includes('<')) return json({ ok: false, message: 'Plik nie wygląda jak XML' })

    // Quick count of listings
    const count = (text.match(/<oferta|<listing|<property/gi) || []).length

    return json({ ok: true, count, message: `Plik XML dostępny, znaleziono ~${count} ofert` })
  } catch (e: any) {
    return json({ ok: false, message: 'Nie można pobrać pliku: ' + e.message })
  }
})
