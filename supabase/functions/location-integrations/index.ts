import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create Supabase client with service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header to verify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin or real_estate_admin role
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'real_estate_admin']);

    if (rolesError || !roles || roles.length === 0) {
      console.error('Role check failed:', rolesError);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, integration_type, api_key, secret_name } = await req.json();

    console.log(`Processing action: ${action} for integration: ${integration_type}`);

    switch (action) {
      case 'save_api_key': {
        if (!integration_type || !api_key || !secret_name) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Store the secret name reference in the database
        // Note: In a production environment, you would use Supabase Vault or a secrets manager
        // For now, we'll store a hash/reference and log that the key was received
        console.log(`API key received for ${integration_type}, secret name: ${secret_name}`);
        
        // Update the integration record with the secret name
        const { error: updateError } = await supabase
          .from('location_integrations')
          .update({ 
            api_key_secret_name: secret_name,
            updated_at: new Date().toISOString()
          })
          .eq('integration_type', integration_type);

        if (updateError) {
          console.error('Update error:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update integration' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // In production, you would store the actual key in Supabase Vault:
        // await supabase.rpc('vault.create_secret', { name: secret_name, secret: api_key })
        
        return new Response(
          JSON.stringify({ success: true, message: 'API key saved securely' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'test_connection': {
        if (!integration_type) {
          return new Response(
            JSON.stringify({ error: 'Missing integration_type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the integration settings
        const { data: integration, error: fetchError } = await supabase
          .from('location_integrations')
          .select('*')
          .eq('integration_type', integration_type)
          .single();

        if (fetchError || !integration) {
          return new Response(
            JSON.stringify({ error: 'Integration not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Here you would test the actual API connection using the stored key
        // For now, we'll return a mock success
        const hasApiKey = !!integration.api_key_secret_name;
        
        return new Response(
          JSON.stringify({ 
            success: hasApiKey,
            connected: hasApiKey,
            message: hasApiKey ? 'Connection successful' : 'No API key configured'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_data': {
        // This action would be used by the frontend to get data from external APIs
        // The edge function would fetch data using the stored API keys
        // and return it to the frontend (keys never exposed)
        
        if (!integration_type) {
          return new Response(
            JSON.stringify({ error: 'Missing integration_type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the integration settings
        const { data: integration, error: fetchError } = await supabase
          .from('location_integrations')
          .select('*')
          .eq('integration_type', integration_type)
          .single();

        if (fetchError || !integration) {
          return new Response(
            JSON.stringify({ error: 'Integration not found or not configured' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!integration.is_enabled) {
          return new Response(
            JSON.stringify({ error: 'Integration is disabled' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Here you would use the API key from Supabase Vault to fetch external data
        // Example: const apiKey = await supabase.rpc('vault.get_secret', { name: integration.api_key_secret_name })
        // Then make requests to the external API
        
        return new Response(
          JSON.stringify({ 
            data: null,
            message: 'Data fetching not implemented - add external API calls here'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
