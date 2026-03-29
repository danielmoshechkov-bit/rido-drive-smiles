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
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const weekStart = weekAgo.slice(0, 10);

    // Check if already exists
    const { data: existing } = await supabase.from('weekly_learning_reports').select('id').eq('week_start', weekStart).single();
    if (existing) {
      return new Response(JSON.stringify({ message: 'Raport tygodniowy już istnieje' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Collect weekly data
    const [dailyRes, testsRes, topTemplatesRes, patternsRes] = await Promise.all([
      supabase.from('daily_sales_reports').select('*').gte('report_date', weekStart).order('report_date'),
      supabase.from('ab_tests').select('*').gte('created_at', weekAgo),
      supabase.from('ai_message_templates').select('*').eq('is_active', true).order('times_responded', { ascending: false }).limit(10),
      supabase.from('ai_lead_patterns').select('*').limit(20),
    ]);

    const weeklyData = {
      daily_reports: (dailyRes.data || []).map(d => ({ date: d.report_date, consensus: d.consensus })),
      completed_tests: (testsRes.data || []).filter(t => t.status === 'completed'),
      top_templates: (topTemplatesRes.data || []).map(t => ({ id: t.id, use_case: t.use_case, times_used: t.times_used, times_responded: t.times_responded })),
      patterns: patternsRes.data || [],
    };

    // AI analysis with different focus areas
    const analyze = async (focus: string) => {
      const resp = await fetch(AI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: `Jesteś analitykiem sprzedaży portalu GetRido. ${focus} Odpowiadaj po polsku.` },
            { role: 'user', content: `Dane tygodniowe: ${JSON.stringify(weeklyData)}\n\nZwróć JSON: { "weekly_trend": "rosnący/stabilny/spadający + dlaczego", "best_performing_industry": "...", "worst_performing_industry": "...", "new_pattern_detected": "...", "strategy_for_next_week": "...", "focus_industry": "..." }` }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'weekly_analysis',
              description: 'Tygodniowa analiza',
              parameters: {
                type: 'object',
                properties: {
                  weekly_trend: { type: 'string' },
                  best_performing_industry: { type: 'string' },
                  worst_performing_industry: { type: 'string' },
                  new_pattern_detected: { type: 'string' },
                  strategy_for_next_week: { type: 'string' },
                  focus_industry: { type: 'string' }
                },
                required: ['weekly_trend', 'strategy_for_next_week']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'weekly_analysis' } }
        })
      });
      const data = await resp.json();
      try { return JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'); }
      catch { return { weekly_trend: 'brak danych' }; }
    };

    const [a1, a2, a3] = await Promise.all([
      analyze('Skup się na ogólnych trendach i konwersjach.'),
      analyze('Skup się na psychologii klienta i najlepszych szablonach.'),
      analyze('Skup się na branżach i lokalizacjach.'),
    ]);

    // Consensus
    const consensusResp = await fetch(AI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'user',
          content: `3 analizy tygodniowe:\nA: ${JSON.stringify(a1)}\nB: ${JSON.stringify(a2)}\nC: ${JSON.stringify(a3)}\n\nStwórz konsensus tygodniowy: { "weekly_trend": "...", "key_learning": "...", "strategy_next_week": "...", "confidence": 0.0-1.0 }`
        }],
        tools: [{
          type: 'function',
          function: {
            name: 'weekly_consensus',
            description: 'Konsensus tygodniowy',
            parameters: {
              type: 'object',
              properties: {
                weekly_trend: { type: 'string' },
                key_learning: { type: 'string' },
                strategy_next_week: { type: 'string' },
                confidence: { type: 'number' }
              },
              required: ['weekly_trend', 'confidence']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'weekly_consensus' } }
      })
    });

    const cData = await consensusResp.json();
    let consensus = { weekly_trend: 'brak', confidence: 0 };
    try { consensus = JSON.parse(cData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'); }
    catch { /* use default */ }

    await supabase.from('weekly_learning_reports').insert({
      week_start: weekStart, raw_data: weeklyData,
      claude_analysis: a1, gpt_analysis: a2, gemini_analysis: a3, consensus,
    });

    return new Response(JSON.stringify({ success: true, consensus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Weekly learning error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Błąd' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
