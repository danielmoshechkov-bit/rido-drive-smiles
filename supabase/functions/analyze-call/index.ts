import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { transcript, provider_id, lead_id } = await req.json();
    if (!transcript || !provider_id) throw new Error('transcript i provider_id wymagane');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Get provider info
    const { data: provider } = await supabase.from('service_providers')
      .select('company_name, categories').eq('id', provider_id).single();

    const aiResp = await fetch(AI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: 'Jesteś ekspertem sprzedaży. Analizujesz rozmowy handlowe po polsku.'
        }, {
          role: 'user',
          content: `Przeanalizuj tę rozmowę sprzedażową.
Firma: ${provider?.company_name || 'brak'}
Branża: ${provider?.categories || 'brak'}
Transkrypt: ${transcript}

Zwróć JSON: { "sentiment": "positive/neutral/negative", "summary": "2-3 zdania", "objections": ["obiekcja 1"], "winning_phrases": ["fraza"], "missed_opportunities": ["co można było zrobić"], "next_action": "rekomendacja", "outcome_prediction": "won/lost/uncertain" }`
        }],
        tools: [{
          type: 'function',
          function: {
            name: 'call_analysis',
            description: 'Analiza rozmowy',
            parameters: {
              type: 'object',
              properties: {
                sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
                summary: { type: 'string' },
                objections: { type: 'array', items: { type: 'string' } },
                winning_phrases: { type: 'array', items: { type: 'string' } },
                missed_opportunities: { type: 'array', items: { type: 'string' } },
                next_action: { type: 'string' },
                outcome_prediction: { type: 'string', enum: ['won', 'lost', 'uncertain'] }
              },
              required: ['sentiment', 'summary', 'next_action', 'outcome_prediction']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'call_analysis' } }
      })
    });

    const aiData = await aiResp.json();
    let analysis = { sentiment: 'neutral', summary: 'Analiza niedostępna', objections: [], winning_phrases: [], missed_opportunities: [], next_action: 'Brak', outcome_prediction: 'uncertain' };

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) analysis = JSON.parse(toolCall.function.arguments);
    } catch { /* use default */ }

    // Save to call_transcripts
    await supabase.from('call_transcripts').insert({
      provider_id, lead_id: lead_id || null, transcript,
      ai_summary: analysis.summary, ai_sentiment: analysis.sentiment,
      ai_next_action: analysis.next_action, outcome: analysis.outcome_prediction,
    });

    // Update ai_lead_patterns with objections
    if (analysis.objections?.length > 0 && provider?.categories) {
      const { data: existing } = await supabase.from('ai_lead_patterns')
        .select('*').eq('industry', provider.categories).limit(1).single();
      if (existing) {
        const objections = [...(existing.common_objections as string[] || []), ...analysis.objections].slice(-20);
        const responses = [...(existing.winning_responses as string[] || []), ...analysis.winning_phrases].slice(-20);
        await supabase.from('ai_lead_patterns').update({
          common_objections: objections, winning_responses: responses,
          sample_size: (existing.sample_size || 0) + 1, updated_at: new Date().toISOString()
        }).eq('id', existing.id);
      } else {
        await supabase.from('ai_lead_patterns').insert({
          industry: provider.categories,
          common_objections: analysis.objections,
          winning_responses: analysis.winning_phrases,
          sample_size: 1
        });
      }
    }

    return new Response(JSON.stringify({ success: true, analysis }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Analyze call error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Błąd' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
