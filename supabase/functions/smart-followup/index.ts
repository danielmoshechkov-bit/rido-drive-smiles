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
    const { lead_id, provider_id } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Get lead data
    const { data: lead } = await supabase.from('service_leads')
      .select('*, provider_services(name, price)').eq('id', lead_id).single();
    if (!lead) throw new Error('Lead not found');

    // Get provider data
    const { data: provider } = await supabase.from('service_providers')
      .select('company_name, company_city, company_phone').eq('id', provider_id).single();

    // Get best templates for this industry
    const { data: templates } = await supabase.from('ai_message_templates')
      .select('*').eq('use_case', 'first_contact').eq('is_active', true)
      .order('times_responded', { ascending: false }).limit(3);

    // Get patterns
    const { data: patterns } = await supabase.from('ai_lead_patterns')
      .select('*').limit(5);

    const hour = new Date().getHours();

    // Ask AI what to do
    const aiResp = await fetch(AI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: `Jesteś asystentem sprzedaży dla ${provider?.company_name || 'firmy'} z ${provider?.company_city || 'Polski'}.`
        }, {
          role: 'user',
          content: `Nowy lead: ${JSON.stringify({ name: lead.lead_name, service: lead.provider_services?.name, source: lead.source, message: lead.lead_message })}
Najlepsze szablony: ${JSON.stringify(templates?.map(t => ({ id: t.id, body: t.body, response_rate: t.times_responded })))}
Wzorce: ${JSON.stringify(patterns)}
Obecna godzina: ${hour}
Zdecyduj i zwróć JSON: { "send_now": true/false, "message": "gotowa wiadomość SMS", "reasoning": "dlaczego" }`
        }],
        tools: [{
          type: 'function',
          function: {
            name: 'followup_decision',
            description: 'Decyzja o follow-upie',
            parameters: {
              type: 'object',
              properties: {
                send_now: { type: 'boolean' },
                message: { type: 'string' },
                reasoning: { type: 'string' },
                send_at: { type: 'string', description: 'ISO datetime jeśli nie teraz' }
              },
              required: ['send_now', 'message', 'reasoning']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'followup_decision' } }
      })
    });

    const aiData = await aiResp.json();
    let decision = { send_now: true, message: `Dzień dobry ${lead.lead_name || ''}! Dziękujemy za zainteresowanie naszą usługą. Jak możemy pomóc?`, reasoning: 'default' };

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) decision = JSON.parse(toolCall.function.arguments);
    } catch { /* use default */ }

    // Schedule in followup_queue
    const scheduledAt = decision.send_now ? new Date().toISOString() : (decision.send_at || new Date().toISOString());

    await supabase.from('followup_queue').insert({
      lead_id, step_index: 0, channel: 'sms',
      message: decision.message, scheduled_at: scheduledAt, status: 'pending'
    });

    // Log the interaction
    await supabase.from('ai_interactions').insert({
      provider_id, lead_id, interaction_type: 'follow_up',
      channel: 'sms', direction: 'outbound',
      message_sent: decision.message, ai_generated: true, outcome: 'pending'
    });

    return new Response(JSON.stringify({ success: true, decision }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Smart followup error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Błąd' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
