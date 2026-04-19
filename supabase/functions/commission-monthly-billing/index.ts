// Edge function: generuje miesięczne faktury prowizyjne portalu (uruchamiane 1. dnia miesiąca)
// Zlicza wszystkie zakończone zlecenia z portalu z poprzedniego miesiąca per usługodawca
// i tworzy fakturę prowizyjną od marży/robocizny.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Możliwość przekazania konkretnego okresu (do testów)
    let body: any = {};
    try { body = await req.json(); } catch { /* GET trigger */ }
    const now = new Date();
    const targetYear = body?.year ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
    const targetMonth = body?.month ?? (now.getMonth() === 0 ? 12 : now.getMonth()); // poprzedni miesiąc
    const periodStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const periodEnd = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Pobierz wszystkie zakończone zlecenia z portalu w okresie
    const { data: bookings, error: bErr } = await supabase
      .from('service_bookings')
      .select('id, provider_id, final_amount, commission_amount, completed_at')
      .eq('source', 'portal')
      .eq('completion_status', 'completed')
      .is('commission_invoice_id', null)
      .gte('completed_at', periodStart + 'T00:00:00')
      .lte('completed_at', periodEnd + 'T23:59:59');

    if (bErr) throw bErr;
    if (!bookings || bookings.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No bookings to invoice', period: `${targetYear}-${targetMonth}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Grupuj per provider
    const grouped: Record<string, typeof bookings> = {};
    for (const b of bookings) {
      if (!b.provider_id) continue;
      grouped[b.provider_id] = grouped[b.provider_id] || [];
      grouped[b.provider_id].push(b);
    }

    const results: any[] = [];
    for (const [providerId, items] of Object.entries(grouped)) {
      const commissionTotal = items.reduce((s, x) => s + (x.commission_amount || 0), 0);
      const valueTotal = items.reduce((s, x) => s + (x.final_amount || 0), 0);
      const totalGross = Math.round(commissionTotal * 1.23 * 100) / 100;

      // Numer faktury
      const invoiceNumber = `PRW/${targetYear}/${String(targetMonth).padStart(2, '0')}/${providerId.substring(0, 8)}`;

      const { data: invoice, error: iErr } = await supabase
        .from('service_commission_invoices')
        .upsert({
          provider_id: providerId,
          invoice_number: invoiceNumber,
          period_year: targetYear,
          period_month: targetMonth,
          bookings_count: items.length,
          bookings_total_value: valueTotal,
          commission_total: commissionTotal,
          vat_rate: 23,
          total_gross: totalGross,
          status: 'issued',
          issued_at: new Date().toISOString(),
          due_date: new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
        }, { onConflict: 'provider_id,period_year,period_month' })
        .select('id')
        .single();

      if (iErr) { console.error('Invoice err:', iErr); continue; }

      // Powiąż zlecenia z fakturą
      await supabase
        .from('service_bookings')
        .update({ commission_invoice_id: invoice.id })
        .in('id', items.map(b => b.id));

      results.push({ provider_id: providerId, invoice_id: invoice.id, bookings: items.length, commission: commissionTotal });
    }

    return new Response(JSON.stringify({ ok: true, period: `${targetYear}-${targetMonth}`, generated: results.length, details: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('commission-monthly-billing error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
