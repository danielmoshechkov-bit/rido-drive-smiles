import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ClipboardList, Loader2, FileKey } from 'lucide-react';
import { RentalWizard } from '@/components/rental/RentalWizard';
import { RentalBookingWorkspace } from '@/components/rental/RentalBookingWorkspace';

const STATUS_LABEL: Record<string, string> = { new: 'Nowa', pending_confirmation: 'Do potwierdzenia', confirmed: 'Rezerwacja', in_progress: 'W trakcie', completed: 'Zakończony', cancelled: 'Anulowany', no_show: 'Nie stawił się' };
const STATUS_COLOR: Record<string, string> = { confirmed: 'bg-blue-100 text-blue-800', in_progress: 'bg-green-100 text-green-800', completed: 'bg-primary/10 text-primary', cancelled: 'bg-red-100 text-red-800' };
const fmt = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : ''; } catch { return iso || ''; } };

export function RentalBookingsList({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [shown, setShown] = useState(30);
  const [detail, setDetail] = useState<any | null>(null);
  const [wizard, setWizard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: bk } = await sb.from('bookings').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    const subjIds = [...new Set((bk || []).map((b: any) => b.subject_id))];
    let veh: Record<string, any> = {};
    if (subjIds.length) { const { data: vs } = await sb.from('rental_vehicles').select('subject_id, brand, model, plate').in('subject_id', subjIds); veh = Object.fromEntries((vs || []).map((v: any) => [v.subject_id, v])); }
    const ids = (bk || []).map((b: any) => b.id);
    let payByBooking: Record<string, any[]> = {};
    if (ids.length) { const { data: pays } = await sb.from('rental_payments').select('booking_id, kind, amount, status').in('booking_id', ids); (pays || []).forEach((p: any) => { (payByBooking[p.booking_id] = payByBooking[p.booking_id] || []).push(p); }); }
    setRows((bk || []).map((b: any) => {
      const v = veh[b.subject_id] || {};
      const pays = payByBooking[b.id] || [];
      const paid = pays.filter((p: any) => p.kind === 'oplata' && p.status === 'oplacone').reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const due = Number(b.rate_amount || b.estimated_price || 0);
      const payStatus = due > 0 && paid >= due ? 'opłacone' : paid > 0 ? 'częściowo' : 'nieopłacone';
      return { ...b, vehLabel: [v.plate, v.brand, v.model].filter(Boolean).join(' ') || '—', paid, due, payStatus };
    }));
    setLoading(false);
  }, [companyId, sb]);
  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const filtered = rows.filter(r => {
    if (tab === 'aktywne') return r.status === 'in_progress';
    if (tab === 'nadchodzace') return r.status === 'confirmed' && new Date(r.period_start).getTime() > now;
    if (tab === 'zakonczone') return ['completed', 'cancelled'].includes(r.status);
    if (tab === 'zalegle') return r.payStatus !== 'opłacone' && new Date(r.period_end).getTime() < now && r.status !== 'cancelled';
    if (tab === 'gielda') return r.source === 'gielda' && r.status === 'pending_confirmation';
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /> Zlecenia na wynajem</h2>
        <div className="flex-1" />
        <Button onClick={() => setWizard(true)} className="gap-2"><FileKey className="h-4 w-4" /> Nowe zlecenie</Button>
      </div>
      <div className="flex gap-1 flex-wrap">
        {[['all', 'Wszystkie'], ['aktywne', 'Aktywne'], ['nadchodzace', 'Nadchodzące'], ['zakonczone', 'Zakończone'], ['zalegle', 'Zaległe'], ['gielda', 'Z giełdy']].map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => { setTab(k); setShown(30); }}>{l}</Button>
        ))}
      </div>
      <Card><CardContent className="p-0">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : filtered.length === 0 ? <div className="py-12 text-center text-muted-foreground text-sm">Brak zleceń.</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Numer</TableHead><TableHead>Auto</TableHead><TableHead>Najemca</TableHead><TableHead>Od–Do</TableHead><TableHead>Kwota</TableHead><TableHead>Kaucja</TableHead><TableHead>Najem</TableHead><TableHead>Płatność</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.slice(0, shown).map(b => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setDetail(b)}>
                    <TableCell className="font-mono text-xs">{b.booking_number}</TableCell>
                    <TableCell>{b.vehLabel}</TableCell>
                    <TableCell className="font-medium">{b.renter_name}</TableCell>
                    <TableCell className="text-xs">{fmt(b.period_start)} – {fmt(b.period_end)}</TableCell>
                    <TableCell>{b.due ? `${b.due} zł` : '—'}</TableCell>
                    <TableCell>{b.deposit_amount != null ? `${b.deposit_amount} zł` : '—'}</TableCell>
                    <TableCell><span className={`rounded-full text-xs px-2 py-0.5 ${STATUS_COLOR[b.status] || 'bg-muted'}`}>{STATUS_LABEL[b.status] || b.status}</span></TableCell>
                    <TableCell><span className={`rounded-full text-xs px-2 py-0.5 ${b.payStatus === 'opłacone' ? 'bg-green-100 text-green-800' : b.payStatus === 'częściowo' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{b.payStatus}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent></Card>
      {filtered.length > shown && <div className="flex justify-center"><Button variant="outline" size="sm" onClick={() => setShown(s => s + 30)}>Pokaż więcej ({filtered.length - shown})</Button></div>}

      {detail && <RentalBookingWorkspace companyId={companyId} booking={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); load(); }} />}
      <RentalWizard companyId={companyId} open={wizard} onOpenChange={setWizard} onCreated={load} />
    </div>
  );
}

function DetailDialog({ sb, companyId, booking, onClose, onChanged }: any) {
  const [busy, setBusy] = useState(false);
  const setStatus = async (status: string) => {
    setBusy(true);
    const patch: any = { status };
    if (status === 'in_progress') patch.started_at = new Date().toISOString();
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    if (status === 'cancelled') patch.cancelled_at = new Date().toISOString();
    const { error } = await sb.from('bookings').update(patch).eq('id', booking.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Status zaktualizowany'); onChanged();
  };
  const markPaid = async () => {
    toast.error('Oznaczenie płatności wymaga autoryzowanej funkcji serwerowej i audytu.');
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Zlecenie {booking.booking_number}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Auto:</span> {booking.vehLabel}</div>
            <div><span className="text-muted-foreground">Najemca:</span> {booking.renter_name}</div>
            <div><span className="text-muted-foreground">Telefon:</span> {booking.renter_phone || '—'}</div>
            <div><span className="text-muted-foreground">Okres:</span> {fmt(booking.period_start)} – {fmt(booking.period_end)}</div>
            <div><span className="text-muted-foreground">Kwota:</span> {booking.due} zł</div>
            <div><span className="text-muted-foreground">Kaucja:</span> {booking.deposit_amount ?? '—'} zł</div>
            <div><span className="text-muted-foreground">Status:</span> {STATUS_LABEL[booking.status] || booking.status}</div>
            <div><span className="text-muted-foreground">Płatność:</span> {booking.payStatus}</div>
          </div>
          {booking.source === 'gielda' && booking.status === 'pending_confirmation' && (
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Rezerwacja z giełdy — wymaga decyzji</div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={async () => {
                  setBusy(true);
                  const { data: a } = await sb.rpc('rental_check_availability', { p_subject_id: booking.subject_id, p_start: booking.period_start, p_end: booking.period_end, p_exclude: booking.id });
                  if (a && !a.available) { setBusy(false); toast.error('Termin koliduje z innym najmem/blokadą — odrzuć lub zmień.'); return; }
                  await sb.from('bookings').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', booking.id);
                  setBusy(false); toast.success('Rezerwacja zatwierdzona'); onChanged();
                }}>Zatwierdź</Button>
                <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setStatus('cancelled')}>Odrzuć</Button>
              </div>
            </div>
          )}
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Status najmu</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('confirmed')}>Rezerwacja</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('in_progress')}>Wydaj (w trakcie)</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('completed')}>Zakończ</Button>
              <Button size="sm" variant="outline" disabled={busy} className="text-destructive" onClick={() => setStatus('cancelled')}>Anuluj</Button>
            </div>
            <div className="text-xs font-semibold text-muted-foreground pt-1">Płatność</div>
            <Button size="sm" onClick={markPaid} disabled={busy || booking.payStatus === 'opłacone'}>Oznacz opłacone ({booking.due} zł)</Button>
            <p className="text-xs text-muted-foreground">Pełne płatności (link P24, kaucja) — sekcja „Płatności + Kaucja". Umowa/protokół/faktura — Blok 2.</p>
          </div>
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Zamknij</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
