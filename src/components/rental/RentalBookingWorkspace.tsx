import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileSignature, FileText, Wallet, Camera, Eye, MessageSquare, Mail, Link as LinkIcon, Loader2 } from 'lucide-react';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { ManageDialog } from '@/components/rental/RentalPaymentsPanel';
import { RentalProtocol } from '@/components/rental/RentalProtocol';
import { generateBookingContract } from '@/components/rental/rentalContractMap';
import { sendRentalSms, sendRentalEmail, contractLink } from '@/components/rental/rentalMessaging';
import { sanitizeDocumentHtml } from '@/security/htmlSanitizer';

const STATUS_LABEL: Record<string, string> = { new: 'Nowa', pending_confirmation: 'Do potwierdzenia', confirmed: 'Rezerwacja', in_progress: 'W trakcie', completed: 'Zakończony', cancelled: 'Anulowany', no_show: 'Nie stawił się' };
const fmt = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : ''; } catch { return iso || ''; } };

/** „Kokpit zlecenia" — umowa / faktura / płatność / protokół z jednego miejsca. */
export function RentalBookingWorkspace({ companyId, booking, onClose, onChanged }: { companyId: string; booking: any; onClose: () => void; onChanged: () => void }) {
  const sb = supabase as any;
  const [busy, setBusy] = useState(false);
  const [inst, setInst] = useState<any | null>(null);
  const [invoiceLink, setInvoiceLink] = useState<any | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: di } = await sb.from('rental_document_instances').select('*').eq('booking_id', booking.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setInst(di || null);
    const { data: bi } = await sb.from('rental_booking_invoices').select('*').eq('booking_id', booking.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setInvoiceLink(bi || null);
  }, [sb, booking.id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: string) => {
    setBusy(true);
    const patch: any = { status };
    if (status === 'in_progress') patch.started_at = new Date().toISOString();
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    if (status === 'cancelled') patch.cancelled_at = new Date().toISOString();
    if (status === 'confirmed') patch.confirmed_at = new Date().toISOString();
    await sb.from('bookings').update(patch).eq('id', booking.id);
    setBusy(false); toast.success('Status zaktualizowany'); onChanged();
  };

  const genContract = async () => {
    setBusy(true);
    try { await generateBookingContract(sb, companyId, booking); toast.success('Umowa wygenerowana (szkic)'); load(); }
    catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };
  const sendContract = async (channel: 'sms' | 'email') => {
    if (!booking.confirmation_token) { toast.error('Brak tokenu zlecenia'); return; }
    const link = contractLink(booking.confirmation_token);
    const msg = `Umowa najmu ${booking.booking_number} do podpisu: ${link}`;
    if (channel === 'sms') { if (!booking.renter_phone) return toast.error('Brak telefonu'); await sendRentalSms(booking.renter_phone, msg); }
    else { if (!booking.renter_email) return toast.error('Brak e‑maila'); await sendRentalEmail(booking.renter_email, 'Umowa najmu do podpisu', `<p>${msg}</p><p><a href="${link}">Podpisz</a></p>`); }
    if (inst) await sb.from('rental_document_instances').update({ status: 'sent', sent_at: new Date().toISOString(), sent_channel: channel }).eq('id', inst.id);
    load();
  };

  const openInvoice = async () => {
    const { data: veh } = await sb.from('rental_vehicles').select('brand, model, plate').eq('subject_id', booking.subject_id).maybeSingle();
    const net = Number(booking.due || booking.rate_amount || booking.estimated_price || 0);
    const okres = `${new Date(booking.period_start).toLocaleDateString('pl-PL')}–${new Date(booking.period_end).toLocaleDateString('pl-PL')}`;
    setInvoiceOpen({
      prefillItems: [{ name: `Usługa wynajmu pojazdu ${[veh?.brand, veh?.model, veh?.plate].filter(Boolean).join(' ')} (${okres})`, quantity: 1, unit: 'usł.', unit_net_price: net, unit_gross_price: Math.round(net * 1.23 * 100) / 100, vat_rate: '23' }],
      prefillBuyer: { name: booking.renter_name || '', nip: booking.renter_nip || '', email: booking.renter_email || '' },
      prefillNotes: `Najem ${booking.booking_number}`,
    } as any);
  };
  const onInvoiceSaved = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // deterministycznie: faktura z notatką zawierającą numer najmu
        const { data: inv } = await sb.from('user_invoices').select('id, invoice_number').eq('user_id', user.id).ilike('notes', `%${booking.booking_number}%`).order('created_at', { ascending: false }).limit(1);
        if (inv && inv[0]) {
          const { data: exists } = await sb.from('rental_booking_invoices').select('id').eq('user_invoice_id', inv[0].id).limit(1);
          if (!exists || exists.length === 0) await sb.from('rental_booking_invoices').insert({ company_id: companyId, booking_id: booking.id, user_invoice_id: inv[0].id, invoice_number: inv[0].invoice_number });
        }
      }
    } catch { /* link best-effort */ }
    setInvoiceOpen(false); load();
  };

  const paymentsBooking = { id: booking.id, booking_number: booking.booking_number, due: booking.due ?? booking.rate_amount ?? 0, deposit_amount: booking.deposit_amount, pays: [], kaucja: undefined };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Zlecenie {booking.booking_number}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          {/* Podsumowanie */}
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Auto:</span> {booking.vehLabel || '—'}</div>
            <div><span className="text-muted-foreground">Najemca:</span> {booking.renter_name}</div>
            <div><span className="text-muted-foreground">Okres:</span> {fmt(booking.period_start)} – {fmt(booking.period_end)}</div>
            <div><span className="text-muted-foreground">Kwota / kaucja:</span> {booking.due ?? booking.rate_amount ?? '—'} / {booking.deposit_amount ?? '—'} zł</div>
            <div><span className="text-muted-foreground">Status:</span> {STATUS_LABEL[booking.status] || booking.status}</div>
            <div><span className="text-muted-foreground">Płatność:</span> {booking.payStatus || '—'}</div>
          </div>

          {booking.source === 'gielda' && booking.status === 'pending_confirmation' && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 space-y-2">
              <div className="text-xs font-semibold text-amber-800">Rezerwacja z giełdy — decyzja</div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); const { data: a } = await sb.rpc('rental_check_availability', { p_subject_id: booking.subject_id, p_start: booking.period_start, p_end: booking.period_end, p_exclude: booking.id }); if (a && !a.available) { setBusy(false); return toast.error('Termin koliduje.'); } await setStatus('confirmed'); }}>Zatwierdź</Button>
                <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setStatus('cancelled')}>Odrzuć</Button>
              </div>
            </div>
          )}

          {/* Status najmu */}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-1">Status najmu</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('confirmed')}>Rezerwacja</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('in_progress')}>Wydaj (w trakcie)</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('completed')}>Zakończ</Button>
              <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setStatus('cancelled')}>Anuluj</Button>
            </div>
          </div>

          {/* Akcje: umowa / faktura / płatność / protokół */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-3">
            <div className="rounded-lg border p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><FileSignature className="h-4 w-4 text-primary" /> Umowa</div>
              {!inst ? <Button size="sm" disabled={busy} onClick={genContract}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Generuj umowę</Button> : (
                <div className="space-y-1">
                  <div className="text-xs">Status: <b>{inst.status === 'signed' ? 'podpisana' : inst.status === 'sent' ? 'wysłana' : 'szkic'}</b></div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setPreview(inst.filled_content || '')}><Eye className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => sendContract('sms')}><MessageSquare className="h-3 w-3" />SMS</Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => sendContract('email')}><Mail className="h-3 w-3" />E‑mail</Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (booking.confirmation_token) { navigator.clipboard.writeText(contractLink(booking.confirmation_token)); toast.success('Link skopiowany'); } }}><LinkIcon className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Faktura</div>
              {invoiceLink ? <div className="text-xs">Wystawiona: <b>{invoiceLink.invoice_number || '—'}</b></div> : <div className="text-xs text-muted-foreground">Brak faktury</div>}
              <Button size="sm" onClick={openInvoice}>{invoiceLink ? 'Wystaw kolejną' : 'Wystaw fakturę'}</Button>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Płatności + kaucja</div>
              <Button size="sm" onClick={() => setPaymentsOpen(true)}>Zarządzaj płatnościami</Button>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><Camera className="h-4 w-4 text-primary" /> Protokół</div>
              <Button size="sm" onClick={() => setProtocolOpen(true)}>Wydanie / zwrot</Button>
            </div>
          </div>

          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Zamknij</Button></div>
        </div>

        {/* Podgląd umowy */}
        <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Podgląd umowy</DialogTitle></DialogHeader><div dangerouslySetInnerHTML={{ __html: sanitizeDocumentHtml(preview) }} /></DialogContent>
        </Dialog>
      </DialogContent>

      {/* Faktura — reuse SimpleFreeInvoice */}
      {invoiceOpen && (
        <Dialog open onOpenChange={(v) => { if (!v) setInvoiceOpen(false); }}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Faktura — {booking.booking_number}</DialogTitle></DialogHeader>
            <SimpleFreeInvoice prefillItems={(invoiceOpen as any).prefillItems} prefillBuyer={(invoiceOpen as any).prefillBuyer} prefillNotes={(invoiceOpen as any).prefillNotes} onClose={() => setInvoiceOpen(false)} onSaved={onInvoiceSaved} />
          </DialogContent>
        </Dialog>
      )}

      {paymentsOpen && <ManageDialog sb={sb} companyId={companyId} booking={paymentsBooking} onClose={() => setPaymentsOpen(false)} onChanged={() => { setPaymentsOpen(false); onChanged(); }} />}

      {protocolOpen && (
        <Dialog open onOpenChange={(v) => !v && setProtocolOpen(false)}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Protokół — {booking.booking_number}</DialogTitle></DialogHeader>
            <RentalProtocol companyId={companyId} initialBookingId={booking.id} />
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
