import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateWorkshopVehicle, useWorkshopClients } from '@/hooks/useWorkshop';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { Car, Search, Loader2, Plus, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  onCreated?: (vehicle: any) => void;
}

const fuelTypes = ['Benzyna', 'Diesel', 'LPG', 'Elektryczny', 'Hybryda', 'Wodór', 'CNG'];

export function WorkshopAddVehicleDialog({ open, onOpenChange, providerId, onCreated }: Props) {
  const create = useCreateWorkshopVehicle();
  const qc = useQueryClient();
  const { data: clients = [] } = useWorkshopClients(providerId);
  const [form, setForm] = useState({
    brand: '', model: '', color: '', vin: '', plate: '', year: '',
    first_registration_date: '', fuel_type: '', engine_number: '',
    engine_capacity_cm3: '', engine_power_kw: '', mileage_unit: 'km', description: '',
    owner_client_id: '',
  });
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerList, setShowOwnerList] = useState(false);
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [createdOwner, setCreatedOwner] = useState<any>(null);

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

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
    const vehicle = await create.mutateAsync({
      provider_id: providerId,
      brand: form.brand || null,
      model: form.model || null,
      color: form.color || null,
      vin: form.vin || null,
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
    // Ensure vehicles list refreshes
    qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
    onCreated?.(vehicle);
    setForm({ brand: '', model: '', color: '', vin: '', plate: '', year: '', first_registration_date: '', fuel_type: '', engine_number: '', engine_capacity_cm3: '', engine_power_kw: '', mileage_unit: 'km', description: '', owner_client_id: '' });
    setCreatedOwner(null);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" /> Dodaj nowy pojazd
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* VIN & Plate row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Numer VIN</Label>
                <div className="relative">
                  <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="VIN" className="pr-10" />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer hover:text-primary transition-colors" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Numer rejestracyjny</Label>
                <div className="relative">
                  <Input value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} placeholder="Nr rejestracyjny" className="pr-10" />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer hover:text-primary transition-colors" />
                </div>
              </div>
            </div>

            {/* Brand, Model, Color */}
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

            {/* Owner - inline with title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Właściciel pojazdu</Label>
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
                <div className="relative">
                  <Input
                    value={ownerSearch}
                    onChange={e => { setOwnerSearch(e.target.value); setShowOwnerList(true); }}
                    onFocus={() => setShowOwnerList(true)}
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

            {/* Year, Registration date, Fuel */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Rok produkcji</Label>
                <Input type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="Rok" />
              </div>
              <div className="space-y-1.5">
                <Label>Data pierwszej rejestracji</Label>
                <Input type="date" value={form.first_registration_date} onChange={e => set('first_registration_date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Rodzaj paliwa</Label>
                <Select value={form.fuel_type} onValueChange={v => set('fuel_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                  <SelectContent>
                    {fuelTypes.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Engine details */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Pojemność (cm³)</Label>
                <Input type="number" value={form.engine_capacity_cm3} onChange={e => set('engine_capacity_cm3', e.target.value)} placeholder="cm³" />
              </div>
              <div className="space-y-1.5">
                <Label>Moc silnika (kW)</Label>
                <Input type="number" value={form.engine_power_kw} onChange={e => set('engine_power_kw', e.target.value)} placeholder="kW" />
              </div>
              <div className="space-y-1.5">
                <Label>Nr silnika</Label>
                <Input value={form.engine_number} onChange={e => set('engine_number', e.target.value)} placeholder="Nr silnika" />
              </div>
            </div>
            {/* Description */}
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
    </>
  );
}
