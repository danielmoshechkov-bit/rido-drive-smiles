import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Wallet, Loader2, Link as LinkIcon, Copy } from 'lucide-react';
import { noScroll } from '@/components/rental/rentalLib';

const fmt = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : ''; } catch { return iso || ''; } };

export function RentalPaymentsPanel({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(30);
  const [manage, setManage] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: bk } = await sb.from('bookings').select('id, booking_number, renter_name, subject_id, rate_amount, estimated_price, deposit_amount, status').eq('company_id', companyId).order('created_at', { ascending: false });
    const ids = (bk || []).map((b: any) => b.id);
    let payByBooking: Record<string, any[]> = {};
    if (ids.length) { const { data: pays } = await sb.from('rental_payments').select('*').in('booking_id', ids); (pays || []).forEach((p: any) => { (payByBooking[p.booking_id] = payByBooking[p.booking_id] || []).push(p); }); }
    setRows((bk || []).map((b: any) => {
      const pays = payByBooking[b.id] || [];
      const due = Number(b.rate_amount || b.estimated_price || 0);
      const paid = pays.filter((p: any) => p.kind === 'oplata' && p.status === 'oplacone').reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const kaucja = pays.find((p: any) => p.kind === 'kaucja');
      return { ...b, pays, due, paid, payStatus: due > 0 && paid >= due ? 'opłacone' : paid > 0 ? 'częściowo' : 'nieopłacone', kaucja };
    }));
    setLoading(false);
  }, [companyId, sb]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Płatności + Kaucja</h2>
      <Card><CardContent className="p-0">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : rows.length === 0 ? <div className="py-12 text-center text-muted-foreground text-sm">Brak zleceń.</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Numer</TableHead><TableHead>Najemca</TableHead><TableHead>Kwota</TableHead><TableHead>Opłata</TableHead><TableHead>Kaucja</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, shown).map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.booking_number}</TableCell>
                    <TableCell className="font-medium">{b.renter_name}</TableCell>
                    <TableCell>{b.due} zł</TableCell>
                    <TableCell><span className={`rounded-full text-xs px-2 py-0.5 ${b.payStatus === 'opłacone' ? 'bg-green-100 text-green-800' : b.payStatus === 'częściowo' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{b.payStatus}</span></TableCell>
                    <TableCell className="text-xs">{b.kaucja ? `${b.kaucja.amount} zł · ${b.kaucja.status}` : (b.deposit_amount ? `${b.deposit_amount} zł · brak` : '—')}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setManage(b)}>Zarządzaj</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent></Card>
      {rows.length > shown && <div className="flex justify-center"><Button variant="outline" size="sm" onClick={() => setShown(s => s + 30)}>Pokaż więcej ({rows.length - shown})</Button></div>}
      {manage && <ManageDialog sb={sb} companyId={companyId} booking={manage} onClose={() => setManage(null)} onChanged={() => { setManage(null); load(); }} />}
    </div>
  );
}

export function ManageDialog({ sb, companyId, booking, onClose, onChanged }: any) {
  const [amount, setAmount] = useState(String(booking.due || ''));
  const [method, setMethod] = useState('reczna');
  const [busy, setBusy] = useState(false);
  const [depAmount, setDepAmount] = useState(String(booking.deposit_amount || ''));

  const addPayment = async (status: string, useLink = false) => {
    setBusy(true);
    try {
      const row: any = { company_id: companyId, booking_id: booking.id, kind: 'oplata', amount: Number(String(amount).replace(',', '.')) || 0, method: useLink ? 'bramka' : method, status };
      if (status === 'oplacone') row.paid_at = new Date().toISOString();
      if (useLink) { row.link_token = (crypto as any).randomUUID(); row.link_url = `https://secure.przelewy24.pl/PLACEHOLDER/${row.link_token}`; }
      const { error } = await sb.from('rental_payments').insert(row);
      if (error) throw error;
      toast.success(useLink ? 'Link wygenerowany (placeholder — auto‑potwierdzenie po wdrożeniu webhooka)' : 'Płatność zapisana'); onChanged();
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  const setKaucja = async (status: string) => {
    setBusy(true);
    try {
      if (booking.kaucja) await sb.from('rental_payments').update({ status, amount: Number(String(depAmount).replace(',', '.')) || booking.kaucja.amount }).eq('id', booking.kaucja.id);
      else await sb.from('rental_payments').insert({ company_id: companyId, booking_id: booking.id, kind: 'kaucja', amount: Number(String(depAmount).replace(',', '.')) || 0, method: 'reczna', status });
      toast.success('Kaucja: ' + status); onChanged();
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Płatności — {booking.booking_number}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Opłata najmu */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">Opłata za najem</div>
            <div className="grid grid-cols-2 gap-2 items-end">
              <div className="space-y-1"><Label className="text-xs">Kwota (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={amount} onChange={e => setAmount(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Metoda</Label>
                <select value={method} onChange={e => setMethod(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm"><option value="reczna">gotówka/przelew (ręcznie)</option></select></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => addPayment('oplacone')}>Oznacz opłacone</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => addPayment('oczekuje')}>Zapisz jako oczekujące</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => addPayment('oczekuje', true)} className="gap-1"><LinkIcon className="h-3 w-3" />Generuj link P24</Button>
            </div>
          </div>

          {/* Historia płatności */}
          {(booking.pays || []).length > 0 && (
            <div className="border-t pt-2">
              <div className="text-xs font-semibold text-muted-foreground mb-1">Historia</div>
              <ul className="space-y-1 text-sm">
                {(booking.pays || []).map((p: any) => (
                  <li key={p.id} className="flex items-center gap-2 border-b py-1">
                    <span className="capitalize">{p.kind}</span><span>{p.amount} zł</span>
                    <span className="text-muted-foreground">{p.method}</span>
                    <span className={`rounded-full text-xs px-2 py-0.5 ${p.status === 'oplacone' ? 'bg-green-100 text-green-800' : 'bg-muted'}`}>{p.status}</span>
                    <span className="text-xs text-muted-foreground flex-1">{p.paid_at ? fmt(p.paid_at) : ''}</span>
                    {p.method === 'bramka' && p.status === 'oczekuje' && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { await sb.from('rental_payments').update({ status: 'oplacone', paid_at: new Date().toISOString() }).eq('id', p.id); toast.success('Potwierdzono ręcznie'); onChanged(); }}>Potwierdź</Button>}
                    {p.link_url && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(p.link_url); toast.success('Link skopiowany'); }}><Copy className="h-3 w-3" /></Button>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Kaucja */}
          <div className="border-t pt-2 space-y-2">
            <div className="text-sm font-semibold">Kaucja</div>
            <div className="flex items-end gap-2">
              <div className="space-y-1"><Label className="text-xs">Kwota (zł)</Label><Input className="w-32" type="text" inputMode="decimal" onWheel={noScroll} value={depAmount} onChange={e => setDepAmount(e.target.value)} /></div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setKaucja('oplacone')}>Pobrana</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setKaucja('zwrocone')}>Zwrócona</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setKaucja('potracone')}>Potrącona</Button>
            </div>
            {booking.kaucja && <div className="text-xs text-muted-foreground">Aktualnie: {booking.kaucja.amount} zł · {booking.kaucja.status}</div>}
          </div>

          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Zamknij</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
