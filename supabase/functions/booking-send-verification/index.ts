// Wysyła 4-cyfrowy kod weryfikacyjny SMS na numer klienta przy rezerwacji portalowej
// SMS portalowy — używa SMSAPI_TOKEN platformy, nie obciąża salda usługodawcy
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
    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id required' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: b, error } = await supabase
      .from('service_bookings')
      .select('id, customer_phone, verification_sent_at, verified_at, service_providers(short_name, company_name)')
      .eq('id', booking_id)
      .single();

    if (error || !b) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404, headers: corsHeaders });
    }
    if (b.verified_at) {
      return new Response(JSON.stringify({ ok: true, already_verified: true }), { headers: corsHeaders });
    }

    // Throttle: max 1 SMS per 15s
    if (b.verification_sent_at) {
      const ageSec = (Date.now() - new Date(b.verification_sent_at).getTime()) / 1000;
      if (ageSec < 15) {
        return new Response(JSON.stringify({ error: `Poczekaj ${Math.ceil(15 - ageSec)}s przed ponownym wysłaniem` }), { status: 429, headers: corsHeaders });
      }
    }

    // Generuj NOWY kod przy każdym wysłaniu
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const provider: any = b.service_providers;
    const providerName = provider?.short_name || provider?.company_name || 'GetRido';
    const phone = normalizePhone(b.customer_phone || '');

    const message = `GetRido: Twoj kod weryfikacji rezerwacji w ${providerName}: ${code}. Kod wazny 10 minut.`;

    const smsToken = Deno.env.get('SMSAPI_TOKEN');
    if (!smsToken) {
      return new Response(JSON.stringify({ error: 'SMS not configured' }), { status: 500, headers: corsHeaders });
    }

    // Próbuj kolejnych nadawców — niektóre konta SMSAPI mają tylko domyślne (Test/Info/2Way)
    const senderCandidates = ['GetRido', '2Way', 'Info', 'Test'];
    let smsData: any = null;
    let usedSender = '';
    for (const sender of senderCandidates) {
      const r = await fetch('https://api.smsapi.pl/sms.do', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${smsToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ to: phone, message, from: sender, format: 'json' }),
      });
      smsData = await r.json();
      console.log('Verification SMS attempt:', { sender, phone, smsData });
      // error 14 = Invalid from field — spróbuj kolejnego nadawcy
      if (smsData?.error !== 14) {
        usedSender = sender;
        break;
      }
    }
    const smsOk = smsData && !smsData.error;

    await supabase.from('service_bookings').update({
      verification_code: code,
      verification_sent_at: new Date().toISOString(),
      verification_attempts: 0,
    }).eq('id', booking_id);

    if (!smsOk) {
      return new Response(JSON.stringify({ error: smsData?.message || 'Nie udało się wysłać SMS', sms_error: smsData }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, sender: usedSender }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('booking-send-verification error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
