import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Loader2, Car } from 'lucide-react';

interface Props { companyId: string; }

interface VehicleRow {
  id: string;
  title: string;
  status: string;
  rental_vehicles?: {
    brand?: string; model?: string; plate?: string; vin?: string; year?: number;
    color?: string; fuel?: string; engine_capacity_cm3?: number; power_hp?: number;
    rate_daily?: number; rate_weekly?: number; rate_monthly?: number; deposit?: number;
  } | null;
}

// Podpowiedzi marek (datalist) — wpis ręczny modelu/marki spoza listy dozwolony.
const BRANDS = ['Toyota', 'Volkswagen', 'BMW', 'Audi', 'Mercedes-Benz', 'Škoda', 'Ford',
  'Opel', 'Renault', 'Peugeot', 'Hyundai', 'Kia', 'Nissan', 'Honda', 'Mazda', 'Volvo',
  'Fiat', 'Citroën', 'Dacia', 'Tesla', 'Seat', 'Suzuki', 'Mitsubishi', 'Jeep', 'Land Rover'];

const FUELS = [
  { v: 'benzyna', l: 'Benzyna' }, { v: 'diesel', l: 'Diesel' }, { v: 'lpg', l: 'LPG' },
  { v: 'hybryda', l: 'Hybryda' }, { v: 'elektryczny', l: 'Elektryczny' }, { v: 'inne', l: 'Inne' },
];

const empty = {
  title: '', brand: '', model: '', year: '', plate: '', vin: '', color: '',
  fuel: '', engine: '', power: '',
  rate_daily: '', rate_weekly: '', rate_monthly: '', deposit: '',
};

// Blokuje zmianę wartości pól liczbowych przy scrollu touchpada/myszy.
const noScroll = (e: React.WheelEvent<HTMLInputElement>) => (e.currentTarget as HTMLInputElement).blur();
const toInt = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null; };
const toNum = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };

export function RentalSubjectsList({ companyId }: Props) {
  const sb = supabase as any;
  const [items, setItems] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const set = (k: keyof typeof empty, v: string) => setForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const { data: subs, error } = await sb
      .from('rental_subjects')
      .select('id, title, status')
      .eq('owner_company_id', companyId)
      .eq('subject_kind', 'vehicle')
      .order('created_at', { ascending: false });
    if (error) { toast.error('Błąd wczytywania pojazdów: ' + error.message); setItems([]); setLoading(false); return; }
    const ids = (subs || []).map((s: any) => s.id);
    let vehById: Record<string, any> = {};
    if (ids.length) {
      const { data: vehs } = await sb
        .from('rental_vehicles')
        .select('subject_id, brand, model, plate, vin, year, color, fuel, engine_capacity_cm3, power_hp, rate_daily, rate_weekly, rate_monthly, deposit')
        .in('subject_id', ids);
      vehById = Object.fromEntries((vehs || []).map((v: any) => [v.subject_id, v]));
    }
    setItems((subs || []).map((s: any) => ({ ...s, rental_vehicles: vehById[s.id] || null })) as VehicleRow[]);
    setLoading(false);
  }, [companyId, sb]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    // Walidacja pól obowiązkowych
    if (!form.brand.trim()) { toast.error('Podaj markę'); return; }
    if (!form.model.trim()) { toast.error('Podaj model'); return; }
    if (!form.engine.trim()) { toast.error('Pojemność jest wymagana'); return; }
    if (!form.power.trim()) { toast.error('Moc jest wymagana'); return; }
    if (!form.fuel) { toast.error('Rodzaj paliwa jest wymagany'); return; }
    setSaving(true);
    try {
      const title = form.title.trim() || `${form.brand.trim()} ${form.model.trim()}`.trim();
      const { data: subj, error: e1 } = await sb
        .from('rental_subjects')
        .insert({ owner_company_id: companyId, subject_kind: 'vehicle', title, status: 'available' })
        .select('id')
        .single();
      if (e1) throw e1;
      const { error: e2 } = await sb.from('rental_vehicles').insert({
        subject_id: subj.id,
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: toInt(form.year),
        plate: form.plate.trim() || null,
        vin: form.vin.trim() || null,
        color: form.color.trim() || null,
        fuel: form.fuel,
        engine_capacity_cm3: toInt(form.engine),
        power_hp: toInt(form.power),
        rate_daily: toNum(form.rate_daily),
        rate_weekly: toNum(form.rate_weekly),
        rate_monthly: toNum(form.rate_monthly),
        deposit: toNum(form.deposit),
      });
      if (e2) throw e2;
      toast.success('Pojazd dodany');
      setForm({ ...empty });
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error('Nie udało się dodać pojazdu: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const rateLabel = (v?: VehicleRow['rental_vehicles']) => {
    if (!v) return '—';
    const parts: string[] = [];
    if (v.rate_daily != null) parts.push(`${v.rate_daily}/d`);
    if (v.rate_weekly != null) parts.push(`${v.rate_weekly}/t`);
    if (v.rate_monthly != null) parts.push(`${v.rate_monthly}/mc`);
    return parts.length ? parts.join(' · ') : '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Car className="h-5 w-5 text-primary" /> Pojazdy na wynajem
        </h2>
        <div className="flex-1" />
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Dodaj auto
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Brak pojazdów. Kliknij „Dodaj auto”.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pojazd</TableHead>
                  <TableHead>Nr rej.</TableHead>
                  <TableHead>Paliwo</TableHead>
                  <TableHead>Poj./Moc</TableHead>
                  <TableHead>Stawki</TableHead>
                  <TableHead>Kaucja</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => {
                  const v = s.rental_vehicles;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {[v?.brand, v?.model].filter(Boolean).join(' ') || s.title}
                        {v?.year ? <span className="text-muted-foreground"> · {v.year}</span> : null}
                      </TableCell>
                      <TableCell>{v?.plate || '—'}</TableCell>
                      <TableCell className="capitalize">{v?.fuel || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {v?.engine_capacity_cm3 ? `${v.engine_capacity_cm3} cm³` : '—'}
                        {v?.power_hp ? ` · ${v.power_hp} KM` : ''}
                      </TableCell>
                      <TableCell className="text-xs">{rateLabel(v)}</TableCell>
                      <TableCell>{v?.deposit != null ? `${v.deposit} zł` : '—'}</TableCell>
                      <TableCell>
                        <span className="inline-block rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                          {s.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Car className="h-5 w-5" /> Nowy pojazd</DialogTitle>
          </DialogHeader>

          <datalist id="rental-brands">
            {BRANDS.map(b => <option key={b} value={b} />)}
          </datalist>

          <div className="space-y-5">
            {/* Identyfikacja */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Pojazd</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Marka *</Label>
                  <Input list="rental-brands" value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="np. Toyota" />
                </div>
                <div className="space-y-1.5">
                  <Label>Model *</Label>
                  <Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="dowolny, np. Seria 3 GT" />
                </div>
                <div className="space-y-1.5">
                  <Label>Rok</Label>
                  <Input type="text" inputMode="numeric" onWheel={noScroll} value={form.year} onChange={e => set('year', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Kolor</Label>
                  <Input value={form.color} onChange={e => set('color', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nr rejestracyjny</Label>
                  <Input value={form.plate} onChange={e => set('plate', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>VIN</Label>
                  <Input value={form.vin} onChange={e => set('vin', e.target.value)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Nazwa (opcjonalnie — domyślnie marka + model)</Label>
                  <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="np. Toyota Corolla biała #1" />
                </div>
              </div>
            </div>

            {/* Dane techniczne (wymagane) */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Dane techniczne</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Pojemność (cm³) *</Label>
                  <Input type="text" inputMode="numeric" onWheel={noScroll} value={form.engine} onChange={e => set('engine', e.target.value)} placeholder="np. 1598" />
                </div>
                <div className="space-y-1.5">
                  <Label>Moc (KM) *</Label>
                  <Input type="text" inputMode="numeric" onWheel={noScroll} value={form.power} onChange={e => set('power', e.target.value)} placeholder="np. 132" />
                </div>
                <div className="space-y-1.5">
                  <Label>Paliwo *</Label>
                  <Select value={form.fuel} onValueChange={(v) => set('fuel', v)}>
                    <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
                    <SelectContent>
                      {FUELS.map(f => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Stawki + kaucja */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Stawki domyślne (zł) + kaucja</div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label>Dzienna</Label>
                  <Input type="text" inputMode="decimal" onWheel={noScroll} value={form.rate_daily} onChange={e => set('rate_daily', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tygodniowa</Label>
                  <Input type="text" inputMode="decimal" onWheel={noScroll} value={form.rate_weekly} onChange={e => set('rate_weekly', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Miesięczna</Label>
                  <Input type="text" inputMode="decimal" onWheel={noScroll} value={form.rate_monthly} onChange={e => set('rate_monthly', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Kaucja</Label>
                  <Input type="text" inputMode="decimal" onWheel={noScroll} value={form.deposit} onChange={e => set('deposit', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Anuluj</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Zapisz
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
