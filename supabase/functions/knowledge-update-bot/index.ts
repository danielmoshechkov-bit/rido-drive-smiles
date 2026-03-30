import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const KNOWLEDGE_SOURCES = [
  { url: 'https://developers.facebook.com/blog/', name: 'Meta Developer Blog', platform: 'meta' },
  { url: 'https://www.facebook.com/business/news', name: 'Meta Business News', platform: 'meta' },
  { url: 'https://blog.google/products/ads-commerce/', name: 'Google Ads Blog', platform: 'google' },
  { url: 'https://www.socialmediaexaminer.com/category/social-media-marketing/', name: 'Social Media Examiner', platform: 'both' },
  { url: 'https://searchengineland.com/category/paid-search', name: 'Search Engine Land PPC', platform: 'google' },
  { url: 'https://www.wordstream.com/blog', name: 'WordStream Blog', platform: 'both' },
  { url: 'https://adespresso.com/blog/', name: 'AdEspresso Blog', platform: 'meta' },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

  const { data: runRecord } = await supabase
    .from('knowledge_bot_runs')
    .insert({ status: 'running', sources_checked: KNOWLEDGE_SOURCES.map(s => s.name) })
    .select().single()

  let itemsFound = 0, itemsAdded = 0
  const errors: string[] = []

  try {
    const fetchedContent: string[] = []
    for (const source of KNOWLEDGE_SOURCES) {
      try {
        const response = await fetch(source.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GetRidoBot/1.0)' },
          signal: AbortSignal.timeout(10000)
        })
        if (response.ok) {
          const html = await response.text()
          const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000)
          fetchedContent.push(`=== ${source.name} (${source.platform}) ===\n${text}\n`)
        }
      } catch (e: any) {
        errors.push(`${source.name}: ${e.message}`)
      }
    }

    const { data: existing } = await supabase.from('platform_knowledge').select('title').gte('discovered_at', new Date(Date.now() - 30 * 86400000).toISOString())
    const existingTitles = existing?.map(k => k.title) || []

    const analysisPrompt = `Jesteś ekspertem od reklam cyfrowych. Wyodrębnij NOWE informacje z poniższych treści.

ISTNIEJĄCE WPISY (nie duplikuj):
${existingTitles.slice(0, 20).join('\n')}

TREŚĆ:
${fetchedContent.join('\n\n')}

Odpowiedz WYŁĄCZNIE JSON — tablica:
[{"platform":"meta"|"google"|"both"|"industry","category":"algorithm_change"|"new_feature"|"policy_change"|"best_practice"|"benchmark"|"creative_trend"|"audience_insight"|"cost_trend","title":"tytuł PL max 100 zn","summary":"podsumowanie PL max 300 zn","full_content":"opis PL max 1000 zn","source_name":"źródło","published_at":"YYYY-MM-DD lub null","relevance_score":1-10,"tags":["tag"]}]
Max 15 pozycji. Nie wymyślaj — wyciągaj tylko fakty.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey!.trim(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-20250514', max_tokens: 4000, messages: [{ role: 'user', content: analysisPrompt }] })
    })
    const claudeData = await claudeResponse.json()
    const rawText = claudeData.content?.[0]?.text || '[]'

    let knowledgeItems: any[] = []
    try {
      knowledgeItems = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
      itemsFound = knowledgeItems.length
    } catch (e: any) { errors.push('Parse error: ' + e.message) }

    for (const item of knowledgeItems) {
      const isDup = existingTitles.some(t => t.toLowerCase().includes(item.title?.toLowerCase()?.substring(0, 30) || ''))
      if (!isDup && item.title && item.summary) {
        const { error } = await supabase.from('platform_knowledge').insert({
          platform: item.platform || 'both', category: item.category || 'best_practice',
          title: item.title, summary: item.summary, full_content: item.full_content,
          source_name: item.source_name, published_at: item.published_at,
          relevance_score: item.relevance_score || 5, tags: item.tags || [], is_active: true
        })
        if (!error) itemsAdded++
      }
    }

    await supabase.from('platform_knowledge').update({ is_active: false }).lt('discovered_at', new Date(Date.now() - 90 * 86400000).toISOString())
    await supabase.from('knowledge_bot_runs').update({ completed_at: new Date().toISOString(), status: 'completed', items_found: itemsFound, items_added: itemsAdded }).eq('id', runRecord!.id)

    return new Response(JSON.stringify({ success: true, items_found: itemsFound, items_added: itemsAdded, errors }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    await supabase.from('knowledge_bot_runs').update({ completed_at: new Date().toISOString(), status: 'failed', error_message: error.message }).eq('id', runRecord!.id)
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
