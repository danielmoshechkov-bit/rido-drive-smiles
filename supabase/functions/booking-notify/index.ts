// Edge function: wysyła SMS-y przy rezerwacjach z portalu
// type: 'preliminary' (wstępna rezerwacja), 'confirmed' (potwierdzona przez usługodawcę), 'review_request' (prośba o ocenę po 24h)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, type } = await req.json();
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
        vehicle_brand, vehicle_model, vehicle_plate,
        service_providers(company_name, short_name, company_address, company_city, company_phone),
        services(name)
      `)
      .eq('id', booking_id)
      .single();

    if (error || !b) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404, headers: corsHeaders });
    }

    const provider: any = b.service_providers;
    const providerName = provider?.short_name || provider?.company_name || 'Usługodawca';
    const dateStr = b.scheduled_date ? new Date(b.scheduled_date).toLocaleDateString('pl-PL') : '';
    const timeStr = b.scheduled_time?.substring(0, 5) || '';

    let message = '';
    if (type === 'preliminary') {
      message = `GetRido: Dziekujemy za rezerwacje wstepna w ${providerName} na ${dateStr} ${timeStr}. Czekaj na potwierdzenie od uslugodawcy. Nr: ${b.booking_number}`;
    } else if (type === 'confirmed') {
      const addr = [provider?.company_address, provider?.company_city].filter(Boolean).join(', ');
      message = `GetRido: Twoja wizyta w ${providerName} POTWIERDZONA na ${dateStr} ${timeStr}. ${addr ? 'Adres: ' + addr + '. ' : ''}Tel: ${provider?.company_phone || ''}`;
    } else if (type === 'review_request') {
      message = `GetRido: Jak Ci poszla wizyta w ${providerName}? Oceniaj uslugi na portalu (obowiazkowe przed kolejna rezerwacja). Dziekujemy!`;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown type' }), { status: 400, headers: corsHeaders });
    }

    // Normalizuj numer
    let phone = (b.customer_phone || '').replace(/\D/g, '');
    if (phone.length === 9) phone = '48' + phone;
    if (phone.startsWith('0048')) phone = phone.substring(2);

    // Wyślij przez JustSend (zgodnie z infrastrukturą platformy)
    const smsToken = Deno.env.get('SMSAPI_TOKEN');
    if (!smsToken) {
      console.error('SMSAPI_TOKEN not configured');
      return new Response(JSON.stringify({ ok: false, error: 'SMS not configured' }), { headers: corsHeaders });
    }

    const smsRes = await fetch('https://api.smsapi.pl/sms.do', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${smsToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        to: phone,
        message,
        from: 'GetRido',
        format: 'json',
      }),
    });
    const smsData = await smsRes.json();
    console.log('SMS result:', smsData);

    if (type === 'confirmed') {
      await supabase.from('service_bookings').update({ confirmed_at: new Date().toISOString() }).eq('id', booking_id);
    }
    if (type === 'review_request') {
      await supabase.from('service_bookings').update({ review_request_sent_at: new Date().toISOString() }).eq('id', booking_id);
    }

    return new Response(JSON.stringify({ ok: true, sms: smsData }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('booking-notify error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
