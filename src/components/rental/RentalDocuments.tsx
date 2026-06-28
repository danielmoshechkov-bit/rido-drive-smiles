import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { FileSignature, Plus, Eye, Send, FileText, Loader2, Link as LinkIcon, MessageSquare, Mail } from 'lucide-react';
import { RENTAL_CONTRACT_CONTENT, generateRentalContractHtml } from '@/components/rental/rentalLib';
import { sendRentalSms, sendRentalEmail, contractLink } from '@/components/rental/rentalMessaging';

const fmt = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('pl-PL') : ''; } catch { return iso || ''; } };

export function RentalDocuments({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [templates, setTemplates] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [fillFor, setFillFor] = useState<any | null>(null);

  const builtin = { id: 'builtin-rental', name: 'Umowa najmu pojazdu', code: 'RENTAL_CONTRACT', content: RENTAL_CONTRACT_CONTENT, builtin: true };

  const load = useCallback(async () => {
    const [{ data: t }, { data: ins }, { data: c }] = await Promise.all([
      sb.from('rental_contract_templates').select('*').eq('company_id', companyId).eq('status', 'active').order('created_at', { ascending: false }),
      sb.from('rental_document_instances').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      sb.from('companies').select('name, nip').eq('id', companyId).maybeSingle(),
    ]);
    setTemplates([builtin, ...(t || [])]);
    // dołącz token/kontakt najemcy do instancji (link do podpisu)
    const bIds = [...new Set((ins || []).map((i: any) => i.booking_id).filter(Boolean))];
    let bMap: Record<string, any> = {};
    if (bIds.length) { const { data: bk } = await sb.from('bookings').select('id, confirmation_token, renter_phone, renter_email, booking_number').in('id', bIds); bMap = Object.fromEntries((bk || []).map((b: any) => [b.id, b])); }
    setInstances((ins || []).map((i: any) => ({ ...i, _bk: bMap[i.booking_id] })));
    setCompany(c);
  }, [companyId, sb]);

  const sendLink = async (inst: any, channel: 'sms' | 'email') => {
    const bk = inst._bk;
    if (!bk?.confirmation_token) { toast.error('Brak tokenu zlecenia'); return; }
    const link = contractLink(bk.confirmation_token);
    const msg = `Umowa najmu ${bk.booking_number || ''} do podpisu: ${link}`;
    if (channel === 'sms') { if (!bk.renter_phone) { toast.error('Brak telefonu najemcy'); return; } await sendRentalSms(bk.renter_phone, msg); }
    else { if (!bk.renter_email) { toast.error('Brak e‑maila najemcy'); return; } await sendRentalEmail(bk.renter_email, 'Umowa najmu do podpisu', `<p>${msg}</p><p><a href="${link}">Podpisz umowę</a></p>`); }
    await sb.from('rental_document_instances').update({ status: 'sent', sent_at: new Date().toISOString(), sent_channel: channel }).eq('id', inst.id);
    await sb.from('rental_signature_logs').insert({ company_id: companyId, booking_id: bk.id, instance_id: inst.id, action_type: channel === 'sms' ? 'sms_sent' : 'email_sent', actor_type: 'system' });
    load();
  };
  const copyLink = (inst: any) => { const t = inst._bk?.confirmation_token; if (!t) return toast.error('Brak tokenu'); navigator.clipboard.writeText(contractLink(t)); toast.success('Link skopiowany'); };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const markSigned = async (id: string) => {
    await sb.from('rental_document_instances').update({ status: 'signed', signed_at: new Date().toISOString() }).eq('id', id);
    toast.success('Oznaczono jako podpisane'); load();
  };

  const sent = instances.filter(i => i.status === 'sent');
  const signed = instances.filter(i => i.status === 'signed');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" /> Umowy</h2>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Szablony</TabsTrigger>
          <TabsTrigger value="sent">Wysłane ({sent.length})</TabsTrigger>
          <TabsTrigger value="signed">Podpisane ({signed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="pt-3 space-y-3">
          <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Stwórz szablon</Button>
          <div className="grid md:grid-cols-2 gap-3">
            {templates.map(t => (
              <Card key={t.id}><CardContent className="py-4 flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.code || 'custom'}{t.builtin ? ' · wbudowany' : ''}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setPreview(`<pre style="white-space:pre-wrap;font-family:inherit">${t.content || ''}</pre>`)}><Eye className="h-4 w-4" /></Button>
                <Button size="sm" onClick={() => setFillFor(t)} className="gap-1"><Send className="h-4 w-4" />Uzupełnij i wyślij</Button>
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sent" className="pt-3">
          <InstancesList rows={sent} onPreview={(h) => setPreview(h)} onSign={markSigned}
            onSendSms={(i: any) => sendLink(i, 'sms')} onSendEmail={(i: any) => sendLink(i, 'email')} onCopyLink={copyLink} />
        </TabsContent>
        <TabsContent value="signed" className="pt-3">
          <InstancesList rows={signed} onPreview={(h) => setPreview(h)} />
        </TabsContent>
      </Tabs>

      {/* Podgląd */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Podgląd</DialogTitle></DialogHeader>
          <div dangerouslySetInnerHTML={{ __html: preview || '' }} />
        </DialogContent>
      </Dialog>

      {createOpen && <CreateTemplate sb={sb} companyId={companyId} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />}
      {fillFor && <FillAndSend sb={sb} companyId={companyId} company={company} template={fillFor} onClose={() => setFillFor(null)} onSent={() => { setFillFor(null); load(); }} onPreview={setPreview} />}
    </div>
  );
}

function InstancesList({ rows, onPreview, onSign, onSendSms, onSendEmail, onCopyLink }: any) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Brak dokumentów.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r: any) => (
        <Card key={r.id}><CardContent className="py-3 flex items-center gap-2 flex-wrap">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-[160px]">
            <div className="font-medium text-sm">{r.template_name} {r.contract_number && <span className="font-mono text-xs text-muted-foreground">· {r.contract_number}</span>}</div>
            <div className="text-xs text-muted-foreground">{r.filled_data?.renter_name || ''} · {r.status === 'signed' ? `podpisano ${fmt(r.signed_at)}` : `wysłano ${fmt(r.sent_at)}`}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onPreview(r.filled_content || '')} title="Podgląd"><Eye className="h-4 w-4" /></Button>
          {onCopyLink && r.status !== 'signed' && <Button size="sm" variant="ghost" onClick={() => onCopyLink(r)} title="Kopiuj link"><LinkIcon className="h-4 w-4" /></Button>}
          {onSendSms && r.status !== 'signed' && <Button size="sm" variant="outline" className="gap-1" onClick={() => onSendSms(r)}><MessageSquare className="h-3 w-3" />SMS</Button>}
          {onSendEmail && r.status !== 'signed' && <Button size="sm" variant="outline" className="gap-1" onClick={() => onSendEmail(r)}><Mail className="h-3 w-3" />E‑mail</Button>}
          {onSign && <Button size="sm" variant="outline" onClick={() => onSign(r.id)}>Oznacz podpisane</Button>}
        </CardContent></Card>
      ))}
    </div>
  );
}

function CreateTemplate({ sb, companyId, onClose, onSaved }: any) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { toast.error('Podaj nazwę'); return; }
    setBusy(true);
    try {
      await sb.from('rental_contract_templates').insert({ company_id: companyId, name: name.trim(), content, status: 'active' });
      toast.success('Szablon zapisany'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Nowy szablon</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nazwa</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Treść (placeholdery np. {'{{IMIE_NAZWISKO_NAJEMCY}}'})</Label>
            <Textarea rows={10} value={content} onChange={e => setContent(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Anuluj</Button>
            <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Zapisz</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FillAndSend({ sb, companyId, company, template, onClose, onSent, onPreview }: any) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await sb.from('bookings')
        .select('id, booking_number, renter_name, renter_phone, period_start, period_end, rate_basis, rate_amount, deposit_amount, subject_id')
        .eq('company_id', companyId).order('created_at', { ascending: false });
      setBookings(data || []);
    })();
  }, [companyId, sb]);

  const build = async () => {
    const bk = bookings.find(b => b.id === bookingId);
    if (!bk) { toast.error('Wybierz rezerwację'); return null; }
    const { data: veh } = await sb.from('rental_vehicles').select('brand, model, vin, plate').eq('subject_id', bk.subject_id).maybeSingle();
    const filled = {
      contract_number: bk.booking_number, contract_date: new Date().toLocaleDateString('pl-PL'),
      company_name: company?.name, company_nip: company?.nip,
      renter_name: bk.renter_name, renter_phone: bk.renter_phone,
      car_brand: veh?.brand, car_model: veh?.model, car_vin: veh?.vin, car_registration: veh?.plate,
      period_from: bk.period_start ? new Date(bk.period_start).toLocaleString('pl-PL') : '',
      period_to: bk.period_end ? new Date(bk.period_end).toLocaleString('pl-PL') : '',
      rate: bk.rate_amount != null ? `${bk.rate_amount} zł / ${bk.rate_basis || ''}` : '',
      deposit: bk.deposit_amount != null ? String(bk.deposit_amount) : '',
    };
    return { bk, filled, html: generateRentalContractHtml(filled) };
  };

  const preview = async () => { const r = await build(); if (r) onPreview(r.html); };
  const send = async () => {
    const r = await build(); if (!r) return;
    setBusy(true);
    try {
      await sb.from('rental_document_instances').insert({
        company_id: companyId, booking_id: r.bk.id, subject_id: r.bk.subject_id,
        template_name: template.name, contract_number: r.bk.booking_number,
        status: 'sent', filled_data: r.filled, filled_content: r.html, sent_at: new Date().toISOString(),
      });
      toast.success('Umowa wygenerowana i wysłana'); onSent();
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Uzupełnij i wyślij — {template.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Rezerwacja</Label>
            <Select value={bookingId} onValueChange={setBookingId}>
              <SelectTrigger><SelectValue placeholder="Wybierz rezerwację" /></SelectTrigger>
              <SelectContent>
                {bookings.map(b => <SelectItem key={b.id} value={b.id}>{b.booking_number} · {b.renter_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {bookings.length === 0 && <p className="text-xs text-muted-foreground">Brak rezerwacji — utwórz najpierw zlecenie na wynajem.</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={preview} disabled={!bookingId}><Eye className="h-4 w-4 mr-2" />Podgląd</Button>
            <Button onClick={send} disabled={!bookingId || busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}<Send className="h-4 w-4 mr-2" />Wyślij</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
