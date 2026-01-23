import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReminderRequest {
  action: 'check' | 'send' | 'mark_paid' | 'create' | 'get_templates' | 'save_template' | 'check_upcoming' | 'notify_fleet' | 'daily_check';
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
async function sendSMS(supabase: any, phone: string, message: string, driverId?: string, fleetId?: string): Promise<boolean> {
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

// Get SMS template for fleet
async function getSmsTemplate(supabase: any, fleetId: string): Promise<string> {
  const defaultTemplate = 'Przypomnienie: Termin płatności za wynajem pojazdu {plate} minął. Kwota: {amount} PLN. Prosimy o pilną wpłatę.';
  
  try {
    const { data: template } = await supabase
      .from('fleet_sms_templates')
      .select('template_content')
      .eq('fleet_id', fleetId)
      .eq('template_type', 'payment_reminder')
      .single();
    
    return template?.template_content || defaultTemplate;
  } catch {
    return defaultTemplate;
  }
}

// Replace placeholders in template
function replacePlaceholders(template: string, reminder: any): string {
  return template
    .replace('{amount}', reminder.amount_due?.toFixed(2) || '0.00')
    .replace('{plate}', reminder.vehicle?.plate || '')
    .replace('{brand}', reminder.vehicle?.brand || '')
    .replace('{model}', reminder.vehicle?.model || '')
    .replace('{due_date}', reminder.due_date || '')
    .replace('{driver_name}', `${reminder.driver?.first_name || ''} ${reminder.driver?.last_name || ''}`.trim());
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

    console.log(`Processing action: ${action}`);

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

      const smsTemplate = await getSmsTemplate(supabase, reminder.fleet_id);
      const smsContent = replacePlaceholders(smsTemplate, reminder);

      let smsSent = false;
      let emailSent = false;

      // Send SMS if phone available
      if (reminder.driver?.phone) {
        smsSent = await sendSMS(
          supabase,
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

    // CHECK UPCOMING - Send reminders 3 days before due date
    if (action === 'check_upcoming') {
      const today = new Date();
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const targetDate = threeDaysLater.toISOString().split('T')[0];

      console.log(`Checking for payments due on: ${targetDate}`);

      const { data: upcomingReminders, error } = await supabase
        .from('rental_payment_reminders')
        .select(`
          *,
          driver:drivers(first_name, last_name, email, phone),
          vehicle:vehicles(plate, brand, model)
        `)
        .eq('status', 'pending')
        .eq('due_date', targetDate)
        .eq('upcoming_reminder_sent', false);

      if (error) throw error;

      let sentCount = 0;
      for (const reminder of upcomingReminders || []) {
        const upcomingTemplate = 'Przypomnienie: Za 3 dni ({due_date}) upływa termin płatności {amount} zł za pojazd {plate}. Jeśli już zapłaciłeś, zignoruj tę wiadomość.';
        const smsContent = replacePlaceholders(upcomingTemplate, reminder);

        let sent = false;

        if (reminder.driver?.phone) {
          sent = await sendSMS(supabase, reminder.driver.phone, smsContent, reminder.driver_id, reminder.fleet_id);
        }

        if (reminder.driver?.email) {
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">Przypomnienie o zbliżającym się terminie płatności</h2>
              <p>Szanowny/a ${reminder.driver?.first_name || ''} ${reminder.driver?.last_name || ''},</p>
              <p>Przypominamy, że za 3 dni upływa termin płatności za wynajem pojazdu:</p>
              <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                <p><strong>Pojazd:</strong> ${reminder.vehicle?.brand || ''} ${reminder.vehicle?.model || ''} (${reminder.vehicle?.plate || ''})</p>
                <p><strong>Kwota do zapłaty:</strong> ${reminder.amount_due?.toFixed(2) || '0.00'} PLN</p>
                <p><strong>Termin płatności:</strong> ${reminder.due_date || ''}</p>
              </div>
              <p>Jeśli płatność została już dokonana, prosimy zignorować tę wiadomość.</p>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                Wiadomość wygenerowana automatycznie przez system RIDO.
              </p>
            </div>
          `;

          await sendEmail(
            reminder.driver.email,
            `Przypomnienie - termin płatności za 3 dni - ${reminder.vehicle?.plate || ''}`,
            emailHtml
          );
          sent = true;
        }

        if (sent) {
          await supabase
            .from('rental_payment_reminders')
            .update({ upcoming_reminder_sent: true })
            .eq('id', reminder.id);
          sentCount++;
        }
      }

      console.log(`Sent ${sentCount} upcoming reminders`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          checked: upcomingReminders?.length || 0,
          sent: sentCount 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NOTIFY FLEET - Create notifications for fleet on due date
    if (action === 'notify_fleet') {
      const today = new Date().toISOString().split('T')[0];

      console.log(`Creating fleet notifications for payments due on: ${today}`);

      const { data: dueReminders, error } = await supabase
        .from('rental_payment_reminders')
        .select('id, fleet_id')
        .in('status', ['pending', 'reminded'])
        .eq('due_date', today)
        .eq('fleet_notified', false);

      if (error) throw error;

      let createdCount = 0;
      for (const reminder of dueReminders || []) {
        const { error: insertError } = await supabase
          .from('fleet_payment_notifications')
          .insert({
            fleet_id: reminder.fleet_id,
            reminder_id: reminder.id,
            notification_type: 'payment_due',
            status: 'pending'
          });

        if (!insertError) {
          await supabase
            .from('rental_payment_reminders')
            .update({ fleet_notified: true })
            .eq('id', reminder.id);
          createdCount++;
        }
      }

      console.log(`Created ${createdCount} fleet notifications`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          checked: dueReminders?.length || 0,
          created: createdCount 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DAILY CHECK - Run all automatic checks
    if (action === 'daily_check') {
      console.log('Running daily payment check...');

      // 1. Send upcoming reminders (3 days before)
      const upcomingResult = await handleAction(supabase, 'check_upcoming');
      
      // 2. Notify fleet about due payments
      const notifyResult = await handleAction(supabase, 'notify_fleet');
      
      // 3. Auto-send reminders for overdue payments without fleet response
      const overdueResult = await handleOverdueAutoReminders(supabase);

      return new Response(
        JSON.stringify({ 
          success: true, 
          upcoming: upcomingResult,
          fleet_notifications: notifyResult,
          overdue_auto: overdueResult
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CHECK - automatic check for overdue payments (legacy)
    if (action === 'check') {
      const today = new Date().toISOString().split('T')[0];

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
        if (reminder.last_reminder_at) {
          const lastReminderDate = reminder.last_reminder_at.split('T')[0];
          if (lastReminderDate === today) continue;
        }

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

// Helper function to handle internal action calls
async function handleAction(supabase: any, action: string): Promise<any> {
  try {
    if (action === 'check_upcoming') {
      const today = new Date();
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const targetDate = threeDaysLater.toISOString().split('T')[0];

      const { data: upcomingReminders } = await supabase
        .from('rental_payment_reminders')
        .select(`*, driver:drivers(first_name, last_name, email, phone), vehicle:vehicles(plate, brand, model)`)
        .eq('status', 'pending')
        .eq('due_date', targetDate)
        .eq('upcoming_reminder_sent', false);

      let sentCount = 0;
      for (const reminder of upcomingReminders || []) {
        const upcomingTemplate = 'Przypomnienie: Za 3 dni ({due_date}) upływa termin płatności {amount} zł za pojazd {plate}. Jeśli już zapłaciłeś, zignoruj tę wiadomość.';
        const smsContent = replacePlaceholders(upcomingTemplate, reminder);

        if (reminder.driver?.phone) {
          await sendSMS(supabase, reminder.driver.phone, smsContent, reminder.driver_id, reminder.fleet_id);
          await supabase.from('rental_payment_reminders').update({ upcoming_reminder_sent: true }).eq('id', reminder.id);
          sentCount++;
        }
      }

      return { checked: upcomingReminders?.length || 0, sent: sentCount };
    }

    if (action === 'notify_fleet') {
      const today = new Date().toISOString().split('T')[0];

      const { data: dueReminders } = await supabase
        .from('rental_payment_reminders')
        .select('id, fleet_id')
        .in('status', ['pending', 'reminded'])
        .eq('due_date', today)
        .eq('fleet_notified', false);

      let createdCount = 0;
      for (const reminder of dueReminders || []) {
        const { error } = await supabase
          .from('fleet_payment_notifications')
          .insert({
            fleet_id: reminder.fleet_id,
            reminder_id: reminder.id,
            notification_type: 'payment_due',
            status: 'pending'
          });

        if (!error) {
          await supabase.from('rental_payment_reminders').update({ fleet_notified: true }).eq('id', reminder.id);
          createdCount++;
        }
      }

      return { checked: dueReminders?.length || 0, created: createdCount };
    }

    return { error: 'Unknown action' };
  } catch (error) {
    console.error(`Error in handleAction(${action}):`, error);
    return { error: error.message };
  }
}

// Auto-send reminders for overdue payments where fleet hasn't responded in 24h
async function handleOverdueAutoReminders(supabase: any): Promise<any> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString();

    // Find notifications that are pending for more than 24 hours
    const { data: staleNotifications } = await supabase
      .from('fleet_payment_notifications')
      .select('id, reminder_id')
      .eq('status', 'pending')
      .lt('created_at', yesterdayStr);

    let autoSentCount = 0;
    for (const notification of staleNotifications || []) {
      // Send reminder automatically
      const { error } = await supabase.functions.invoke('rental-payment-reminders', {
        body: { action: 'send', reminder_id: notification.reminder_id }
      });

      if (!error) {
        // Mark notification as auto-sent
        await supabase
          .from('fleet_payment_notifications')
          .update({ status: 'auto_sent', responded_at: new Date().toISOString() })
          .eq('id', notification.id);
        autoSentCount++;
      }
    }

    return { checked: staleNotifications?.length || 0, auto_sent: autoSentCount };
  } catch (error) {
    console.error('Error in handleOverdueAutoReminders:', error);
    return { error: error.message };
  }
}
