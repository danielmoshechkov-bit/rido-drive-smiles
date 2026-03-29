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

    // Get active tests
    const { data: tests } = await supabase.from('ab_tests')
      .select('*').eq('status', 'running');

    if (!tests || tests.length === 0) {
      return new Response(JSON.stringify({ message: 'Brak aktywnych testów A/B' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results = [];

    for (const test of tests) {
      const startedAt = new Date(test.started_at);
      const daysSinceStart = (Date.now() - startedAt.getTime()) / 86400000;

      if (daysSinceStart < 7) continue; // Too early

      // Ask AI to evaluate
      const resp = await fetch(AI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [{
            role: 'user',
            content: `Test A/B: "${test.name}". Hipoteza: "${test.hypothesis}". Wariant A: ${JSON.stringify(test.variant_a)}. Wariant B: ${JSON.stringify(test.variant_b)}. Trwa ${Math.round(daysSinceStart)} dni. Oceń: { "winner": "A/B/inconclusive", "confidence": 0-100, "reasoning": "...", "apply_immediately": true/false, "next_test_suggestion": "..." }`
          }],
          tools: [{
            type: 'function',
            function: {
              name: 'evaluate_test',
              description: 'Ocena testu A/B',
              parameters: {
                type: 'object',
                properties: {
                  winner: { type: 'string', enum: ['A', 'B', 'inconclusive'] },
                  confidence: { type: 'number' },
                  reasoning: { type: 'string' },
                  apply_immediately: { type: 'boolean' },
                  next_test_suggestion: { type: 'string' }
                },
                required: ['winner', 'confidence', 'reasoning']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'evaluate_test' } }
        })
      });

      const aiData = await resp.json();
      let evaluation = { winner: 'inconclusive', confidence: 0, reasoning: 'Brak danych', apply_immediately: false };

      try {
        evaluation = JSON.parse(aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}');
      } catch { /* use default */ }

      if (evaluation.confidence > 85) {
        await supabase.from('ab_tests').update({
          status: 'completed', winner: evaluation.winner,
          results: evaluation
        }).eq('id', test.id);
      }

      results.push({ test_id: test.id, name: test.name, evaluation });
    }

    return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('A/B test error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Błąd' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
