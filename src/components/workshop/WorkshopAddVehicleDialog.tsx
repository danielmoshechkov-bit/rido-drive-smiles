import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateWorkshopVehicle, useWorkshopClients } from '@/hooks/useWorkshop';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { VehicleLookupCreditsModal } from '@/components/vehicle/VehicleLookupCreditsModal';
import { useVehicleLookup } from '@/hooks/useVehicleLookup';
import { Car, Search, Loader2, Plus, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  onCreated?: (vehicle: any) => void;
}

const fuelTypes = ['Benzyna', 'Diesel', 'LPG', 'Elektryczny', 'Hybryda', 'Wodór', 'CNG'];
const bodyTypes = ['sedan', 'kombi', 'hatchback', 'suv', 'coupe', 'van', 'pickup', 'cabrio'];

/** Trim model name: "X5 (G05) xDrive50e 3.0 24V" → "X5 (G05) xDrive50e" */
function trimModelName(raw: string): string {
  if (!raw) return raw;
  // Remove trailing engine specs like "3.0 24V", "2.0 TDI 16V", "1.6 HDi" etc.
  // Pattern: remove trailing " N.N" followed by optional alphanumeric specs
  return raw.replace(/\s+\d+\.\d+(\s+\S+)*$/, '').trim();
}

export function WorkshopAddVehicleDialog({ open, onOpenChange, providerId, onCreated }: Props) {
  const create = useCreateWorkshopVehicle();
  const qc = useQueryClient();
  const { data: clients = [] } = useWorkshopClients(providerId);
  const [userId, setUserId] = useState<string | undefined>();
  const [form, setForm] = useState({
    brand: '', model: '', color: '', vin: '', plate: '', year: '',
    first_registration_date: '', fuel_type: '', engine_number: '',
    engine_capacity_cm3: '', engine_power_kw: '', mileage_unit: 'km', description: '',
    owner_client_id: '', body_style: '',
  });
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerList, setShowOwnerList] = useState(false);
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [createdOwner, setCreatedOwner] = useState<any>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const ownerDropdownRef = useRef<HTMLDivElement>(null);

  const { credits, loading: lookupLoading, checkRegistration, checkVin, purchaseCredits } = useVehicleLookup(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  // Close owner dropdown on outside click
  useEffect(() => {
    if (!showOwnerList) return;
    const handler = (e: MouseEvent) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(e.target as Node)) {
        setShowOwnerList(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOwnerList]);

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const applyVehicleData = (data: any) => {
    setForm(prev => {
      const updated = { ...prev };
      if (data.make) updated.brand = data.make;
      if (data.model) updated.model = trimModelName(data.model);
      if (data.body_style) updated.body_style = data.body_style.toLowerCase();
      if (data.color) updated.color = data.color;
      if (data.registration_year) updated.year = String(data.registration_year);
      if (data.fuel_type) updated.fuel_type = data.fuel_type;
      if (data.engine_size) {
        const num = data.engine_size.replace(/[^0-9]/g, '');
        if (num) updated.engine_capacity_cm3 = num;
      }
      if (data.engine_power_kw) updated.engine_power_kw = String(data.engine_power_kw);
      if (data.vin && !prev.vin) updated.vin = data.vin;
      if (data.registration_number && !prev.plate) updated.plate = data.registration_number;
      // Description left empty — not auto-filled from API
      return updated;
    });
  };

  // Auto-save vehicle to workshop_vehicles after successful API lookup (so user doesn't pay twice)
  const autoSaveVehicle = async (data: any) => {
    try {
      // Check if vehicle already exists for this provider (by plate or VIN)
      const plate = data.registration_number?.toUpperCase();
      const vin = data.vin?.toUpperCase();

      let exists = false;
      if (plate) {
        const { data: ex } = await supabase
          .from('workshop_vehicles')
          .select('id')
          .eq('provider_id', providerId)
          .ilike('plate', plate)
          .limit(1)
          .maybeSingle();
        if (ex) exists = true;
      }
      if (!exists && vin) {
        const { data: ex } = await supabase
          .from('workshop_vehicles')
          .select('id')
          .eq('provider_id', providerId)
          .ilike('vin', vin)
          .limit(1)
          .maybeSingle();
        if (ex) exists = true;
      }

      if (!exists) {
        const engineCap = data.engine_size ? parseInt(String(data.engine_size).replace(/[^0-9]/g, '')) || null : null;
        const enginePow = data.engine_power_kw ? parseInt(String(data.engine_power_kw)) || null : null;

        await supabase.from('workshop_vehicles').insert({
          provider_id: providerId,
          brand: data.make || null,
          model: data.model ? trimModelName(data.model) : null,
          vin: vin || null,
          plate: plate || null,
          year: data.registration_year || null,
          fuel_type: data.fuel_type || null,
          engine_capacity_cm3: engineCap,
          engine_power_kw: enginePow,
          color: data.color || null,
        });
        // Invalidate vehicle list cache
        qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
      }
    } catch (e) {
      console.error('Auto-save vehicle error:', e);
    }
  };

  const handleSearchPlate = async () => {
    if (!form.plate || form.plate.length < 3) {
      toast.error('Wpisz numer rejestracyjny');
      return;
    }
    if (!credits || credits.remaining_credits < 1) {
      setShowCreditsModal(true);
      return;
    }
    const data = await checkRegistration(form.plate);
    if (!data && credits && credits.remaining_credits < 1) {
      setShowCreditsModal(true);
    } else if (data) {
      applyVehicleData(data);
      await autoSaveVehicle(data);
    }
  };

  const handleSearchVin = async () => {
    if (!form.vin || form.vin.length < 5) {
      toast.error('Wpisz numer VIN');
      return;
    }
    if (!credits || credits.remaining_credits < 1) {
      setShowCreditsModal(true);
      return;
    }
    const data = await checkVin(form.vin);
    if (!data && credits && credits.remaining_credits < 1) {
      setShowCreditsModal(true);
    } else if (data) {
      applyVehicleData(data);
      await autoSaveVehicle(data);
    }
  };

  const handlePurchaseCredits = async (amount: number, priceNet: number) => {
    const ok = await purchaseCredits(amount, priceNet);
    if (ok) setShowCreditsModal(false);
  };

  const allClients = useMemo(() => {
    if (createdOwner && !clients.find((c: any) => c.id === createdOwner.id)) {
      return [createdOwner, ...clients];
    }
    return clients;
  }, [clients, createdOwner]);

  const filteredClients = useMemo(() => {
    if (!ownerSearch) return allClients;
    const s = ownerSearch.toLowerCase();
    return allClients.filter((c: any) =>
      c.first_name?.toLowerCase().includes(s) ||
      c.last_name?.toLowerCase().includes(s) ||
      c.company_name?.toLowerCase().includes(s)
    );
  }, [allClients, ownerSearch]);

  const selectedOwner = allClients.find((c: any) => c.id === form.owner_client_id);
  const ownerLabel = selectedOwner
    ? selectedOwner.client_type === 'company'
      ? selectedOwner.company_name
      : `${selectedOwner.first_name || ''} ${selectedOwner.last_name || ''}`.trim()
    : '';

  const handleSubmit = async () => {
    if (!form.brand && !form.plate) return;
    try {
      const vehicle = await create.mutateAsync({
        provider_id: providerId,
        brand: form.brand || null,
        model: form.model || null,
        color: form.color || null,
        vin: form.vin?.toUpperCase() || null,
        plate: form.plate?.toUpperCase() || null,
        year: form.year ? parseInt(form.year) : null,
        first_registration_date: form.first_registration_date || null,
        fuel_type: form.fuel_type || null,
        engine_number: form.engine_number || null,
        engine_capacity_cm3: form.engine_capacity_cm3 ? parseInt(form.engine_capacity_cm3) : null,
        engine_power_kw: form.engine_power_kw ? parseInt(form.engine_power_kw) : null,
        mileage_unit: form.mileage_unit,
        description: form.description || null,
        owner_client_id: form.owner_client_id || null,
      });
      onCreated?.(vehicle);
      setForm({ brand: '', model: '', color: '', vin: '', plate: '', year: '', first_registration_date: '', fuel_type: '', engine_number: '', engine_capacity_cm3: '', engine_power_kw: '', mileage_unit: 'km', description: '', owner_client_id: '', body_style: '' });
      setCreatedOwner(null);
      onOpenChange(false);
      setTimeout(() => { qc.invalidateQueries({ queryKey: ['workshop-vehicles'] }); }, 100);
    } catch (e: any) {
      console.error('Vehicle save error:', e);
      toast.error('Błąd zapisu pojazdu: ' + (e?.message || 'Nieznany błąd'));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" /> Dodaj nowy pojazd
              {credits && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  Kredyty: <span className="font-semibold text-primary">{credits.remaining_credits}</span>
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* === SECTION: Dane klienta === */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Dane klienta</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAddOwner(true)}>
                  <Plus className="h-3 w-3" /> Dodaj właściciela
                </Button>
              </div>
              {form.owner_client_id ? (
                <div className="flex items-center gap-2 p-2.5 border-2 border-primary/30 rounded-lg bg-primary/5">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium flex-1">{ownerLabel}</span>
                  <Button variant="ghost" size="sm" onClick={() => { set('owner_client_id', ''); setShowOwnerList(true); }}>Zmień</Button>
                </div>
              ) : (
                <div className="relative" ref={ownerDropdownRef}>
                  <Input
                    value={ownerSearch}
                    onChange={e => { setOwnerSearch(e.target.value); setShowOwnerList(true); }}
                    onClick={() => setShowOwnerList(true)}
                    placeholder="Wyszukaj właściciela z listy klientów..."
                  />
                  {showOwnerList && (
                    <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-48 overflow-y-auto">
                      <button className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowOwnerList(false); setShowAddOwner(true); }}>
                        <Plus className="h-4 w-4 text-primary" /> Dodaj nowego klienta
                      </button>
                      {filteredClients.map((c: any) => (
                        <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors" onClick={() => { set('owner_client_id', c.id); setShowOwnerList(false); setOwnerSearch(''); }}>
                          <div className="font-medium">
                            {c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`}
                          </div>
                        </button>
                      ))}
                      {filteredClients.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground text-center">Brak klientów</div>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* === SECTION: Dane pojazdu === */}
            <div className="border-t pt-4">
              <Label className="text-sm font-semibold">Dane pojazdu</Label>
            </div>

            {/* Nr rejestracyjny | VIN */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Numer rejestracyjny</Label>
                <div className="relative">
                  <Input value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} placeholder="Nr rejestracyjny" className="pr-10" />
                  <button type="button" onClick={handleSearchPlate} disabled={lookupLoading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent transition-colors">
                    {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Search className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors cursor-pointer" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Numer VIN</Label>
                <div className="relative">
                  <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="VIN" className="pr-10" />
                  <button type="button" onClick={handleSearchVin} disabled={lookupLoading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent transition-colors">
                    {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Search className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors cursor-pointer" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Marka | Model | Kolor */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Marka</Label>
                <Input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Marka" />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="Model" />
              </div>
              <div className="space-y-1.5">
                <Label>Kolor</Label>
                <Input value={form.color} onChange={e => set('color', e.target.value)} placeholder="Kolor" />
              </div>
            </div>

            {/* Rok produkcji | Pojemność | Moc */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Rok produkcji</Label>
                <Input type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="Rok" />
              </div>
              <div className="space-y-1.5">
                <Label>Pojemność (cm³)</Label>
                <Input type="number" value={form.engine_capacity_cm3} onChange={e => set('engine_capacity_cm3', e.target.value)} placeholder="cm³" />
              </div>
              <div className="space-y-1.5">
                <Label>Moc silnika (kW)</Label>
                <Input type="number" value={form.engine_power_kw} onChange={e => set('engine_power_kw', e.target.value)} placeholder="kW" />
              </div>
            </div>

            {/* Rodzaj paliwa | Typ nadwozia | Data pierwszej rejestracji */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Rodzaj paliwa</Label>
                <Select value={form.fuel_type} onValueChange={v => set('fuel_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                  <SelectContent>
                    {fuelTypes.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Typ nadwozia</Label>
                <Select value={form.body_style} onValueChange={v => set('body_style', v)}>
                  <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                  <SelectContent>
                    {bodyTypes.map(b => <SelectItem key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data pierwszej rejestracji</Label>
                <Input type="date" value={form.first_registration_date} onChange={e => set('first_registration_date', e.target.value)} />
              </div>
            </div>

            {/* Opis pojazdu */}
            <div className="space-y-1.5">
              <Label>Opis pojazdu</Label>
              <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Opis pojazdu" rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
              <Button onClick={handleSubmit} disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Zapisz
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WorkshopAddClientDialog
        open={showAddOwner}
        onOpenChange={setShowAddOwner}
        providerId={providerId}
        onCreated={(c) => {
          setCreatedOwner(c);
          set('owner_client_id', c.id);
        }}
      />

      <VehicleLookupCreditsModal
        open={showCreditsModal}
        onOpenChange={setShowCreditsModal}
        onPurchase={handlePurchaseCredits}
      />
    </>
  );
}
