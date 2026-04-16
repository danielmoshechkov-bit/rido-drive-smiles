import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWorkshopClients, useWorkshopVehicles } from '@/hooks/useWorkshop';
import { WorkshopAddVehicleDialog } from './WorkshopAddVehicleDialog';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Search, Trash2, Archive, X, Check, ChevronsUpDown
} from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

// Hooks for tire storage data
function useTireStorageRecords(providerId: string) {
  return useQuery({
    queryKey: ['tire-storage', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_tire_storage')
        .select('*, workshop_clients(*), workshop_vehicles(*)')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!providerId,
  });
}

function useServicePoints(providerId: string) {
  return useQuery({
    queryKey: ['service-points', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_service_points')
        .select('*')
        .eq('provider_id', providerId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!providerId,
  });
}

export function WorkshopTireStorage({ providerId, onBack }: Props) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const { data: records = [], isLoading } = useTireStorageRecords(providerId);

  const filtered = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter((r: any) =>
      (r.client_name || '').toLowerCase().includes(q) ||
      (r.tire_brand || '').toLowerCase().includes(q) ||
      (r.storage_number || '').toLowerCase().includes(q) ||
      (r.workshop_clients?.first_name || '').toLowerCase().includes(q) ||
      (r.workshop_clients?.last_name || '').toLowerCase().includes(q) ||
      (r.workshop_vehicles?.plate || '').toLowerCase().includes(q)
    );
  }, [records, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Przechowalnia</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Przechowaj
        </Button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj" className="pl-9 w-[250px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KOD</TableHead>
                <TableHead>KLIENT</TableHead>
                <TableHead>TELEFON</TableHead>
                <TableHead>MARKA / MODEL</TableHead>
                <TableHead>ROZMIAR</TableHead>
                <TableHead>SEZON</TableHead>
                <TableHead>POJAZD</TableHead>
                <TableHead>LOKALIZACJA</TableHead>
                <TableHead>DATA PRZYJĘCIA</TableHead>
                <TableHead>KOSZT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <Archive className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {isLoading ? 'Ładowanie...' : 'Brak danych'}
                  </TableCell>
                </TableRow>
              ) : filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.storage_number || '—'}</TableCell>
                  <TableCell>{r.client_name || `${r.workshop_clients?.first_name || ''} ${r.workshop_clients?.last_name || ''}`.trim() || '—'}</TableCell>
                  <TableCell className="text-xs">{r.client_phone || '—'}</TableCell>
                  <TableCell>{r.tire_brand} {r.tire_model}</TableCell>
                  <TableCell>{r.tire_size || '—'}</TableCell>
                  <TableCell>{r.season === 'letnie' ? '☀️ Letnie' : r.season === 'zimowe' ? '❄️ Zimowe' : '🔄 Całoroczne'}</TableCell>
                  <TableCell className="text-xs">{r.workshop_vehicles ? `${r.workshop_vehicles.brand} ${r.workshop_vehicles.model} ${r.workshop_vehicles.plate}` : '—'}</TableCell>
                  <TableCell className="text-xs">{r.location_name || '—'}</TableCell>
                  <TableCell className="text-xs">{r.stored_at ? new Date(r.stored_at).toLocaleDateString('pl-PL') : '—'}</TableCell>
                  <TableCell className="font-medium">{(r.storage_cost || 0).toFixed(2)} zł</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Od 0 do {filtered.length} z {records.length} wyników
      </div>

      <TireStorageDialog open={showAdd} onOpenChange={setShowAdd} providerId={providerId} />
    </div>
  );
}

// ---- Searchable Combobox ----
function SearchableCombobox({ items, value, onSelect, onCreateNew, placeholder, renderItem, getLabel }: {
  items: any[];
  value: string;
  onSelect: (val: string) => void;
  onCreateNew?: (query: string) => void;
  placeholder: string;
  renderItem: (item: any) => React.ReactNode;
  getLabel: (item: any) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item => getLabel(item).toLowerCase().includes(q));
  }, [items, query, getLabel]);

  const selectedLabel = items.find(i => i.id === value) ? getLabel(items.find(i => i.id === value)!) : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal">
          {selectedLabel || <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              {onCreateNew && query.trim() ? (
                <button
                  className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                  onClick={() => { onCreateNew(query.trim()); setOpen(false); setQuery(''); }}
                >
                  <Plus className="h-4 w-4" /> Dodaj „{query.trim()}"
                </button>
              ) : 'Nie znaleziono'}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map(item => (
                <CommandItem key={item.id} value={getLabel(item)} onSelect={() => { onSelect(item.id); setOpen(false); setQuery(''); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === item.id ? 'opacity-100' : 'opacity-0'}`} />
                  {renderItem(item)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---- Dialog ----
function TireStorageDialog({ open, onOpenChange, providerId }: { open: boolean; onOpenChange: (v: boolean) => void; providerId: string }) {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useWorkshopClients(providerId);
  const { data: vehicles = [] } = useWorkshopVehicles(providerId);
  const { data: servicePoints = [] } = useServicePoints(providerId);

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [storedAt, setStoredAt] = useState(new Date().toISOString().split('T')[0]);
  const [pickupAt, setPickupAt] = useState('');
  const [storageCost, setStorageCost] = useState('150');
  const [pickupDeadline, setPickupDeadline] = useState('');
  const [reminderMonths, setReminderMonths] = useState('6');
  const [locationName, setLocationName] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [season, setSeason] = useState('letnie');
  const [employeeName, setEmployeeName] = useState('');

  // Tire fields
  const [tireBrand, setTireBrand] = useState('');
  const [tireModel, setTireModel] = useState('');
  const [tireSize, setTireSize] = useState('');
  const [dotCode, setDotCode] = useState('');
  const [treadDepth, setTreadDepth] = useState('');
  const [rimType, setRimType] = useState('');
  const [rimManufacturer, setRimManufacturer] = useState('');
  const [quantity, setQuantity] = useState('4');
  const [notes, setNotes] = useState('');

  // Tasks (empty by default)
  const [tasks, setTasks] = useState<{ name: string; price: number }[]>([]);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskPrice, setNewTaskPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSelectClient = (id: string) => {
    setClientId(id);
    const client = clients.find((c: any) => c.id === id);
    if (client) {
      const name = client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim();
      setClientName(name);
      if (client.phone) setClientPhone(client.phone);
    }
  };

  const handleCreateClient = (query: string) => {
    setClientName(query);
    setClientId('');
  };

  const handleSelectVehicle = (id: string) => {
    setVehicleId(id);
  };

  const handleCreateVehicle = (query: string) => {
    // Just store the text for now
    setVehicleId('');
  };

  const addTask = () => {
    if (!newTaskName.trim()) return;
    setTasks([...tasks, { name: newTaskName.trim(), price: parseFloat(newTaskPrice) || 0 }]);
    setNewTaskName('');
    setNewTaskPrice('');
  };

  const removeTask = (idx: number) => {
    setTasks(tasks.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!clientName.trim()) {
      toast.error('Podaj imię i nazwisko klienta');
      return;
    }
    setSaving(true);
    try {
      // Parse DOT code to extract week/year
      const dotMatch = dotCode.match(/^(\d{2})(\d{2})$/);

      const { data: stored, error } = await (supabase as any)
        .from('workshop_tire_storage')
        .insert({
          provider_id: providerId,
          client_id: clientId || null,
          vehicle_id: vehicleId || null,
          client_name: clientName,
          client_phone: clientPhone,
          tire_brand: tireBrand,
          tire_model: tireModel,
          tire_size: tireSize,
          tire_type: rimType,
          rim_type: rimType,
          rim_manufacturer: rimManufacturer,
          quantity: parseInt(quantity) || 4,
          tread_depth_mm: parseFloat(treadDepth) || null,
          dot_code: dotCode,
          production_year: dotMatch ? 2000 + parseInt(dotMatch[2]) : null,
          season,
          stored_at: storedAt,
          pickup_at: pickupAt || null,
          pickup_deadline: pickupDeadline || null,
          storage_cost: parseFloat(storageCost) || 150,
          location_name: locationName || locationDesc,
          reminder_months: parseInt(reminderMonths) || 6,
          employee_name: employeeName,
          notes,
          is_active: true,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Save tasks
      if (tasks.length > 0 && stored?.id) {
        const { error: taskErr } = await (supabase as any)
          .from('workshop_tire_storage_tasks')
          .insert(tasks.map(t => ({
            storage_id: stored.id,
            name: t.name,
            price: t.price,
          })));
        if (taskErr) console.error('Tasks save error:', taskErr);
      }

      toast.success('Przechowanie zapisane!');
      queryClient.invalidateQueries({ queryKey: ['tire-storage'] });
      onOpenChange(false);

      // Offer SMS
      if (clientPhone) {
        const seasonLabel = season === 'letnie' ? 'letnie' : season === 'zimowe' ? 'zimowe' : 'całoroczne';
        toast.info(`SMS potwierdzenie można wysłać na ${clientPhone}`, {
          action: { label: 'Wyślij', onClick: () => toast.info('Funkcja SMS w przygotowaniu') },
        });
      }
    } catch (e: any) {
      toast.error(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const addServicePoint = async () => {
    const name = prompt('Nazwa punktu serwisowego:');
    if (!name?.trim()) return;
    const { error } = await (supabase as any)
      .from('workshop_service_points')
      .insert({ provider_id: providerId, name: name.trim() });
    if (error) toast.error(error.message);
    else {
      toast.success('Punkt dodany');
      queryClient.invalidateQueries({ queryKey: ['service-points'] });
    }
  };

  const tasksTotal = tasks.reduce((s, t) => s + t.price, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowe przechowanie</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Client */}
          <div className="space-y-2">
            <Label>Klient</Label>
            <SearchableCombobox
              items={clients}
              value={clientId}
              onSelect={handleSelectClient}
              onCreateNew={handleCreateClient}
              placeholder="Wpisz imię i nazwisko..."
              renderItem={(c: any) => c.company_name || `${c.first_name} ${c.last_name}`}
              getLabel={(c: any) => c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}
            />
            {!clientId && clientName && (
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Imię i nazwisko" className="h-8" />
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label>Nr telefonu</Label>
            <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+48 ..." className="h-9" />
          </div>

          {/* Vehicle */}
          <div className="space-y-2">
            <Label>Pojazd</Label>
            <SearchableCombobox
              items={vehicles}
              value={vehicleId}
              onSelect={handleSelectVehicle}
              onCreateNew={handleCreateVehicle}
              placeholder="Wyszukaj pojazd..."
              renderItem={(v: any) => `${v.brand} ${v.model} — ${v.plate}`}
              getLabel={(v: any) => `${v.brand || ''} ${v.model || ''} ${v.plate || ''}`.trim()}
            />
          </div>

          {/* Season */}
          <div className="space-y-2">
            <Label>Sezon</Label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="letnie">☀️ Letnie</SelectItem>
                <SelectItem value="zimowe">❄️ Zimowe</SelectItem>
                <SelectItem value="całoroczne">🔄 Całoroczne</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="space-y-2">
            <Label>Data przyjęcia</Label>
            <Input type="date" value={storedAt} onChange={e => setStoredAt(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label>Data wydania</Label>
            <Input type="date" value={pickupAt} onChange={e => setPickupAt(e.target.value)} className="h-9" />
          </div>

          {/* Cost */}
          <div className="space-y-2">
            <Label>Koszt przechowania</Label>
            <div className="flex items-center gap-2">
              <Input type="number" value={storageCost} onChange={e => setStorageCost(e.target.value)} className="flex-1 h-9" />
              <span className="text-sm text-muted-foreground">PLN netto</span>
            </div>
          </div>

          {/* Reminder */}
          <div className="space-y-2">
            <Label>Przypomnienie SMS za</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min="1" max="12" value={reminderMonths} onChange={e => setReminderMonths(e.target.value)} className="w-20 h-9" />
              <span className="text-sm text-muted-foreground">miesięcy</span>
            </div>
          </div>

          {/* Service point */}
          <div className="space-y-2">
            <Label>Punkt serwisowy</Label>
            <div className="flex items-center gap-2">
              <Select value={locationName} onValueChange={setLocationName}>
                <SelectTrigger className="flex-1 h-9"><SelectValue placeholder="Wybierz punkt..." /></SelectTrigger>
                <SelectContent>
                  {servicePoints.map((sp: any) => (
                    <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={addServicePoint}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Location description */}
          <div className="space-y-2">
            <Label>Lokalizacja (opis)</Label>
            <Textarea value={locationDesc} onChange={e => setLocationDesc(e.target.value)} placeholder="Nr regału, pozycja..." rows={2} />
          </div>

          {/* Employee */}
          <div className="space-y-2">
            <Label>Pracownik</Label>
            <Input value={employeeName} onChange={e => setEmployeeName(e.target.value)} placeholder="Imię i nazwisko" className="h-9" />
          </div>
        </div>

        {/* Tire details */}
        <div className="mt-6">
          <h3 className="font-semibold text-lg mb-3">Szczegóły opon</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Marka opon</Label>
              <Input value={tireBrand} onChange={e => setTireBrand(e.target.value)} placeholder="Continental" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Model opon</Label>
              <Input value={tireModel} onChange={e => setTireModel(e.target.value)} placeholder="PremiumContact 6" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rozmiar</Label>
              <Input value={tireSize} onChange={e => setTireSize(e.target.value)} placeholder="205/55R16" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">DOT (tydzień/rok)</Label>
              <Input value={dotCode} onChange={e => setDotCode(e.target.value)} placeholder="3325" maxLength={4} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Głębokość bieżnika (mm)</Label>
              <Input type="number" value={treadDepth} onChange={e => setTreadDepth(e.target.value)} placeholder="6.5" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Typ felg</Label>
              <Input value={rimType} onChange={e => setRimType(e.target.value)} placeholder="Aluminiowe" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Producent felg</Label>
              <Input value={rimManufacturer} onChange={e => setRimManufacturer(e.target.value)} placeholder="OZ Racing" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ilość</Label>
              <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-8" />
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <Label className="text-xs">Uwagi</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dodatkowe informacje..." rows={2} />
          </div>
        </div>

        {/* Tasks (empty by default, add with +) */}
        <div className="mt-6">
          <h3 className="font-semibold text-lg mb-3">Lista zadań</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>LP.</TableHead>
                <TableHead>NAZWA</TableHead>
                <TableHead className="text-right">CENA</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task, idx) => (
                <TableRow key={idx}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{task.name}</TableCell>
                  <TableCell className="text-right">{task.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeTask(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {tasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Brak zadań — dodaj plusem poniżej</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex items-center gap-2 mt-2">
            <Input value={newTaskName} onChange={e => setNewTaskName(e.target.value)} placeholder="Nazwa zadania" className="flex-1 h-8" onKeyDown={e => e.key === 'Enter' && addTask()} />
            <Input type="number" value={newTaskPrice} onChange={e => setNewTaskPrice(e.target.value)} placeholder="Cena" className="w-24 h-8" onKeyDown={e => e.key === 'Enter' && addTask()} />
            <Button variant="outline" size="sm" className="gap-1 h-8" onClick={addTask}>
              <Plus className="h-4 w-4" /> Dodaj
            </Button>
          </div>
          <div className="text-right text-sm font-medium mt-1">Razem: {tasksTotal.toFixed(2)}</div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Zapisuję...' : 'Zapisz'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
