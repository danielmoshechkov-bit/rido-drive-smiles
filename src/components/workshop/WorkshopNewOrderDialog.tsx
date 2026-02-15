import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCreateWorkshopOrder, useWorkshopClients, useWorkshopVehicles, useCreateWorkshopOrderItem } from '@/hooks/useWorkshop';
import { WorkshopAddVehicleDialog } from './WorkshopAddVehicleDialog';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { Plus, ClipboardList, Loader2, Car, Users, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
}

interface TaskItem {
  name: string;
  mechanic: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
}

export function WorkshopNewOrderDialog({ open, onOpenChange, providerId }: Props) {
  const { data: clients = [] } = useWorkshopClients(providerId);
  const { data: vehicles = [] } = useWorkshopVehicles(providerId);
  const createOrder = useCreateWorkshopOrder();
  const createItem = useCreateWorkshopOrderItem();

  const [vehicleId, setVehicleId] = useState('');
  const [clientId, setClientId] = useState('');
  const [description, setDescription] = useState('');
  const [priceMode, setPriceMode] = useState<'net' | 'gross'>('gross');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTask, setNewTask] = useState<TaskItem>({ name: '', mechanic: '', unit: 'szt', quantity: 1, price: 0, discount: 0 });
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showVehicleList, setShowVehicleList] = useState(false);
  const [showClientList, setShowClientList] = useState(false);

  // Toggles
  const [returnParts, setReturnParts] = useState(false);
  const [regDoc, setRegDoc] = useState(false);
  const [testDrive, setTestDrive] = useState(true);
  const [topUpFluids, setTopUpFluids] = useState(false);
  const [topUpLights, setTopUpLights] = useState(false);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return vehicles;
    const s = vehicleSearch.toLowerCase();
    return vehicles.filter((v: any) =>
      (v.brand?.toLowerCase().includes(s)) ||
      (v.model?.toLowerCase().includes(s)) ||
      (v.plate?.toLowerCase().includes(s)) ||
      (v.vin?.toLowerCase().includes(s))
    );
  }, [vehicles, vehicleSearch]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    const s = clientSearch.toLowerCase();
    return clients.filter((c: any) =>
      (c.first_name?.toLowerCase().includes(s)) ||
      (c.last_name?.toLowerCase().includes(s)) ||
      (c.company_name?.toLowerCase().includes(s)) ||
      (c.nip?.includes(s))
    );
  }, [clients, clientSearch]);

  const selectedVehicle = vehicles.find((v: any) => v.id === vehicleId);
  const selectedClient = clients.find((c: any) => c.id === clientId);

  const vehicleLabel = selectedVehicle
    ? `${selectedVehicle.brand || ''} ${selectedVehicle.model || ''} ${selectedVehicle.plate || ''}`.trim()
    : '';
  const clientLabel = selectedClient
    ? selectedClient.client_type === 'company'
      ? selectedClient.company_name
      : `${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`.trim()
    : '';

  const totalCost = tasks.reduce((sum, t) => {
    const base = t.quantity * t.price;
    return sum + base - (base * t.discount / 100);
  }, 0);

  const addTask = () => {
    if (!newTask.name) return;
    setTasks([...tasks, { ...newTask }]);
    setNewTask({ name: '', mechanic: '', unit: 'szt', quantity: 1, price: 0, discount: 0 });
  };

  const removeTask = (i: number) => setTasks(tasks.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    const order = await createOrder.mutateAsync({
      provider_id: providerId,
      order_number: '', // auto-generated
      vehicle_id: vehicleId || null,
      client_id: clientId || null,
      description: description || null,
      price_mode: priceMode,
      total_net: priceMode === 'net' ? totalCost : totalCost / 1.23,
      total_gross: priceMode === 'gross' ? totalCost : totalCost * 1.23,
      return_parts_to_client: returnParts,
      registration_document: regDoc,
      test_drive_consent: testDrive,
      top_up_fluids: topUpFluids,
      top_up_lights: topUpLights,
      status_name: 'Przyjęcie do serwisu',
    });

    // Insert task items
    for (const t of tasks) {
      const base = t.quantity * t.price;
      const discounted = base - (base * t.discount / 100);
      await createItem.mutateAsync({
        order_id: order.id,
        name: t.name,
        mechanic: t.mechanic || null,
        unit: t.unit,
        quantity: t.quantity,
        unit_price_gross: priceMode === 'gross' ? t.price : t.price * 1.23,
        unit_price_net: priceMode === 'net' ? t.price : t.price / 1.23,
        discount_percent: t.discount,
        total_gross: priceMode === 'gross' ? discounted : discounted * 1.23,
        total_net: priceMode === 'net' ? discounted : discounted / 1.23,
      });
    }

    // Reset
    setVehicleId(''); setClientId(''); setDescription(''); setTasks([]);
    setReturnParts(false); setRegDoc(false); setTestDrive(true); setTopUpFluids(false); setTopUpLights(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" /> Zlecenie
              </DialogTitle>
              <div className="flex gap-1 text-sm">
                <Button variant={priceMode === 'net' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPriceMode('net')}>NETTO</Button>
                <Button variant={priceMode === 'gross' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPriceMode('gross')}>BRUTTO</Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5">
            {/* Vehicle & Client */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pojazd</Label>
                {vehicleId ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <Car className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium flex-1">{vehicleLabel}</span>
                    <Button variant="ghost" size="sm" onClick={() => { setVehicleId(''); setShowVehicleList(true); }}>Zmień</Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={vehicleSearch}
                      onChange={e => { setVehicleSearch(e.target.value); setShowVehicleList(true); }}
                      onFocus={() => setShowVehicleList(true)}
                      placeholder="Pojazd (np. rejestracja, marka...)"
                    />
                    {showVehicleList && (
                      <div className="absolute z-50 w-full mt-1 border rounded-md bg-background shadow-lg max-h-60 overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2 border-b" onClick={() => { setShowVehicleList(false); setShowAddVehicle(true); }}>
                          <Plus className="h-4 w-4" /> Utwórz nowy pojazd
                        </button>
                        {filteredVehicles.map((v: any) => (
                          <button key={v.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => { setVehicleId(v.id); setShowVehicleList(false); setVehicleSearch(''); }}>
                            <div className="flex items-center gap-2">
                              <Car className="h-3.5 w-3.5 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{v.brand} {v.model} {v.year ? `${v.year}` : ''} {v.engine_capacity_cm3 ? `${v.engine_capacity_cm3} cm³` : ''}</div>
                                <div className="text-xs text-muted-foreground">{v.plate} {v.vin || ''}</div>
                              </div>
                            </div>
                          </button>
                        ))}
                        {filteredVehicles.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Brak wyników</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Klient</Label>
                {clientId ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium flex-1">{clientLabel}</span>
                    <Button variant="ghost" size="sm" onClick={() => { setClientId(''); setShowClientList(true); }}>Zmień</Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={clientSearch}
                      onChange={e => { setClientSearch(e.target.value); setShowClientList(true); }}
                      onFocus={() => setShowClientList(true)}
                      placeholder="Wyszukaj klienta..."
                    />
                    {showClientList && (
                      <div className="absolute z-50 w-full mt-1 border rounded-md bg-background shadow-lg max-h-60 overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2 border-b" onClick={() => { setShowClientList(false); setShowAddClient(true); }}>
                          <Plus className="h-4 w-4" /> Utwórz nowego klienta
                        </button>
                        {filteredClients.map((c: any) => (
                          <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => { setClientId(c.id); setShowClientList(false); setClientSearch(''); }}>
                            <div className="flex items-center gap-2">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              <div>
                                <div className="font-medium">
                                  {c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`}
                                </div>
                                {c.nip && <div className="text-xs text-muted-foreground">NIP: {c.nip}</div>}
                              </div>
                            </div>
                          </button>
                        ))}
                        {filteredClients.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Brak wyników</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Opis zlecenia" rows={3} />
            </div>

            {/* Tasks table */}
            <div>
              <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Lista zadań</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nazwa</TableHead>
                    <TableHead>Mechanik</TableHead>
                    <TableHead>Jedn</TableHead>
                    <TableHead className="text-right">Ilość</TableHead>
                    <TableHead className="text-right">Rabat %</TableHead>
                    <TableHead className="text-right">Koszt</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t, i) => {
                    const base = t.quantity * t.price;
                    const cost = base - (base * t.discount / 100);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>{t.mechanic}</TableCell>
                        <TableCell>{t.unit}</TableCell>
                        <TableCell className="text-right">{t.quantity}</TableCell>
                        <TableCell className="text-right">{t.discount}%</TableCell>
                        <TableCell className="text-right">{cost.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeTask(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {tasks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">Brak danych</TableCell>
                    </TableRow>
                  )}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell colSpan={5}>Razem</TableCell>
                    <TableCell className="text-right">{totalCost.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {/* Add task row */}
              <div className="grid grid-cols-6 gap-2 mt-2 items-end">
                <Input placeholder="Nazwa" value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))} />
                <Input placeholder="Mechanik" value={newTask.mechanic} onChange={e => setNewTask(p => ({ ...p, mechanic: e.target.value }))} />
                <Input placeholder="Jedn" value={newTask.unit} onChange={e => setNewTask(p => ({ ...p, unit: e.target.value }))} />
                <Input type="number" placeholder="Ilość" value={newTask.quantity} onChange={e => setNewTask(p => ({ ...p, quantity: Number(e.target.value) }))} />
                <Input type="number" placeholder="Cena" value={newTask.price || ''} onChange={e => setNewTask(p => ({ ...p, price: Number(e.target.value) }))} />
                <Button onClick={addTask} className="gap-1"><Plus className="h-4 w-4" /> Dodaj</Button>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2 border-t">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={returnParts} onCheckedChange={setReturnParts} /> Zwrot części do klienta
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={regDoc} onCheckedChange={setRegDoc} /> Dowód rejestracyjny
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={testDrive} onCheckedChange={setTestDrive} /> Zgoda na jazdę próbną
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={topUpFluids} onCheckedChange={setTopUpFluids} /> Uzupełnić płyny
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={topUpLights} onCheckedChange={setTopUpLights} /> Uzupełnić oświetlenie
              </label>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
              <Button onClick={handleSubmit} disabled={createOrder.isPending}>
                {createOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Utwórz zlecenie
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WorkshopAddVehicleDialog
        open={showAddVehicle}
        onOpenChange={setShowAddVehicle}
        providerId={providerId}
        onCreated={(v) => { setVehicleId(v.id); }}
      />
      <WorkshopAddClientDialog
        open={showAddClient}
        onOpenChange={setShowAddClient}
        providerId={providerId}
        onCreated={(c) => { setClientId(c.id); }}
      />
    </>
  );
}
