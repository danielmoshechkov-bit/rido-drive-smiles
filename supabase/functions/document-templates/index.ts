import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentTemplate {
  id?: string;
  name: string;
  code: string;
  version: string;
  placeholders_json: any;
  file_url?: string;
  enabled: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const templateId = pathParts[pathParts.length - 1];

    switch (req.method) {
      case 'GET': {
        if (templateId && templateId !== 'document-templates') {
          // Get single template
          const { data, error } = await supabaseClient
            .from('document_templates')
            .select('*')
            .eq('id', templateId)
            .single();

          if (error) throw error;

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Get all templates
          const { data, error } = await supabaseClient
            .from('document_templates')
            .select('*')
            .order('name');

          if (error) throw error;

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'POST': {
        const template: DocumentTemplate = await req.json();
        
        // Validate required fields
        if (!template.name || !template.code) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: name, code' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabaseClient
          .from('document_templates')
          .insert([{
            ...template,
            version: template.version || '1.0',
            enabled: template.enabled !== undefined ? template.enabled : true
          }])
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'PATCH': {
        if (!templateId) {
          return new Response(
            JSON.stringify({ error: 'Template ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updates = await req.json();
        
        const { data, error } = await supabaseClient
          .from('document_templates')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', templateId)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'DELETE': {
        if (!templateId) {
          return Response(
            JSON.stringify({ error: 'Template ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabaseClient
          .from('document_templates')
          .delete()
          .eq('id', templateId);

        if (error) throw error;

        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in document-templates function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});