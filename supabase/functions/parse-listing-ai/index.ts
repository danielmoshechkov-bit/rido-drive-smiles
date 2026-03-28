import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { listing_id, batch_ids } = await req.json()
    const ids = batch_ids || (listing_id ? [listing_id] : [])

    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: 'No listing IDs provided' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // Get KIMI API key
    const KIMI_KEY = Deno.env.get('KIMI_API_KEY')
    if (!KIMI_KEY) {
      // Fallback: try from ai_providers table
      const { data: provider } = await sb
        .from('ai_providers')
        .select('api_key_encrypted')
        .eq('provider_key', 'kimi')
        .single()
      
      if (!provider?.api_key_encrypted) {
        return new Response(JSON.stringify({ error: 'No KIMI API key configured' }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }
    }

    const apiKey = KIMI_KEY || (await sb.from('ai_providers').select('api_key_encrypted').eq('provider_key', 'kimi').single()).data?.api_key_encrypted

    // Fetch listings
    const { data: listings, error: fetchErr } = await sb
      .from('real_estate_listings')
      .select('id, title, description, area, area_total, rooms, price, city, district, has_balcony, has_elevator, has_parking, has_garden, floor, total_floors, build_year')
      .in('id', ids)

    if (fetchErr || !listings) {
      return new Response(JSON.stringify({ error: fetchErr?.message || 'No listings found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = []

    for (const listing of listings) {
      try {
        if (!listing.description || listing.description.trim().length < 30) {
          results.push({ id: listing.id, success: false, error: 'Description too short' })
          continue
        }

        const prompt = `Przeanalizuj to ogłoszenie nieruchomości i wyciągnij wszystkie możliwe dane.

TYTUŁ: ${listing.title || 'brak'}
OPIS: ${listing.description}
DANE Z CRM: powierzchnia=${listing.area_total || listing.area || '?'}m², pokoje=${listing.rooms || '?'}, cena=${listing.price || '?'}zł, adres=${listing.city || ''} ${listing.district || ''}, piętro=${listing.floor || '?'}/${listing.total_floors || '?'}, rok=${listing.build_year || '?'}

Zwróć JSON w dokładnie tym formacie:
{
  "area_total": liczba lub null,
  "area_usable": liczba lub null,
  "rooms": [
    {"name": "Salon", "area": 29},
    {"name": "Sypialnia 1", "area": 15}
  ],
  "amenities": {
    "balkon": true/false/null,
    "taras": true/false/null,
    "ogrodek": true/false/null,
    "garaz": true/false/null,
    "piwnica": true/false/null,
    "winda": true/false/null,
    "klimatyzacja": true/false/null,
    "ochrona": true/false/null,
    "recepcja": true/false/null,
    "monitoring": true/false/null,
    "domofon": true/false/null,
    "smart_home": true/false/null,
    "miejsce_postojowe": true/false/null
  },
  "building_info": {
    "rok_budowy": liczba lub null,
    "material": "cegła/wielka płyta/beton/szkielet/inny" lub null,
    "stan": "do remontu/do odświeżenia/dobry/bardzo dobry/idealny/deweloperski" lub null,
    "ogrzewanie": "miejskie/gazowe/elektryczne/pompa ciepła/inne" lub null,
    "okna": "plastikowe/drewniane/aluminiowe" lub null,
    "pietro": liczba lub null,
    "liczba_pieter": liczba lub null
  },
  "location_details": {
    "blisko_metra": true/false/null,
    "blisko_szkoly": true/false/null,
    "blisko_parku": true/false/null,
    "blisko_centrum": true/false/null,
    "cicha_okolica": true/false/null,
    "widok": null
  },
  "description_formatted": "Sformatowany opis w HTML z <h3> dla sekcji, <ul> dla list, <p> dla akapitów. Zachowaj treść, popraw formatowanie.",
  "ai_summary": "Jedno zdanie max 120 znaków",
  "confidence": liczba 0-100
}`

        const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'moonshot-v1-8k',
            messages: [
              {
                role: 'system',
                content: 'Jesteś ekspertem od analizy ogłoszeń nieruchomości w Polsce. Analizujesz tekst ogłoszenia i wyciągasz dane strukturalne. Odpowiadasz WYŁĄCZNIE w formacie JSON, bez markdown, bez ```.'
              },
              { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.1
          })
        })

        const data = await res.json()
        const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
        let parsed: any = {}

        try {
          parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
        } catch {
          console.error('Failed to parse AI response for', listing.id, raw.slice(0, 200))
          results.push({ id: listing.id, success: false, error: 'JSON parse error' })
          continue
        }

        // Update listing with AI data
        const { error: updateErr } = await sb.from('real_estate_listings').update({
          ai_rooms_data: parsed.rooms || [],
          ai_amenities: parsed.amenities || {},
          ai_building_info: parsed.building_info || {},
          ai_location_details: parsed.location_details || {},
          ai_description_html: parsed.description_formatted || null,
          ai_summary: parsed.ai_summary || null,
          ai_area_total: parsed.area_total || null,
          ai_parsed_at: new Date().toISOString(),
          ai_confidence: parsed.confidence || 0,
          // Also update area_total if we got a better value
          ...(parsed.area_total && (!listing.area_total || listing.area_total === 0) ? { area_total: parsed.area_total } : {}),
        }).eq('id', listing.id)

        if (updateErr) {
          results.push({ id: listing.id, success: false, error: updateErr.message })
        } else {
          results.push({ id: listing.id, success: true })
        }

        // Rate limit: wait between requests
        if (listings.length > 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      } catch (err) {
        results.push({ id: listing.id, success: false, error: String(err) })
      }
    }

    return new Response(JSON.stringify({ results, processed: results.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('parse-listing-ai error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
