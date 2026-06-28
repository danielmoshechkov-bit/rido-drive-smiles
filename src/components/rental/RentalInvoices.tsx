import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { FileText, Loader2, Plus, AlertTriangle } from 'lucide-react';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';

/**
 * Faktury wynajmu = podpięcie do ŻYWEGO modułu (user_invoices) przez reuse
 * komponentu SimpleFreeInvoice (prefill z bookingu). Zero nowego silnika.
 * Mapa najem↔faktura w rental_booking_invoices (best-effort po zapisie).
 */
export function RentalInvoices({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [userId, setUserId] = useState<string | undefined>();
  const [hasSeller, setHasSeller] = useState<boolean | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(30);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickBooking, setPickBooking] = useState('');
  const [editor, setEditor] = useState<any | null>(null); // { prefill } or { editInvoiceId }

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id);
    if (user) { const { data: comp } = await sb.from('user_invoice_companies').select('id').eq('user_id', user.id).limit(1); setHasSeller((comp || []).length > 0); }
    const { data: l } = await sb.from('rental_booking_invoices').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    setLinks(l || []);
    const { data: bk } = await sb.from('bookings').select('id, booking_number, renter_name, renter_nip, renter_email, subject_id, rate_amount, estimated_price, period_start, period_end').eq('company_id', companyId).order('created_at', { ascending: false });
    setBookings(bk || []);
    setLoading(false);
  }, [companyId, sb]);
  useEffect(() => { load(); }, [load]);

  const openForBooking = async () => {
    const bk = bookings.find(b => b.id === pickBooking);
    if (!bk) { toast.error('Wybierz zlecenie'); return; }
    const { data: veh } = await sb.from('rental_vehicles').select('brand, model, plate').eq('subject_id', bk.subject_id).maybeSingle();
    const net = Number(bk.rate_amount || bk.estimated_price || 0);
    const okres = `${new Date(bk.period_start).toLocaleDateString('pl-PL')}–${new Date(bk.period_end).toLocaleDateString('pl-PL')}`;
    const item = { name: `Usługa wynajmu pojazdu ${[veh?.brand, veh?.model, veh?.plate].filter(Boolean).join(' ')} (${okres})`, quantity: 1, unit: 'usł.', unit_net_price: net, unit_gross_price: Math.round(net * 1.23 * 100) / 100, vat_rate: '23' };
    const buyer = { name: bk.renter_name || '', nip: bk.renter_nip || '', email: bk.renter_email || '' };
    setPickOpen(false);
    setEditor({ prefillItems: [item], prefillBuyer: buyer, prefillNotes: `Najem ${bk.booking_number}`, bookingId: bk.id });
  };

  const onSavedInvoice = async () => {
    // powiąż fakturę z najmem DETERMINISTYCZNIE: po numerze najmu w notatce + dedup
    try {
      const bk = bookings.find(b => b.id === editor?.bookingId);
      if (userId && bk) {
        const { data: inv } = await sb.from('user_invoices').select('id, invoice_number').eq('user_id', userId).ilike('notes', `%${bk.booking_number}%`).order('created_at', { ascending: false }).limit(1);
        if (inv && inv[0]) {
          const { data: ex } = await sb.from('rental_booking_invoices').select('id').eq('user_invoice_id', inv[0].id).limit(1);
          if (!ex || ex.length === 0) await sb.from('rental_booking_invoices').insert({ company_id: companyId, booking_id: bk.id, user_invoice_id: inv[0].id, invoice_number: inv[0].invoice_number });
        }
      }
    } catch { /* link best-effort */ }
    setEditor(null); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Faktury</h2>
        <div className="flex-1" />
        <Button onClick={() => setPickOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Wystaw fakturę</Button>
      </div>

      {hasSeller === false && (
        <Card className="border-amber-300 bg-amber-50"><CardContent className="py-3 flex items-start gap-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5" /><div>Brak danych sprzedawcy. Uzupełnij je przy pierwszej fakturze (krok „Sprzedawca") lub w module Faktury. <Button size="sm" variant="link" className="px-1 h-auto" onClick={() => setEditor({ prefillItems: [], prefillBuyer: {} })}>Uzupełnij teraz</Button></div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : links.length === 0 ? <div className="py-12 text-center text-muted-foreground text-sm">Brak wystawionych faktur. Kliknij „Wystaw fakturę”.</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Faktura</TableHead><TableHead>Najem</TableHead><TableHead>Data</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {links.slice(0, shown).map(l => {
                  const bk = bookings.find(b => b.id === l.booking_id);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.invoice_number || l.user_invoice_id?.slice(0, 8)}</TableCell>
                      <TableCell>{bk?.booking_number || '—'} · {bk?.renter_name || ''}</TableCell>
                      <TableCell className="text-xs">{new Date(l.created_at).toLocaleDateString('pl-PL')}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEditor({ editInvoiceId: l.user_invoice_id })}>Otwórz (PDF/KSeF/e‑mail)</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
      </CardContent></Card>
      {links.length > shown && <div className="flex justify-center"><Button variant="outline" size="sm" onClick={() => setShown(s => s + 30)}>Pokaż więcej ({links.length - shown})</Button></div>}

      {/* Wybór zlecenia */}
      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Wystaw fakturę — wybierz zlecenie</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={pickBooking} onValueChange={setPickBooking}><SelectTrigger><SelectValue placeholder="Zlecenie" /></SelectTrigger>
              <SelectContent>{bookings.map(b => <SelectItem key={b.id} value={b.id}>{b.booking_number} · {b.renter_name}</SelectItem>)}</SelectContent></Select>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPickOpen(false)}>Anuluj</Button><Button onClick={openForBooking} disabled={!pickBooking}>Dalej</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edytor faktury — REUSE SimpleFreeInvoice (user_invoices) */}
      {editor && (
        <Dialog open onOpenChange={(v) => { if (!v) setEditor(null); }}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Faktura</DialogTitle></DialogHeader>
            <SimpleFreeInvoice
              editInvoiceId={editor.editInvoiceId}
              prefillItems={editor.prefillItems}
              prefillBuyer={editor.prefillBuyer}
              prefillNotes={editor.prefillNotes}
              onClose={() => setEditor(null)}
              onSaved={onSavedInvoice}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
