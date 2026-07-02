import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UniversalSelector } from '@/components/UniversalSelector';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { useGusLookup } from '@/hooks/useGusLookup';
import { ShortenLegalFormCheckbox } from '@/components/shared/ShortenLegalFormCheckbox';

/** Selektor właściciela auta (rental_vehicle_owners) + „Dodaj właściciela". Zapis rental_vehicles.owner_id. */
export function RentalOwnerSelector({ companyId, subjectId, currentOwnerId, onChange, owners: ownersProp }: {
  companyId: string; subjectId: string; currentOwnerId?: string | null; onChange: () => void; owners?: { id: string; name: string }[];
}) {
  const sb = supabase as any;
  const [ownersState, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const controlled = Array.isArray(ownersProp);
  const owners = controlled ? (ownersProp as any[]) : ownersState;

  const load = useCallback(async () => {
    if (controlled) return; // właściciele z propsów (zbiorcze) — koniec N+1
    const { data } = await sb.from('rental_vehicle_owners').select('id, name, company_name').eq('company_id', companyId).order('created_at', { ascending: false });
    setOwners((data || []).map((o: any) => ({ id: o.id, name: o.name || o.company_name || 'Właściciel' })));
  }, [sb, companyId, controlled]);
  useEffect(() => { load(); }, [load]);

  const select = async (item: { id: string } | null) => {
    await sb.from('rental_vehicles').update({ owner_id: item?.id || null }).eq('subject_id', subjectId);
    onChange();
  };

  return (
    <>
      <UniversalSelector
        id={`rental-owner-${subjectId}`}
        items={owners}
        currentValue={currentOwnerId || null}
        placeholder="Właściciel"
        searchPlaceholder="Szukaj właściciela..."
        noResultsText="Brak właścicieli"
        showSearch
        showAddNew
        addNewButtonText="Dodaj właściciela"
        allowClear
        onSelect={select}
        onAddNew={() => setAddOpen(true)}
      />
      {addOpen && <AddOwner sb={sb} companyId={companyId} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); if (controlled) onChange(); else load(); }} />}
    </>
  );
}

function AddOwner({ sb, companyId, onClose, onSaved }: any) {
  const [f, setF] = useState({ name: '', company_name: '', phone: '', email: '', nip: '', bank_account: '' });
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));
  const { lookup: gusLookup, loading: gusLoading, shorten: gusShorten, setShorten: setGusShorten } = useGusLookup({
    onCompany: (gus) => setF(s => ({ ...s, company_name: gus.nazwa, nip: gus.nip })),
  });
  const fromGus = async () => {
    const gus = await gusLookup(f.nip);
    if (!gus) return toast.error('Nie znaleziono firmy w GUS');
    toast.success('Dane firmy pobrane z GUS');
  };
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
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Imię i nazwisko</Label><Input value={f.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="space-y-1"><Label>Firma</Label><Input value={f.company_name} onChange={e => set('company_name', e.target.value)} /></div>
            <div className="space-y-1"><Label>Telefon</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
            <div className="space-y-1"><Label>E-mail</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
            <div className="space-y-1"><Label>NIP</Label><div className="flex gap-1"><Input value={f.nip} onChange={e => set('nip', e.target.value)} /><Button type="button" variant="outline" size="icon" className="shrink-0" onClick={fromGus} disabled={gusLoading || f.nip.replace(/\D/g, '').length < 10} title="Pobierz dane firmy z GUS">{gusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button></div><ShortenLegalFormCheckbox checked={gusShorten} onCheckedChange={setGusShorten} /></div>
            <div className="space-y-1"><Label>Konto bankowe</Label><Input value={f.bank_account} onChange={e => set('bank_account', e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Anuluj</Button><Button onClick={save}>Zapisz</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
