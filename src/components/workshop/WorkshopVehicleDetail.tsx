import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useWorkshopOrders, useWorkshopClients } from '@/hooks/useWorkshop';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Search, Car, Plus, Phone, QrCode, Loader2, Users, Save
} from 'lucide-react';

interface Props {
  vehicle: any;
  providerId: string;
  onBack: () => void;
  onOpenOrder?: (order: any) => void;
}

const fuelTypes = ['Benzyna', 'Diesel', 'LPG', 'Hybryda', 'Elektryczny', 'Benzyna+LPG'];

export function WorkshopVehicleDetail({ vehicle, providerId, onBack, onOpenOrder }: Props) {
  const [activeTab, setActiveTab] = useState('dane');
  const { data: allOrders = [] } = useWorkshopOrders(providerId);
  const { data: clients = [] } = useWorkshopClients(providerId);
  const qc = useQueryClient();

  const [ownerClientId, setOwnerClientId] = useState(vehicle.owner_client_id || '');
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerList, setShowOwnerList] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    color: vehicle.color || '',
    vin: vehicle.vin || '',
    plate: vehicle.plate || '',
    year: vehicle.year || '',
    first_registration_date: vehicle.first_registration_date || '',
    fuel_type: vehicle.fuel_type || '',
    engine_number: vehicle.engine_number || '',
    engine_capacity_cm3: vehicle.engine_capacity_cm3 || '',
    engine_power_kw: vehicle.engine_power_kw || '',
    description: vehicle.description || '',
  });

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const vehicleOrders = allOrders.filter((o: any) => o.vehicle_id === vehicle.id);

  const selectedOwner = clients.find((c: any) => c.id === ownerClientId);
  const ownerLabel = selectedOwner
    ? (selectedOwner.company_name || `${selectedOwner.first_name || ''} ${selectedOwner.last_name || ''}`.trim())
    : '';

  const filteredClients = useMemo(() => {
    if (!ownerSearch) return clients;
    const s = ownerSearch.toLowerCase();
    return clients.filter((c: any) =>
      c.first_name?.toLowerCase().includes(s) ||
      c.last_name?.toLowerCase().includes(s) ||
      c.company_name?.toLowerCase().includes(s)
    );
  }, [clients, ownerSearch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('workshop_vehicles').update({
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
        description: form.description || null,
        owner_client_id: ownerClientId || null,
      }).eq('id', vehicle.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
      toast.success('Pojazd zapisany');
    } catch (e: any) {
      toast.error('Błąd zapisu: ' + (e?.message || 'Nieznany'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Pojazdy
        </button>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold">
          {vehicle.brand} {vehicle.model} {vehicle.plate}
        </span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dane">Dane pojazdu</TabsTrigger>
          <TabsTrigger value="pliki">Pliki</TabsTrigger>
          <TabsTrigger value="zlecenia">Historia zleceń</TabsTrigger>
          <TabsTrigger value="zadania">Historia zadań</TabsTrigger>
          <TabsTrigger value="przebiegi">Przebiegi</TabsTrigger>
          <TabsTrigger value="naprawcze">Dane naprawcze</TabsTrigger>
        </TabsList>

        {/* Vehicle data */}
        <TabsContent value="dane">
          <Card>
            <CardContent className="py-6 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Numer VIN</Label>
                  <div className="flex gap-2">
                    <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} className="font-mono flex-1" />
                    <Button size="icon" variant="outline"><Search className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Data pierwszej rejestracji</Label>
                  <Input type="date" value={form.first_registration_date} onChange={e => set('first_registration_date', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Rodzaj paliwa</Label>
                  <Select value={form.fuel_type} onValueChange={v => set('fuel_type', v)}>
                    <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                    <SelectContent>
                      {fuelTypes.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Numer silnika</Label>
                  <Input value={form.engine_number} onChange={e => set('engine_number', e.target.value)} placeholder="Numer silnika" />
                </div>
                <div className="space-y-2">
                  <Label>Marka</Label>
                  <Input value={form.brand} onChange={e => set('brand', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input value={form.model} onChange={e => set('model', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Kolor</Label>
                  <Input value={form.color} onChange={e => set('color', e.target.value)} placeholder="Kolor" />
                </div>
                <div className="space-y-2">
                  <Label>Numer rejestracyjny</Label>
                  <div className="flex gap-2">
                    <Input value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} className="font-mono flex-1" />
                    <Button size="icon" variant="outline"><Search className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Rok produkcji</Label>
                  <Input type="number" value={form.year} onChange={e => set('year', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Pojemność</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={form.engine_capacity_cm3} onChange={e => set('engine_capacity_cm3', e.target.value)} />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">cm³</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Moc silnika</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={form.engine_power_kw} onChange={e => set('engine_power_kw', e.target.value)} />
                    <Badge variant="secondary">kW</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Jednostka przebiegu</Label>
                  <Select defaultValue="km">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="km">km</SelectItem>
                      <SelectItem value="mi">mi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Owner - editable */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Aktualny właściciel</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAddClient(true)}>
                    <Plus className="h-3 w-3" /> Dodaj nowego
                  </Button>
                </div>
                {ownerClientId && selectedOwner ? (
                  <div className="flex items-center gap-2 p-2.5 border-2 border-primary/30 rounded-lg bg-primary/5">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium flex-1">{ownerLabel}</span>
                    <Button variant="ghost" size="sm" onClick={() => { setOwnerClientId(''); setShowOwnerList(true); }}>Zmień</Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={ownerSearch}
                      onChange={e => { setOwnerSearch(e.target.value); setShowOwnerList(true); }}
                      onClick={() => setShowOwnerList(true)}
                      placeholder="Wyszukaj właściciela z listy klientów..."
                    />
                    {showOwnerList && (
                      <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-48 overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowOwnerList(false); setShowAddClient(true); }}>
                          <Plus className="h-4 w-4 text-primary" /> Dodaj nowego klienta
                        </button>
                        {filteredClients.map((c: any) => (
                          <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors" onClick={() => { setOwnerClientId(c.id); setShowOwnerList(false); setOwnerSearch(''); }}>
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

              <div className="space-y-2">
                <Label>Opis pojazdu</Label>
                <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Opis pojazdu" rows={3} />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onBack}>Anuluj</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Zapisz
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Files */}
        <TabsContent value="pliki">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Brak plików — dodaj zdjęcia lub dokumenty pojazdu
            </CardContent>
          </Card>
        </TabsContent>

        {/* Order history */}
        <TabsContent value="zlecenia">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nowe zlecenie</Button>
              <div className="flex-1" />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Szukaj" className="pl-9 w-[250px]" />
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NUMER ZLECENIA</TableHead>
                      <TableHead>UTWORZONE</TableHead>
                      <TableHead>ZAKOŃCZONE</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead>KLIENT</TableHead>
                      <TableHead>PRZYJĘCIE</TableHead>
                      <TableHead className="text-right">RAZEM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicleOrders.length > 0 ? vehicleOrders.map((order: any) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => onOpenOrder?.(order)}
                      >
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>{order.created_at?.split('T')[0]}</TableCell>
                        <TableCell>{order.completed_at?.split('T')[0] || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-xs">{order.status_name}</Badge>
                        </TableCell>
                        <TableCell>
                          {order.client && (
                            <div className="flex items-center gap-1.5 text-sm">
                              {order.client.company_name || `${order.client.first_name || ''} ${order.client.last_name || ''}`}
                              {order.client.phone && <Phone className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.client_acceptance_confirmed ? 'default' : 'outline'} className="text-xs">
                            {order.client_acceptance_confirmed ? '✓' : '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {(order.items?.reduce((s: number, i: any) => s + (i.total_gross || 0), 0) || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Brak zleceń dla tego pojazdu
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Task history */}
        <TabsContent value="zadania">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Historia zadań wykonanych na tym pojeździe zostanie tutaj wyświetlona.
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mileage */}
        <TabsContent value="przebiegi">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Historia przebiegów pojazdu rejestrowanych przy każdym zleceniu.
            </CardContent>
          </Card>
        </TabsContent>

        {/* Repair data */}
        <TabsContent value="naprawcze">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Dane naprawcze dostępne po aktywacji modułu i podaniu VIN pojazdu.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <WorkshopAddClientDialog
        open={showAddClient}
        onOpenChange={setShowAddClient}
        providerId={providerId}
        onCreated={(c) => {
          setOwnerClientId(c.id);
          setShowOwnerList(false);
        }}
      />
    </div>
  );
}
