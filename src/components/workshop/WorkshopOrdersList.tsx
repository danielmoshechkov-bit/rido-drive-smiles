import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useWorkshopOrders, useWorkshopStatuses, useUpdateWorkshopOrder,
} from '@/hooks/useWorkshop';
import { WorkshopNewOrderDialog } from './WorkshopNewOrderDialog';
import {
  Plus, Search, CheckCircle, Calendar, Wallet, Users, Car, Trash2,
  Phone, ClipboardList, Filter, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  providerId: string;
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

export function WorkshopOrdersList({ providerId }: Props) {
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [completedOnly, setCompletedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);

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

        {/* Filter icons */}
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
                  <TableHead>Utworzone</TableHead>
                  <TableHead>Zakończone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Klient</TableHead>
                  <TableHead>Przyjęcie</TableHead>
                  <TableHead className="text-right">Razem</TableHead>
                  <TableHead>Pojazd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order: any) => (
                  <TableRow key={order.id} className="group">
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{order.order_number}</span>
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(order.created_at), 'yyyy-MM-dd')}</TableCell>
                    <TableCell>{order.completed_at ? format(new Date(order.completed_at), 'yyyy-MM-dd') : ''}</TableCell>
                    <TableCell>
                      <div className="relative">
                        <button
                          onClick={() => setStatusDropdownId(statusDropdownId === order.id ? null : order.id)}
                          className="cursor-pointer"
                        >
                          <Badge className={`${statusColors[order.status_name] || 'bg-gray-200 text-black'} text-xs whitespace-nowrap`}>
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
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {order.client && <Users className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-sm">{getClientName(order)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {order.client?.phone && (
                        <button title="Pokaż dane do kontaktu">
                          <Phone className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {(order.total_gross || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {order.vehicle && <Car className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-sm truncate max-w-[180px]">{getVehicleName(order)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOrders.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Brak zleceń
                    </TableCell>
                  </TableRow>
                )}
                {filteredOrders.length > 0 && (
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell colSpan={7}>Suma</TableCell>
                    <TableCell className="text-right">
                      {totalSum.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell></TableCell>
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
    </div>
  );
}
