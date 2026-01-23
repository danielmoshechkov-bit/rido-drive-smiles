import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReminderRequest {
  action: 'check' | 'send' | 'mark_paid' | 'create' | 'get_templates' | 'save_template';
  reminder_id?: string;
  driver_id?: string;
  fleet_id?: string;
  amount_due?: number;
  due_date?: string;
  vehicle_id?: string;
  notes?: string;
  template_type?: string;
  template_content?: string;
}

// Send email via Resend
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RIDO <noreply@getrido.pl>',
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const result = await response.json();
    console.log('Resend response:', result);
    return !result.error;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
}

// Send SMS via SMSAPI
async function sendSMS(phone: string, message: string, driverId?: string, fleetId?: string): Promise<boolean> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: {
        phone: phone,
        message: message,
        driver_id: driverId,
        fleet_id: fleetId,
        type: 'payment_reminder'
      }
    });

    if (error) {
      console.error('SMS edge function error:', error);
      return false;
    }

    return data?.success === true;
  } catch (error) {
    console.error('SMS sending error:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: ReminderRequest = await req.json();
    const { action } = body;

    // GET TEMPLATES
    if (action === 'get_templates') {
      const { data: templates, error } = await supabase
        .from('fleet_sms_templates')
        .select('*')
        .eq('fleet_id', body.fleet_id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, templates }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SAVE TEMPLATE
    if (action === 'save_template') {
      const { error } = await supabase
        .from('fleet_sms_templates')
        .upsert({
          fleet_id: body.fleet_id,
          template_type: body.template_type || 'payment_reminder',
          template_content: body.template_content,
          is_active: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fleet_id,template_type' });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CREATE REMINDER
    if (action === 'create') {
      const { data: reminder, error } = await supabase
        .from('rental_payment_reminders')
        .insert({
          driver_id: body.driver_id,
          fleet_id: body.fleet_id,
          vehicle_id: body.vehicle_id,
          amount_due: body.amount_due,
          due_date: body.due_date,
          notes: body.notes,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, reminder }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // MARK AS PAID
    if (action === 'mark_paid') {
      const { error } = await supabase
        .from('rental_payment_reminders')
        .update({
          status: 'paid',
          payment_confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', body.reminder_id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SEND REMINDER
    if (action === 'send') {
      // Get reminder details
      const { data: reminder, error: reminderError } = await supabase
        .from('rental_payment_reminders')
        .select(`
          *,
          driver:drivers(first_name, last_name, email, phone),
          vehicle:vehicles(plate, brand, model)
        `)
        .eq('id', body.reminder_id)
        .single();

      if (reminderError || !reminder) {
        throw new Error('Reminder not found');
      }

      // Get SMS template
      const { data: template } = await supabase
        .from('fleet_sms_templates')
        .select('template_content')
        .eq('fleet_id', reminder.fleet_id)
        .eq('template_type', 'payment_reminder')
        .single();

      const defaultTemplate = 'Przypomnienie: Termin płatności za wynajem pojazdu {plate} minął. Kwota: {amount} PLN. Prosimy o pilną wpłatę.';
      let smsContent = template?.template_content || defaultTemplate;

      // Replace placeholders
      smsContent = smsContent
        .replace('{amount}', reminder.amount_due?.toFixed(2) || '0.00')
        .replace('{plate}', reminder.vehicle?.plate || '')
        .replace('{brand}', reminder.vehicle?.brand || '')
        .replace('{model}', reminder.vehicle?.model || '')
        .replace('{due_date}', reminder.due_date || '')
        .replace('{driver_name}', `${reminder.driver?.first_name || ''} ${reminder.driver?.last_name || ''}`.trim());

      let smsSent = false;
      let emailSent = false;

      // Send SMS if phone available
      if (reminder.driver?.phone) {
        smsSent = await sendSMS(
          reminder.driver.phone,
          smsContent,
          reminder.driver_id,
          reminder.fleet_id
        );
      }

      // Send email if available
      if (reminder.driver?.email) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Przypomnienie o płatności</h2>
            <p>Szanowny/a ${reminder.driver?.first_name || ''} ${reminder.driver?.last_name || ''},</p>
            <p>Przypominamy o zaległej płatności za wynajem pojazdu:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Pojazd:</strong> ${reminder.vehicle?.brand || ''} ${reminder.vehicle?.model || ''} (${reminder.vehicle?.plate || ''})</p>
              <p><strong>Kwota do zapłaty:</strong> ${reminder.amount_due?.toFixed(2) || '0.00'} PLN</p>
              <p><strong>Termin płatności:</strong> ${reminder.due_date || ''}</p>
            </div>
            <p>Prosimy o niezwłoczne uregulowanie należności.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Wiadomość wygenerowana automatycznie przez system RIDO.
            </p>
          </div>
        `;

        emailSent = await sendEmail(
          reminder.driver.email,
          `Przypomnienie o płatności - ${reminder.vehicle?.plate || 'Wynajem pojazdu'}`,
          emailHtml
        );
      }

      // Update reminder
      const newStatus = new Date(reminder.due_date) < new Date() ? 'overdue' : 'reminded';
      await supabase
        .from('rental_payment_reminders')
        .update({
          status: newStatus,
          reminder_count: (reminder.reminder_count || 0) + 1,
          last_reminder_at: new Date().toISOString(),
          last_reminder_type: smsSent && emailSent ? 'both' : smsSent ? 'sms' : emailSent ? 'email' : 'none',
          updated_at: new Date().toISOString()
        })
        .eq('id', body.reminder_id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          sms_sent: smsSent, 
          email_sent: emailSent 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CHECK - automatic check for overdue payments
    if (action === 'check') {
      const today = new Date().toISOString().split('T')[0];

      // Find overdue reminders that haven't been reminded today
      const { data: overdueReminders, error } = await supabase
        .from('rental_payment_reminders')
        .select(`
          id,
          driver_id,
          fleet_id,
          amount_due,
          due_date,
          reminder_count,
          last_reminder_at,
          driver:drivers(first_name, last_name, email, phone),
          vehicle:vehicles(plate, brand, model)
        `)
        .in('status', ['pending', 'reminded', 'overdue'])
        .lt('due_date', today);

      if (error) throw error;

      let sentCount = 0;
      for (const reminder of overdueReminders || []) {
        // Check if already reminded today
        if (reminder.last_reminder_at) {
          const lastReminderDate = reminder.last_reminder_at.split('T')[0];
          if (lastReminderDate === today) continue;
        }

        // Send reminder
        const response = await supabase.functions.invoke('rental-payment-reminders', {
          body: { action: 'send', reminder_id: reminder.id }
        });

        if (!response.error) sentCount++;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          checked: overdueReminders?.length || 0,
          sent: sentCount 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in rental-payment-reminders:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
