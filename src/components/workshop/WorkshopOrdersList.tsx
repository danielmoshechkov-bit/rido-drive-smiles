import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  useWorkshopOrders, useWorkshopStatuses, useUpdateWorkshopOrder,
} from '@/hooks/useWorkshop';
import { WorkshopNewOrderDialog } from './WorkshopNewOrderDialog';
import { WorkshopEditClientDialog } from './WorkshopEditClientDialog';
import {
  Plus, Search, CheckCircle, Car, Trash2,
  Wrench, Filter, Loader2, Copy, Phone, Mail, User, ExternalLink, Building
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
        <Button onClick={() => setShowNewOrder(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nowe zlecenie
        </Button>
        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" className="gap-1">
            <Trash2 className="h-4 w-4" /> Usuń zaznaczone
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant={completedOnly ? 'secondary' : 'ghost'}
          size="icon"
          title="Tylko zakończone"
          onClick={() => setCompletedOnly(!completedOnly)}
        >
          <CheckCircle className="h-4 w-4" />
        </Button>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-1" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            {statuses.map((s: any) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj"
            className="pl-9 w-[200px]"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
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
                                  <button className="text-left font-mono text-[10px] hover:text-primary flex items-center gap-1 truncate" onClick={() => { navigator.clipboard.writeText(order.vehicle.vin); toast.success('Skopiowano VIN'); }}>
                                    {order.vehicle.vin} <Copy className="h-2.5 w-2.5 opacity-50" />
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
      <Dialog open={!!editVehicle} onOpenChange={(v) => { if (!v) setEditVehicle(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              {editVehicle?.brand} {editVehicle?.model} — {editVehicle?.plate}
            </DialogTitle>
          </DialogHeader>
          {editVehicle && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Marka</Label>
                <p className="font-medium">{editVehicle.brand || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Model</Label>
                <p className="font-medium">{editVehicle.model || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Nr rejestracyjny</Label>
                <button className="font-medium flex items-center gap-1 hover:text-primary" onClick={() => { navigator.clipboard.writeText(editVehicle.plate || ''); toast.success('Skopiowano'); }}>
                  {editVehicle.plate || '—'} <Copy className="h-3 w-3 opacity-50" />
                </button>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rok produkcji</Label>
                <p className="font-medium">{editVehicle.year || '—'}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">VIN</Label>
                <button className="font-mono text-sm flex items-center gap-1 hover:text-primary" onClick={() => { navigator.clipboard.writeText(editVehicle.vin || ''); toast.success('Skopiowano VIN'); }}>
                  {editVehicle.vin || '—'} <Copy className="h-3 w-3 opacity-50" />
                </button>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Pojemność silnika</Label>
                <p className="font-medium">{editVehicle.engine_capacity ? `${editVehicle.engine_capacity} cc` : '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Moc silnika</Label>
                <p className="font-medium">{editVehicle.engine_power ? `${editVehicle.engine_power} kW` : '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rodzaj paliwa</Label>
                <p className="font-medium">{editVehicle.fuel_type || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Kolor</Label>
                <p className="font-medium">{editVehicle.color || '—'}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
