// Zwraca dostępne sloty dla usługodawcy w wybranym dniu (na podstawie zajętych zleceń + rezerwacji)
// Publiczny endpoint — używany przez stronę /r/:token gdy klient chce zaproponować zmianę terminu
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const date = url.searchParams.get('date'); // YYYY-MM-DD
    if (!token || !date) {
      return new Response(JSON.stringify({ error: 'token and date required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: booking, error: bErr } = await supabase
      .from('workshop_client_bookings')
      .select('id, provider_id, station_id, duration_minutes')
      .eq('confirmation_token', token)
      .maybeSingle();

    if (bErr || !booking) {
      return new Response(JSON.stringify({ error: 'booking not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Pobierz inne rezerwacje na ten sam dzień u tego usługodawcy (na tym samym stanowisku jeśli ustawione)
    let q = supabase
      .from('workshop_client_bookings')
      .select('appointment_time, duration_minutes, station_id, status')
      .eq('provider_id', booking.provider_id)
      .eq('appointment_date', date)
      .neq('id', booking.id)
      .neq('status', 'cancelled');
    if (booking.station_id) q = q.eq('station_id', booking.station_id);

    const { data: occupied } = await q;

    // Generuj sloty co 30 min od 8:00 do 18:00
    const slots: { time: string; available: boolean }[] = [];
    const dur = booking.duration_minutes || 60;

    const occupiedRanges = (occupied || []).map((o: any) => {
      const [h, m] = (o.appointment_time as string).split(':').map(Number);
      const start = h * 60 + m;
      return { start, end: start + (o.duration_minutes || 60) };
    });

    for (let mins = 8 * 60; mins + dur <= 18 * 60; mins += 30) {
      const overlaps = occupiedRanges.some(r => mins < r.end && mins + dur > r.start);
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      slots.push({ time: `${hh}:${mm}`, available: !overlaps });
    }

    return new Response(JSON.stringify({ slots, duration: dur }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
