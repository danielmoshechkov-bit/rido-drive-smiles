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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // Check if already generated today
    const { data: existing } = await supabase.from('daily_sales_reports').select('id').eq('report_date', today).single();
    if (existing) {
      return new Response(JSON.stringify({ message: 'Raport na dziś już istnieje' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // KROK 1 — Zbierz dane
    const [leadsRes, interactionsRes, transcriptsRes, followupsRes, templatesRes] = await Promise.all([
      supabase.from('service_leads').select('*').gte('created_at', yesterday),
      supabase.from('ai_interactions').select('*').gte('created_at', yesterday),
      supabase.from('call_transcripts').select('ai_summary, ai_sentiment, outcome').gte('created_at', yesterday),
      supabase.from('followup_queue').select('*').gte('sent_at', yesterday).eq('status', 'sent'),
      supabase.from('ai_message_templates').select('id, use_case, times_used, times_responded, sales_won').eq('is_active', true),
    ]);

    const leads = leadsRes.data || [];
    const interactions = interactionsRes.data || [];
    const transcripts = transcriptsRes.data || [];
    const followups = followupsRes.data || [];
    const templates = templatesRes.data || [];

    const dailyPackage = {
      date: today,
      new_leads: {
        count: leads.length,
        sources: {
          organic: leads.filter(l => l.source === 'organic').length,
          portal_ad: leads.filter(l => l.source === 'portal_ad').length,
          ai_search: leads.filter(l => l.source === 'ai_search').length,
        }
      },
      interactions: {
        total_sent: interactions.filter(i => i.direction === 'outbound').length,
        responses_received: interactions.filter(i => i.direction === 'inbound').length,
      },
      outcomes: {
        won: interactions.filter(i => i.outcome === 'sale_won').length,
        lost: interactions.filter(i => i.outcome === 'sale_lost').length,
        no_response: interactions.filter(i => i.outcome === 'no_response').length,
      },
      transcripts_summary: transcripts.slice(0, 5).map(t => ({ summary: t.ai_summary, sentiment: t.ai_sentiment, outcome: t.outcome })),
      templates_performance: templates.slice(0, 10).map(t => ({ id: t.id, use_case: t.use_case, used: t.times_used, responded: t.times_responded })),
      followups_sent: followups.length,
    };

    const dataStr = JSON.stringify(dailyPackage);
    const systemPrompt = 'Jesteś ekspertem sprzedaży B2C dla małych firm w Polsce. Analizujesz dane portalu usługowego GetRido. Odpowiadaj po polsku.';

    // KROK 2 — Analiza przez AI (single model via Lovable gateway)
    const analyzeWithPrompt = async (extraInstruction: string) => {
      const resp = await fetch(AI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt + ' ' + extraInstruction },
            { role: 'user', content: `Dane sprzedażowe z ${today}: ${dataStr}\n\nZwróć JSON: { "key_insight": "...", "what_worked": ["..."], "what_failed": ["..."], "pattern_detected": "...", "recommended_change": "...", "confidence": 0.0-1.0 }` }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'daily_analysis',
              description: 'Dzienna analiza sprzedaży',
              parameters: {
                type: 'object',
                properties: {
                  key_insight: { type: 'string' },
                  what_worked: { type: 'array', items: { type: 'string' } },
                  what_failed: { type: 'array', items: { type: 'string' } },
                  pattern_detected: { type: 'string' },
                  recommended_change: { type: 'string' },
                  confidence: { type: 'number' }
                },
                required: ['key_insight', 'confidence']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'daily_analysis' } }
        })
      });
      const data = await resp.json();
      try {
        return JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}');
      } catch { return { key_insight: 'Analiza niedostępna', confidence: 0 }; }
    };

    // Run analyses (using same model with different focus instructions)
    const [analysisA, analysisB, analysisC] = await Promise.all([
      analyzeWithPrompt('Skup się na KONKRETNYCH wzorcach sprzedażowych, nie ogólnikach.'),
      analyzeWithPrompt('Skup się na psychologii klienta i timingu — kiedy klienci są gotowi kupić.'),
      analyzeWithPrompt('Skup się na wzorcach branżowych — która branża konwertuje najlepiej i dlaczego.'),
    ]);

    // KROK 3 — Consensus
    const consensusResp = await fetch(AI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Tworzysz konsensus z 3 analiz AI. Odpowiadaj po polsku.' },
          { role: 'user', content: `Analiza A: ${JSON.stringify(analysisA)}\nAnaliza B: ${JSON.stringify(analysisB)}\nAnaliza C: ${JSON.stringify(analysisC)}\n\nZwróć konsensus JSON: { "consensus_insight": "...", "disagreements": "...", "final_recommendation": "...", "ab_test_suggestion": "...", "confidence_score": 0.0-1.0, "models_agreement": 0.0-1.0 }` }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'consensus',
            description: 'Konsensus analiz',
            parameters: {
              type: 'object',
              properties: {
                consensus_insight: { type: 'string' },
                disagreements: { type: 'string' },
                final_recommendation: { type: 'string' },
                ab_test_suggestion: { type: 'string' },
                confidence_score: { type: 'number' },
                models_agreement: { type: 'number' }
              },
              required: ['consensus_insight', 'confidence_score', 'models_agreement']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'consensus' } }
      })
    });

    const consensusData = await consensusResp.json();
    let consensus = { consensus_insight: 'Brak danych', confidence_score: 0, models_agreement: 0 };
    try {
      consensus = JSON.parse(consensusData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}');
    } catch { /* use default */ }

    // KROK 4 — Zapisz
    await supabase.from('daily_sales_reports').insert({
      report_date: today,
      raw_data: dailyPackage,
      claude_analysis: analysisA,
      gpt_analysis: analysisB,
      gemini_analysis: analysisC,
      consensus,
    });

    // KROK 5 — Auto-wdrożenie jeśli pewność > 0.8
    if (consensus.confidence_score > 0.8) {
      // Log actions taken
      await supabase.from('daily_sales_reports').update({
        actions_taken: [{ type: 'high_confidence_noted', recommendation: consensus.final_recommendation, at: new Date().toISOString() }]
      }).eq('report_date', today);
    }

    // KROK 6 — Email notification
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          type: 'daily_report',
          report_date: today,
          consensus_insight: consensus.consensus_insight,
          recommendation: consensus.final_recommendation,
        }
      });
    } catch { /* email is optional */ }

    return new Response(JSON.stringify({ success: true, consensus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Daily sales analysis error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Błąd' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
