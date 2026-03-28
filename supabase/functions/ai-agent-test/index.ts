import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { model, system_prompt, agent_id } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY nie jest skonfigurowany');
    }

    // Determine if this is a Claude or GPT model
    const isClaudeModel = model.startsWith('claude');
    
    let responseText = '';

    if (isClaudeModel) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 500,
          system: system_prompt,
          messages: [
            {
              role: 'user',
              content: 'Test: odpowiedz po polsku jednym zdaniem że działasz poprawnie i podaj swój model.',
            },
          ],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Claude API error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      responseText = data.content?.[0]?.text || 'Brak odpowiedzi';
    } else {
      // GPT model - use Lovable AI Gateway
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY nie jest skonfigurowany');
      }

      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: model === 'gpt-4o' ? 'openai/gpt-5' : 'openai/gpt-5-mini',
          messages: [
            { role: 'system', content: system_prompt },
            { role: 'user', content: 'Test: odpowiedz po polsku jednym zdaniem że działasz poprawnie i podaj swój model.' },
          ],
          max_tokens: 500,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI Gateway error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || 'Brak odpowiedzi';
    }

    return new Response(
      JSON.stringify({ success: true, response: responseText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('AI agent test error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
