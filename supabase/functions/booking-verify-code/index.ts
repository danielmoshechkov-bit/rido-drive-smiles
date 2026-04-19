// Weryfikuje 4-cyfrowy kod, oznacza rezerwację jako verified i wysyła wstępne potwierdzenie SMS
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string): string {
  let phone = (raw || '').replace(/\D/g, '');
  if (phone.startsWith('0048')) phone = phone.substring(2);
  while (phone.startsWith('4848')) phone = phone.substring(2);
  if (phone.startsWith('48') && phone.length === 11) return phone;
  if (phone.startsWith('0')) phone = phone.substring(1);
  if (phone.length === 9) return '48' + phone;
  return phone;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, code } = await req.json();
    if (!booking_id || !code) {
      return new Response(JSON.stringify({ error: 'booking_id and code required' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: b, error } = await supabase
      .from('service_bookings')
      .select(`
        id, booking_number, verification_code, verification_attempts, verified_at, verification_sent_at,
        customer_name, customer_phone, scheduled_date, scheduled_time,
        service_providers(short_name, company_name)
      `)
      .eq('id', booking_id)
      .single();

    if (error || !b) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404, headers: corsHeaders });
    }
    if (b.verified_at) {
      return new Response(JSON.stringify({ ok: true, already_verified: true }), { headers: corsHeaders });
    }
    if ((b.verification_attempts || 0) >= 5) {
      return new Response(JSON.stringify({ error: 'Przekroczono limit prób. Wyślij nowy kod.' }), { status: 429, headers: corsHeaders });
    }
    // Code expires after 10 minutes
    if (b.verification_sent_at) {
      const ageMin = (Date.now() - new Date(b.verification_sent_at).getTime()) / 60000;
      if (ageMin > 10) {
        return new Response(JSON.stringify({ error: 'Kod wygasł. Wyślij nowy.' }), { status: 410, headers: corsHeaders });
      }
    }

    if (String(code).trim() !== String(b.verification_code || '').trim()) {
      await supabase.from('service_bookings').update({
        verification_attempts: (b.verification_attempts || 0) + 1,
      }).eq('id', booking_id);
      return new Response(JSON.stringify({ error: 'Nieprawidłowy kod' }), { status: 400, headers: corsHeaders });
    }

    // Mark verified, status -> pending (czeka na potwierdzenie usługodawcy)
    await supabase.from('service_bookings').update({
      verified_at: new Date().toISOString(),
      verification_code: null,
      status: 'pending',
    }).eq('id', booking_id);

    // Wyślij wstępne potwierdzenie (portalowe — nie obciąża salda usługodawcy)
    const provider: any = b.service_providers;
    const providerName = provider?.short_name || provider?.company_name || 'usługodawcy';
    const dateStr = b.scheduled_date ? new Date(b.scheduled_date).toLocaleDateString('pl-PL') : '';
    const timeStr = b.scheduled_time?.substring(0, 5) || '';
    const phone = normalizePhone(b.customer_phone || '');

    const message = `GetRido: Wstepna rezerwacja ${b.booking_number} przyjeta na ${dateStr} ${timeStr}. Oczekuj na potwierdzenie terminu przez ${providerName}.`;

    if (phone) {
      try {
        await supabase.functions.invoke('send-sms', {
          body: { phone, message, type: 'booking_preliminary' }
        });
      } catch (e) {
        console.warn('Preliminary SMS failed:', e);
      }
    }

    return new Response(JSON.stringify({ ok: true, booking_number: b.booking_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('booking-verify-code error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
