import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { brief, image_url, target_audience, service_id, client_id, platform } = await req.json()
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (!apiKey) {
      return json({ variants: [], error: 'Brak klucza Anthropic API' }, 200)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) IMAGE ANALYSIS (Claude Vision) — opcjonalna
    let image_analysis: any = null
    if (image_url) {
      try {
        const visionPrompt = `Oceń tę grafikę jako materiał do reklamy ${platform || brief?.platform || 'Meta/Google'}.
Sprawdź:
1. Jakość techniczna (rozdzielczość, ostrość, oświetlenie)
2. Zgodność z polityką Meta (brak nagości, przemocy, tekstu >20% obrazu)
3. Atrakcyjność dla grupy docelowej: ${target_audience || brief?.audience || 'ogólna'}
4. Czy produkt/usługa jest wyraźnie widoczna

Odpowiedz TYLKO JSON:
{"quality_score":0-100,"compliance_score":0-100,"issues":["..."],"recommendation":"...","use_original":true|false}`
        const visionResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-20250514',
            max_tokens: 600,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'url', url: image_url } },
                { type: 'text', text: visionPrompt },
              ],
            }],
          }),
        })
        const vd = await visionResp.json()
        const vt = vd?.content?.[0]?.text || '{}'
        const m = vt.match(/\{[\s\S]*\}/)
        image_analysis = m ? JSON.parse(m[0]) : null
      } catch (e) {
        console.error('vision error', e)
      }
    }

    // 2) COMPLIANCE RULES z platform_knowledge
    let complianceContext = ''
    try {
      const { data: rules } = await supabase
        .from('platform_knowledge')
        .select('title, summary, platform, category')
        .in('category', ['compliance_rule', 'policy_update', 'best_practice'])
        .eq('is_active', true)
        .order('relevance_score', { ascending: false })
        .limit(8)
      if (rules?.length) {
        complianceContext = '\n\nAKTUALNE REGUŁY COMPLIANCE (przestrzegaj):\n' +
          rules.map((r: any) => `- [${r.platform}/${r.category}] ${r.title}: ${r.summary}`).join('\n')
      }
    } catch (e) {
      console.error('platform_knowledge error', e)
    }

    // 3) GENERATE VARIANTS
    const prompt = `Na podstawie poniższego briefu wygeneruj dokładnie 3 warianty reklamy. Odpowiedz TYLKO w formacie JSON (array 3 obiektów).
Każdy obiekt: { "headline": "...", "primary_text": "...", "description": "...", "cta": "...", "targeting_suggestions": "...", "compliance_score": 0-100, "compliance_notes": "..." }

Brief:
- Platforma: ${brief.platform}
- Cel: ${brief.goal}
- Produkt: ${brief.product}
- Grupa docelowa: ${brief.audience || 'ogólna'}
- Budżet: ${brief.budget || 'nieokreślony'} zł/dzień
- Ton: ${brief.tone}
- USP: ${brief.usp || 'brak'}
- CTA: ${brief.cta || 'Dowiedz się więcej'}
${complianceContext}`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    const text = data?.content?.[0]?.text || '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const variants = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    const avgCompliance = variants.length
      ? Math.round(variants.reduce((a: number, v: any) => a + (Number(v.compliance_score) || 80), 0) / variants.length)
      : 0

    // 4) Optional: persist to ad_orders updates if id provided
    if (service_id && client_id) {
      try {
        await supabase.from('ad_orders').update({
          additional_notes: JSON.stringify({ variants, image_analysis, compliance_score: avgCompliance }).slice(0, 4000),
          updated_at: new Date().toISOString(),
        }).eq('service_id', service_id).eq('provider_user_id', client_id).eq('status', 'pending_publish')
      } catch (e) {
        console.error('ad_orders update', e)
      }
    }

    return json({
      variants,
      image_analysis,
      compliance_score: avgCompliance,
      compliance_rules_applied: complianceContext ? true : false,
    }, 200)
  } catch (err) {
    console.error('generate-ad-creative error:', err)
    return json({ variants: [], error: String(err) }, 500)
  }
})

function json(body: any, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
