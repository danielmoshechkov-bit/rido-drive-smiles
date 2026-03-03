import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkshopOrders, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Search, Car, Wrench, Plus, GripVertical, Undo2 } from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks, isToday, subDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Props {
  providerId: string;
  onBack: () => void;
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);

export function WorkshopScheduler({ providerId, onBack }: Props) {
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [search, setSearch] = useState('');
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [showSlotDialog, setShowSlotDialog] = useState(false);
  const [slotData, setSlotData] = useState<{ day: Date; hour: number; stationId: string } | null>(null);
  const [draggedOrder, setDraggedOrder] = useState<any>(null);
  const [dragSource, setDragSource] = useState<'unplanned' | 'scheduled' | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [dragOverUnplanned, setDragOverUnplanned] = useState(false);

  const updateOrder = useUpdateWorkshopOrder();

  const { data: workstations = [] } = useQuery({
    queryKey: ['workshop-workstations', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_workstations')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orders = [] } = useWorkshopOrders(providerId);

  const defaultStations = workstations.length > 0 ? workstations : [
    { id: '1', name: 'Stanowisko 1', sort_order: 0 },
    { id: '2', name: 'Stanowisko 2', sort_order: 1 },
    { id: '3', name: 'Stanowisko 3', sort_order: 2 },
  ];

  const activeStationId = selectedStation || defaultStations[0]?.id;
  const activeStation = defaultStations.find((s: any) => s.id === activeStationId);

  const unplannedOrders = useMemo(() => {
    let filtered = orders.filter((o: any) =>
      o.status_name !== 'Zakończone' && !o.scheduled_start
    );
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((o: any) =>
        o.order_number?.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q) ||
        o.vehicle?.brand?.toLowerCase().includes(q) ||
        o.vehicle?.model?.toLowerCase().includes(q) ||
        o.vehicle?.plate?.toLowerCase().includes(q)
      );
    }
    return filtered.slice(0, 20);
  }, [orders, search]);

  const scheduledOrders = useMemo(() => {
    return orders.filter((o: any) =>
      o.scheduled_start && o.scheduled_station_id === activeStationId
    );
  }, [orders, activeStationId]);

  const getOrderForCell = (day: Date, hour: number) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return scheduledOrders.find((o: any) => {
      if (!o.scheduled_start) return false;
      const oDate = format(new Date(o.scheduled_start), 'yyyy-MM-dd');
      const oHour = new Date(o.scheduled_start).getHours();
      return oDate === dayStr && oHour === hour;
    });
  };

  const weekDays = useMemo(() => {
    return Array.from({ length: viewMode === 'day' ? 1 : 5 }, (_, i) =>
      addDays(currentWeekStart, i)
    );
  }, [currentWeekStart, viewMode]);

  const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const currentDay = weekDays[0];
  const weekEnd = addDays(currentWeekStart, 4);
  const headerLabel = viewMode === 'day'
    ? format(currentDay, 'EEEE, d MMMM yyyy', { locale: pl })
    : `${format(currentWeekStart, 'd', { locale: pl })} – ${format(weekEnd, 'd MMM yyyy', { locale: pl })}`;

  const handleCellClick = (day: Date, hour: number, stationId: string) => {
    if (getOrderForCell(day, hour)) return;
    setSlotData({ day, hour, stationId });
    setShowSlotDialog(true);
  };

  const handleDrop = async (day: Date, hour: number, stationId: string) => {
    if (!draggedOrder) return;
    const existing = getOrderForCell(day, hour);
    if (existing && existing.id !== draggedOrder.id) {
      toast.error('Ten slot jest już zajęty');
      resetDrag();
      return;
    }
    const scheduledStart = new Date(day);
    scheduledStart.setHours(hour, 0, 0, 0);

    try {
      await updateOrder.mutateAsync({
        id: draggedOrder.id,
        scheduled_start: scheduledStart.toISOString(),
        scheduled_station_id: stationId,
      });
      toast.success(`Zlecenie ${draggedOrder.order_number} → ${format(day, 'dd.MM')} ${hour}:00`);
    } catch {
      toast.error('Nie udało się zaplanować zlecenia');
    }
    resetDrag();
  };

  const handleDropToUnplanned = async () => {
    if (!draggedOrder || dragSource !== 'scheduled') return;
    try {
      await updateOrder.mutateAsync({
        id: draggedOrder.id,
        scheduled_start: null,
        scheduled_station_id: null,
      });
      toast.success(`Zlecenie ${draggedOrder.order_number} wróciło do nieprzypisanych`);
    } catch {
      toast.error('Nie udało się cofnąć zlecenia');
    }
    resetDrag();
  };

  const resetDrag = () => {
    setDraggedOrder(null);
    setDragSource(null);
    setDragOverCell(null);
    setDragOverUnplanned(false);
  };

  const cellKey = (day: Date, hour: number) => `${format(day, 'yyyy-MM-dd')}-${hour}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Terminarz</h2>
      </div>

      {/* Unplanned tasks - drop zone when dragging from calendar */}
      <Card
        className={`border-2 shadow-sm transition-all ${
          dragOverUnplanned && dragSource === 'scheduled'
            ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
            : 'border-border'
        }`}
        onDragOver={(e) => {
          if (dragSource === 'scheduled') {
            e.preventDefault();
            setDragOverUnplanned(true);
          }
        }}
        onDragLeave={() => setDragOverUnplanned(false)}
        onDrop={handleDropToUnplanned}
      >
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">Zadania do rozplanowania</h3>
              {dragSource === 'scheduled' && (
                <span className="text-xs text-orange-600 font-medium flex items-center gap-1 animate-pulse">
                  <Undo2 className="h-3 w-3" /> Upuść tutaj aby cofnąć
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj" className="pl-9 w-[200px]" />
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {unplannedOrders.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center w-full">
                Brak zadań do rozplanowania
              </div>
            ) : (
              unplannedOrders.map((o: any) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onDragStart={() => { setDraggedOrder(o); setDragSource('unplanned'); }}
                  onDragEnd={resetDrag}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Workstation tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {defaultStations.map((st: any) => (
          <Button
            key={st.id}
            variant={activeStationId === st.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedStation(st.id)}
            className="whitespace-nowrap"
          >
            {st.name}
          </Button>
        ))}
      </div>

      {/* Calendar controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => {
            if (viewMode === 'day') setCurrentWeekStart(subDays(currentWeekStart, 1));
            else setCurrentWeekStart(subWeeks(currentWeekStart, 1));
          }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>Dziś</Button>
          <Button variant="outline" size="icon" onClick={() => {
            if (viewMode === 'day') setCurrentWeekStart(addDays(currentWeekStart, 1));
            else setCurrentWeekStart(addWeeks(currentWeekStart, 1));
          }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold ml-2 capitalize">{headerLabel}</h3>
        </div>

        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          {(['day', 'week'] as const).map(mode => (
            <Button
              key={mode}
              variant={viewMode === mode ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode(mode)}
            >
              {mode === 'day' ? 'Dzień' : 'Tydzień'}
            </Button>
          ))}
        </div>
      </div>

      {/* Schedule grid - HIGH CONTRAST */}
      <div className="rounded-xl border-2 border-foreground/20 shadow-lg overflow-hidden">
        {/* Station header - BLUE */}
        <div className="bg-[hsl(220,80%,50%)] px-4 py-2.5 font-semibold text-sm flex items-center gap-2 text-white">
          <Wrench className="h-4 w-4" />
          {activeStation?.name || 'Stanowisko'}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-16 bg-[hsl(220,30%,95%)] dark:bg-[hsl(220,20%,20%)] border-b-2 border-r-2 border-foreground/20 p-2.5 text-left text-foreground font-bold sticky left-0 z-10">
                  Godzina
                </th>
                {weekDays.map(day => {
                  const today = isToday(day);
                  return (
                    <th
                      key={day.toISOString()}
                      className={`border-b-2 border-r border-foreground/20 p-2.5 text-center min-w-[150px] ${
                        today
                          ? 'bg-[hsl(220,80%,50%)] text-white'
                          : 'bg-[hsl(220,30%,95%)] dark:bg-[hsl(220,20%,20%)] text-foreground'
                      }`}
                    >
                      <div className="font-bold text-sm">
                        {format(day, 'EEE', { locale: pl })}
                      </div>
                      <div className={`text-lg font-black ${today ? 'text-white' : ''}`}>
                        {format(day, 'dd.MM')}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hour, hourIdx) => {
                const isEvenRow = hourIdx % 2 === 0;
                return (
                  <tr key={hour}>
                    <td className={`border-b border-r-2 border-foreground/20 p-2 text-right font-mono font-bold text-sm sticky left-0 z-10 ${
                      isEvenRow
                        ? 'bg-[hsl(220,20%,97%)] dark:bg-[hsl(220,15%,15%)] text-foreground'
                        : 'bg-[hsl(220,25%,93%)] dark:bg-[hsl(220,15%,18%)] text-foreground'
                    }`}>
                      {`${hour}:00`}
                    </td>
                    {weekDays.map(day => {
                      const key = cellKey(day, hour);
                      const isDragOver = dragOverCell === key;
                      const scheduledOrder = getOrderForCell(day, hour);
                      const today = isToday(day);

                      return (
                        <td
                          key={key}
                          className={`border-b border-r border-foreground/15 p-1 cursor-pointer transition-all relative h-16 ${
                            today
                              ? (isEvenRow ? 'bg-[hsl(220,60%,97%)] dark:bg-[hsl(220,30%,15%)]' : 'bg-[hsl(220,60%,94%)] dark:bg-[hsl(220,30%,18%)]')
                              : (isEvenRow ? 'bg-background' : 'bg-[hsl(220,15%,96%)] dark:bg-[hsl(220,10%,14%)]')
                          } ${
                            isDragOver && draggedOrder
                              ? '!bg-[hsl(130,60%,85%)] dark:!bg-[hsl(130,40%,20%)] ring-2 ring-[hsl(130,60%,40%)] ring-inset shadow-inner'
                              : scheduledOrder
                                ? ''
                                : 'hover:bg-[hsl(220,40%,92%)] dark:hover:bg-[hsl(220,20%,22%)]'
                          }`}
                          onClick={() => handleCellClick(day, hour, activeStationId)}
                          onDragOver={(e) => { e.preventDefault(); setDragOverCell(key); }}
                          onDragLeave={() => { if (dragOverCell === key) setDragOverCell(null); }}
                          onDrop={() => handleDrop(day, hour, activeStationId)}
                        >
                          {scheduledOrder ? (
                            <div
                              className="bg-[hsl(220,70%,55%)] text-white rounded-md p-1.5 text-xs h-full cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDraggedOrder(scheduledOrder);
                                setDragSource('scheduled');
                              }}
                              onDragEnd={resetDrag}
                            >
                              <div className="flex items-center gap-1 font-semibold">
                                <GripVertical className="h-3 w-3 opacity-60 flex-shrink-0" />
                                <Car className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">
                                  {scheduledOrder.vehicle
                                    ? `${scheduledOrder.vehicle.brand} ${scheduledOrder.vehicle.model}`
                                    : 'Zlecenie'}
                                </span>
                              </div>
                              <div className="text-white/70 truncate ml-5">{scheduledOrder.order_number}</div>
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-40 transition-opacity">
                              <Plus className="h-5 w-5 text-foreground" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slot dialog */}
      <SlotDialog
        open={showSlotDialog}
        onOpenChange={setShowSlotDialog}
        slotData={slotData}
        unplannedOrders={unplannedOrders}
        station={activeStation}
        onSchedule={async (orderId, day, hour, stationId) => {
          const scheduledStart = new Date(day);
          scheduledStart.setHours(hour, 0, 0, 0);
          try {
            await updateOrder.mutateAsync({
              id: orderId,
              scheduled_start: scheduledStart.toISOString(),
              scheduled_station_id: stationId,
            });
            toast.success('Zlecenie dodane do terminarza');
          } catch {
            toast.error('Nie udało się zaplanować');
          }
        }}
      />
    </div>
  );
}

function OrderCard({ order, onDragStart, onDragEnd }: { order: any; onDragStart: () => void; onDragEnd: () => void }) {
  return (
    <Card
      className="min-w-[260px] flex-shrink-0 border-l-4 border-l-[hsl(220,70%,55%)] cursor-grab active:cursor-grabbing hover:shadow-md transition-all bg-card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Car className="h-4 w-4 text-muted-foreground" />
          {order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model} ${order.vehicle.plate || ''}` : 'Brak pojazdu'}
        </div>
        <div className="text-xs text-muted-foreground">{order.order_number}</div>
        {order.items?.slice(0, 3).map((item: any, idx: number) => (
          <div key={idx} className="flex items-center text-xs">
            <Wrench className="h-3 w-3 flex-shrink-0 mr-1" /> <span className="truncate">{item.name}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SlotDialog({ open, onOpenChange, slotData, unplannedOrders, station, onSchedule }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slotData: { day: Date; hour: number; stationId: string } | null;
  unplannedOrders: any[];
  station: any;
  onSchedule: (orderId: string, day: Date, hour: number, stationId: string) => Promise<void>;
}) {
  const [selectedOrderId, setSelectedOrderId] = useState('');

  if (!slotData) return null;

  const handleCreate = async () => {
    if (!selectedOrderId) return;
    await onSchedule(selectedOrderId, slotData.day, slotData.hour, slotData.stationId);
    onOpenChange(false);
    setSelectedOrderId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Zaplanuj zlecenie</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Data</label>
              <div className="text-sm text-muted-foreground mt-1">
                {format(slotData.day, 'EEEE, d MMM yyyy', { locale: pl })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Godzina</label>
              <div className="text-sm text-muted-foreground mt-1">{slotData.hour}:00</div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Stanowisko</label>
            <div className="text-sm text-muted-foreground mt-1">{station?.name}</div>
          </div>

          {unplannedOrders.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Wybierz zlecenie</label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger><SelectValue placeholder="Wybierz zlecenie z listy..." /></SelectTrigger>
                <SelectContent>
                  {unplannedOrders.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_number} — {o.vehicle ? `${o.vehicle.brand} ${o.vehicle.model}` : 'Brak pojazdu'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={handleCreate} disabled={!selectedOrderId}>
              Zaplanuj
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
