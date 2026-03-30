import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get automation settings
    const { data: settings } = await supabase
      .from('agency_settings')
      .select('*')
      .single();

    if (!settings) {
      return new Response(JSON.stringify({ success: true, message: 'No settings found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const roasStopThreshold = settings.roas_stop_threshold || 1.0;
    const roasBoostThreshold = settings.roas_boost_threshold || 3.0;
    const maxBoostPercent = settings.max_boost_percent || 30;

    // Get active campaigns
    const { data: campaigns } = await supabase
      .from('agency_campaigns')
      .select('*')
      .eq('status', 'active');

    let actionsCount = 0;

    for (const campaign of campaigns || []) {
      // AUTO-STOP: If ROAS below threshold
      if (campaign.roas_current && campaign.roas_current < roasStopThreshold) {
        await supabase.from('agent_actions').insert({
          action_type: 'auto_stop',
          description: `Kampania "${campaign.name}" ma ROAS ${campaign.roas_current} (próg: ${roasStopThreshold}). Automatycznie wstrzymana.`,
          campaign_id: campaign.id,
          status: 'proposed',
        });
        actionsCount++;
      }

      // AUTO-BOOST: If ROAS above boost threshold
      if (campaign.roas_current && campaign.roas_current > roasBoostThreshold && campaign.daily_budget) {
        const newBudget = Math.round(campaign.daily_budget * (1 + maxBoostPercent / 100));
        await supabase.from('agent_actions').insert({
          action_type: 'auto_boost',
          description: `Kampania "${campaign.name}" ma ROAS ${campaign.roas_current}. Propozycja zwiększenia budżetu z ${campaign.daily_budget} na ${newBudget} PLN/dzień.`,
          campaign_id: campaign.id,
          status: 'proposed',
        });
        actionsCount++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, actions_proposed: actionsCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
