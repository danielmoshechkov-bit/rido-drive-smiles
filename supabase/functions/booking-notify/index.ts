// Edge function: wysyła SMS-y przy rezerwacjach z portalu przez globalny send-sms
// type: 'preliminary' | 'confirmed' | 'review_request' | 'rescheduled' | 'cancelled'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, type, old_date, old_time } = await req.json();
    if (!booking_id || !type) {
      return new Response(JSON.stringify({ error: 'booking_id and type required' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: b, error } = await supabase
      .from('service_bookings')
      .select(`
        id, booking_number, customer_name, customer_phone, scheduled_date, scheduled_time,
        vehicle_brand, vehicle_model, vehicle_plate, customer_notes, service_id, provider_id,
        service_providers(id, company_name, short_name, company_address, company_city, company_phone)
      `)
      .eq('id', booking_id)
      .single();

    if (error || !b) {
      console.error('Booking not found:', error);
      return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404, headers: corsHeaders });
    }

    let service: any = null;
    if (b.service_id) {
      const { data: svc } = await supabase.from('provider_services').select('name').eq('id', b.service_id).maybeSingle();
      service = svc;
    }

    const provider: any = b.service_providers;
    const providerName = provider?.short_name || provider?.company_name || 'Usługodawca';
    const providerPhone = provider?.company_phone || '';
    const addr = [provider?.company_address, provider?.company_city].filter(Boolean).join(', ');
    const dateStr = b.scheduled_date ? new Date(b.scheduled_date).toLocaleDateString('pl-PL') : '';
    const timeStr = b.scheduled_time?.substring(0, 5) || '';
    const serviceName = service?.name || '';

    let message = '';
    if (type === 'preliminary') {
      message = `GetRido: Wstepna rezerwacja ${b.booking_number} w ${providerName} na ${dateStr} ${timeStr}${serviceName ? ' (' + serviceName + ')' : ''}. Czekaj na potwierdzenie terminu.`;
    } else if (type === 'confirmed') {
      message = `GetRido: POTWIERDZONA wizyta ${dateStr} ${timeStr} - ${providerName}${serviceName ? '. Usluga: ' + serviceName : ''}.${addr ? ' ' + addr + '.' : ''}${providerPhone ? ' Tel: ' + providerPhone : ''}`;
    } else if (type === 'rescheduled') {
      const oldStr = old_date && old_time ? `${new Date(old_date).toLocaleDateString('pl-PL')} ${String(old_time).substring(0,5)}` : '';
      message = `GetRido: Termin wizyty w ${providerName} zostal ZMIENIONY${oldStr ? ' z ' + oldStr : ''} na ${dateStr} ${timeStr}.${providerPhone ? ' Aby odwolac/zmienic dzwon: ' + providerPhone : ''}`;
    } else if (type === 'review_request') {
      message = `GetRido: Jak Ci poszla wizyta w ${providerName}? Oceniaj usluge na portalu (obowiazkowe przed kolejna rezerwacja). Dziekujemy!`;
    } else if (type === 'cancelled') {
      message = `GetRido: Witaj, niestety wizyta w ${providerName} dnia ${dateStr} ${timeStr} zostala ODWOLANA. W razie pytan dzwon: ${providerPhone || '—'}.`;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown type' }), { status: 400, headers: corsHeaders });
    }

    // Wysyłka przez globalny send-sms — fleet_id = provider_id, by odjąć z licznika usługodawcy
    const { data: smsRes, error: smsErr } = await supabase.functions.invoke('send-sms', {
      body: {
        phone: b.customer_phone,
        message,
        type: 'booking_' + type,
        sender: 'GetRido',
        fleet_id: b.provider_id, // provider_id usługodawcy — odejmie z jego konta SMS
      },
    });

    if (smsErr || smsRes?.success === false) {
      console.error('send-sms error:', smsErr || smsRes);
      return new Response(JSON.stringify({ ok: false, error: smsErr?.message || smsRes?.error || 'SMS send failed', details: smsRes?.details || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[booking-notify] sent:', type, '->', b.customer_phone, smsRes);

    if (type === 'confirmed') {
      await supabase.from('service_bookings').update({ confirmed_at: new Date().toISOString() }).eq('id', booking_id);
    }
    if (type === 'review_request') {
      await supabase.from('service_bookings').update({ review_request_sent_at: new Date().toISOString() }).eq('id', booking_id);
    }

    return new Response(JSON.stringify({ ok: true, sms: smsRes }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('booking-notify error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
