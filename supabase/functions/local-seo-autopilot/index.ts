import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!.trim()

  const { data: clients } = await supabase
    .from('agency_clients')
    .select('*')
    .eq('local_seo_enabled', true)

  let generated = 0
  for (const client of clients || []) {
    const prompt = `Stwórz post na Google Business dla firmy: ${client.company_name}
Branża: ${client.industry || 'usługi'}
Miasto: ${client.city || 'Polska'}
Poprzednie tematy: ${(client.recent_post_topics || []).join(', ') || 'brak'}

Post 150-300 znaków, lokalny, angażujący, NIE reklama.
JSON: {"post_text":"treść","call_to_action":"BOOK|ORDER|LEARN_MORE|SIGN_UP|CALL","topic":"1-3 słowa","suggested_image_prompt":"prompt EN"}`

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await resp.json()
      const postData = JSON.parse(data.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

      await supabase.from('local_seo_posts').insert({
        client_id: client.id, platform: 'google_business',
        post_text: postData.post_text, call_to_action: postData.call_to_action,
        topic: postData.topic, image_prompt: postData.suggested_image_prompt,
        status: client.auto_approve_seo ? 'scheduled' : 'pending_approval',
        scheduled_for: new Date(Date.now() + 2 * 3600000).toISOString()
      })

      // Update recent topics
      const topics = [...(client.recent_post_topics || []), postData.topic].slice(-10)
      await supabase.from('agency_clients').update({ recent_post_topics: topics }).eq('id', client.id)
      generated++
    } catch (e) { console.error('SEO post error', client.id, e) }
  }

  return new Response(JSON.stringify({ success: true, generated }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
