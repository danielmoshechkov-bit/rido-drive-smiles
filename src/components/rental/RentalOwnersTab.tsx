import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Users, Plus, Loader2 } from 'lucide-react';

/** „Nasz wynajem" — właściciele aut + ich pojazdy/opłaty. Na rental_vehicle_owners. */
export function RentalOwnersTab({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [owners, setOwners] = useState<any[]>([]);
  const [vehByOwner, setVehByOwner] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: o } = await sb.from('rental_vehicle_owners').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    setOwners(o || []);
    const ids = (o || []).map((x: any) => x.id);
    if (ids.length) {
      const { data: subs } = await sb.from('rental_subjects').select('id, title').eq('owner_company_id', companyId).eq('subject_kind', 'vehicle');
      const subMap = Object.fromEntries((subs || []).map((s: any) => [s.id, s.title]));
      const { data: vs } = await sb.from('rental_vehicles').select('subject_id, brand, model, plate, owner_id, owner_rental_fee').in('owner_id', ids);
      const grouped: Record<string, any[]> = {};
      (vs || []).forEach((v: any) => { (grouped[v.owner_id] = grouped[v.owner_id] || []).push({ ...v, title: subMap[v.subject_id] }); });
      setVehByOwner(grouped);
    } else setVehByOwner({});
    setLoading(false);
  }, [sb, companyId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Nasz wynajem — właściciele</h2>
        <div className="flex-1" />
        <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Dodaj właściciela</Button>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : owners.length === 0 ? <Card className="py-12 text-center text-muted-foreground text-sm">Brak właścicieli.</Card>
          : <div className="space-y-3">{owners.map(o => (
            <Card key={o.id}><CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-semibold">{o.name || o.company_name || 'Właściciel'}</div>
                  <div className="text-xs text-muted-foreground">{[o.company_name, o.nip && `NIP ${o.nip}`, o.phone, o.email].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              {(vehByOwner[o.id] || []).length > 0 && (
                <Table className="mt-2"><TableHeader><TableRow><TableHead>Pojazd</TableHead><TableHead>Nr rej.</TableHead><TableHead>Opłata dla właściciela</TableHead></TableRow></TableHeader>
                  <TableBody>{(vehByOwner[o.id] || []).map((v: any, i: number) => <TableRow key={i}><TableCell>{[v.brand, v.model].filter(Boolean).join(' ') || v.title}</TableCell><TableCell>{v.plate || '—'}</TableCell><TableCell>{v.owner_rental_fee != null ? `${v.owner_rental_fee} zł/tydz.` : '—'}</TableCell></TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent></Card>
          ))}</div>}
      {addOpen && <AddOwner sb={sb} companyId={companyId} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />}
    </div>
  );
}

function AddOwner({ sb, companyId, onClose, onSaved }: any) {
  const [f, setF] = useState({ name: '', company_name: '', phone: '', email: '', nip: '', bank_account: '' });
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.name.trim() && !f.company_name.trim()) { toast.error('Podaj imię/nazwę'); return; }
    const { error } = await sb.from('rental_vehicle_owners').insert({ company_id: companyId, ...f });
    if (error) return toast.error(error.message);
    toast.success('Właściciel dodany'); onSaved();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nowy właściciel</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Imię i nazwisko</Label><Input value={f.name} onChange={e => set('name', e.target.value)} /></div>
          <div className="space-y-1"><Label>Firma</Label><Input value={f.company_name} onChange={e => set('company_name', e.target.value)} /></div>
          <div className="space-y-1"><Label>Telefon</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="space-y-1"><Label>E-mail</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
          <div className="space-y-1"><Label>NIP</Label><Input value={f.nip} onChange={e => set('nip', e.target.value)} /></div>
          <div className="space-y-1"><Label>Konto</Label><Input value={f.bank_account} onChange={e => set('bank_account', e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={onClose}>Anuluj</Button><Button onClick={save}>Zapisz</Button></div>
      </DialogContent>
    </Dialog>
  );
}
