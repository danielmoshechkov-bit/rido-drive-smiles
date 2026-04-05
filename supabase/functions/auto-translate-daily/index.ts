import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UI_SECTIONS_TO_SYNC = ['home', 'nav', 'auth', 'common', 
  'marketplace', 'sp', 'accounting', 'notifications', 'mainPage']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let plJson: Record<string, any> = {}
  
  try {
    const body = await req.json()
    plJson = body.pl_json || {}
  } catch {}

  const results: any[] = []

  for (const section of UI_SECTIONS_TO_SYNC) {
    const sectionKeys = plJson[section]
    if (!sectionKeys || typeof sectionKeys !== 'object') continue

    const flatKeys = flattenObject(sectionKeys)
    if (Object.keys(flatKeys).length === 0) continue

    try {
      const res = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/auto-translate-ui`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            section,
            keys: flatKeys,
            langs: ['en', 'ru', 'ua', 'de', 'vi', 'kz'],
            force: false
          })
        }
      )

      const data = await res.json()
      results.push({ section, ...data.stats })
    } catch (e) {
      console.error(`Section ${section} failed:`, e)
      results.push({ section, error: String(e) })
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
})

function flattenObject(
  obj: Record<string, any>, 
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      result[key] = v
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v, key))
    }
  }
  return result
}
