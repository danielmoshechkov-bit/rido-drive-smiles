import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Determine API endpoint and key based on model
function getApiConfig(model: string) {
  if (model.startsWith('google/') || model.startsWith('openai/')) {
    // Lovable AI Gateway
    return {
      url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      keyEnv: 'LOVABLE_API_KEY',
      model,
    }
  }
  if (model.startsWith('claude-')) {
    // Anthropic
    return {
      url: 'https://api.anthropic.com/v1/messages',
      keyEnv: 'ANTHROPIC_API_KEY',
      model,
      isAnthropic: true,
    }
  }
  // Kimi / Moonshot (default fallback)
  return {
    url: 'https://api.moonshot.ai/v1/chat/completions',
    keyEnv: 'KIMI_API_KEY',
    model: model || 'moonshot-v1-8k',
  }
}

async function callAI(apiKey: string, config: any, systemPrompt: string, userPrompt: string): Promise<string> {
  if (config.isAnthropic) {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    const data = await res.json()
    return data.content?.[0]?.text?.trim() || '{}'
  }

  // OpenAI-compatible (Lovable Gateway, Kimi)
  const res = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  })
  const data = await res.json()
  if (data.error) {
    throw new Error(`AI API error: ${JSON.stringify(data.error)}`)
  }
  return data.choices?.[0]?.message?.content?.trim() || '{}'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { listing_id, batch_ids, model: requestModel } = await req.json()
    const ids = batch_ids || (listing_id ? [listing_id] : [])

    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: 'No listing IDs provided' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // Get configured model from portal_integrations or use request model
    let selectedModel = requestModel || ''
    if (!selectedModel) {
      const { data: parserConfig } = await sb
        .from('portal_integrations')
        .select('config_json')
        .eq('key', 'ai_listing_parser')
        .maybeSingle()
      selectedModel = (parserConfig?.config_json as any)?.model || 'moonshot-v1-8k'
    }

    const apiConfig = getApiConfig(selectedModel)
    const apiKey = Deno.env.get(apiConfig.keyEnv)

    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: `Brak klucza API: ${apiConfig.keyEnv}. Skonfiguruj go w ustawieniach Supabase.` 
      }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[parse-listing-ai] Model: ${selectedModel}, Provider: ${apiConfig.keyEnv}, Listings: ${ids.length}`)

    // Fetch listings with ALL relevant fields
    const { data: listings, error: fetchErr } = await sb
      .from('real_estate_listings')
      .select('id, title, description, area, area_total, area_usable, rooms, price, city, district, address, has_balcony, has_elevator, has_parking, has_garden, floor, total_floors, build_year, crm_raw_data')
      .in('id', ids)

    if (fetchErr || !listings) {
      return new Response(JSON.stringify({ error: fetchErr?.message || 'No listings found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const systemPrompt = `Jesteś ekspertem od analizy ogłoszeń nieruchomości w Polsce. Analizujesz tekst ogłoszenia i wyciągasz dane strukturalne. 

WAŻNE ZASADY:
- Odpowiadasz WYŁĄCZNIE w formacie JSON, bez markdown, bez \`\`\`
- Powierzchnia całkowita (area_total) to CAŁY metraż nieruchomości, NIE jednego pomieszczenia
- Jeśli w opisie są wymienione pokoje/pomieszczenia z metrażami, zsumuj je — to przybliżona powierzchnia całkowita
- Każde wymienione pomieszczenie musi być w tablicy rooms
- Adres i lokalizację wyciągnij z opisu jeśli jest podany

DLA LOKALI KOMERCYJNYCH / MAGAZYNÓW / BIUR:
- Rozdzielaj powierzchnie: magazyn osobno, biuro osobno, pomieszczenia socjalne osobno
- W tablicy rooms podaj każdy typ powierzchni jako osobny wpis, np:
  {"name": "Magazyn", "area": 1500}, {"name": "Biuro", "area": 145}, {"name": "Pomieszczenia socjalne", "area": 50}
- area_total = suma WSZYSTKICH powierzchni (magazyn + biuro + socjalne + inne)
- Jeśli w opisie jest "magazyn 1845m2" i "biuro socjalne 145m2", to area_total = 1990 i w rooms oba wpisy
- Typ nieruchomości: jeśli to magazyn z biurem, ustaw property_subtype: "magazyn z biurem"`

    const results: Array<{ id: string; success: boolean; error?: string }> = []

    for (const listing of listings) {
      try {
        if (!listing.description || listing.description.trim().length < 20) {
          results.push({ id: listing.id, success: false, error: 'Description too short' })
          continue
        }

        // Extract raw CRM data hints if available
        const rawHints = listing.crm_raw_data ? 
          Object.entries(listing.crm_raw_data as Record<string, any>)
            .filter(([k, v]) => v && String(v).length > 0 && String(v).length < 200)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ') : ''

        const prompt = `Przeanalizuj to ogłoszenie nieruchomości i wyciągnij WSZYSTKIE możliwe dane.

TYTUŁ: ${listing.title || 'brak'}
OPIS: ${listing.description}
DANE Z CRM: powierzchnia_calkowita=${listing.area_total || listing.area || '?'}m², pow_uzytkowa=${listing.area_usable || '?'}m², pokoje=${listing.rooms || '?'}, cena=${listing.price || '?'}zł, miasto=${listing.city || ''}, dzielnica=${listing.district || ''}, adres=${listing.address || '?'}, piętro=${listing.floor || '?'}/${listing.total_floors || '?'}, rok=${listing.build_year || '?'}
${rawHints ? `DANE DODATKOWE Z CRM: ${rawHints}` : ''}

Zwróć JSON w dokładnie tym formacie:
{
  "property_type": "mieszkanie" / "dom" / "dzialka" / "pokoj" / "kawalerka" / "lokal-uzytkowy" / "hala-magazyn" / "rynek-pierwotny" (WYBIERZ JEDEN na podstawie treści. Magazyn, hala, hurtownia = "hala-magazyn". Biuro, sklep, lokal usługowy, gabinet = "lokal-uzytkowy"),
  "area_total": liczba (CAŁY metraż nieruchomości = suma wszystkich pomieszczeń) lub null,
  "area_usable": liczba lub null,
  "property_subtype": "magazyn z biurem" / "lokal handlowy" / "biuro" / null (dla komercji),
  "rooms": [
    {"name": "Salon", "area": 29},
    {"name": "Sypialnia 1", "area": 15},
    {"name": "Kuchnia", "area": 8},
    {"name": "Łazienka", "area": 5},
    {"name": "Przedpokój", "area": 4}
  ],
  UWAGA dla magazynów/lokali: rooms powinno zawierać np:
  [{"name": "Magazyn", "area": 1845}, {"name": "Biuro", "area": 100}, {"name": "Pomieszczenia socjalne", "area": 45}],
  "address_extracted": "ul. Przykładowa 15, Warszawa" lub null,
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
    "widok": "opis widoku" lub null
  },
  "description_formatted": "Sformatowany opis w czystym HTML. WYMAGANIA: 1) Każdy akapit w <p>. 2) Sekcje jak 'Układ pomieszczeń', 'Wykończenie', 'Lokalizacja' w <h3>. 3) Listy pokoi/cech w <ul><li>. 4) Popraw błędy ortograficzne. 5) Dodaj <br/> między sekcjami. 6) NIE zmieniaj faktów, tylko formatuj czytelnie. Tekst musi być przyjemny wizualnie z wyraźnymi odstępami.",
  "ai_summary": "Jedno zdanie podsumowujące max 120 znaków",
  "confidence": liczba 0-100
}

UWAGA: Wypisz WSZYSTKIE pokoje wymienione w opisie, nie pomijaj żadnego!`

        const raw = await callAI(apiKey, apiConfig, systemPrompt, prompt)
        let parsed: any = {}

        try {
          // Clean up potential markdown fences
          const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
          parsed = JSON.parse(cleaned)
        } catch {
          console.error('Failed to parse AI response for', listing.id, raw.slice(0, 300))
          results.push({ id: listing.id, success: false, error: 'JSON parse error' })
          continue
        }

        // Validate area_total — if AI returned it and it seems like a single room area, recalculate
        let aiAreaTotal = parsed.area_total
        if (parsed.rooms && parsed.rooms.length > 1) {
          const roomsSum = parsed.rooms.reduce((s: number, r: any) => s + (r.area || 0), 0)
          // If area_total is smaller than the sum of rooms, use the sum
          if (aiAreaTotal && aiAreaTotal < roomsSum) {
            aiAreaTotal = roomsSum
          }
          // If no area_total but we have rooms, use the sum
          if (!aiAreaTotal && roomsSum > 0) {
            aiAreaTotal = roomsSum
          }
        }

        // Build update payload
        const updatePayload: Record<string, any> = {
          ai_rooms_data: parsed.rooms || [],
          ai_amenities: parsed.amenities || {},
          ai_building_info: parsed.building_info || {},
          ai_location_details: parsed.location_details || {},
          ai_description_html: parsed.description_formatted || null,
          ai_summary: parsed.ai_summary || null,
          ai_area_total: aiAreaTotal || null,
          ai_parsed_at: new Date().toISOString(),
          ai_confidence: parsed.confidence || 0,
        }

        // Update property_type if AI classified it
        const validTypes = ['mieszkanie', 'dom', 'dzialka', 'pokoj', 'kawalerka', 'lokal-uzytkowy', 'hala-magazyn', 'rynek-pierwotny']
        if (parsed.property_type && validTypes.includes(parsed.property_type)) {
          updatePayload.property_type = parsed.property_type
        }

        // Update area_total if we got a better value from AI
        if (aiAreaTotal && aiAreaTotal > 0) {
          const currentArea = listing.area_total || listing.area || 0
          // If current area is 0, or AI area is significantly different (and AI has high confidence)
          if (!currentArea || currentArea === 0 || (parsed.confidence >= 70 && Math.abs(aiAreaTotal - currentArea) > currentArea * 0.2)) {
            updatePayload.area_total = aiAreaTotal
            updatePayload.area = aiAreaTotal
          }
        }

        // Update address if extracted
        if (parsed.address_extracted && !listing.address) {
          updatePayload.address = parsed.address_extracted
        }

        const { error: updateErr } = await sb.from('real_estate_listings')
          .update(updatePayload)
          .eq('id', listing.id)

        if (updateErr) {
          results.push({ id: listing.id, success: false, error: updateErr.message })
        } else {
          results.push({ id: listing.id, success: true })
        }

        // Rate limit between requests
        if (listings.length > 1) {
          await new Promise(r => setTimeout(r, 600))
        }
      } catch (err) {
        console.error('Error processing listing', listing.id, err)
        results.push({ id: listing.id, success: false, error: String(err) })
      }
    }

    return new Response(JSON.stringify({ 
      results, 
      processed: results.length,
      model: selectedModel,
      success_count: results.filter(r => r.success).length,
      error_count: results.filter(r => !r.success).length,
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('parse-listing-ai error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})