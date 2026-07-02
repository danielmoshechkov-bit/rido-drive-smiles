import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileKey, Loader2, CheckCircle2, AlertTriangle, Calculator, Search } from 'lucide-react';
import { useGusLookup } from '@/hooks/useGusLookup';
import { noScroll } from '@/components/rental/rentalLib';

/** „Wynajmij pojazd" — dostępność (anti-double-booking) + auto-wycena + najemca → booking. */
export function RentalWizard({ companyId, open, onOpenChange, onCreated }: {
  companyId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}) {
  const sb = supabase as any;
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [renters, setRenters] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [avail, setAvail] = useState<any | null>(null);
  const [priceInfo, setPriceInfo] = useState<any | null>(null);
  const [checking, setChecking] = useState(false);
  const [renterMode, setRenterMode] = useState<'existing' | 'new'>('new');
  const [f, setF] = useState({
    subject_id: '', start: '', end: '', rate_basis: 'day', rate_amount: '', deposit: '',
    renter_id: '', renter_type: 'private', full_name: '', company_name: '', nip: '', pesel: '', phone: '', email: '',
  });
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));
  const { lookup: gusLookup, loading: gusLoading } = useGusLookup();
  const fromGus = async () => {
    const gus = await gusLookup(f.nip);
    if (!gus) return toast.error('Nie znaleziono firmy w GUS');
    setF(s => ({ ...s, company_name: gus.nazwa, nip: gus.nip }));
    toast.success('Dane firmy pobrane z GUS');
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: subs } = await sb.from('rental_subjects').select('id, title').eq('owner_company_id', companyId).eq('subject_kind', 'vehicle').order('created_at', { ascending: false });
      const ids = (subs || []).map((s: any) => s.id);
      let veh: Record<string, any> = {};
      if (ids.length) { const { data: vs } = await sb.from('rental_vehicles').select('subject_id, brand, model, plate').in('subject_id', ids); veh = Object.fromEntries((vs || []).map((v: any) => [v.subject_id, v])); }
      setVehicles((subs || []).map((s: any) => ({ id: s.id, label: [veh[s.id]?.plate, veh[s.id]?.brand, veh[s.id]?.model].filter(Boolean).join(' ') || s.title })));
      const { data: r } = await sb.from('rental_renters').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
      setRenters(r || []);
    })();
  }, [open, companyId, sb]);

  const checkAndPrice = async () => {
    if (!f.subject_id || !f.start || !f.end) { toast.error('Wybierz pojazd i okres'); return; }
    const startIso = new Date(f.start).toISOString(), endIso = new Date(f.end).toISOString();
    if (new Date(endIso) <= new Date(startIso)) { toast.error('„Do" musi być po „od"'); return; }
    setChecking(true);
    try {
      const { data: a } = await sb.rpc('rental_check_availability', { p_subject_id: f.subject_id, p_start: startIso, p_end: endIso, p_exclude: null });
      setAvail(a);
      const { data: p } = await sb.rpc('rental_calc_price', { p_subject_id: f.subject_id, p_start: startIso, p_end: endIso });
      setPriceInfo(p);
      if (p && !p.error) setF(s => ({ ...s, rate_amount: String(p.amount ?? ''), deposit: s.deposit || String(p.deposit ?? '') }));
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setChecking(false); }
  };

  const submit = async () => {
    if (!f.subject_id || !f.start || !f.end) { toast.error('Uzupełnij pojazd i okres'); return; }
    const startIso = new Date(f.start).toISOString(), endIso = new Date(f.end).toISOString();
    // twardy re-check dostępności tuż przed zapisem
    const { data: a } = await sb.rpc('rental_check_availability', { p_subject_id: f.subject_id, p_start: startIso, p_end: endIso, p_exclude: null });
    if (a && !a.available) { setAvail(a); toast.error('Termin zajęty — wybierz inny.'); return; }
    let renterName = f.full_name.trim(), renterPhone = f.phone.trim(), renterEmail = f.email.trim(), renterId: string | null = null, rType = f.renter_type, nip = f.nip, pesel = f.pesel;
    if (renterMode === 'existing') {
      const r = renters.find(x => x.id === f.renter_id);
      if (!r) { toast.error('Wybierz najemcę'); return; }
      renterId = r.id; renterName = r.full_name || r.company_name || 'Najemca'; renterPhone = r.phone || ''; renterEmail = r.email || ''; rType = r.renter_type; nip = r.nip; pesel = r.pesel;
    } else {
      if (!renterName && !f.company_name.trim()) { toast.error('Podaj najemcę'); return; }
      if (!renterPhone) { toast.error('Podaj telefon najemcy'); return; }
    }
    setSaving(true);
    try {
      if (renterMode === 'new') {
        const { data: nr } = await sb.from('rental_renters').insert({ company_id: companyId, renter_type: f.renter_type, full_name: f.full_name.trim() || null, company_name: f.company_name.trim() || null, nip: f.nip || null, pesel: f.pesel || null, phone: f.phone || null, email: f.email || null }).select('id').single();
        renterId = nr?.id || null;
        renterName = f.full_name.trim() || f.company_name.trim();
      }
      const { data, error } = await sb.from('bookings').insert({
        company_id: companyId, subject_id: f.subject_id, renter_id: renterId, renter_type: rType, renter_name: renterName, renter_phone: renterPhone, renter_email: renterEmail || null, renter_nip: nip || null, renter_pesel: pesel || null,
        period_start: startIso, period_end: endIso, rate_basis: f.rate_basis, rate_amount: f.rate_amount ? Number(f.rate_amount.replace(',', '.')) : null, estimated_price: f.rate_amount ? Number(f.rate_amount.replace(',', '.')) : null,
        deposit_amount: f.deposit ? Number(f.deposit.replace(',', '.')) : null, status: 'confirmed', source: 'calendar',
      }).select('booking_number').single();
      if (error) throw error;
      toast.success('Najem utworzony: ' + data.booking_number + ' (termin zablokowany)');
      setF({ subject_id: '', start: '', end: '', rate_basis: 'day', rate_amount: '', deposit: '', renter_id: '', renter_type: 'private', full_name: '', company_name: '', nip: '', pesel: '', phone: '', email: '' });
      setAvail(null); setPriceInfo(null); onOpenChange(false); onCreated();
    } catch (e: any) { toast.error('Błąd: ' + (e.message || e)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileKey className="h-5 w-5" /> Wynajmij pojazd</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Pojazd + termin */}
          <div className="space-y-1.5"><Label>Pojazd *</Label>
            <Select value={f.subject_id} onValueChange={v => { set('subject_id', v); setAvail(null); setPriceInfo(null); }}><SelectTrigger><SelectValue placeholder="Wybierz pojazd" /></SelectTrigger>
              <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Od *</Label><Input type="datetime-local" value={f.start} onChange={e => { set('start', e.target.value); setAvail(null); }} /></div>
            <div className="space-y-1.5"><Label>Do *</Label><Input type="datetime-local" value={f.end} onChange={e => { set('end', e.target.value); setAvail(null); }} /></div>
          </div>
          <Button variant="outline" onClick={checkAndPrice} disabled={checking} className="gap-2">{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Sprawdź dostępność i wyceń</Button>

          {avail && (avail.available
            ? <div className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Termin wolny</div>
            : <div className="text-sm text-destructive flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5" /><div>Termin zajęty: {(avail.conflicts || []).map((c: any) => `${c.label}`).join(', ')}</div></div>)}
          {priceInfo && !priceInfo.error && (
            <div className="text-xs bg-muted rounded p-2">Wycena: <b>{priceInfo.amount} zł</b> ({priceInfo.total_days} dni{priceInfo.discount_percent > 0 ? `, rabat −${priceInfo.discount_percent}%` : ''}) · kaucja sugerowana {priceInfo.deposit} zł</div>
          )}

          {/* Najemca */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant={renterMode === 'new' ? 'default' : 'outline'} onClick={() => setRenterMode('new')}>Nowy najemca</Button>
              <Button size="sm" variant={renterMode === 'existing' ? 'default' : 'outline'} onClick={() => setRenterMode('existing')} disabled={renters.length === 0}>Istniejący</Button>
            </div>
            {renterMode === 'existing' ? (
              <Select value={f.renter_id} onValueChange={v => set('renter_id', v)}><SelectTrigger><SelectValue placeholder="Wybierz najemcę" /></SelectTrigger>
                <SelectContent>{renters.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name || r.company_name} {r.phone ? `· ${r.phone}` : ''}</SelectItem>)}</SelectContent></Select>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2"><Label className="text-xs">Typ</Label>
                  <Select value={f.renter_type} onValueChange={v => set('renter_type', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="private">Prywatny</SelectItem><SelectItem value="driver">Kierowca</SelectItem><SelectItem value="company">Firma</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-xs">Imię i nazwisko</Label><Input value={f.full_name} onChange={e => set('full_name', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Firma</Label><Input value={f.company_name} onChange={e => set('company_name', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Telefon *</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">E-mail</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">NIP</Label><div className="flex gap-1"><Input value={f.nip} onChange={e => set('nip', e.target.value)} /><Button type="button" variant="outline" size="icon" className="shrink-0" onClick={fromGus} disabled={gusLoading || f.nip.replace(/\D/g, '').length < 10} title="Pobierz dane firmy z GUS">{gusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button></div></div>
                <div className="space-y-1"><Label className="text-xs">PESEL</Label><Input value={f.pesel} onChange={e => set('pesel', e.target.value)} /></div>
              </div>
            )}
          </div>

          {/* Kwota + kaucja */}
          <div className="border-t pt-3 grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label className="text-xs">Jednostka</Label>
              <Select value={f.rate_basis} onValueChange={v => set('rate_basis', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="hour">godzina</SelectItem><SelectItem value="day">doba</SelectItem><SelectItem value="week">tydzień</SelectItem><SelectItem value="month">miesiąc</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Kwota (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.rate_amount} onChange={e => set('rate_amount', e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Kaucja (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.deposit} onChange={e => set('deposit', e.target.value)} /></div>
          </div>

          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={submit} disabled={saving || (avail && !avail.available)}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Utwórz najem</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
