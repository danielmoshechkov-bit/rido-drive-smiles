import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid token');
    }

    if (path === 'send') {
      // Send invitation
      const { driver_id, fleet_id, vehicle_id } = await req.json();
      
      console.log('Sending invitation:', { driver_id, fleet_id, vehicle_id });

      // Check if invitation already exists
      const { data: existing } = await supabase
        .from('fleet_invitations')
        .select('id')
        .eq('driver_id', driver_id)
        .eq('fleet_id', fleet_id)
        .eq('status', 'pending')
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({ error: 'Invitation already sent' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create invitation
      const { data: invitation, error: inviteError } = await supabase
        .from('fleet_invitations')
        .insert({
          driver_id,
          fleet_id,
          vehicle_id,
          invited_by: user.id,
          status: 'pending'
        })
        .select()
        .single();

      if (inviteError) throw inviteError;

      // Get fleet name and driver info
      const { data: fleet } = await supabase
        .from('fleets')
        .select('name')
        .eq('id', fleet_id)
        .single();

      const { data: driver } = await supabase
        .from('drivers')
        .select('first_name, last_name')
        .eq('id', driver_id)
        .single();

      // Create alert for driver
      await supabase
        .from('system_alerts')
        .insert({
          type: 'info',
          category: 'invitation',
          title: 'Zaproszenie do floty',
          description: `Flota "${fleet?.name}" zaprasza Cię do współpracy`,
          driver_id,
          fleet_id,
          metadata: {
            invitation_id: invitation.id,
            vehicle_id
          }
        });

      // Create alert for fleet
      await supabase
        .from('system_alerts')
        .insert({
          type: 'info',
          category: 'invitation',
          title: 'Wysłano zaproszenie',
          description: `Zaproszenie dla ${driver?.first_name} ${driver?.last_name}`,
          fleet_id,
          metadata: {
            invitation_id: invitation.id,
            driver_id
          }
        });

      console.log('Invitation created:', invitation.id);

      return new Response(
        JSON.stringify({ invitation }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (path === 'respond') {
      // Respond to invitation
      const { invitation_id, status } = await req.json();
      
      console.log('Responding to invitation:', { invitation_id, status });

      // Update invitation
      const { data: invitation, error: updateError } = await supabase
        .from('fleet_invitations')
        .update({
          status,
          responded_at: new Date().toISOString()
        })
        .eq('id', invitation_id)
        .select('*, fleets(*), vehicles(*)')
        .single();

      if (updateError) throw updateError;

      // If accepted, update driver fleet_id and create assignments
      if (status === 'accepted') {
        // Always update driver's fleet_id
        const { error: updateFleetError } = await supabase
          .from('drivers')
          .update({ fleet_id: invitation.fleet_id })
          .eq('id', invitation.driver_id);

        if (updateFleetError) {
          console.error('Error updating driver fleet_id:', updateFleetError);
        }

        // If vehicle assigned, create vehicle assignment
        if (invitation.vehicle_id) {
          // Unassign any existing assignments for this vehicle
          await supabase
            .from('driver_vehicle_assignments')
            .update({ status: 'inactive', unassigned_at: new Date().toISOString() })
            .eq('vehicle_id', invitation.vehicle_id)
            .eq('status', 'active');

          // Create new assignment
          const { error: assignError } = await supabase
            .from('driver_vehicle_assignments')
            .insert({
              driver_id: invitation.driver_id,
              vehicle_id: invitation.vehicle_id,
              fleet_id: invitation.fleet_id,
              status: 'active'
            });

          if (assignError) throw assignError;
        }

        // Create alert for fleet
        await supabase
          .from('system_alerts')
          .insert({
            type: 'info',
            category: 'invitation',
            title: 'Kierowca dołączył do floty',
            description: invitation.vehicle_id 
              ? `Kierowca zaakceptował zaproszenie i został przypisany do pojazdu ${invitation.vehicles?.plate}`
              : 'Kierowca zaakceptował zaproszenie do floty',
            fleet_id: invitation.fleet_id,
            driver_id: invitation.driver_id
          });
      } else if (status === 'rejected') {
        // Create alert for fleet about rejection
        await supabase
          .from('system_alerts')
          .insert({
            type: 'warning',
            category: 'invitation',
            title: 'Zaproszenie odrzucone',
            description: `Kierowca odrzucił zaproszenie do floty`,
            fleet_id: invitation.fleet_id,
            driver_id: invitation.driver_id
          });
      }

      console.log('Invitation response processed');

      return new Response(
        JSON.stringify({ invitation }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (path === 'my-invitations') {
      // Get user's driver_id
      const { data: driverApp } = await supabase
        .from('driver_app_users')
        .select('driver_id')
        .eq('user_id', user.id)
        .single();

      if (!driverApp) {
        return new Response(
          JSON.stringify({ invitations: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get invitations
      const { data: invitations, error: fetchError } = await supabase
        .from('fleet_invitations')
        .select('*, fleets(*), vehicles(*)')
        .eq('driver_id', driverApp.driver_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      return new Response(
        JSON.stringify({ invitations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (path === 'leave-fleet') {
      // Leave fleet
      const { fleet_id } = await req.json();
      
      console.log('Leaving fleet:', { fleet_id, user_id: user.id });

      // Get user's driver_id
      const { data: driverApp } = await supabase
        .from('driver_app_users')
        .select('driver_id')
        .eq('user_id', user.id)
        .single();

      if (!driverApp) {
        throw new Error('Driver not found');
      }

      // Deactivate assignments
      const { error: deactivateError } = await supabase
        .from('driver_vehicle_assignments')
        .update({
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('driver_id', driverApp.driver_id)
        .eq('fleet_id', fleet_id)
        .eq('status', 'active');

      if (deactivateError) throw deactivateError;

      // Get fleet name
      const { data: fleet } = await supabase
        .from('fleets')
        .select('name')
        .eq('id', fleet_id)
        .single();

      // Create alert for fleet
      await supabase
        .from('system_alerts')
        .insert({
          type: 'warning',
          category: 'fleet',
          title: 'Kierowca opuścił flotę',
          description: `Kierowca opuścił flotę "${fleet?.name}"`,
          fleet_id,
          driver_id: driverApp.driver_id
        });

      console.log('Left fleet successfully');

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fleet-invitations function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
