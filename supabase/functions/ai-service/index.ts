import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface AIServiceRequest {
  type: 'search' | 'seo' | 'photo_edit' | 'chat' | 'test' | 'vehicle-description' | 'document_extract';
  payload: Record<string, unknown>;
  userId?: string;
}

// Document extraction using GPT-4o Vision
async function extractDocumentWithVision(
  documentUrl: string,
  fileType: string
): Promise<Record<string, unknown>> {
  const systemPrompt = `Jesteś asystentem księgowym specjalizującym się w OCR faktur kosztowych.
Analizujesz zdjęcie/skan faktury i zwracasz ustrukturyzowane dane w formacie JSON.

ZAWSZE odpowiadaj TYLKO w formacie JSON bez dodatkowego tekstu ani markdown.
Jeśli nie możesz odczytać wartości, ustaw null.
Dla kwot używaj liczb (nie stringów).
Dla dat używaj formatu YYYY-MM-DD.

Wymagana struktura odpowiedzi:
{
  "invoice_number": "string lub null",
  "issue_date": "YYYY-MM-DD lub null",
  "sale_date": "YYYY-MM-DD lub null", 
  "due_date": "YYYY-MM-DD lub null",
  "supplier": {
    "name": "string lub null",
    "nip": "string (tylko cyfry) lub null",
    "address": "string lub null"
  },
  "amounts": {
    "net": number lub null,
    "vat": number lub null,
    "gross": number lub null,
    "vat_rate": "string np. 23% lub null"
  },
  "items": [
    { "name": "string", "qty": number, "net": number }
  ],
  "category": "transport|fuel|service|rent|insurance|office|telecommunication|other",
  "payment_method": "transfer|cash|card lub null",
  "bank_account": "string lub null",
  "confidence": number od 0 do 1 (twoja pewność co do poprawności odczytu)
}`;

  console.log(`[AI Service] Extracting document from: ${documentUrl}`);
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: 'Przeanalizuj tę fakturę i wyodrębnij wszystkie dane. Odpowiedz TYLKO w formacie JSON.' 
            },
            { 
              type: 'image_url', 
              image_url: { url: documentUrl } 
            }
          ]
        }
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI Service] Vision API error: ${response.status}`, errorText);
    throw new Error(`Document extraction failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  console.log(`[AI Service] Raw extraction response:`, content.substring(0, 500));

  // Parse JSON from response
  try {
    // Try to extract JSON from markdown code blocks if present
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const extraction = JSON.parse(jsonStr);
    return {
      success: true,
      extraction,
      usage: data.usage,
    };
  } catch (parseError) {
    console.error(`[AI Service] Failed to parse extraction JSON:`, parseError);
    throw new Error('Failed to parse AI response as JSON');
  }
}

interface AISettings {
  ai_enabled: boolean;
  ai_model: string;
  system_prompt: string;
  openai_api_key_encrypted?: string;
  gemini_api_key_encrypted?: string;
  ai_search_enabled: boolean;
  ai_seo_enabled: boolean;
  ai_photo_enabled: boolean;
}

// Get AI settings from database
async function getAISettings(supabase: ReturnType<typeof createClient>): Promise<AISettings | null> {
  const { data } = await supabase
    .from('ai_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  return data;
}

// Call OpenAI-compatible API (Lovable Gateway or direct OpenAI)
async function callOpenAI(
  messages: Array<{ role: string; content: string }>,
  settings: AISettings,
  options: { model?: string; tools?: unknown[]; tool_choice?: unknown } = {}
): Promise<{ content: string; tool_calls?: unknown[]; usage?: { total_tokens: number } }> {
  const startTime = Date.now();
  
  // Priority: ai_settings.openai_api_key_encrypted > LOVABLE_API_KEY
  const apiKey = settings.openai_api_key_encrypted || LOVABLE_API_KEY;
  const apiUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const model = options.model || settings.ai_model || 'openai/gpt-5.2';
  
  console.log(`[AI Service] Using ${settings.openai_api_key_encrypted ? 'custom OpenAI key from settings' : 'Lovable Gateway'}`);
  
  const body: Record<string, unknown> = {
    model,
    messages,
  };
  
  if (options.tools) {
    body.tools = options.tools;
    body.tool_choice = options.tool_choice || 'auto';
  }
  
  console.log(`[AI Service] Calling ${model} via Lovable Gateway`);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  const responseTime = Date.now() - startTime;
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI Service] API error: ${response.status}`, errorText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('AI credits depleted. Please add more credits.');
    }
    throw new Error(`AI API error: ${response.status}`);
  }
  
  const data = await response.json();
  const message = data.choices?.[0]?.message;
  
  console.log(`[AI Service] Response received in ${responseTime}ms`);
  
  return {
    content: message?.content || '',
    tool_calls: message?.tool_calls,
    usage: data.usage,
  };
}

// Call Gemini for image editing (using Lovable Gateway nano-banana)
async function callGeminiImage(
  imageUrl: string,
  instruction: string,
  _settings: AISettings
): Promise<{ editedImageUrl: string }> {
  const startTime = Date.now();
  
  console.log(`[AI Service] Calling Gemini Image API for edit: "${instruction}"`);
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      modalities: ['image', 'text']
    }),
  });
  
  const responseTime = Date.now() - startTime;
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI Service] Gemini Image API error: ${response.status}`, errorText);
    throw new Error(`Image editing failed: ${response.status}`);
  }
  
  const data = await response.json();
  const editedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!editedImageUrl) {
    throw new Error('No edited image returned from AI');
  }
  
  console.log(`[AI Service] Image edited in ${responseTime}ms`);
  
  return { editedImageUrl };
}

// Log AI usage (legacy + new ai_requests_log)
async function logAIUsage(
  supabase: ReturnType<typeof createClient>,
  userId: string | undefined,
  aiType: string,
  modelUsed: string,
  tokensUsed: number,
  responseTimeMs: number,
  querySummary?: string
) {
  try {
    // Legacy log
    await supabase.from('ai_credit_history').insert({
      user_id: userId || null,
      query_type: aiType,
      ai_type: aiType,
      model_used: modelUsed,
      tokens_used: tokensUsed,
      response_time_ms: responseTimeMs,
      query_summary: querySummary?.substring(0, 100),
      credits_used: 1,
      was_free: !userId
    });
    // New centralized log
    await supabase.from('ai_requests_log').insert({
      actor_user_id: userId || null,
      feature: `ai_${aiType}`,
      provider: 'lovable',
      model: modelUsed,
      task_type: aiType === 'photo_edit' ? 'image' : 'text',
      status: 'success',
      response_time_ms: responseTimeMs,
      tokens_in: tokensUsed,
    });
  } catch (error) {
    console.error('[AI Service] Failed to log usage:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, payload, userId }: AIServiceRequest = await req.json();
    
    if (!type) {
      return new Response(
        JSON.stringify({ error: 'Missing request type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const settings = await getAISettings(supabase);
    
    if (!settings?.ai_enabled) {
      return new Response(
        JSON.stringify({ error: 'AI services are currently disabled' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    let result: Record<string, unknown> = {};
    const startTime = Date.now();
    
    switch (type) {
      case 'test': {
        // Simple test to verify AI connection
        const testResult = await callOpenAI(
          [
            { role: 'system', content: 'You are a helpful assistant. Respond briefly.' },
            { role: 'user', content: payload.query as string || 'Say hello!' }
          ],
          settings
        );
        result = {
          success: true,
          response: testResult.content,
          model: settings.ai_model,
        };
        break;
      }
      
      case 'search': {
        if (!settings.ai_search_enabled) {
          return new Response(
            JSON.stringify({ error: 'AI Search is disabled' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Delegate to ai-search function
        result = { redirect: 'ai-search', payload };
        break;
      }
      
      case 'seo': {
        if (!settings.ai_seo_enabled) {
          return new Response(
            JSON.stringify({ error: 'AI SEO is disabled' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Delegate to ai-seo-generator function
        result = { redirect: 'ai-seo-generator', payload };
        break;
      }
      
      case 'photo_edit': {
        if (!settings.ai_photo_enabled) {
          return new Response(
            JSON.stringify({ error: 'AI Photo Editing is disabled' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const { imageUrl, instruction } = payload as { imageUrl: string; instruction: string };
        if (!imageUrl || !instruction) {
          return new Response(
            JSON.stringify({ error: 'Missing imageUrl or instruction' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const editResult = await callGeminiImage(imageUrl, instruction, settings);
        result = {
          success: true,
          originalUrl: imageUrl,
          editedUrl: editResult.editedImageUrl,
          instruction,
        };
        break;
      }
      
      case 'chat': {
        const messages = payload.messages as Array<{ role: string; content: string }>;
        if (!messages || !Array.isArray(messages)) {
          return new Response(
            JSON.stringify({ error: 'Missing messages array' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const chatResult = await callOpenAI(messages, settings);
        result = {
          success: true,
          content: chatResult.content,
          usage: chatResult.usage,
        };
        break;
      }
      
      case 'vehicle-description': {
        const vehicleData = payload.vehicleData as Record<string, unknown>;
        if (!vehicleData) {
          return new Response(
            JSON.stringify({ error: 'Missing vehicleData' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const prompt = `Napisz profesjonalny, atrakcyjny opis ogłoszenia sprzedaży pojazdu w języku polskim. 
Dane pojazdu:
- Marka: ${vehicleData.brand || 'nieznana'}
- Model: ${vehicleData.model || 'nieznany'}
- Rok: ${vehicleData.year || 'nieznany'}
- Przebieg: ${vehicleData.mileage || 'nieznany'} km
- Paliwo: ${vehicleData.fuel || 'nieznane'}
- Skrzynia: ${vehicleData.transmission || 'nieznana'}
- Moc: ${vehicleData.power || 'nieznana'} KM
- Pojemność: ${vehicleData.engine || 'nieznana'} cm³
- Nadwozie: ${vehicleData.bodyType || 'nieznane'}
- Kolor: ${vehicleData.color || 'nieznany'}
- Wyposażenie: ${Array.isArray(vehicleData.equipment) ? vehicleData.equipment.join(', ') : 'standardowe'}
- Uszkodzony: ${vehicleData.isDamaged ? 'tak' : 'nie'}
- Typ transakcji: ${vehicleData.transactionType || 'sprzedaż'}

Opis powinien być:
- Długość: 150-300 słów
- Profesjonalny ale przyjazny ton
- Podkreślający zalety pojazdu
- Bez powtarzania suchych danych technicznych
- Zachęcający do kontaktu`;

        const descResult = await callOpenAI(
          [
            { role: 'system', content: 'Jesteś ekspertem od sprzedaży samochodów. Piszesz atrakcyjne opisy ogłoszeń.' },
            { role: 'user', content: prompt }
          ],
          settings
        );
        
        result = {
          success: true,
          description: descResult.content,
        };
        break;
      }
      
      case 'document_extract': {
        const { document_url, file_type } = payload as { document_url: string; file_type: string };
        if (!document_url) {
          return new Response(
            JSON.stringify({ error: 'Missing document_url' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`[AI Service] Processing document extraction for: ${document_url}`);
        
        const extractionResult = await extractDocumentWithVision(
          document_url,
          file_type || 'image'
        );
        
        result = extractionResult;
        break;
      }
      
      default:
        return new Response(
          JSON.stringify({ error: `Unknown request type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    
    const responseTime = Date.now() - startTime;
    
    // Log usage
    await logAIUsage(
      supabase,
      userId,
      type,
      settings.ai_model || 'openai/gpt-5.2',
      0,
      responseTime,
      JSON.stringify(payload).substring(0, 100)
    );
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[AI Service] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
