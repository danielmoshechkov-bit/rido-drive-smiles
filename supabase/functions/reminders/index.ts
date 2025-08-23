import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Email configuration - these would come from environment variables
const SMTP_CONFIG = {
  host: Deno.env.get('SMTP_HOST') || 'localhost',
  port: parseInt(Deno.env.get('SMTP_PORT') || '587'),
  user: Deno.env.get('SMTP_USER') || '',
  pass: Deno.env.get('SMTP_PASS') || '',
  from: Deno.env.get('MAIL_FROM') || 'RIDO <no-reply@rido.pl>',
};

async function sendEmail(to: string, subject: string, body: string) {
  console.log(`Would send email to ${to}: ${subject}`);
  console.log(`Body: ${body}`);
  
  // This is where actual email sending would be implemented
  // For now, just log the email details
  return true;
}

async function checkExpiryDates(supabaseClient: any) {
  const results = [];
  const today = new Date();
  const warningDays = [30, 7, 3, 1];

  // Check vehicle policies
  for (const days of warningDays) {
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + days);
    
    const { data: policies, error } = await supabaseClient
      .from('vehicle_policies')
      .select(`
        *,
        vehicle:vehicles(plate, brand, model)
      `)
      .eq('valid_to', targetDate.toISOString().split('T')[0]);

    if (error) {
      console.error('Error fetching policies:', error);
      continue;
    }

    for (const policy of policies || []) {
      // Check if reminder already exists
      const { data: existingReminder } = await supabaseClient
        .from('reminders')
        .select('id')
        .eq('entity_type', 'Policy')
        .eq('entity_id', policy.id)
        .eq('due_date', policy.valid_to)
        .single();

      if (!existingReminder) {
        // Create reminder
        const { error: reminderError } = await supabaseClient
          .from('reminders')
          .insert([{
            entity_type: 'Policy',
            entity_id: policy.id,
            due_date: policy.valid_to,
            title: `${policy.vehicle.plate} - ${policy.type} wygasa`,
            notes: `Pojazd ${policy.vehicle.plate}: ${policy.type} wygasa dnia ${policy.valid_to}. Proszę o działanie.`,
            channel: 'email',
            status: 'open'
          }]);

        if (!reminderError) {
          // Send email
          const emailSent = await sendEmail(
            'admin@rido.pl', // This would come from configuration
            `[RIDO] ${policy.vehicle.plate} - ${policy.type} wygasa ${policy.valid_to}`,
            `Pojazd ${policy.vehicle.plate}: ${policy.type} wygasa dnia ${policy.valid_to}. Proszę o działanie.`
          );

          if (emailSent) {
            // Update reminder status
            await supabaseClient
              .from('reminders')
              .update({ status: 'sent' })
              .eq('entity_type', 'Policy')
              .eq('entity_id', policy.id)
              .eq('due_date', policy.valid_to);
          }

          results.push({
            type: 'policy',
            vehicle: policy.vehicle.plate,
            days: days,
            date: policy.valid_to
          });
        }
      }
    }
  }

  // Check vehicle inspections
  for (const days of warningDays) {
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + days);
    
    const { data: inspections, error } = await supabaseClient
      .from('vehicle_inspections')
      .select(`
        *,
        vehicle:vehicles(plate, brand, model)
      `)
      .eq('valid_to', targetDate.toISOString().split('T')[0]);

    if (error) {
      console.error('Error fetching inspections:', error);
      continue;
    }

    for (const inspection of inspections || []) {
      // Check if reminder already exists
      const { data: existingReminder } = await supabaseClient
        .from('reminders')
        .select('id')
        .eq('entity_type', 'Inspection')
        .eq('entity_id', inspection.id)
        .eq('due_date', inspection.valid_to)
        .single();

      if (!existingReminder) {
        // Create reminder
        const { error: reminderError } = await supabaseClient
          .from('reminders')
          .insert([{
            entity_type: 'Inspection',
            entity_id: inspection.id,
            due_date: inspection.valid_to,
            title: `${inspection.vehicle.plate} - przegląd wygasa`,
            notes: `Pojazd ${inspection.vehicle.plate}: przegląd wygasa dnia ${inspection.valid_to}. Proszę o działanie.`,
            channel: 'email',
            status: 'open'
          }]);

        if (!reminderError) {
          // Send email
          const emailSent = await sendEmail(
            'admin@rido.pl', // This would come from configuration
            `[RIDO] ${inspection.vehicle.plate} - przegląd wygasa ${inspection.valid_to}`,
            `Pojazd ${inspection.vehicle.plate}: przegląd wygasa dnia ${inspection.valid_to}. Proszę o działanie.`
          );

          if (emailSent) {
            // Update reminder status
            await supabaseClient
              .from('reminders')
              .update({ status: 'sent' })
              .eq('entity_type', 'Inspection')
              .eq('entity_id', inspection.id)
              .eq('due_date', inspection.valid_to);
          }

          results.push({
            type: 'inspection',
            vehicle: inspection.vehicle.plate,
            days: days,
            date: inspection.valid_to
          });
        }
      }
    }
  }

  return results;
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
        if (action === 'check') {
          // Manual trigger of expiry check
          const results = await checkExpiryDates(supabaseClient);
          
          return new Response(JSON.stringify({
            message: 'Expiry check completed',
            processed: results.length,
            results: results
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Get reminders
          const status = url.searchParams.get('status') || 'open';
          
          const { data, error } = await supabaseClient
            .from('reminders')
            .select('*')
            .eq('status', status)
            .order('due_date');

          if (error) throw error;

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'POST': {
        if (action === 'cron') {
          // This would be called by a cron job
          console.log('Running scheduled reminder check...');
          
          const results = await checkExpiryDates(supabaseClient);
          
          return new Response(JSON.stringify({
            message: 'Cron job completed',
            processed: results.length,
            timestamp: new Date().toISOString()
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Create manual reminder
          const reminder = await req.json();
          
          const { data, error } = await supabaseClient
            .from('reminders')
            .insert([reminder])
            .select()
            .single();

          if (error) throw error;

          return new Response(JSON.stringify(data), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in reminders function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});