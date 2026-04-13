import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, Search, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVehicleLookup } from '@/hooks/useVehicleLookup';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const fuelTypes = ['Benzyna', 'Diesel', 'LPG', 'Elektryczny', 'Hybryda', 'Benzyna+LPG', 'CNG'];

interface Props {
  vehicle: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkshopVehicleEditDialog({ vehicle, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    brand: '',
    model: '',
    plate: '',
    vin: '',
    year: '',
    engine_capacity_cm3: '',
    engine_power_kw: '',
    fuel_type: '',
    color: '',
  });

  const { credits, loading: lookupLoading, checkRegistration, checkVin } = useVehicleLookup(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (vehicle && open) {
      setForm({
        brand: vehicle.brand || '',
        model: vehicle.model || '',
        plate: vehicle.plate || '',
        vin: vehicle.vin || '',
        year: vehicle.year ? String(vehicle.year) : '',
        engine_capacity_cm3: vehicle.engine_capacity_cm3 ? String(vehicle.engine_capacity_cm3) : '',
        engine_power_kw: vehicle.engine_power_kw ? String(vehicle.engine_power_kw) : '',
        fuel_type: vehicle.fuel_type || '',
        color: vehicle.color || '',
      });
    }
  }, [vehicle, open]);

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const normalizeFuelType = (value?: string) => {
    const normalized = (value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('diesel') || normalized === 'olej napędowy') return 'Diesel';
    if (normalized.includes('benz') || normalized.includes('petrol')) return 'Benzyna';
    if (normalized.includes('lpg')) return 'LPG';
    if (normalized.includes('hyb')) return 'Hybryda';
    if (normalized.includes('elek')) return 'Elektryczny';
    if (normalized.includes('cng')) return 'CNG';
    return value;
  };

  const extractDigits = (value?: string | number) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    const match = text.match(/\d+/g);
    return match ? match.join('') : '';
  };

  const applyLookup = (data: any) => {
    if (data.make) set('brand', data.make);
    if (data.model) set('model', data.model.replace(/\s+\d+\.\d+(\s+\S+)*$/, '').trim());
    if (data.registration_year) set('year', String(data.registration_year));
    if (data.vin) set('vin', String(data.vin).toUpperCase());
    if (data.color) set('color', data.color);
    const normalizedFuel = normalizeFuelType(data.fuel_type);
    if (normalizedFuel) set('fuel_type', normalizedFuel);
    const capacity = extractDigits(data.engine_size);
    if (capacity) set('engine_capacity_cm3', capacity);
    const power = extractDigits(data.engine_power_kw || data.power_kw || data.engine_power);
    if (power) set('engine_power_kw', power);
  };

  const handlePlateSearch = async () => {
    if (!form.plate.trim()) return;
    const data = await checkRegistration(form.plate.trim());
    if (data) applyLookup(data);
  };

  const handleVinSearch = async () => {
    if (!form.vin.trim()) return;
    const data = await checkVin(form.vin.trim());
    if (data) applyLookup(data);
  };

  const handleSave = async () => {
    if (!vehicle?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('workshop_vehicles')
        .update({
          brand: form.brand || null,
          model: form.model || null,
          plate: form.plate || null,
          vin: form.vin || null,
          year: form.year ? parseInt(form.year, 10) : null,
          engine_capacity_cm3: form.engine_capacity_cm3 ? parseInt(form.engine_capacity_cm3, 10) : null,
          engine_power_kw: form.engine_power_kw ? parseInt(form.engine_power_kw, 10) : null,
          fuel_type: form.fuel_type || null,
          color: form.color || null,
        })
        .eq('id', vehicle.id);
      if (error) throw error;
      toast.success('Dane pojazdu zapisane');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['workshopOrders'] }),
        qc.invalidateQueries({ queryKey: ['workshopVehicles'] }),
      ]);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const missingFields = [];
  if (!form.vin) missingFields.push('VIN');
  if (!form.brand) missingFields.push('Marka');
  if (!form.model) missingFields.push('Model');
  if (!form.engine_power_kw) missingFields.push('Moc silnika');
  if (!form.engine_capacity_cm3) missingFields.push('Pojemność');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Edycja pojazdu
          </DialogTitle>
        </DialogHeader>

        {missingFields.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            <strong>Uzupełnij brakujące dane:</strong> {missingFields.join(', ')}
            <p className="text-xs mt-1 text-amber-600">Dane te są potrzebne do prawidłowego wyszukiwania części.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nr rejestracyjny</Label>
            <div className="flex gap-1">
              <Input value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} placeholder="WW12345" />
              <Button variant="outline" size="icon" onClick={handlePlateSearch} disabled={lookupLoading || !form.plate.trim()} title="Szukaj po nr rej">
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Rok produkcji</Label>
            <Input value={form.year} onChange={e => set('year', e.target.value)} placeholder="2020" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">VIN</Label>
            <div className="flex gap-1">
              <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="WVWZZZ3CZWE123456" className={!form.vin ? 'border-amber-400 ring-1 ring-amber-300' : ''} />
              <Button variant="outline" size="icon" onClick={handleVinSearch} disabled={lookupLoading || !form.vin.trim()} title="Szukaj po VIN">
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Marka</Label>
            <Input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="BMW" className={!form.brand ? 'border-amber-400 ring-1 ring-amber-300' : ''} />
          </div>
          <div>
            <Label className="text-xs">Model</Label>
            <Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="X5" className={!form.model ? 'border-amber-400 ring-1 ring-amber-300' : ''} />
          </div>
          <div>
            <Label className="text-xs">Pojemność silnika (cc)</Label>
            <Input value={form.engine_capacity_cm3} onChange={e => set('engine_capacity_cm3', e.target.value)} placeholder="1998" className={!form.engine_capacity_cm3 ? 'border-amber-400 ring-1 ring-amber-300' : ''} />
          </div>
          <div>
            <Label className="text-xs">Moc silnika (kW)</Label>
            <Input value={form.engine_power_kw} onChange={e => set('engine_power_kw', e.target.value)} placeholder="150" className={!form.engine_power_kw ? 'border-amber-400 ring-1 ring-amber-300' : ''} />
          </div>
          <div>
            <Label className="text-xs">Rodzaj paliwa</Label>
            <Select value={form.fuel_type} onValueChange={v => set('fuel_type', v)}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {fuelTypes.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Kolor</Label>
            <Input value={form.color} onChange={e => set('color', e.target.value)} placeholder="Czarny" />
          </div>
        </div>

        {credits !== null && (
          <p className="text-xs text-muted-foreground">Pozostałe kredyty wyszukiwania: {credits.remaining_credits}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
