import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Trash2, FileText, Wrench, ImagePlus, History, Info, Upload, Loader2, GripVertical, X, Megaphone } from 'lucide-react';
import { InlineEdit } from '@/components/InlineEdit';
import { UniversalSelector } from '@/components/UniversalSelector';
import { CarBrandModelSelector } from '@/components/CarBrandModelSelector';
import { VehicleRentBlock } from '@/components/ui/VehicleRentBlock';
import { RentalExpiryBadges } from '@/components/rental/RentalExpiryBadges';
import { RentalOwnerSelector } from '@/components/rental/RentalOwnerSelector';
import { PublishDialog } from '@/components/rental/RentalMarketplace';
import { unpublishRentalListing } from '@/components/rental/rentalListing';
import { uploadRentalFile, noScroll, FUEL_TYPES } from '@/components/rental/rentalLib';

export interface VehicleItem {
  id: string; title: string; status: string;
  rental_vehicles?: any | null;
}
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString('pl-PL'); } catch { return iso; } };

export function RentalVehicleCard({ companyId, companyName, item, aux, drivers = [], owners = [], onChanged }: {
  companyId: string; companyName: string; item: VehicleItem; aux?: any; drivers?: { id: string; name: string }[]; owners?: { id: string; name: string }[]; onChanged: () => void;
}) {
  const sb = supabase as any;
  const [openCard, setOpenCard] = useState(false);
  const v = item.rental_vehicles || {};
  const assignment = aux?.assignment || null;             // dane z propsów (zbiorcze) — koniec N+1
  const listingKinds: string[] = aux?.listingKinds || [];
  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const updateVeh = async (patch: any) => { await sb.from('rental_vehicles').update(patch).eq('subject_id', item.id); };

  const assignDriver = async (driverId: string | null) => {
    await sb.from('rental_vehicle_assignments').update({ status: 'inactive', unassigned_at: new Date().toISOString() }).eq('subject_id', item.id).eq('status', 'active');
    if (driverId) {
      await sb.from('rental_vehicle_assignments').insert({ company_id: companyId, subject_id: item.id, driver_id: driverId, status: 'active', assigned_at: new Date().toISOString() });
      toast.success('Kierowca przypisany');
    } else toast.success('Usunięto przypisanie');
    onChanged();
  };

  const deleteVehicle = async () => {
    if (!confirm('Czy na pewno usunąć ten pojazd? Operacji nie można cofnąć.')) return;
    const { error } = await sb.from('rental_subjects').delete().eq('id', item.id);
    if (error) return toast.error(error.message);
    toast.success('Pojazd usunięty'); onChanged();
  };

  return (
    <Card className="overflow-hidden">
      <Collapsible open={openCard} onOpenChange={setOpenCard}>
        <div className="relative">
          {/* Kosz */}
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 text-destructive hover:bg-destructive/10 z-10"
            onClick={(e) => { e.stopPropagation(); deleteVehicle(); }}><Trash2 className="h-4 w-4" /></Button>

          <div className="p-4 space-y-3">
            {/* Rząd 1: nr rej / pojazd / flota(statycznie) / wynajem zł/tydz */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pr-10">
              <div className="min-w-[100px]"><div className="text-xs text-muted-foreground">Nr rej.:</div><div className="font-bold text-sm text-primary">{v.plate || '—'}</div></div>
              <div className="min-w-[120px]"><div className="text-xs text-muted-foreground">Pojazd:</div><div className="font-semibold text-sm">{[v.brand, v.model].filter(Boolean).join(' ') || item.title}</div></div>
              <div className="min-w-[100px]"><div className="text-xs text-muted-foreground">Flota:</div><div className="text-sm">{companyName}</div></div>
              <VehicleRentBlock value={v.rate_weekly ?? null} onChange={(val) => updateVeh({ rate_weekly: val })}
                assignedAt={assignment?.assigned_at} onAssignedAtChange={(date) => sb.from('rental_vehicle_assignments').update({ assigned_at: date.toISOString() }).eq('id', assignment?.id).then(onChanged)} userRole="fleet" />
            </div>

            {/* Rząd 2: kierowca / dokumenty(badge) / właściciel / giełda */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/50 pt-3">
              <div className="min-w-[160px]">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><ChevronDown className="h-3 w-3 text-primary" />Kierowca:</div>
                <UniversalSelector id={`rental-driver-${item.id}`} items={drivers} currentValue={assignment?.driver_id || null}
                  placeholder={assignment ? (drivers.find(d => d.id === assignment.driver_id)?.name || 'Przypisany') : 'Brak'}
                  searchPlaceholder="Szukaj kierowcy..." noResultsText="Brak kierowców" showSearch showAddNew addNewButtonText="Dodaj kierowcę" allowClear
                  onSelect={(it) => assignDriver(it?.id || null)} onAddNew={() => setAddDriverOpen(true)} />
              </div>
              <div className="min-w-[200px]"><div className="text-xs text-muted-foreground">Dokumenty:</div><RentalExpiryBadges companyId={companyId} subjectId={item.id} ocTo={aux?.ocTo} inspTo={aux?.inspTo} termTo={v.contract_termination_date} onSaved={onChanged} /></div>
              <div className="min-w-[140px]">
                <div className="text-xs text-muted-foreground">Właściciel:</div>
                <RentalOwnerSelector companyId={companyId} subjectId={item.id} currentOwnerId={v.owner_id} owners={owners} onChange={onChanged} />
              </div>
              {v.owner_id && (
                <div className="min-w-[120px]">
                  <div className="text-xs text-muted-foreground">Opłata właściciela:</div>
                  <div className="flex items-center gap-1"><InlineEdit value={v.owner_rental_fee?.toString() || '0'} onSave={async (val) => { await updateVeh({ owner_rental_fee: parseFloat(val.replace(',', '.')) || 0 }); onChanged(); }} /><span className="text-xs text-muted-foreground">zł/tydz.</span></div>
                </div>
              )}
              <div className="min-w-[140px]">
                <div className="text-xs text-muted-foreground">Giełda:</div>
                {listingKinds.length > 0
                  ? <div className="flex items-center gap-1.5 text-xs"><span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5">Na giełdzie</span><Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={async (e) => { e.stopPropagation(); await unpublishRentalListing(item.id); toast.success('Wycofano z giełdy'); onChanged(); }}>Wycofaj</Button></div>
                  : <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setPublishOpen(true); }}><Megaphone className="h-3 w-3 mr-1" />Wystaw</Button>}
              </div>
            </div>
          </div>

          <CollapsibleTrigger className="w-full flex items-center justify-center py-1 border-t hover:bg-accent/30">
            {openCard ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4 border-t pt-3">
            <Tabs defaultValue="info">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="info"><Info className="h-4 w-4 mr-1.5" />Info</TabsTrigger>
                <TabsTrigger value="docs"><FileText className="h-4 w-4 mr-1.5" />Dokumenty</TabsTrigger>
                <TabsTrigger value="history"><History className="h-4 w-4 mr-1.5" />Historia najmu</TabsTrigger>
                <TabsTrigger value="service"><Wrench className="h-4 w-4 mr-1.5" />Serwis</TabsTrigger>
                <TabsTrigger value="photos"><ImagePlus className="h-4 w-4 mr-1.5" />Zdjęcia</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="pt-3"><InfoTab sb={sb} subjectId={item.id} v={v} onChanged={onChanged} /></TabsContent>
              <TabsContent value="docs" className="pt-3"><DocsTab sb={sb} companyId={companyId} subjectId={item.id} /></TabsContent>
              <TabsContent value="history" className="pt-3"><HistoryTab sb={sb} subjectId={item.id} /></TabsContent>
              <TabsContent value="service" className="pt-3"><ServiceTab sb={sb} companyId={companyId} subjectId={item.id} /></TabsContent>
              <TabsContent value="photos" className="pt-3"><PhotosTab sb={sb} subjectId={item.id} initial={v.photos || []} /></TabsContent>
            </Tabs>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {addDriverOpen && <AddDriver sb={sb} companyId={companyId} onClose={() => setAddDriverOpen(false)} onSaved={() => { setAddDriverOpen(false); onChanged(); }} />}
      {publishOpen && <PublishDialog sb={sb} companyId={companyId} row={{ id: item.id, title: item.title, veh: v }} tiers={[]} onClose={() => setPublishOpen(false)} onDone={() => { setPublishOpen(false); onChanged(); }} />}
    </Card>
  );
}

function AddDriver({ sb, companyId, onClose, onSaved }: any) {
  const [f, setF] = useState({ first_name: '', last_name: '', phone: '', email: '' });
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.first_name.trim() && !f.last_name.trim()) { toast.error('Podaj imię/nazwisko'); return; }
    const { error } = await sb.from('rental_drivers').insert({ company_id: companyId, ...f });
    if (error) return toast.error(error.message);
    toast.success('Kierowca dodany'); onSaved();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nowy kierowca</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Imię</Label><Input value={f.first_name} onChange={e => set('first_name', e.target.value)} /></div>
          <div className="space-y-1"><Label>Nazwisko</Label><Input value={f.last_name} onChange={e => set('last_name', e.target.value)} /></div>
          <div className="space-y-1"><Label>Telefon</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="space-y-1"><Label>E-mail</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={onClose}>Anuluj</Button><Button onClick={save}>Zapisz</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function InfoTab({ sb, subjectId, v, onChanged }: any) {
  const save = async (field: string, val: any) => { await sb.from('rental_vehicles').update({ [field]: val }).eq('subject_id', subjectId); onChanged(); };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1"><Label>Nr rejestracyjny</Label><InlineEdit value={v.plate || ''} onSave={async (val) => save('plate', val.toUpperCase())} placeholder="Wpisz nr rej." /></div>
      <div className="space-y-1"><Label>VIN</Label><InlineEdit value={v.vin || ''} onSave={async (val) => save('vin', val.toUpperCase())} placeholder="Wpisz VIN" /></div>
      <div className="sm:col-span-2 grid grid-cols-2 gap-4">
        <CarBrandModelSelector brand={v.brand || ''} model={v.model || ''} onBrandChange={(b) => save('brand', b)} onModelChange={(m) => save('model', m)} />
      </div>
      <div className="space-y-1"><Label>Rok</Label><InlineEdit value={v.year?.toString() || ''} onSave={async (val) => save('year', val ? parseInt(val, 10) : null)} placeholder="Rok" /></div>
      <div className="space-y-1"><Label>Kolor</Label><InlineEdit value={v.color || ''} onSave={async (val) => save('color', val)} placeholder="Kolor" /></div>
      <div className="space-y-1"><Label>Pojemność (cm³)</Label><InlineEdit value={v.engine_capacity_cm3?.toString() || ''} onSave={async (val) => save('engine_capacity_cm3', val ? parseInt(val, 10) : null)} /></div>
      <div className="space-y-1"><Label>Moc (KM)</Label><InlineEdit value={v.power_hp?.toString() || ''} onSave={async (val) => save('power_hp', val ? parseInt(val, 10) : null)} /></div>
      <div className="space-y-1"><Label>Rodzaj paliwa</Label>
        <Select value={v.fuel || ''} onValueChange={(val) => save('fuel', val)}>
          <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
          <SelectContent>{FUEL_TYPES.map(f => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}

function DocsTab({ sb, companyId, subjectId }: any) {
  const [docs, setDocs] = useState<any[]>([]);
  const [type, setType] = useState('Inny dokument');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data } = await sb.from('rental_vehicle_documents').select('*').eq('subject_id', subjectId).order('created_at', { ascending: false }); setDocs(data || []); }, [sb, subjectId]);
  useEffect(() => { load(); }, [load]);
  const upload = async (file?: File) => {
    if (!file) return; setBusy(true);
    try { const url = await uploadRentalFile(subjectId, file); await sb.from('rental_vehicle_documents').insert({ company_id: companyId, subject_id: subjectId, doc_type: type, file_url: url, file_name: file.name }); toast.success('Dokument dodany'); load(); }
    catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
        <div className="space-y-1 md:col-span-2"><Label className="text-xs">Typ dokumentu</Label><Input value={type} onChange={e => setType(e.target.value)} placeholder="Typ dokumentu" /></div>
        <label className="inline-flex"><Button asChild variant="outline" disabled={busy}><span>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-2" />Dodaj</>}</span></Button><input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={e => upload(e.target.files?.[0])} /></label>
      </div>
      {docs.length === 0 ? <p className="text-sm text-muted-foreground">Brak dokumentów.</p> : (
        <ul className="list-disc pl-5 text-sm space-y-1">{docs.map(d => <li key={d.id}><a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{d.doc_type} • {new Date(d.created_at).toLocaleDateString('pl-PL')}</a></li>)}</ul>
      )}
    </div>
  );
}

function HistoryTab({ sb, subjectId }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { (async () => { const { data } = await sb.from('bookings').select('booking_number, renter_name, period_start, period_end, status').eq('subject_id', subjectId).order('period_start', { ascending: false }); setRows(data || []); })(); }, [sb, subjectId]);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Brak historii najmu.</p>;
  return <ul className="space-y-1 text-sm">{rows.map((r, i) => <li key={i} className="flex items-center gap-2 border-b py-1"><span className="font-mono text-xs">{r.booking_number}</span><span className="font-medium">{r.renter_name}</span><span className="text-muted-foreground flex-1">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</span><span className="rounded-full bg-muted text-xs px-2 py-0.5">{r.status}</span></li>)}</ul>;
}

function ServiceTab({ sb, companyId, subjectId }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [f, setF] = useState({ service_type: '', service_date: '', odometer: '', cost: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const set = (k: string, val: string) => setF(s => ({ ...s, [k]: val }));
  const loadTypes = useCallback(async () => { const { data } = await sb.from('rental_service_types').select('*').eq('company_id', companyId).order('name'); setTypes(data || []); }, [sb, companyId]);
  const load = useCallback(async () => { const { data } = await sb.from('rental_vehicle_services').select('*').eq('subject_id', subjectId).order('service_date', { ascending: false }); setRows(data || []); }, [sb, subjectId]);
  useEffect(() => { load(); loadTypes(); }, [load, loadTypes]);
  const addType = async () => { const name = prompt('Nazwa nowego typu serwisu:'); if (!name) return; await sb.from('rental_service_types').insert({ company_id: companyId, name }); loadTypes(); };
  const add = async () => {
    if (!f.service_type || !f.service_date) { toast.error('Podaj typ i datę'); return; }
    let fileUrl: string | null = null;
    if (file) { try { fileUrl = await uploadRentalFile(subjectId, file); } catch (e: any) { toast.error(e.message); return; } }
    await sb.from('rental_vehicle_services').insert({ company_id: companyId, subject_id: subjectId, service_type: f.service_type, service_date: f.service_date, odometer: f.odometer ? parseInt(f.odometer, 10) : null, cost: f.cost ? parseFloat(f.cost.replace(',', '.')) : null, description: f.description || null, provider: f.description || null, file_url: fileUrl });
    setF({ service_type: '', service_date: '', odometer: '', cost: '', description: '' }); setFile(null); toast.success('Wpis dodany'); load();
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
        <div className="space-y-1"><Label className="text-xs">Typ serwisu</Label>
          <Select value={f.service_type} onValueChange={v => set('service_type', v)}><SelectTrigger><SelectValue placeholder="Wybierz typ" /></SelectTrigger>
            <SelectContent>{types.map((t: any) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <Button variant="outline" onClick={addType}>Dodaj typ serwisu</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
        <div className="space-y-1"><Label className="text-xs">Data</Label><Input type="date" value={f.service_date} onChange={e => set('service_date', e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Przebieg</Label><Input type="text" inputMode="numeric" onWheel={noScroll} value={f.odometer} onChange={e => set('odometer', e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Koszt</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.cost} onChange={e => set('cost', e.target.value)} /></div>
        <label className="inline-flex"><Button asChild variant="outline"><span><Upload className="h-4 w-4 mr-2" />{file ? 'Plik ✓' : 'Plik'}</span></Button><input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      </div>
      <div className="flex gap-2"><Input value={f.description} onChange={e => set('description', e.target.value)} placeholder="Opis / warsztat" /><Button onClick={add}>Zapisz wpis</Button></div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Brak wpisów serwisowych.</p> : (
        <ul className="space-y-1 text-sm">{rows.map(r => <li key={r.id} className="border-b py-1"><span className="font-medium">{r.service_type} • {r.service_date ? fmtDate(r.service_date) : ''}</span><span className="text-muted-foreground"> · Przebieg: {r.odometer ?? '—'} km · Koszt: {r.cost ?? '—'} zł {r.description ? `· ${r.description}` : ''}</span> {r.file_url && <a href={r.file_url} target="_blank" rel="noreferrer" className="text-primary text-xs">plik</a>}</li>)}</ul>
      )}
    </div>
  );
}

function PhotosTab({ sb, subjectId, initial }: any) {
  const [photos, setPhotos] = useState<string[]>(initial || []);
  const [busy, setBusy] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const save = async (next: string[]) => { setPhotos(next); await sb.from('rental_vehicles').update({ photos: next }).eq('subject_id', subjectId); };
  const onUpload = async (files: FileList | null) => {
    if (!files) return; setBusy(true);
    try { const urls: string[] = []; for (let i = 0; i < files.length; i++) urls.push(await uploadRentalFile(subjectId, files[i])); await save([...photos, ...urls]); toast.success('Zdjęcia dodane'); }
    catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };
  const remove = (i: number) => save(photos.filter((_, j) => j !== i));
  const onDrop = (target: number) => { if (dragIdx === null || dragIdx === target) return; const next = [...photos]; const [m] = next.splice(dragIdx, 1); next.splice(target, 0, m); setDragIdx(null); save(next); };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Przeciągnij, aby zmienić kolejność. Zdjęcie nr 1 = główne (na giełdzie).</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((url, i) => (
          <div key={i} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}
            className={`relative aspect-square rounded-lg border-2 overflow-hidden cursor-move ${dragIdx === i ? 'opacity-50' : ''}`}>
            <img src={url} alt="" className="w-full h-full object-cover" />
            <div className="absolute top-1 left-1 bg-background/90 px-1.5 py-0.5 rounded text-xs font-bold flex items-center gap-1"><GripVertical className="h-3 w-3" />{i + 1}</div>
            <button onClick={() => remove(i)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"><X className="h-3 w-3" /></button>
          </div>
        ))}
        <label className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-accent/50">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground mt-1">Dodaj</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={e => onUpload(e.target.files)} />
        </label>
      </div>
    </div>
  );
}
