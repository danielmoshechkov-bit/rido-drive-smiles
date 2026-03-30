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

  // Get campaigns with rotation enabled and active variants
  const { data: campaigns } = await supabase
    .from('agency_campaigns')
    .select('id, name, platform')
    .eq('status', 'active')

  let rotated = 0
  for (const campaign of campaigns || []) {
    const { data: variants } = await supabase
      .from('ad_variants')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'active')
      .eq('rotation_enabled', true)

    if (!variants || variants.length < 2) continue

    const worst = variants.reduce((w: any, v: any) => (v.ctr || 0) < (w.ctr || 0) ? v : w)
    const best = variants.reduce((b: any, v: any) => (v.ctr || 0) > (b.ctr || 0) ? v : b)

    await supabase.from('ad_variants').update({ status: 'paused', paused_reason: 'auto_rotation' }).eq('id', worst.id)

    const prompt = `Najlepszy wariant (CTR: ${best.ctr}%): "${best.headline}" / "${best.body_text}"
Wyłączony (CTR: ${worst.ctr}%): "${worst.headline}" / "${worst.body_text}"
Platforma: ${campaign.platform}

Stwórz NOWY wariant. JSON:
{"headline":"max 40 zn","body_text":"max 125 zn","description":"max 30 zn","cta":"SHOP_NOW|LEARN_MORE|SIGN_UP|CONTACT_US|GET_QUOTE","rationale":"1 zdanie PL"}`

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await resp.json()
      const newVariant = JSON.parse(data.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

      await supabase.from('ad_variants').insert({
        campaign_id: campaign.id,
        headline: newVariant.headline, body_text: newVariant.body_text,
        description: newVariant.description, cta: newVariant.cta,
        platform: campaign.platform,
        status: worst.auto_approve_rotation ? 'active' : 'pending_approval',
        generated_by: 'ai_rotation', generation_rationale: newVariant.rationale,
        rotation_enabled: true, auto_approve_rotation: worst.auto_approve_rotation
      })
      rotated++
    } catch (e) { console.error('Rotation error', campaign.id, e) }
  }

  return new Response(JSON.stringify({ success: true, rotated }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
