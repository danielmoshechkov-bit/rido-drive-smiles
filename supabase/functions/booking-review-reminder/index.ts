// Edge function: znajduje zakończone zlecenia (24h+ temu, bez wysłanej prośby o ocenę)
// i tworzy wpis w pending_service_reviews + wysyła SMS z prośbą o ocenę.
// Uruchamiane co godzinę przez pg_cron.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: bookings } = await supabase
      .from('service_bookings')
      .select('id, customer_user_id, provider_id, customer_phone')
      .eq('completion_status', 'completed')
      .eq('source', 'portal')
      .is('review_request_sent_at', null)
      .not('customer_user_id', 'is', null)
      .lte('completed_at', cutoff)
      .limit(50);

    let processed = 0;
    for (const b of (bookings || [])) {
      // Utwórz pending review (jeśli nie istnieje)
      await supabase.from('pending_service_reviews').upsert({
        user_id: b.customer_user_id,
        booking_id: b.id,
        provider_id: b.provider_id,
      }, { onConflict: 'booking_id' });

      // Wyślij SMS
      await supabase.functions.invoke('booking-notify', {
        body: { booking_id: b.id, type: 'review_request' }
      });
      processed++;
    }
    return new Response(JSON.stringify({ ok: true, processed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
