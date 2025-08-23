import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentGenerateRequest {
  templates: string[];
  driverRef: {
    id?: string;
    phone?: string;
    email?: string;
    fullName?: string;
  };
  vehicleRef: {
    id?: string;
    plate?: string;
  };
  fields: {
    rent: {
      weeklyPrice: number;
      deposit: number;
      startDate: string;
      startTime: string;
      endDate?: string;
      endTime?: string;
      indefinite: boolean;
      limitKm: number;
      overKmRate: number;
    };
    handover: {
      placeOut: string;
      placeIn: string;
      fuelLevel: string;
      remarks: string;
    };
  };
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
    const action = pathParts[pathParts.length - 1];

    switch (req.method) {
      case 'GET': {
        if (action === 'documents') {
          // Get all documents
          const { data, error } = await supabaseClient
            .from('documents')
            .select(`
              *,
              vehicle:vehicles(plate, brand, model),
              driver:drivers(first_name, last_name)
            `)
            .order('created_at', { ascending: false });

          if (error) throw error;

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Get single document
          const documentId = action;
          const { data, error } = await supabaseClient
            .from('documents')
            .select(`
              *,
              vehicle:vehicles(plate, brand, model),
              driver:drivers(first_name, last_name)
            `)
            .eq('id', documentId)
            .single();

          if (error) throw error;

          // Return document metadata or redirect to file
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'POST': {
        if (action === 'generate') {
          const request: DocumentGenerateRequest = await req.json();
          
          console.log('Document generation request:', request);

          // Find or create driver
          let driver;
          if (request.driverRef.id) {
            const { data, error } = await supabaseClient
              .from('drivers')
              .select('*')
              .eq('id', request.driverRef.id)
              .single();
            
            if (error) throw new Error('Driver not found');
            driver = data;
          } else {
            // Create new driver logic would go here
            throw new Error('Creating new drivers not implemented yet');
          }

          // Find or create vehicle
          let vehicle;
          if (request.vehicleRef.id) {
            const { data, error } = await supabaseClient
              .from('vehicles')
              .select('*')
              .eq('id', request.vehicleRef.id)
              .single();
            
            if (error) throw new Error('Vehicle not found');
            vehicle = data;
          } else {
            // Create new vehicle logic would go here
            throw new Error('Creating new vehicles not implemented yet');
          }

          // Get templates
          const { data: templates, error: templatesError } = await supabaseClient
            .from('document_templates')
            .select('*')
            .in('code', request.templates);

          if (templatesError) throw templatesError;

          const generatedDocuments = [];

          // For each template, generate document
          for (const template of templates) {
            // This is where DOCX processing and PDF generation would happen
            // For now, we'll just create placeholder entries
            
            const documentData = {
              type: template.name,
              vehicle_id: vehicle.id,
              driver_id: driver.id,
              template_id: template.id,
              file_url: `/api/documents/${crypto.randomUUID()}.pdf`, // Placeholder
            };

            const { data: document, error: docError } = await supabaseClient
              .from('documents')
              .insert([documentData])
              .select()
              .single();

            if (docError) throw docError;

            generatedDocuments.push({
              id: document.id,
              type: document.type,
              fileUrl: document.file_url
            });
          }

          console.log('Generated documents:', generatedDocuments);

          return new Response(JSON.stringify(generatedDocuments), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(
            JSON.stringify({ error: 'Invalid endpoint' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in documents function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});