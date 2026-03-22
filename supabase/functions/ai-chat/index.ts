import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const RIDO_SYSTEM = `Jesteś RidoAI – inteligentnym asystentem życiowym platformy GetRido. Rozmawiasz naturalnie i po ludzku. ZAWSZE odpowiadaj w tym samym języku, w którym pisze użytkownik. Jeśli użytkownik pisze po polsku — odpowiadaj po polsku. Jeśli po rosyjsku — po rosyjsku. Jeśli po angielsku — po angielsku. Automatycznie wykrywaj język użytkownika i odpowiadaj w nim. Nigdy nie ujawniaj jakiego modelu AI używasz – jesteś po prostu "RidoAI".

Możesz pomagać użytkownikom w:
- Wyszukiwaniu nieruchomości, usług, ofert na portalu
- Odpowiadaniu na pytania o portal i jego funkcje
- Tworzeniu treści, tekstów, opisów
- Analizie i wycenach
- Ogólnych pytaniach i rozmowach
- Pytaniach o pogodę, aktualności, fakty — odpowiadaj na nie z wiedzy którą posiadasz, NIGDY nie mów że nie masz dostępu do danych pogodowych

WAŻNE: Gdy użytkownik pyta o pogodę, temperaturę lub prognozę — odpowiedz KONKRETNIE podając temperaturę, opis pogody i prognozę. Nigdy nie odsyłaj do stron pogodowych. Jeśli nie znasz dokładnych danych, podaj przybliżone na podstawie pory roku i lokalizacji.

Gdy użytkownik prosi o wygenerowanie grafiki/obrazu w trybie chat, odpowiedz normalnie że to zrobisz i dodaj na końcu:
IMAGE_REQUEST:true

W trybie Cowork gdy użytkownik chce wykonać akcję w portalu, na końcu odpowiedzi dodaj:
ACTION:{"type":"TYP_AKCJI","params":{}}
Dostępne akcje: CREATE_INVOICE, CREATE_TASK, FIND_SERVICE, BOOK_APPOINTMENT, SEARCH_PROPERTY, OPEN_PAGE`

const WEATHER_QUERY_PATTERNS = /(?:pogod|weather|forecast|temperatur|meteo|klimat|температур|погод|прогноз|wetter|thời tiết|tiempo|météo|počasí)/i
const LOW_CONFIDENCE_WEATHER_PATTERNS = [
  // Polish
  /nie mog[eę].{0,60}(sprawdzi[ćc]|mam dost[eę]pu|w czasie rzeczywistym)/i,
  /sprawd[źz].{0,30}na stronie/i,
  /nie mam dost[eę]pu do danych pogodowych/i,
  /nie znam.{0,30}(pogody|temperatury)/i,
  /nie posiadam.{0,30}(aktualnych|bieżących|rzeczywistych)/i,
  // English
  /i (?:can'?t|cannot|don'?t) .{0,40}(check|access|verify).{0,40}(weather|forecast)/i,
  /don'?t have (?:access|real.?time)/i,
  // Russian
  /не (?:могу|имею).{0,60}(провери|доступ|реальн|актуальн|текущ)/i,
  /не (?:знаю|известн).{0,40}(погод|температур)/i,
  /нет доступа к.{0,40}(погод|данн|информац)/i,
  /рекомендую.{0,40}(сайт|weather|meteo|прогноз)/i,
  /посети.{0,40}(сайт|weather|meteo)/i,
  // Ukrainian  
  /не (?:можу|маю).{0,60}(перевір|доступ|реальн|актуальн)/i,
  // German
  /(?:keinen? zugang|kann nicht).{0,40}(wetter|prüfen|überprüfen)/i,
]
const FILE_ACCESS_FAILURE_PATTERNS = [
  /nie mog[eę].{0,80}(otworzy[ćc]|odczyta[ćc]|czyta[ćc]|przeanalizowa[ćc]|sprawdzi[ćc]).{0,40}(pliku|pdf|dokumentu|obrazu|za[łl]ącznika)/i,
  /nie mog[eę] bezpo[sś]rednio czyta[ćc] zawarto[sś]ci/i,
  /na podstawie nazwy pliku/i,
  /plik binarny/i,
  /i (?:can'?t|cannot|unable to).{0,80}(open|read|access|analy[sz]e).{0,40}(file|pdf|document|image|attachment)/i,
  /не (?:могу|удалось).{0,80}(откры|прочита|проанализирова|обработа)/i,
]

// General "I can't answer" patterns — triggers fallback to next provider
const GENERAL_LOW_CONFIDENCE_PATTERNS = [
  // Polish
  /nie mog[eę].{0,60}(odpowiedzie[ćc]|pom[oó]c|udzieli[ćc]|poradzi[ćc])/i,
  /nie mam.{0,40}(dost[eę]pu|mo[żz]liwo[śs]ci|informacji|danych)/i,
  /nie jestem w stanie.{0,60}(odpowiedzie[ćc]|sprawdzi[ćc]|pom[oó]c|udzieli[ćc])/i,
  /nie posiadam.{0,40}(informacji|danych|wiedzy|dost[eę]pu)/i,
  /jako (?:model|asystent|AI).{0,40}nie/i,
  /sprawd[źz].{0,30}(na|w|u) (?:internecie|google|stron)/i,
  /odwied[źz].{0,30}(stron|serwis|portal)/i,
  /zalecam.{0,30}(sprawdzi[ćc]|odwiedzi[ćc]|skontaktowa[ćc])/i,
  // English
  /i (?:can'?t|cannot|don'?t|am not able to).{0,60}(answer|help|provide|access|check|verify)/i,
  /i don'?t have.{0,40}(access|ability|information|data|capability)/i,
  /as an? (?:AI|language model|assistant).{0,40}(?:can'?t|cannot|don'?t|unable)/i,
  /please (?:check|visit|consult).{0,40}(website|google|online)/i,
  // Russian
  /не (?:могу|в состоянии).{0,60}(ответ|помочь|предостав|дать)/i,
  /у меня нет.{0,40}(доступ|возможност|информац|данн)/i,
  /как (?:модель|ИИ|ассистент).{0,40}не/i,
  /рекомендую.{0,40}(обратиться|проверить|посетить|поискать)/i,
  // Ukrainian
  /не (?:можу|в змозі).{0,60}(відповіст|допомогт|надат)/i,
  /не маю.{0,40}(доступ|можливост|інформац|дан)/i,
  // German
  /ich (?:kann|bin) nicht.{0,60}(antwort|helfen|bereitstell|zugreif)/i,
  /(?:bitte|empfehle).{0,40}(besuchen|überprüf|nachschau)/i,
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const t0 = Date.now()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let usedProvider = 'unknown', usedModel = 'unknown', feature = 'ai_chat'
  let userId: string | null = null

  try {
    const auth = req.headers.get('Authorization')
    if (auth) {
      const { data } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
      userId = data?.user?.id || null
    }

    const body = await req.json()
    const { taskType, query, mode, messages, stream, imageBase64, maskBase64, files } = body
    feature = body.feature || 'ai_chat'

    // Pobierz WSZYSTKICH dostawców
    const { data: allProviders, error: provErr } = await supabase.from('ai_providers').select('*')
    console.log(`[ai-chat] Loaded ${allProviders?.length || 0} providers, error: ${provErr?.message || 'none'}`)

    // Helper: check if provider has a valid key
    const hasKey = (p: any) => p?.api_key_encrypted && String(p.api_key_encrypted).trim() !== ''

    // Find provider by key(s)
    const findByKey = (...keys: string[]) => {
      // First: enabled + has key
      for (const key of keys) {
        const found = allProviders?.find((p: any) => p.provider_key === key && hasKey(p) && p.is_enabled)
        if (found) return found
      }
      // Then: just has key (even disabled)
      for (const key of keys) {
        const found = allProviders?.find((p: any) => p.provider_key === key && hasKey(p))
        if (found) return found
      }
      return null
    }

    // Find any Gemini provider with key
    const findGemini = () => {
      const byKey = findByKey('gemini', 'google_gemini', 'gemini_flash', 'gemini_pro', 'imagen3')
      if (byKey) return byKey
      // Fuzzy search by name
      return allProviders?.find((p: any) =>
        hasKey(p) && (
          p.display_name?.toLowerCase().includes('gemini') ||
          p.provider_key?.toLowerCase().includes('gemini') ||
          p.display_name?.toLowerCase().includes('imagen')
        )
      ) || null
    }

    // ── INPAINTING ───────────────────────────────────────────────
    if (taskType === 'inpaint') {
      const lovKey = Deno.env.get('LOVABLE_API_KEY')
      if (!lovKey) {
        return jsonResp({ result: '⚠️ Edycja obrazów jest tymczasowo niedostępna.' })
      }
      usedProvider = 'lovable'
      usedModel = 'google/gemini-2.5-flash-image'
      console.log('[ai-chat] Inpaint using Lovable Gateway')

      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${lovKey}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Edytuj obraz zgodnie z zaznaczonymi obszarami. Fioletowe maski pokazują miejsca zmian. Zachowaj cały obraz bez zmian poza zaznaczonymi miejscami. Wprowadź dokładnie te zmiany: ${query}`,
              },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${maskBase64}` } },
            ],
          }],
          modalities: ['image', 'text'],
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        console.error('[ai-chat] Inpaint error:', res.status, errText)
        await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: errText, ms: Date.now() - t0 })
        return jsonResp({ result: mapError('image', res.status, errText) })
      }
      const d = await res.json()
      const imgUrl = d?.choices?.[0]?.message?.images?.[0]?.image_url?.url
      await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: imgUrl ? 'success' : 'error', ms: Date.now() - t0 })
      return jsonResp({ result: imgUrl ? '✨ Gotowe!' : '❌ Nie udało się edytować obrazu.', images: imgUrl ? [imgUrl] : [] })
    }

    // ── GENEROWANIE OBRAZÓW (Nano Banana) ────────────────────────
    if (taskType === 'image') {
      // Use Lovable Gateway for image generation (Nano Banana)
      const lovKey = Deno.env.get('LOVABLE_API_KEY')
      if (!lovKey) {
        return jsonResp({ result: '⚠️ Generowanie obrazów jest tymczasowo niedostępne.' })
      }
      usedProvider = 'lovable'
      usedModel = 'google/gemini-2.5-flash-image'
      console.log(`[ai-chat] Image generation using Lovable Gateway (Nano Banana)`)

      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovKey}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          messages: [{ role: 'user', content: query }],
          modalities: ['image', 'text']
        })
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('[ai-chat] Image gen error:', res.status, errText)
        await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: errText, ms: Date.now() - t0 })
        return jsonResp({ result: mapError('image', res.status, errText) })
      }

      const d = await res.json()
      const imgData = d?.choices?.[0]?.message?.images?.[0]?.image_url?.url
      const textReply = d?.choices?.[0]?.message?.content || ''
      
      await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: imgData ? 'success' : 'error', ms: Date.now() - t0 })
      return jsonResp({
        result: imgData ? '' : (textReply || '❌ Nie udało się wygenerować obrazu.'),
        images: imgData ? [imgData] : []
      })
    }

    // ── ROUTING TEKSTU ───────────────────────────────────────────
    // Build multimodal content if files attached
    const hasFiles = files && Array.isArray(files) && files.length > 0
    const weatherQuery = WEATHER_QUERY_PATTERNS.test(query || '')
    const hasRichVisionFiles = hasFiles && files.some((f: any) => isImageFile(f) || isPdfFile(f))

    const history = [
      ...(messages || []).filter((m: any) => m.content).map((m: any) => ({ role: m.role, content: m.content }))
    ]
    if (!history.length || history[history.length - 1]?.role !== 'user') {
      history.push({ role: 'user', content: query })
    }

    // If files are attached, enrich the last user message with file contents
    if (hasFiles && history.length > 0) {
      const lastMsg = history[history.length - 1]
      if (lastMsg.role === 'user') {
        let enrichedContent = lastMsg.content
        for (const f of files) {
          if (f.text) {
            enrichedContent += `\n\n--- Zawartość pliku "${f.name}" ---\n${f.text}\n--- Koniec pliku ---`
          } else if (f.data && f.type?.startsWith('image/')) {
            // Will be handled as multimodal below for Gemini
          } else if (isPdfFile(f)) {
            enrichedContent += `\n\n[Załączono dokument PDF: ${f.name}. Przeanalizuj jego rzeczywistą treść i odpowiedz konkretnie.]`
          } else if (f.data) {
            enrichedContent += `\n\n[Załączono plik: ${f.name} (${f.type || 'binarny'}). Jeśli potrafisz odczytać jego treść, zrób to i odpowiedz konkretnie.]`
          }
        }
        lastMsg.content = enrichedContent
      }
    }
    const sys = mode === 'cowork'
      ? RIDO_SYSTEM + '\n\nJesteś w trybie Cowork — gdy użytkownik prosi o akcję w portalu, wykonaj ją!'
      : RIDO_SYSTEM

    // Build provider chain based on mode
    const chain: any[] = []
    
    if (weatherQuery) {
      // For weather queries: Gemini FIRST (has grounding/search), then Lovable Gateway, then others
      chain.push(findGemini(), findByKey('kimi'))
      // Add a virtual "lovable_gateway" provider as ultimate fallback
      chain.push({ id: '__lovable_gateway__', provider_key: '__lovable_gateway__', api_key_encrypted: 'lovable', display_name: 'Lovable Gateway', is_enabled: true })
      chain.push(findByKey('claude_haiku'))
    } else if (hasRichVisionFiles) {
      chain.push(findByKey('claude_sonnet'), findByKey('claude_opus'), findByKey('claude_haiku'), findGemini())
    } else if (mode === 'rido_pro') {
      chain.push(findByKey('claude_opus'), findByKey('claude_sonnet'), findByKey('claude_haiku'))
    } else if (mode === 'cowork' || mode === 'rido_code') {
      chain.push(findByKey('claude_sonnet'), findByKey('claude_haiku'))
    } else {
      chain.push(findByKey('claude_haiku'))
    }
    // Always add general fallbacks
    if (!weatherQuery) {
      chain.push(findByKey('kimi'), findGemini(), findByKey('openai_mini', 'openai_gpt4o', 'openai'))
    }
    // Always add Lovable Gateway as ultimate fallback for all queries
    chain.push({ id: '__lovable_gateway__', provider_key: '__lovable_gateway__', api_key_encrypted: 'lovable', display_name: 'Lovable Gateway', is_enabled: true })

    // Deduplicate and filter to providers with keys
    const seen = new Set<string>()
    const providers = chain.filter((p: any) => {
      if (!p || !hasKey(p)) return false
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })

    console.log(`[ai-chat] Text providers chain: ${providers.map((p: any) => p.provider_key).join(' → ')}`)

    if (!providers.length) {
      const msg = '⚠️ Brak kluczy API. Wejdź w Centrum AI → Dostawcy & API i dodaj klucz Claude lub Gemini.'
      if (stream) return sseText(msg)
      return jsonResp({ result: msg })
    }

    // OpenAI-compatible endpoints
    const oaiEndpoints: Record<string, string> = {
      kimi: 'https://api.moonshot.cn/v1/chat/completions',
      openai_gpt4o: 'https://api.openai.com/v1/chat/completions',
      openai_mini: 'https://api.openai.com/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
    }

    const claudeModels: Record<string, string> = {
      claude_haiku: 'claude-haiku-4-5-20251001',
      claude_sonnet: 'claude-sonnet-4-6',
      claude_opus: 'claude-opus-4-6',
    }

    let lastError = '⚠️ Żaden dostawca AI nie odpowiedział.'

    for (const p of providers) {
      const apiKey = p.api_key_encrypted
      usedProvider = p.provider_key
      usedModel = p.default_model || p.provider_key

      const isLovableGateway = p.provider_key === '__lovable_gateway__'
      const isGemini = !isLovableGateway && (p.display_name?.toLowerCase().includes('gemini') ||
                       p.provider_key?.toLowerCase().includes('gemini') ||
                       p.display_name?.toLowerCase().includes('imagen'))
      const isClaude = p.provider_key?.startsWith('claude')

      console.log(`[ai-chat] Trying provider: ${p.provider_key} (isGemini=${isGemini}, isClaude=${isClaude}, isLovableGateway=${isLovableGateway})`)

      try {
        if (isLovableGateway) {
          // Lovable AI Gateway — uses Gemini with grounding (for weather, search, etc.)
          const lovKey = Deno.env.get('LOVABLE_API_KEY')
          if (!lovKey) {
            console.log('[ai-chat] Lovable Gateway: no API key, skipping')
            continue
          }
          usedProvider = 'lovable_gateway'
          usedModel = 'google/gemini-3-flash-preview'
          console.log('[ai-chat] Trying Lovable Gateway with grounding')

          const lovMessages = [{ role: 'system', content: sys }, ...history]
          const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovKey}` },
            body: JSON.stringify({
              model: 'google/gemini-3-flash-preview',
              messages: lovMessages,
              stream: !!stream,
              max_tokens: 2048
            })
          })

          if (!res.ok) {
            const errText = await res.text()
            lastError = mapError('Gateway', res.status, errText)
            console.error(`[ai-chat] Lovable Gateway error ${res.status}:`, errText.substring(0, 200))
            await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
            continue
          }

          console.log('[ai-chat] ✅ Lovable Gateway success')
          await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
          if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
          const d = await res.json()
          const answer = d.choices?.[0]?.message?.content || 'Brak odpowiedzi'
          return jsonResp({ result: answer })

        } else if (isClaude) {
          // Anthropic API
          usedModel = claudeModels[p.provider_key] || 'claude-haiku-4-5-20251001'
          const claudeMessages = history.map((msg: any, index: number) => {
            const isLastUser = index === history.length - 1 && msg.role === 'user' && hasFiles
            if (!isLastUser) return { role: msg.role, content: msg.content }

            const contentBlocks: any[] = [{ type: 'text', text: msg.content }]
            for (const f of files) {
              if (!f?.data) continue
              if (isImageFile(f)) {
                contentBlocks.push({
                  type: 'image',
                  source: { type: 'base64', media_type: f.type, data: f.data }
                })
              } else if (isPdfFile(f)) {
                contentBlocks.push({
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: f.data }
                })
              }
            }

            return { role: 'user', content: contentBlocks }
          })

          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: usedModel,
              max_tokens: 2048,
              system: sys,
              messages: claudeMessages,
              stream: !!stream
            })
          })

          if (!res.ok) {
            const errText = await res.text()
            lastError = mapError(p.display_name || 'Claude', res.status, errText)
            console.error(`[ai-chat] Claude ${p.provider_key} error ${res.status}:`, errText.substring(0, 200))
            await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
            continue
          }

          console.log(`[ai-chat] ✅ Claude ${p.provider_key} success`)
          await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
          if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
          const d = await res.json()
          const answer = (d.content || []).filter((block: any) => block?.type === 'text').map((block: any) => block.text).join('\n').trim() || 'Brak odpowiedzi'
          if (shouldRetryWithNextProvider(query || '', answer, hasFiles)) {
            lastError = answer
            continue
          }
          return jsonResp({ result: answer })

        } else if (isGemini) {
          // Gemini via OpenAI-compatible endpoint — supports multimodal (images)
          usedModel = 'gemini-2.5-flash'
          
          // Build messages with image support
          const geminiMessages: any[] = [{ role: 'system', content: sys }]
          for (const msg of history) {
            // Check if this is the last user message and has image files
            const isLastUser = msg === history[history.length - 1] && msg.role === 'user' && hasFiles
            if (isLastUser) {
              const contentParts: any[] = [{ type: 'text', text: msg.content }]
              for (const f of files) {
                if (f.data && f.type?.startsWith('image/')) {
                  contentParts.push({ type: 'image_url', image_url: { url: `data:${f.type};base64,${f.data}` } })
                }
              }
              geminiMessages.push({ role: 'user', content: contentParts })
            } else {
              geminiMessages.push(msg)
            }
          }

          const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: usedModel,
              messages: geminiMessages,
              stream: !!stream,
              max_tokens: 2048
            })
          })

          if (!res.ok) {
            const errText = await res.text()
            lastError = mapError('Gemini', res.status, errText)
            console.error(`[ai-chat] Gemini error ${res.status}:`, errText.substring(0, 200))
            await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
            continue
          }

          console.log(`[ai-chat] ✅ Gemini success`)
          await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
          if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
          const d = await res.json()
          const answer = d.choices?.[0]?.message?.content || 'Brak odpowiedzi'
          if (shouldRetryWithNextProvider(query || '', answer, hasFiles)) {
            lastError = answer
            continue
          }
          return jsonResp({ result: answer })

        } else {
          // OpenAI-compatible (Kimi, OpenAI, etc.)
          const endpoint = oaiEndpoints[p.provider_key]
          if (!endpoint) {
            console.log(`[ai-chat] No endpoint for ${p.provider_key}, skipping`)
            continue
          }

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: usedModel,
              messages: [{ role: 'system', content: sys }, ...history],
              stream: !!stream,
              max_tokens: 2048
            })
          })

          if (!res.ok) {
            const errText = await res.text()
            lastError = mapError(p.display_name || p.provider_key, res.status, errText)
            console.error(`[ai-chat] ${p.provider_key} error ${res.status}:`, errText.substring(0, 200))
            await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: lastError, ms: Date.now() - t0 })
            continue
          }

          console.log(`[ai-chat] ✅ ${p.provider_key} success`)
          await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'success', ms: Date.now() - t0 })
          if (stream) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
          const d = await res.json()
          const answer = d.choices?.[0]?.message?.content || 'Brak odpowiedzi'
          if (shouldRetryWithNextProvider(query || '', answer, hasFiles)) {
            lastError = answer
            continue
          }
          return jsonResp({ result: answer })
        }
      } catch (providerErr) {
        lastError = `⚠️ ${p.display_name || p.provider_key}: błąd połączenia.`
        console.error(`[ai-chat] ${p.provider_key} exception:`, providerErr)
        continue
      }
    }

    console.error(`[ai-chat] All providers failed. Last error: ${lastError}`)
    if (stream) return sseText(lastError)
    return jsonResp({ result: lastError })

  } catch (err) {
    console.error('[ai-chat] Fatal error:', err)
    await logReq(supabase, { feature, provider: usedProvider, model: usedModel, userId, status: 'error', errorMessage: String(err), ms: Date.now() - t0 }).catch(() => {})
    return new Response(
      JSON.stringify({ result: `⚠️ Błąd serwera: ${String(err)}` }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})

const jsonResp = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
  })

async function logReq(sb: any, o: {
  feature: string; provider: string; model: string; userId: string | null
  status: string; ms?: number; errorMessage?: string
}) {
  try {
    await sb.from('ai_requests_log').insert({
      feature: o.feature, provider: o.provider, model: o.model,
      actor_user_id: o.userId, status: o.status,
      response_time_ms: o.ms || null, error_message: o.errorMessage || null, cache_hit: false
    })
  } catch { /* ignore */ }
}

function mapError(_name: string, status: number, raw: string) {
  const err = raw.toLowerCase()
  if (status === 429 || err.includes('rate') || err.includes('too many')) {
    return '⚠️ Za dużo zapytań w krótkim czasie. Spróbuj ponownie za chwilę.'
  }
  if (status === 402 || err.includes('credit') || err.includes('billing') || err.includes('quota') || err.includes('payment')) {
    return '⚠️ Usługa tymczasowo niedostępna. Spróbuj ponownie później.'
  }
  if (status === 401 || status === 403 || err.includes('invalid') || err.includes('permission') || err.includes('authentication')) {
    return '⚠️ Problem z autoryzacją. Skontaktuj się z administratorem.'
  }
  if (status === 404 || err.includes('not found')) {
    return '⚠️ Usługa tymczasowo niedostępna. Spróbuj ponownie.'
  }
  return `⚠️ Coś poszło nie tak. Spróbuj ponownie za chwilę.`
}

function sseText(text: string) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
  return new Response(payload, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}

function isPdfFile(file: any) {
  return file?.type === 'application/pdf' || String(file?.name || '').toLowerCase().endsWith('.pdf')
}

function isImageFile(file: any) {
  return String(file?.type || '').startsWith('image/')
}

function shouldRetryWithNextProvider(query: string, answer: string, hasFiles: boolean) {
  const normalized = String(answer || '').trim()
  if (!normalized) return true
  if (WEATHER_QUERY_PATTERNS.test(query) && LOW_CONFIDENCE_WEATHER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    console.log('[ai-chat] Low confidence weather answer, retrying with next provider')
    return true
  }
  if (hasFiles && FILE_ACCESS_FAILURE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    console.log('[ai-chat] File access failure, retrying with next provider')
    return true
  }
  // General "I can't answer" — fallback to next provider instead of showing refusal
  if (GENERAL_LOW_CONFIDENCE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    console.log('[ai-chat] General low confidence answer detected, retrying with next provider')
    return true
  }
  return false
}
