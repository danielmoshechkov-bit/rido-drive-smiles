import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  useWorkshopOrders, useWorkshopStatuses, useUpdateWorkshopOrder,
} from '@/hooks/useWorkshop';
import { WorkshopNewOrderDialog } from './WorkshopNewOrderDialog';
import { WorkshopEditClientDialog } from './WorkshopEditClientDialog';
import { useVehicleLookup } from '@/hooks/useVehicleLookup';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, CheckCircle, Car, Trash2,
  Wrench, Filter, Loader2, Copy, Phone, Mail, User, ExternalLink, Building, Save
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  providerId: string;
  onSelectOrder?: (order: any) => void;
}

const statusColors: Record<string, string> = {
  'Przyjęcie do serwisu': 'bg-red-500 text-white',
  'Nowe zlecenie': 'bg-amber-400 text-black',
  'Akceptacja klienta': 'bg-amber-400 text-black',
  'W trakcie naprawy': 'bg-amber-400 text-black',
  'Zadania wykonane': 'bg-green-500 text-white',
  'Gotowy do odbioru': 'bg-green-500 text-white',
  'Zakończone': 'bg-gray-800 text-white',
};

export function WorkshopOrdersList({ providerId, onSelectOrder }: Props) {
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [completedOnly, setCompletedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [editClient, setEditClient] = useState<any>(null);
  const [editVehicle, setEditVehicle] = useState<any>(null);

  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const { data: orders = [], isLoading } = useWorkshopOrders(providerId, {
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: search || undefined,
    completedOnly,
  });
  const updateOrder = useUpdateWorkshopOrder();

  const filteredOrders = useMemo(() => {
    if (completedOnly) return orders.filter((o: any) => o.status_name === 'Zakończone');
    return orders;
  }, [orders, completedOnly]);

  const totalSum = filteredOrders.reduce((s: number, o: any) => s + (o.total_gross || 0), 0);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const changeStatus = async (orderId: string, newStatus: string) => {
    await updateOrder.mutateAsync({ id: orderId, status_name: newStatus });
    setStatusDropdownId(null);
    toast.success(`Status zmieniony na: ${newStatus}`);
  };

  const getClientName = (o: any) => {
    if (!o.client) return '';
    return o.client.client_type === 'company'
      ? o.client.company_name
      : `${o.client.first_name || ''} ${o.client.last_name || ''}`.trim();
  };

  const getVehicleName = (o: any) => {
    if (!o.vehicle) return '';
    return `${o.vehicle.brand || ''} ${o.vehicle.model || ''} ${o.vehicle.plate || ''}`.trim();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowNewOrder(true)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nowe</span> zlecenie
        </Button>
        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" className="gap-1">
            <Trash2 className="h-4 w-4" /> Usuń
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant={completedOnly ? 'secondary' : 'ghost'}
          size="icon"
          title="Tylko zakończone"
          onClick={() => setCompletedOnly(!completedOnly)}
          className="h-8 w-8"
        >
          <CheckCircle className="h-4 w-4" />
        </Button>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] sm:w-[180px] h-8 text-xs sm:text-sm">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            {statuses.map((s: any) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj"
            className="pl-9 w-full sm:w-[200px] h-8"
          />
        </div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Brak zleceń</div>
        ) : (
          <>
            {filteredOrders.map((order: any) => (
              <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onSelectOrder?.(order)}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-semibold text-sm">{order.order_number}</span>
                    </div>
                    <Badge className={`${statusColors[order.status_name] || 'bg-gray-200 text-black'} text-[10px] px-1.5 py-0.5`}>
                      {order.status_name || 'Brak'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getVehicleName(order) && (
                        <span className="flex items-center gap-1 truncate">
                          <Car className="h-3 w-3 shrink-0" /> {getVehicleName(order)}
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-foreground text-sm ml-2 shrink-0">
                      {(order.total_gross || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{getClientName(order)}</span>
                    <span>{format(new Date(order.created_at), 'dd.MM.yyyy')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredOrders.length > 0 && (
              <div className="text-right text-sm font-semibold px-2 pt-2 border-t">
                Suma: {totalSum.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
              </div>
            )}
          </>
        )}
      </div>

      {/* Desktop table view */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Numer zlecenia</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Razem</TableHead>
                  <TableHead>Pojazd</TableHead>
                  <TableHead>Klient</TableHead>
                  <TableHead>Przyjęcie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order: any) => (
                  <TableRow key={order.id} className="group cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => onSelectOrder?.(order)}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{order.order_number}</span>
                      </div>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          onClick={() => setStatusDropdownId(statusDropdownId === order.id ? null : order.id)}
                          className="cursor-pointer"
                        >
                          <Badge className={`${statusColors[order.status_name] || 'bg-gray-200 text-black'} text-xs whitespace-nowrap hover:opacity-80 transition-opacity`}>
                            {order.status_name || 'Brak'}
                          </Badge>
                        </button>
                        {statusDropdownId === order.id && (
                          <div className="absolute z-50 mt-1 border rounded-md bg-background shadow-lg min-w-[180px]">
                            {statuses.map((s: any) => (
                              <button
                                key={s.id}
                                className={`w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2 ${
                                  s.name === order.status_name ? 'bg-accent font-medium' : ''
                                }`}
                                onClick={() => changeStatus(order.id, s.name)}
                              >
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {(order.total_gross || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <HoverCard openDelay={400} closeDelay={200}>
                        <HoverCardTrigger asChild>
                          <div
                            className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => order.vehicle && setEditVehicle(order.vehicle)}
                          >
                            {order.vehicle && <Car className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className="text-sm truncate max-w-[180px]">{getVehicleName(order)}</span>
                          </div>
                        </HoverCardTrigger>
                        {order.vehicle && (
                          <HoverCardContent className="w-72 p-3" side="bottom" align="start">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-semibold text-sm">{order.vehicle.brand} {order.vehicle.model}</p>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditVehicle(order.vehicle)}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                              {order.vehicle.plate && (
                                <>
                                  <span className="text-muted-foreground">Nr rej</span>
                                  <button className="text-left font-medium hover:text-primary flex items-center gap-1" onClick={() => { navigator.clipboard.writeText(order.vehicle.plate); toast.success('Skopiowano nr rej'); }}>
                                    {order.vehicle.plate} <Copy className="h-2.5 w-2.5 opacity-50" />
                                  </button>
                                </>
                              )}
                              {order.vehicle.vin && (
                                <>
                                  <span className="text-muted-foreground">VIN</span>
                                  <button className="text-left text-[11px] font-medium hover:text-primary flex items-center gap-1 truncate max-w-full" onClick={() => { navigator.clipboard.writeText(order.vehicle.vin); toast.success('Skopiowano VIN'); }}>
                                    {order.vehicle.vin} <Copy className="h-2.5 w-2.5 opacity-50 shrink-0" />
                                  </button>
                                </>
                              )}
                              {order.vehicle.year && (
                                <>
                                  <span className="text-muted-foreground">Rok prod</span>
                                  <span className="font-medium">{order.vehicle.year}</span>
                                </>
                              )}
                              {order.vehicle.engine_capacity && (
                                <>
                                  <span className="text-muted-foreground">Pojemność</span>
                                  <span className="font-medium">{order.vehicle.engine_capacity} cc</span>
                                </>
                              )}
                              {order.vehicle.engine_power && (
                                <>
                                  <span className="text-muted-foreground">Moc</span>
                                  <span className="font-medium">{order.vehicle.engine_power} kW</span>
                                </>
                              )}
                              {order.vehicle.fuel_type && (
                                <>
                                  <span className="text-muted-foreground">Paliwo</span>
                                  <span className="font-medium">{order.vehicle.fuel_type}</span>
                                </>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-3 h-7 text-xs gap-1"
                              onClick={() => setEditVehicle(order.vehicle)}
                            >
                              <ExternalLink className="h-3 w-3" /> Otwórz kartę pojazdu
                            </Button>
                          </HoverCardContent>
                        )}
                      </HoverCard>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <HoverCard openDelay={400} closeDelay={200}>
                        <HoverCardTrigger asChild>
                          <span
                            className="text-sm cursor-pointer hover:text-primary transition-colors"
                            onClick={() => order.client && setEditClient(order.client)}
                          >
                            {getClientName(order)}
                          </span>
                        </HoverCardTrigger>
                        {order.client && (
                          <HoverCardContent className="w-72 p-3" side="bottom" align="start">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {order.client.client_type === 'company' ? (
                                  <Building className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <User className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-semibold text-sm">{getClientName(order)}</span>
                              </div>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditClient(order.client)}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                            {order.client.company_name && order.client.client_type === 'company' && (
                              <p className="text-xs text-muted-foreground mb-2">{order.client.company_name}</p>
                            )}
                            <div className="space-y-1.5 text-xs">
                              {order.client.phone && (
                                <button className="flex items-center gap-2 hover:text-primary w-full text-left" onClick={() => { navigator.clipboard.writeText(order.client.phone); toast.success('Skopiowano telefon'); }}>
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <span>{order.client.phone}</span>
                                  <Copy className="h-2.5 w-2.5 opacity-50 ml-auto" />
                                </button>
                              )}
                              {order.client.email && (
                                <button className="flex items-center gap-2 hover:text-primary w-full text-left" onClick={() => { navigator.clipboard.writeText(order.client.email); toast.success('Skopiowano email'); }}>
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span className="truncate">{order.client.email}</span>
                                  <Copy className="h-2.5 w-2.5 opacity-50 ml-auto" />
                                </button>
                              )}
                              {order.client.nip && (
                                <button className="flex items-center gap-2 hover:text-primary w-full text-left" onClick={() => { navigator.clipboard.writeText(order.client.nip); toast.success('Skopiowano NIP'); }}>
                                  <span className="text-muted-foreground">NIP:</span>
                                  <span>{order.client.nip}</span>
                                  <Copy className="h-2.5 w-2.5 opacity-50 ml-auto" />
                                </button>
                              )}
                              {order.client.city && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span>📍 {order.client.city}</span>
                                </div>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-3 h-7 text-xs gap-1"
                              onClick={() => setEditClient(order.client)}
                            >
                              <ExternalLink className="h-3 w-3" /> Otwórz kartę klienta
                            </Button>
                          </HoverCardContent>
                        )}
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      {format(new Date(order.created_at), 'yyyy-MM-dd')}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOrders.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Brak zleceń
                    </TableCell>
                  </TableRow>
                )}
                {filteredOrders.length > 0 && (
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell colSpan={3}>Suma</TableCell>
                    <TableCell className="text-right">
                      {totalSum.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell colSpan={3}></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <WorkshopNewOrderDialog
        open={showNewOrder}
        onOpenChange={setShowNewOrder}
        providerId={providerId}
      />

      {/* Client edit dialog */}
      <WorkshopEditClientDialog
        open={!!editClient}
        onOpenChange={(v) => { if (!v) setEditClient(null); }}
        client={editClient}
      />

      {/* Vehicle edit dialog */}
      {editVehicle && (
        <VehicleEditDialog
          vehicle={editVehicle}
          onClose={() => setEditVehicle(null)}
        />
      )}
    </div>
  );
}

const fuelTypes = ['Benzyna', 'Diesel', 'LPG', 'Elektryczny', 'Hybryda', 'Benzyna+LPG', 'CNG'];

function VehicleEditDialog({ vehicle, onClose }: { vehicle: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
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

  const { credits, loading: lookupLoading, checkRegistration, checkVin } = useVehicleLookup(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

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
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Edycja pojazdu
          </DialogTitle>
        </DialogHeader>

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
              <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="WVWZZZ3CZWE123456" />
              <Button variant="outline" size="icon" onClick={handleVinSearch} disabled={lookupLoading || !form.vin.trim()} title="Szukaj po VIN">
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Marka</Label>
            <Input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="BMW" />
          </div>
          <div>
            <Label className="text-xs">Model</Label>
            <Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="X5" />
          </div>
          <div>
            <Label className="text-xs">Pojemność silnika (cc)</Label>
            <Input value={form.engine_capacity_cm3} onChange={e => set('engine_capacity_cm3', e.target.value)} placeholder="1998" />
          </div>
          <div>
            <Label className="text-xs">Moc silnika (kW)</Label>
            <Input value={form.engine_power_kw} onChange={e => set('engine_power_kw', e.target.value)} placeholder="150" />
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
          <Button variant="outline" onClick={onClose}>Anuluj</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
