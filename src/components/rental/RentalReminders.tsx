import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Bell, Loader2, RefreshCw, Send } from 'lucide-react';
import { sendRentalSms, sendRentalEmail, getDryRun, setDryRun } from '@/components/rental/rentalMessaging';
import { noScroll } from '@/components/rental/rentalLib';

const EVENT_TYPES: { v: string; l: string }[] = [
  { v: 'end_rental', l: 'Koniec najmu' }, { v: 'oc_expiry', l: 'Koniec OC' }, { v: 'inspection_expiry', l: 'Koniec przeglądu' },
  { v: 'payment_due', l: 'Zaległa płatność' }, { v: 'return_today', l: 'Zwrot dziś' }, { v: 'deposit_return', l: 'Kaucja do zwrotu' },
];
const within = (dateStr: string, days: number) => { const d = new Date(dateStr).getTime(); const now = Date.now(); return d >= now && d <= now + days * 86400000; };

export function RentalReminders({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dry, setDry] = useState(getDryRun());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data: s } = await sb.from('rental_reminder_settings').select('*').eq('company_id', companyId);
    const map: Record<string, any> = {};
    EVENT_TYPES.forEach(e => { const found = (s || []).find((x: any) => x.event_type === e.v); map[e.v] = found || { event_type: e.v, days_before: 3, sms: true, email: false, enabled: true }; });
    setSettings(map);
    const { data: r } = await sb.from('rental_reminders').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    setRows(r || []);
    setLoading(false);
  }, [sb, companyId]);
  useEffect(() => { load(); }, [load]);

  const saveSetting = async (et: string, patch: any) => {
    const next = { ...settings[et], ...patch };
    setSettings(s => ({ ...s, [et]: next }));
    await sb.from('rental_reminder_settings').upsert({ company_id: companyId, event_type: et, days_before: parseInt(next.days_before, 10) || 0, sms: !!next.sms, email: !!next.email, enabled: !!next.enabled }, { onConflict: 'company_id,event_type' });
  };

  const recompute = async () => {
    setBusy(true);
    try {
      const { data: bks } = await sb.from('bookings').select('id, booking_number, renter_name, renter_phone, renter_email, subject_id, period_end, status, deposit_amount').eq('company_id', companyId).in('status', ['confirmed', 'in_progress', 'completed']);
      const subjIds = [...new Set((bks || []).map((b: any) => b.subject_id))];
      const { data: pol } = subjIds.length ? await sb.from('rental_vehicle_policies').select('subject_id, valid_to').in('subject_id', subjIds).eq('ptype', 'OC') : { data: [] };
      const { data: insp } = subjIds.length ? await sb.from('rental_vehicle_inspections').select('subject_id, valid_to').in('subject_id', subjIds) : { data: [] };
      const ids = (bks || []).map((b: any) => b.id);
      const { data: pays } = ids.length ? await sb.from('rental_payments').select('booking_id, kind, status').in('booking_id', ids) : { data: [] };
      const { data: existing } = await sb.from('rental_reminders').select('booking_id, type, status').eq('company_id', companyId).eq('status', 'planned');
      const has = (bid: string, type: string) => (existing || []).some((e: any) => e.booking_id === bid && e.type === type);
      const newRows: any[] = [];
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const b of (bks || [])) {
        const cfg = settings;
        const chan = (et: string) => cfg[et]?.sms ? 'sms' : 'email';
        // koniec najmu
        if (cfg.end_rental?.enabled && b.period_end && within(b.period_end, cfg.end_rental.days_before) && !has(b.id, 'end_rental'))
          newRows.push({ company_id: companyId, booking_id: b.id, subject_id: b.subject_id, type: 'end_rental', channel: chan('end_rental'), scheduled_for: b.period_end, days_before: cfg.end_rental.days_before, status: 'planned', payload: { label: `Koniec najmu ${b.booking_number}` } });
        // zwrot dziś
        if (cfg.return_today?.enabled && b.period_end?.slice(0, 10) === todayStr && !has(b.id, 'return_today'))
          newRows.push({ company_id: companyId, booking_id: b.id, subject_id: b.subject_id, type: 'return_today', channel: chan('return_today'), scheduled_for: b.period_end, days_before: 0, status: 'planned', payload: { label: `Zwrot dziś ${b.booking_number}` } });
        // zaległa płatność
        const paid = (pays || []).some((p: any) => p.booking_id === b.id && p.kind === 'oplata' && p.status === 'oplacone');
        if (cfg.payment_due?.enabled && !paid && new Date(b.period_end).getTime() < Date.now() && b.status !== 'cancelled' && !has(b.id, 'payment_due'))
          newRows.push({ company_id: companyId, booking_id: b.id, subject_id: b.subject_id, type: 'payment_due', channel: chan('payment_due'), scheduled_for: new Date().toISOString(), days_before: 0, status: 'planned', payload: { label: `Zaległa płatność ${b.booking_number}` } });
        // kaucja do zwrotu (najem zakończony, kaucja pobrana)
        const dep = (pays || []).find((p: any) => p.booking_id === b.id && p.kind === 'kaucja' && p.status === 'oplacone');
        if (cfg.deposit_return?.enabled && b.status === 'completed' && dep && !has(b.id, 'deposit_return'))
          newRows.push({ company_id: companyId, booking_id: b.id, subject_id: b.subject_id, type: 'deposit_return', channel: chan('deposit_return'), scheduled_for: new Date().toISOString(), days_before: 0, status: 'planned', payload: { label: `Kaucja do zwrotu ${b.booking_number}` } });
      }
      // OC/przegląd per subject (przypięte do dowolnego bookingu auta — uproszczenie)
      const subjBooking: Record<string, any> = {}; (bks || []).forEach((b: any) => { if (!subjBooking[b.subject_id]) subjBooking[b.subject_id] = b; });
      for (const p of (pol || [])) { const b = subjBooking[p.subject_id]; if (settings.oc_expiry?.enabled && b && p.valid_to && within(p.valid_to, settings.oc_expiry.days_before) && !has(b.id, 'oc_expiry')) newRows.push({ company_id: companyId, booking_id: b.id, subject_id: p.subject_id, type: 'oc_expiry', channel: settings.oc_expiry.sms ? 'sms' : 'email', scheduled_for: p.valid_to, days_before: settings.oc_expiry.days_before, status: 'planned', payload: { label: `Koniec OC auta` } }); }
      for (const i of (insp || [])) { const b = subjBooking[i.subject_id]; if (settings.inspection_expiry?.enabled && b && i.valid_to && within(i.valid_to, settings.inspection_expiry.days_before) && !has(b.id, 'inspection_expiry')) newRows.push({ company_id: companyId, booking_id: b.id, subject_id: i.subject_id, type: 'inspection_expiry', channel: settings.inspection_expiry.sms ? 'sms' : 'email', scheduled_for: i.valid_to, days_before: settings.inspection_expiry.days_before, status: 'planned', payload: { label: `Koniec przeglądu auta` } }); }

      if (newRows.length) await sb.from('rental_reminders').insert(newRows);
      toast.success(`Przeliczono kolejkę: +${newRows.length} przypomnień`);
      load();
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  const sendOne = async (rem: any) => {
    const { data: b } = await sb.from('bookings').select('renter_name, renter_phone, renter_email, booking_number').eq('id', rem.booking_id).maybeSingle();
    const msg = `${rem.payload?.label || 'Przypomnienie'} — ${b?.booking_number || ''}`;
    if (rem.channel === 'sms' && b?.renter_phone) await sendRentalSms(b.renter_phone, msg);
    else if (b?.renter_email) await sendRentalEmail(b.renter_email, 'Przypomnienie — wynajem', `<p>${msg}</p>`);
    else return false;
    await sb.from('rental_reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', rem.id);
    return true;
  };
  const sendNow = async (rem: any) => { const ok = await sendOne(rem); if (!ok) toast.error('Brak kontaktu najemcy'); load(); };

  const planned = rows.filter(r => r.status === 'planned');
  const sent = rows.filter(r => r.status === 'sent');

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sendBulk = async () => {
    const sel = planned.filter(r => selected.has(r.id));
    if (sel.length === 0) { toast.error('Zaznacz przypomnienia'); return; }
    setBusy(true);
    let okc = 0; for (const r of sel) { if (await sendOne(r)) okc++; }
    setSelected(new Set()); setBusy(false); toast.success(`Wysłano ${okc}/${sel.length}`); load();
  };
  // grupowanie zaplanowanych wg typu
  const byType: Record<string, number> = {}; planned.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1; });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Przypomnienia</h2>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={dry} onCheckedChange={(v) => { setDry(v); setDryRun(v); }} /> Tryb testowy (dry‑run, nie wysyła realnie)</label>
        <Button variant="outline" onClick={recompute} disabled={busy} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Przelicz kolejkę</Button>
      </div>

      {/* Ustawienia */}
      <Card><CardContent className="py-3">
        <div className="text-sm font-semibold mb-2">Ustawienia — ile dni przed i kanał</div>
        <div className="space-y-1">
          {EVENT_TYPES.map(e => { const c = settings[e.v] || {}; return (
            <div key={e.v} className="flex items-center gap-3 text-sm border-b py-1 flex-wrap">
              <span className="w-40">{e.l}</span>
              <Switch checked={!!c.enabled} onCheckedChange={(v) => saveSetting(e.v, { enabled: v })} />
              <span className="text-muted-foreground text-xs">dni przed:</span>
              <Input className="w-16 h-8" type="text" inputMode="numeric" onWheel={noScroll} value={c.days_before ?? 3} onChange={ev => saveSetting(e.v, { days_before: ev.target.value })} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!c.sms} onChange={ev => saveSetting(e.v, { sms: ev.target.checked })} /> SMS</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!c.email} onChange={ev => saveSetting(e.v, { email: ev.target.checked })} /> e‑mail</label>
            </div>
          ); })}
        </div>
      </CardContent></Card>

      {/* Pasek masowy + grupowanie */}
      {planned.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Zaplanowane:</span>
          {Object.entries(byType).map(([t, n]) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">{EVENT_TYPES.find(e => e.v === t)?.l || t}: {n}</span>)}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set(planned.map(r => r.id)))}>Zaznacz wszystkie ({planned.length})</Button>
          <Button size="sm" onClick={sendBulk} disabled={busy || selected.size === 0} className="gap-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Wyślij zaznaczone ({selected.size})</Button>
        </div>
      )}

      {/* Kolejka */}
      <Card><CardContent className="p-0">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead>Co</TableHead><TableHead>Kanał</TableHead><TableHead>Termin</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {[...planned, ...sent].map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.status === 'planned' && <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />}</TableCell>
                  <TableCell>{r.payload?.label || r.type}</TableCell>
                  <TableCell className="uppercase text-xs">{r.channel}</TableCell>
                  <TableCell className="text-xs">{r.scheduled_for ? new Date(r.scheduled_for).toLocaleDateString('pl-PL') : '—'}</TableCell>
                  <TableCell><span className={`rounded-full text-xs px-2 py-0.5 ${r.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{r.status === 'sent' ? 'wysłane' : 'zaplanowane'}</span></TableCell>
                  <TableCell className="text-right">{r.status === 'planned' && <Button size="sm" onClick={() => sendNow(r)} className="gap-1"><Send className="h-3 w-3" />Wyślij teraz</Button>}</TableCell>
                </TableRow>
              ))}
              {planned.length + sent.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Kolejka pusta. Kliknij „Przelicz kolejkę”.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Automatyczny cron (codzienne przeliczanie + wysyłka) = przy deployu. Tu: ręczne „Przelicz" + „Wyślij teraz”.</p>
    </div>
  );
}
