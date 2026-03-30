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

    const { action_id } = await req.json();

    if (!action_id) {
      throw new Error('action_id is required');
    }

    // Get the action
    const { data: action, error } = await supabase
      .from('agent_actions')
      .select('*, agency_campaigns(*)')
      .eq('id', action_id)
      .single();

    if (error || !action) {
      throw new Error('Action not found');
    }

    if (action.status !== 'approved') {
      throw new Error('Action must be approved before execution');
    }

    // Record the current ROAS before execution
    const roasBefore = action.agency_campaigns?.roas_current || null;

    // Mark as executed
    await supabase
      .from('agent_actions')
      .update({
        status: 'executed',
        executed_at: new Date().toISOString(),
        outcome_roas_before: roasBefore,
      })
      .eq('id', action_id);

    // TODO: Execute actual API calls to Meta/Google based on action_type
    // For now, just mark as executed — real API integration comes in Etap 2

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Akcja oznaczona jako wykonana. Integracja API w trakcie wdrażania.',
        action_id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
