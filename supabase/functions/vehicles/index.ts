import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Vehicle {
  id?: string;
  plate: string;
  vin?: string;
  brand: string;
  model: string;
  year: number;
  color?: string;
  odometer?: number;
  status: 'aktywne' | 'serwis' | 'sprzedane';
  gps_external_link?: string;
  city_id: string;
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
    const vehicleId = pathParts[pathParts.length - 1];

    switch (req.method) {
      case 'GET': {
        if (vehicleId && vehicleId !== 'vehicles') {
          // Get single vehicle
          const { data, error } = await supabaseClient
            .from('vehicles')
            .select(`
              *,
              policies:vehicle_policies(*),
              inspections:vehicle_inspections(*),
              services:vehicle_services(*),
              damages:vehicle_damages(*)
            `)
            .eq('id', vehicleId)
            .single();

          if (error) throw error;

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Get all vehicles with optional filters
          const cityId = url.searchParams.get('cityId');
          const status = url.searchParams.get('status');
          const q = url.searchParams.get('q');

          let query = supabaseClient
            .from('vehicles')
            .select(`
              *,
              policies:vehicle_policies(*),
              inspections:vehicle_inspections(*)
            `);

          if (cityId) query = query.eq('city_id', cityId);
          if (status && status !== 'all') query = query.eq('status', status);
          if (q) {
            query = query.or(`plate.ilike.%${q}%,vin.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`);
          }

          const { data, error } = await query.order('created_at', { ascending: false });

          if (error) throw error;

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'POST': {
        const vehicle: Vehicle = await req.json();
        
        // Validate required fields
        if (!vehicle.plate || !vehicle.brand || !vehicle.model || !vehicle.year || !vehicle.city_id) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: plate, brand, model, year, city_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabaseClient
          .from('vehicles')
          .insert([{
            ...vehicle,
            status: vehicle.status || 'aktywne'
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
        if (!vehicleId) {
          return new Response(
            JSON.stringify({ error: 'Vehicle ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updates = await req.json();
        
        const { data, error } = await supabaseClient
          .from('vehicles')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', vehicleId)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'DELETE': {
        if (!vehicleId) {
          return new Response(
            JSON.stringify({ error: 'Vehicle ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabaseClient
          .from('vehicles')
          .delete()
          .eq('id', vehicleId);

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
    console.error('Error in vehicles function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});