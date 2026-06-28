import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Car, Loader2, Search, ImagePlus, X } from 'lucide-react';
import { useVehicleLookup } from '@/hooks/useVehicleLookup';
import { RentalBrandModel } from '@/components/rental/RentalBrandModel';
import { BODY_TYPES, FUEL_TYPES, uploadRentalFile, noScroll } from '@/components/rental/rentalLib';

interface Props { companyId: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void; }

const empty = {
  plate: '', vin: '', brand: '', model: '', bodyType: '', fuel: '', year: '', color: '',
  engine: '', power: '', rate_daily: '', rate_weekly: '', rate_monthly: '', deposit: '', description: '',
  owner_name: '', insp_to: '', oc_to: '', oc_premium: '', has_ac: false as boolean, ac_to: '', ac_premium: '',
};
const toInt = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null; };
const toNum = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };

export function RentalAddVehicleModal({ companyId, open, onOpenChange, onSaved }: Props) {
  const sb = supabase as any;
  const [userId, setUserId] = useState<string | undefined>();
  const [form, setForm] = useState({ ...empty });
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { credits, loading: lookupLoading, checkRegistration, checkVin } = useVehicleLookup(userId);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id)); }, []);

  const applyData = (d: any) => {
    if (!d) return;
    const fuelMatch = FUEL_TYPES.find(f => (d.fuel_type || '').toLowerCase().includes(f.v))?.v;
    setForm(f => ({
      ...f,
      brand: d.make || f.brand,
      model: d.model || f.model,
      color: d.color || f.color,
      year: d.registration_year ? String(d.registration_year) : f.year,
      vin: d.vin || f.vin,
      fuel: fuelMatch || f.fuel,
      bodyType: BODY_TYPES.find(b => (d.body_style || '').toLowerCase().includes(b)) || f.bodyType,
      engine: (d.engine_size || '').replace(/\D/g, '') || f.engine,
      power: (d.engine_power_kw || '').replace(/\D/g, '') || f.power,
    }));
  };

  const doPlate = async () => {
    if (!form.plate.trim()) { toast.error('Wpisz nr rejestracyjny'); return; }
    if ((credits?.remaining_credits ?? 0) < 1) { toast.error('Brak kredytów na wyszukiwanie'); return; }
    const d = await checkRegistration(form.plate.trim().toUpperCase());
    applyData(d);
  };
  const doVin = async () => {
    if (!form.vin.trim()) { toast.error('Wpisz VIN'); return; }
    if ((credits?.remaining_credits ?? 0) < 1) { toast.error('Brak kredytów na wyszukiwanie'); return; }
    const d = await checkVin(form.vin.trim().toUpperCase());
    applyData(d);
  };

  const addPhotos = (files: FileList | null) => {
    if (files) setPhotos(p => [...p, ...Array.from(files)]);
  };

  const handleSubmit = async () => {
    if (!form.brand.trim()) { toast.error('Podaj markę'); return; }
    if (!form.model.trim()) { toast.error('Podaj model'); return; }
    if (!form.engine.trim()) { toast.error('Pojemność jest wymagana'); return; }
    if (!form.power.trim()) { toast.error('Moc jest wymagana'); return; }
    if (!form.fuel) { toast.error('Paliwo jest wymagane'); return; }
    setSaving(true);
    try {
      const title = `${form.brand.trim()} ${form.model.trim()}`.trim();
      const { data: subj, error: e1 } = await sb.from('rental_subjects')
        .insert({
          owner_company_id: companyId, subject_kind: 'vehicle', title, status: 'available',
          attributes: { description: form.description.trim() || null, body_type: form.bodyType || null },
        })
        .select('id').single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from('rental_vehicles').insert({
        subject_id: subj.id,
        brand: form.brand.trim(), model: form.model.trim(), year: toInt(form.year),
        plate: form.plate.trim() || null, vin: form.vin.trim() || null, color: form.color.trim() || null,
        fuel: form.fuel, engine_capacity_cm3: toInt(form.engine), power_hp: toInt(form.power),
        rate_daily: toNum(form.rate_daily), rate_weekly: toNum(form.rate_weekly),
        rate_monthly: toNum(form.rate_monthly), deposit: toNum(form.deposit),
      });
      if (e2) throw e2;

      // Właściciel (opcjonalnie) — utwórz i podepnij
      if (form.owner_name.trim()) {
        const { data: own } = await sb.from('rental_vehicle_owners')
          .insert({ company_id: companyId, name: form.owner_name.trim() }).select('id').single();
        if (own) await sb.from('rental_vehicles').update({ owner_id: own.id }).eq('subject_id', subj.id);
      }
      // OC / AC / Przegląd (opcjonalnie)
      if (form.oc_to) await sb.from('rental_vehicle_policies').insert({ company_id: companyId, subject_id: subj.id, ptype: 'OC', valid_from: new Date().toISOString().slice(0, 10), valid_to: form.oc_to, premium: form.oc_premium ? toNum(form.oc_premium) : null });
      if (form.has_ac && form.ac_to) await sb.from('rental_vehicle_policies').insert({ company_id: companyId, subject_id: subj.id, ptype: 'AC', valid_from: new Date().toISOString().slice(0, 10), valid_to: form.ac_to, premium: form.ac_premium ? toNum(form.ac_premium) : null });
      if (form.insp_to) await sb.from('rental_vehicle_inspections').insert({ company_id: companyId, subject_id: subj.id, inspection_date: new Date().toISOString().slice(0, 10), valid_to: form.insp_to, result: 'pozytywny' });

      // Zdjęcia
      for (let i = 0; i < photos.length; i++) {
        const url = await uploadRentalFile(subj.id, photos[i]);
        await sb.from('rental_vehicle_photos').insert({
          company_id: companyId, subject_id: subj.id, file_url: url, sort_order: i,
        });
      }

      toast.success('Pojazd dodany');
      setForm({ ...empty }); setPhotos([]);
      onOpenChange(false); onSaved();
    } catch (e: any) {
      toast.error('Nie udało się dodać pojazdu: ' + (e.message || e));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Car className="h-5 w-5" /> Nowy pojazd</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Wyszukiwarka */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              Wyszukiwanie danych {credits != null && <span className="ml-1">({credits.remaining_credits} kredytów)</span>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nr rejestracyjny</Label>
                <div className="flex gap-2">
                  <Input value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} placeholder="np. WX12345" />
                  <Button type="button" variant="outline" size="icon" onClick={doPlate} disabled={lookupLoading} title="Pobierz dane">
                    {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>VIN</Label>
                <div className="flex gap-2">
                  <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} />
                  <Button type="button" variant="outline" size="icon" onClick={doVin} disabled={lookupLoading} title="Pobierz dane po VIN">
                    {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Pojazd */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">Pojazd</div>
            <div className="grid grid-cols-2 gap-4">
              <RentalBrandModel brand={form.brand} model={form.model} onBrand={v => set('brand', v)} onModel={v => set('model', v)} />
              <div className="space-y-1.5">
                <Label>Rodzaj nadwozia</Label>
                <Select value={form.bodyType} onValueChange={v => set('bodyType', v)}>
                  <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
                  <SelectContent>{BODY_TYPES.map(b => <SelectItem key={b} value={b} className="capitalize">{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rok</Label>
                <Input type="text" inputMode="numeric" onWheel={noScroll} value={form.year} onChange={e => set('year', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Kolor</Label>
                <Input value={form.color} onChange={e => set('color', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Dane techniczne */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">Dane techniczne</div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Pojemność (cm³) *</Label>
                <Input type="text" inputMode="numeric" onWheel={noScroll} value={form.engine} onChange={e => set('engine', e.target.value)} placeholder="1598" />
              </div>
              <div className="space-y-1.5">
                <Label>Moc (KM) *</Label>
                <Input type="text" inputMode="numeric" onWheel={noScroll} value={form.power} onChange={e => set('power', e.target.value)} placeholder="132" />
              </div>
              <div className="space-y-1.5">
                <Label>Paliwo *</Label>
                <Select value={form.fuel} onValueChange={v => set('fuel', v)}>
                  <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
                  <SelectContent>{FUEL_TYPES.map(f => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Stawki + kaucja */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">Stawki domyślne (zł) + kaucja</div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1.5"><Label>Dzienna</Label>
                <Input type="text" inputMode="decimal" onWheel={noScroll} value={form.rate_daily} onChange={e => set('rate_daily', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tygodniowa</Label>
                <Input type="text" inputMode="decimal" onWheel={noScroll} value={form.rate_weekly} onChange={e => set('rate_weekly', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Miesięczna</Label>
                <Input type="text" inputMode="decimal" onWheel={noScroll} value={form.rate_monthly} onChange={e => set('rate_monthly', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Kaucja</Label>
                <Input type="text" inputMode="decimal" onWheel={noScroll} value={form.deposit} onChange={e => set('deposit', e.target.value)} /></div>
            </div>
          </div>

          {/* Opis */}
          <div className="space-y-1.5">
            <Label>Opis</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Wyposażenie, uwagi…" />
          </div>

          {/* Właściciel + Dokumenty (OC/Przegląd/AC) */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">Właściciel i dokumenty</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2"><Label>Właściciel / Flota (nazwa)</Label>
                <Input value={form.owner_name} onChange={e => set('owner_name', e.target.value)} placeholder="np. Jan Kowalski / RIDO Sp. z o.o." /></div>
              <div className="space-y-1.5"><Label>Przegląd ważny do</Label><Input type="date" value={form.insp_to} onChange={e => set('insp_to', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Polisa OC ważna do</Label><Input type="date" value={form.oc_to} onChange={e => set('oc_to', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Składka OC (zł/rok)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={form.oc_premium} onChange={e => set('oc_premium', e.target.value)} /></div>
              <label className="flex items-center gap-2 col-span-2 text-sm">
                <input type="checkbox" checked={form.has_ac} onChange={e => setForm(f => ({ ...f, has_ac: e.target.checked }))} /> Pojazd posiada ubezpieczenie AC
              </label>
              {form.has_ac && <>
                <div className="space-y-1.5"><Label>Polisa AC ważna do</Label><Input type="date" value={form.ac_to} onChange={e => set('ac_to', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Składka AC (zł/rok)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={form.ac_premium} onChange={e => set('ac_premium', e.target.value)} /></div>
              </>}
            </div>
          </div>

          {/* Zdjęcia */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">Zdjęcia auta</div>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border">
                  <img src={URL.createObjectURL(p)} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setPhotos(ph => ph.filter((_, j) => j !== i))}
                    className="absolute top-0 right-0 bg-black/60 text-white rounded-bl p-0.5"><X className="h-3 w-3" /></button>
                </div>
              ))}
              <label className="h-16 w-16 rounded-lg border border-dashed flex items-center justify-center cursor-pointer hover:bg-accent/50">
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Zapisz
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
