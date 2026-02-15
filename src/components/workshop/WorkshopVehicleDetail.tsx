import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useWorkshopOrders } from '@/hooks/useWorkshop';
import {
  ArrowLeft, Search, Car, Plus, Phone, QrCode, Loader2
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

  const vehicleOrders = allOrders.filter((o: any) => o.vehicle_id === vehicle.id);

  const ownerName = vehicle.owner
    ? (vehicle.owner.company_name || `${vehicle.owner.first_name || ''} ${vehicle.owner.last_name || ''}`.trim())
    : '';

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
                  <Label>Kod Aztec</Label>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <QrCode className="h-5 w-5 text-muted-foreground" />
                      <Input defaultValue={vehicle.aztec_code || ''} placeholder="AZTEC" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Data pierwszej rejestracji</Label>
                  <Input type="date" defaultValue={vehicle.first_registration_date || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Rodzaj paliwa</Label>
                  <Select defaultValue={vehicle.fuel_type || ''}>
                    <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                    <SelectContent>
                      {fuelTypes.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Numer VIN</Label>
                  <div className="flex gap-2">
                    <Input defaultValue={vehicle.vin || ''} className="font-mono flex-1" />
                    <Button size="icon" variant="outline"><Search className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Numer silnika</Label>
                  <Input defaultValue={vehicle.engine_number || ''} placeholder="Numer silnika" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Marka</Label>
                  <Input defaultValue={vehicle.brand || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input defaultValue={vehicle.model || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Kolor</Label>
                  <Input defaultValue={vehicle.color || ''} placeholder="Kolor" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Numer rejestracyjny</Label>
                  <div className="flex gap-2">
                    <Input defaultValue={vehicle.plate || ''} className="font-mono flex-1" />
                    <Button size="icon" variant="outline"><Search className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Rok produkcji</Label>
                  <Input defaultValue={vehicle.year || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Pojemność</Label>
                  <div className="flex items-center gap-2">
                    <Input defaultValue={vehicle.engine_capacity_cm3 || ''} />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">cm³</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Moc silnika</Label>
                  <div className="flex items-center gap-2">
                    <Input defaultValue={vehicle.engine_power_kw || ''} />
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Aktualny właściciel</Label>
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{ownerName || 'Nie przypisano'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Opis pojazdu</Label>
                  <Textarea defaultValue={vehicle.description || ''} placeholder="Opis pojazdu" rows={3} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onBack}>Anuluj</Button>
                <Button>Zapisz</Button>
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

            <div className="text-sm text-muted-foreground">
              Od 1 do {vehicleOrders.length} z {vehicleOrders.length} wyników
            </div>
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
    </div>
  );
}
