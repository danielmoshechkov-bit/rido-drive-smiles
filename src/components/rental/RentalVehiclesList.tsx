import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, Loader2, Car, Search, FileKey, ChevronLeft, ChevronRight } from 'lucide-react';
import { RentalAddVehicleModal } from '@/components/rental/RentalAddVehicleModal';
import { RentalVehicleCard, VehicleItem } from '@/components/rental/RentalVehicleCard';
import { RentalWizard } from '@/components/rental/RentalWizard';
import { daysLeft } from '@/components/rental/rentalLib';

const PAGE = 30;

export function RentalVehiclesList({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [items, setItems] = useState<VehicleItem[]>([]);
  const [aux, setAux] = useState<Record<string, any>>({});
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [vfilter, setVfilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: c } = await sb.from('companies').select('name').eq('id', companyId).maybeSingle();
    setCompanyName(c?.name || 'Moja firma');
    // drivers — JEDNO zapytanie dla firmy (współdzielone przez karty)
    const [{ data: drv }, { data: own }] = await Promise.all([
      sb.from('rental_drivers').select('id, first_name, last_name').eq('company_id', companyId).order('created_at', { ascending: false }),
      sb.from('rental_vehicle_owners').select('id, name, company_name').eq('company_id', companyId).order('created_at', { ascending: false }),
    ]);
    setDrivers((drv || []).map((d: any) => ({ id: d.id, name: `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Kierowca' })));
    setOwners((own || []).map((o: any) => ({ id: o.id, name: o.name || o.company_name || 'Właściciel' })));

    // strona pojazdów (range) + licznik
    let qy = sb.from('rental_subjects').select('id, title, status', { count: 'exact' }).eq('owner_company_id', companyId).eq('subject_kind', 'vehicle');
    if (status !== 'all') qy = qy.eq('status', status);
    const { data: subs, count, error } = await qy.order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) { toast.error('Błąd: ' + error.message); setItems([]); setLoading(false); return; }
    setTotal(count || 0);
    const ids = (subs || []).map((s: any) => s.id);

    // ZBIORCZE ładowanie danych karty dla bieżącej strony (zamiast N+1)
    const auxMap: Record<string, any> = {};
    if (ids.length) {
      const [{ data: vehs }, { data: pol }, { data: insp }, { data: asg }, { data: lst }] = await Promise.all([
        sb.from('rental_vehicles').select('*').in('subject_id', ids),
        sb.from('rental_vehicle_policies').select('subject_id, valid_to').eq('ptype', 'OC').in('subject_id', ids).order('valid_to', { ascending: false }),
        sb.from('rental_vehicle_inspections').select('subject_id, valid_to').in('subject_id', ids).order('valid_to', { ascending: false }),
        sb.from('rental_vehicle_assignments').select('subject_id, driver_id, assigned_at').eq('status', 'active').in('subject_id', ids),
        sb.from('rental_listings').select('subject_id, kind').eq('status', 'active').in('subject_id', ids),
      ]);
      const vehBy = Object.fromEntries((vehs || []).map((v: any) => [v.subject_id, v]));
      const ocBy: Record<string, string> = {}; (pol || []).forEach((p: any) => { if (!ocBy[p.subject_id]) ocBy[p.subject_id] = p.valid_to; });
      const inBy: Record<string, string> = {}; (insp || []).forEach((p: any) => { if (!inBy[p.subject_id]) inBy[p.subject_id] = p.valid_to; });
      const asgBy = Object.fromEntries((asg || []).map((a: any) => [a.subject_id, a]));
      const lstBy: Record<string, string[]> = {}; (lst || []).forEach((l: any) => { (lstBy[l.subject_id] = lstBy[l.subject_id] || []).push(l.kind); });
      ids.forEach((id: string) => { auxMap[id] = { veh: vehBy[id] || null, ocTo: ocBy[id], inspTo: inBy[id], assignment: asgBy[id] || null, listingKinds: lstBy[id] || [] }; });
    }
    setAux(auxMap);
    setItems((subs || []).map((s: any) => ({ ...s, rental_vehicles: auxMap[s.id]?.veh || null })));
    setLoading(false);
  }, [companyId, sb, page, status]);
  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((it) => {
    const v = it.rental_vehicles || {};
    const a = aux[it.id] || {};
    const q = query.trim().toLowerCase();
    const matchQ = !q || [v.plate, v.brand, v.model, v.vin, it.title].filter(Boolean).some((x: string) => x.toLowerCase().includes(q));
    if (!matchQ) return false;
    if (vfilter === 'oc') { const d = daysLeft(a.ocTo); return d == null || d <= 30; }
    if (vfilter === 'nodriver') return !a.assignment;
    if (vfilter === 'listed') return (a.listingKinds || []).length > 0;
    if (vfilter === 'unlisted') return (a.listingKinds || []).length === 0;
    return true;
  });
  const pages = Math.ceil(total / PAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Dodaj pojazd</Button>
        <Button onClick={() => setWizardOpen(true)} className="gap-2"><FileKey className="h-4 w-4" /> Wynajmij pojazd</Button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Szukaj na stronie..." className="pl-9 w-[220px]" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="all">Status</option><option value="available">Dostępne</option><option value="maintenance">Serwis</option><option value="retired">Wycofane</option>
        </select>
        <select value={vfilter} onChange={e => setVfilter(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" title="Filtr na bieżącej stronie">
          <option value="all">Filtr</option><option value="oc">OC ≤30 dni</option><option value="nodriver">Bez kierowcy</option><option value="listed">Na giełdzie</option><option value="unlisted">Niepublikowane</option>
        </select>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : filtered.length === 0 ? <Card className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2"><Car className="h-6 w-6" />Brak pojazdów.</Card>
          : <div className="space-y-2">{filtered.map(it => <RentalVehicleCard key={it.id} companyId={companyId} companyName={companyName} item={it} aux={aux[it.id]} drivers={drivers} owners={owners} onChanged={load} />)}</div>}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Strona {page + 1} / {pages} · {total} aut</span>
          <Button variant="outline" size="icon" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      <RentalAddVehicleModal companyId={companyId} open={addOpen} onOpenChange={setAddOpen} onSaved={load} />
      <RentalWizard companyId={companyId} open={wizardOpen} onOpenChange={setWizardOpen} onCreated={load} />
    </div>
  );
}
