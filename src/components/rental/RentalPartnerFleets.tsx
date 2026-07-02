import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Network, Plus, Loader2, Search } from 'lucide-react';
import { useGusLookup } from '@/hooks/useGusLookup';

/** „Floty partnerskie" — partnerzy B2B. Na rental_partner_fleets. */
export function RentalPartnerFleets({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb.from('rental_partner_fleets').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    setRows(data || []); setLoading(false);
  }, [sb, companyId]);
  useEffect(() => { load(); }, [load]);

  const toggleActive = async (id: string, val: boolean) => { await sb.from('rental_partner_fleets').update({ is_active: val }).eq('id', id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Network className="h-5 w-5 text-primary" /> Floty partnerskie</h2>
        <div className="flex-1" />
        <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Dodaj flotę partnerską</Button>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : rows.length === 0 ? <Card className="py-12 text-center text-muted-foreground text-sm">Brak flot partnerskich.</Card>
          : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id}><CardContent className="py-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="font-semibold">{r.partner_name || 'Partner'}</div>
                <div className="text-xs text-muted-foreground">{[r.nip && `NIP ${r.nip}`, r.city, r.phone, r.email, r.is_b2b && 'B2B', r.invoice_frequency].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Aktywna</span><Switch checked={!!r.is_active} onCheckedChange={(v) => toggleActive(r.id, v)} /></div>
            </CardContent></Card>
          ))}</div>}
      {addOpen && <AddPartner sb={sb} companyId={companyId} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />}
    </div>
  );
}

function AddPartner({ sb, companyId, onClose, onSaved }: any) {
  const [f, setF] = useState({ partner_name: '', nip: '', city: '', address: '', phone: '', email: '', invoice_frequency: '', is_b2b: false });
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));
  const { lookup: gusLookup, loading: gusLoading } = useGusLookup();
  const fromGus = async () => {
    const gus = await gusLookup(f.nip);
    if (!gus) return toast.error('Nie znaleziono firmy w GUS');
    setF(s => ({ ...s, partner_name: gus.nazwa, nip: gus.nip, city: gus.miasto || s.city, address: gus.adres || s.address }));
    toast.success('Dane firmy pobrane z GUS');
  };
  const save = async () => {
    if (!f.partner_name.trim()) { toast.error('Podaj nazwę partnera'); return; }
    const { error } = await sb.from('rental_partner_fleets').insert({ company_id: companyId, ...f, is_active: true });
    if (error) return toast.error(error.message);
    toast.success('Flota partnerska dodana'); onSaved();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nowa flota partnerska</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2"><Label>Nazwa</Label><Input value={f.partner_name} onChange={e => set('partner_name', e.target.value)} /></div>
          <div className="space-y-1"><Label>NIP</Label><div className="flex gap-1"><Input value={f.nip} onChange={e => set('nip', e.target.value)} /><Button type="button" variant="outline" size="icon" className="shrink-0" onClick={fromGus} disabled={gusLoading || f.nip.replace(/\D/g, '').length < 10} title="Pobierz dane firmy z GUS">{gusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button></div></div>
          <div className="space-y-1"><Label>Miasto</Label><Input value={f.city} onChange={e => set('city', e.target.value)} /></div>
          <div className="space-y-1"><Label>Adres</Label><Input value={f.address} onChange={e => set('address', e.target.value)} /></div>
          <div className="space-y-1"><Label>Telefon</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="space-y-1"><Label>E-mail</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
          <div className="space-y-1"><Label>Częstotliwość faktur</Label><Input value={f.invoice_frequency} onChange={e => set('invoice_frequency', e.target.value)} placeholder="np. tygodniowo" /></div>
          <label className="flex items-center gap-2 col-span-2 text-sm"><Switch checked={f.is_b2b} onCheckedChange={(v) => set('is_b2b', v)} /> Rozliczenie B2B</label>
        </div>
        <div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={onClose}>Anuluj</Button><Button onClick={save}>Zapisz</Button></div>
      </DialogContent>
    </Dialog>
  );
}
