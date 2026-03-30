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
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get settings for report email
    const { data: settings } = await supabase
      .from('agency_settings')
      .select('report_email, agency_name')
      .single();

    if (!settings?.report_email) {
      return new Response(
        JSON.stringify({ success: true, message: 'No report email configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get campaign stats
    const { data: campaigns } = await supabase
      .from('agency_campaigns')
      .select('name, platform, status, roas_current, spend_today, daily_budget, risk_level, trend, predicted_roas_7d')
      .eq('status', 'active');

    // Get recent actions
    const { data: actions } = await supabase
      .from('agent_actions')
      .select('action_type, description, status, proposed_at')
      .gte('proposed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('proposed_at', { ascending: false });

    // Get leads from last 24h
    const { data: leads, count: leadsCount } = await supabase
      .from('marketing_leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Generate report summary with Claude
    let reportText = `Raport dzienny - ${new Date().toLocaleDateString('pl-PL')}\n\n`;
    reportText += `Aktywne kampanie: ${campaigns?.length || 0}\n`;
    reportText += `Nowe leady (24h): ${leadsCount || 0}\n`;
    reportText += `Akcje agenta (24h): ${actions?.length || 0}\n\n`;

    if (campaigns && campaigns.length > 0) {
      reportText += 'KAMPANIE:\n';
      for (const c of campaigns) {
        reportText += `- ${c.name} (${c.platform}): ROAS ${c.roas_current || 'b/d'}, wydatek ${c.spend_today || 0} PLN`;
        if (c.risk_level === 'high' || c.risk_level === 'critical') {
          reportText += ' ⚠️ RYZYKO';
        }
        reportText += '\n';
      }
    }

    // Send via rido-mail edge function
    try {
      await fetch(`${supabaseUrl}/functions/v1/rido-mail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          to: settings.report_email,
          subject: `[${settings.agency_name || 'GetRido'}] Raport dzienny - ${new Date().toLocaleDateString('pl-PL')}`,
          text: reportText,
        }),
      });
    } catch (emailErr) {
      console.error('Failed to send report email:', emailErr);
    }

    return new Response(
      JSON.stringify({ success: true, report_sent_to: settings.report_email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
