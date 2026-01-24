import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssistantRequest {
  action: 'interpret' | 'execute' | 'transcribe' | 'speak';
  payload: Record<string, unknown>;
  sessionId?: string;
  locale?: string;
}

interface IntentResponse {
  intent: string;
  confidence: number;
  draft?: Record<string, unknown>;
  missing_fields: string[];
  followup_questions: string[];
  tool_calls: Array<{ name: string; args: Record<string, unknown> }>;
  requires_confirmation: boolean;
  confirmation_summary?: {
    title: string;
    bullets: string[];
    editable_fields: string[];
  };
}

const INTENT_SYSTEM_PROMPT = `Jesteś asystentem RIDO AI. Analizujesz polecenia użytkownika i zwracasz ustrukturyzowany JSON.

Dostępne intencje:
MARKETPLACE:
- search_offers: wyszukiwanie ofert (auta, nieruchomości, usługi)
- compare_offers: porównanie ofert
- create_lead: utworzenie zapytania do usługodawców

KSIĘGOWOŚĆ:
- create_invoice: wystawienie faktury ("wystaw fakturę dla NIP...")
- add_contractor: dodanie kontrahenta ("dodaj kontrahenta NIP...")
- verify_contractor: weryfikacja kontrahenta ("sprawdź białą listę...")
- send_invoice_email: wysłanie faktury emailem
- submit_ksef: wysłanie do KSeF
- scan_receipt: skanowanie paragonu/faktury
- classify_expense: kategoryzacja kosztu

ADMINISTRACJA:
- manage_profile: zarządzanie profilem
- support_ticket: zgłoszenie problemu
- unknown: nieznana intencja

ZASADY:
1. Zawsze zwracaj TYLKO valid JSON
2. Jeśli brakuje danych, dodaj je do missing_fields
3. Akcje nieodwracalne (create_invoice, send_invoice_email, submit_ksef) wymagają confirmation
4. Dla search_offers nie wymagaj confirmation
5. Zadawaj max 1-3 pytania naraz

Format odpowiedzi:
{
  "intent": "nazwa_intencji",
  "confidence": 0.0-1.0,
  "draft": { dane do akcji },
  "missing_fields": ["pole1", "pole2"],
  "followup_questions": ["Pytanie 1?", "Pytanie 2?"],
  "tool_calls": [{ "name": "function_name", "args": {} }],
  "requires_confirmation": true/false,
  "confirmation_summary": {
    "title": "Tytuł akcji",
    "bullets": ["Punkt 1", "Punkt 2"],
    "editable_fields": ["field1", "field2"]
  }
}`;

// Get API key with priority: ai_settings.openai_api_key_encrypted > LOVABLE_API_KEY
async function getOpenAIKey(supabase: ReturnType<typeof createClient>): Promise<string> {
  // First try to get key from ai_settings table
  const { data } = await supabase
    .from('ai_settings')
    .select('openai_api_key_encrypted')
    .limit(1)
    .maybeSingle();

  if (data?.openai_api_key_encrypted) {
    console.log('[AI Assistant] Using OpenAI key from ai_settings');
    return data.openai_api_key_encrypted;
  }

  // Fallback to LOVABLE_API_KEY
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (lovableKey) {
    console.log('[AI Assistant] Using Lovable Gateway key');
    return lovableKey;
  }

  throw new Error('No OpenAI API key configured - add key in Admin Portal or set LOVABLE_API_KEY');
}

async function interpretCommand(
  userText: string,
  context: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>
): Promise<IntentResponse> {
  const apiKey = await getOpenAIKey(supabase);

  const messages = [
    { role: 'system', content: INTENT_SYSTEM_PROMPT },
    { role: 'user', content: `Kontekst: ${JSON.stringify(context)}\n\nPolecenie użytkownika: "${userText}"` }
  ];

  const response = await fetch('https://ai.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('Empty response from AI');
  }

  try {
    return JSON.parse(content) as IntentResponse;
  } catch {
    console.error('Failed to parse AI response:', content);
    return {
      intent: 'unknown',
      confidence: 0,
      missing_fields: [],
      followup_questions: ['Przepraszam, nie zrozumiałem. Możesz powtórzyć?'],
      tool_calls: [],
      requires_confirmation: false,
    };
  }
}

async function executeToolCalls(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<Array<{ name: string; success: boolean; result?: unknown; error?: string }>> {
  const results = [];

  for (const call of toolCalls) {
    try {
      let result: unknown;

      switch (call.name) {
        case 'search_offers':
          // Delegate to ai-search function
          const { data: searchData, error: searchError } = await supabase.functions.invoke('ai-search', {
            body: { query: call.args.query, type: call.args.type || 'vehicles' }
          });
          result = searchError ? { error: searchError.message } : searchData;
          break;

        case 'verify_contractor_whitelist':
          const { data: wlData, error: wlError } = await supabase.functions.invoke('registry-whitelist', {
            body: { nip: call.args.nip }
          });
          result = wlError ? { error: wlError.message } : wlData;
          break;

        case 'verify_contractor_gus':
          const { data: gusData, error: gusError } = await supabase.functions.invoke('registry-gus', {
            body: { nip: call.args.nip }
          });
          result = gusError ? { error: gusError.message } : gusData;
          break;

        case 'create_invoice_draft':
          const { data: invoiceData, error: invoiceError } = await supabase
            .from('invoices')
            .insert({
              entity_id: call.args.entity_id,
              invoice_number: 'DRAFT',
              issue_date: new Date().toISOString().split('T')[0],
              status: 'draft',
              type: 'sales',
              net_amount: call.args.net_amount || 0,
              vat_amount: call.args.vat_amount || 0,
              gross_amount: call.args.gross_amount || 0,
              recipient_name: call.args.recipient_name,
              recipient_nip: call.args.recipient_nip,
              notes: call.args.description,
            })
            .select()
            .single();
          result = invoiceError ? { error: invoiceError.message } : invoiceData;
          break;

        case 'add_contractor':
          const { data: contractorData, error: contractorError } = await supabase
            .from('invoice_recipients')
            .insert({
              entity_id: call.args.entity_id,
              name: call.args.name,
              nip: call.args.nip,
              address_street: call.args.address,
              address_city: call.args.city,
              address_postal_code: call.args.postal_code,
              verification_status: 'unverified',
            })
            .select()
            .single();
          result = contractorError ? { error: contractorError.message } : contractorData;
          break;

        default:
          result = { error: `Unknown tool: ${call.name}` };
      }

      results.push({ name: call.name, success: !('error' in (result as object)), result });
    } catch (error) {
      results.push({ name: call.name, success: false, error: String(error) });
    }
  }

  return results;
}

async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const apiKey = await getOpenAIKey(supabase);

  // Convert base64 to binary
  const binaryString = atob(audioBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Create form data for Whisper API
  const formData = new FormData();
  const audioBlob = new Blob([bytes], { type: mimeType });
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'pl');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Transcription error: ${error}`);
  }

  const data = await response.json();
  return data.text || '';
}

async function generateSpeech(
  text: string,
  voice: string = 'alloy',
  supabase: ReturnType<typeof createClient>
): Promise<{ audioUrl: string; cached: boolean }> {
  // Check cache first
  const phraseHash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text + voice)
  ).then(hash => 
    Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );

  const { data: cached } = await supabase
    .from('voice_phrase_cache')
    .select('audio_url')
    .eq('phrase_hash', phraseHash)
    .maybeSingle();

  if (cached?.audio_url) {
    return { audioUrl: cached.audio_url, cached: true };
  }

  // Generate new audio - get API key from settings
  const apiKey = await getOpenAIKey(supabase);

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS error: ${await response.text()}`);
  }

  // For now, return a placeholder - in production, upload to storage
  // This is a simplified version
  const audioBuffer = await response.arrayBuffer();
  const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
  const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

  // Cache the phrase (simplified - in production use storage)
  await supabase.from('voice_phrase_cache').insert({
    phrase_hash: phraseHash,
    phrase_text: text,
    audio_url: audioUrl,
    provider: 'openai',
    voice_name: voice,
  }).catch(() => {}); // Ignore cache errors

  return { audioUrl, cached: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, payload, sessionId, locale = 'pl' } = await req.json() as AssistantRequest;

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    let response: Record<string, unknown>;
    const startTime = Date.now();

    switch (action) {
      case 'interpret':
        const { text, context = {} } = payload as { text: string; context?: Record<string, unknown> };
        
        if (!text) {
          throw new Error('Text is required for interpret action');
        }

        const intentResult = await interpretCommand(text, { ...context, locale, userId }, supabase);
        response = { success: true, ...intentResult };
        break;

      case 'execute':
        const { toolCalls, confirmed = false } = payload as { 
          toolCalls: Array<{ name: string; args: Record<string, unknown> }>; 
          confirmed?: boolean 
        };

        if (!confirmed) {
          response = { success: false, error: 'Confirmation required' };
          break;
        }

        if (!userId) {
          throw new Error('Authentication required for execute action');
        }

        const executeResults = await executeToolCalls(toolCalls, userId, supabase);
        response = { success: true, results: executeResults };
        break;

      case 'transcribe':
        const { audio, mimeType = 'audio/webm' } = payload as { audio: string; mimeType?: string };
        
        if (!audio) {
          throw new Error('Audio data is required');
        }

        const transcribedText = await transcribeAudio(audio, mimeType, supabase);
        response = { success: true, text: transcribedText };
        break;

      case 'speak':
        const { text: speakText, voice = 'alloy' } = payload as { text: string; voice?: string };
        
        if (!speakText) {
          throw new Error('Text is required for speak action');
        }

        const speechResult = await generateSpeech(speakText, voice, supabase);
        response = { success: true, ...speechResult };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log AI usage
    const responseTimeMs = Date.now() - startTime;
    if (userId) {
      await supabase.from('ai_credit_history').insert({
        user_id: userId,
        query_type: `assistant_${action}`,
        credits_used: action === 'speak' ? 2 : action === 'transcribe' ? 1 : 1,
        response_time_ms: responseTimeMs,
        query_summary: action === 'interpret' ? (payload as { text?: string }).text?.slice(0, 100) : null,
      }).catch(() => {});
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('AI Assistant error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
