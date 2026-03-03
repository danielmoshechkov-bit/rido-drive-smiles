import { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkshopOrders, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Search, Car, Wrench, Plus, GripVertical, Undo2, X, ChevronsUpDown } from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks, isToday, subDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Props {
  providerId: string;
  onBack: () => void;
  title?: string;
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);

export function WorkshopScheduler({ providerId, onBack, title = 'Terminarz' }: Props) {
  const queryClient = useQueryClient();
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Warsztat');
  const [showSlotDialog, setShowSlotDialog] = useState(false);
  const [slotData, setSlotData] = useState<{ day: Date; hour: number; stationId: string } | null>(null);
  const [draggedOrder, setDraggedOrder] = useState<any>(null);
  const [dragSource, setDragSource] = useState<'unplanned' | 'scheduled' | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [dragOverUnplanned, setDragOverUnplanned] = useState(false);
  const [showAddStation, setShowAddStation] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [newStationCategory, setNewStationCategory] = useState('Warsztat');
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // Resize state
  const [resizingOrder, setResizingOrder] = useState<any>(null);
  const [resizeTargetHour, setResizeTargetHour] = useState<number | null>(null);
  const [resizeStartHour, setResizeStartHour] = useState<number | null>(null);
  const resizeRef = useRef<{ startY: number; origStartHour: number; origEndHour: number; orderId: string; direction: 'top' | 'bottom' } | null>(null);
  const resizingOrderRef = useRef<any>(null);
  const resizeTargetHourRef = useRef<number | null>(null);
  const resizeStartHourRef = useRef<number | null>(null);

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

  const categories = useMemo(() => {
    const cats = new Set<string>();
    workstations.forEach((ws: any) => cats.add(ws.category || 'Warsztat'));
    if (cats.size === 0) cats.add('Warsztat');
    return Array.from(cats);
  }, [workstations]);

  useMemo(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [categories]);

  const categoryStations = useMemo(() => {
    const filtered = workstations.filter((ws: any) => (ws.category || 'Warsztat') === activeCategory);
    return filtered.length > 0 ? filtered : [{ id: '__default', name: 'Stanowisko 1', category: activeCategory }];
  }, [workstations, activeCategory]);

  const addStationMut = useMutation({
    mutationFn: async ({ name, category }: { name: string; category: string }) => {
      const maxSort = workstations.length;
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .insert({ provider_id: providerId, name, category, sort_order: maxSort });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success('Stanowisko dodane');
    },
  });

  const removeStationMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('workshop_workstations').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] }),
  });

  const unplannedOrders = useMemo(() => {
    let filtered = orders.filter((o: any) => o.status_name !== 'Zakończone' && !o.scheduled_start);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((o: any) =>
        o.order_number?.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q) ||
        o.vehicle?.brand?.toLowerCase().includes(q) || o.vehicle?.model?.toLowerCase().includes(q) ||
        o.vehicle?.plate?.toLowerCase().includes(q)
      );
    }
    return filtered.slice(0, 20);
  }, [orders, search]);

  // Calculate order span in hours
  const getOrderSpan = useCallback((order: any): number => {
    if (!order.scheduled_start || !order.scheduled_end) return 1;
    const start = new Date(order.scheduled_start);
    const end = new Date(order.scheduled_end);
    const hours = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60)));
    return Math.min(hours, HOURS.length);
  }, []);

  // Get order that starts at this cell
  const getOrderStartingAt = (stationId: string, day: Date, hour: number) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return orders.find((o: any) => {
      if (!o.scheduled_start || o.scheduled_station_id !== stationId) return false;
      const oDate = format(new Date(o.scheduled_start), 'yyyy-MM-dd');
      const oHour = new Date(o.scheduled_start).getHours();
      return oDate === dayStr && oHour === hour;
    });
  };

  // Check if cell is occupied by a spanning order
  const isCellOccupied = (stationId: string, day: Date, hour: number) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return orders.some((o: any) => {
      if (!o.scheduled_start || o.scheduled_station_id !== stationId) return false;
      const oDate = format(new Date(o.scheduled_start), 'yyyy-MM-dd');
      if (oDate !== dayStr) return false;
      const oHour = new Date(o.scheduled_start).getHours();
      const span = getOrderSpan(o);
      return hour >= oHour && hour < oHour + span;
    });
  };

  const weekDays = useMemo(() => {
    return Array.from({ length: viewMode === 'day' ? 1 : 5 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart, viewMode]);

  const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const currentDay = weekDays[0];
  const weekEnd = addDays(currentWeekStart, 4);
  const headerLabel = viewMode === 'day'
    ? format(currentDay, 'EEEE, d MMMM yyyy', { locale: pl })
    : `${format(currentWeekStart, 'd', { locale: pl })} – ${format(weekEnd, 'd MMM yyyy', { locale: pl })}`;

  const handleCellClick = (day: Date, hour: number, stationId: string) => {
    if (isCellOccupied(stationId, day, hour)) return;
    setSlotData({ day, hour, stationId });
    setShowSlotDialog(true);
  };

  const handleDrop = async (day: Date, hour: number, stationId: string) => {
    if (!draggedOrder) return;
    if (isCellOccupied(stationId, day, hour) && !getOrderStartingAt(stationId, day, hour)) {
      toast.error('Slot zajęty');
      resetDrag();
      return;
    }
    const existing = getOrderStartingAt(stationId, day, hour);
    if (existing && existing.id !== draggedOrder.id) { toast.error('Slot zajęty'); resetDrag(); return; }
    const scheduledStart = new Date(day);
    scheduledStart.setHours(hour, 0, 0, 0);
    const span = getOrderSpan(draggedOrder);
    const scheduledEnd = new Date(scheduledStart);
    scheduledEnd.setHours(hour + span, 0, 0, 0);
    try {
      await updateOrder.mutateAsync({ id: draggedOrder.id, scheduled_start: scheduledStart.toISOString(), scheduled_end: scheduledEnd.toISOString(), scheduled_station_id: stationId });
      toast.success(`Zlecenie ${draggedOrder.order_number} → ${format(day, 'dd.MM')} ${hour}:00`);
    } catch { toast.error('Nie udało się zaplanować'); }
    resetDrag();
  };

  const handleDropToUnplanned = async () => {
    if (!draggedOrder || dragSource !== 'scheduled') return;
    try {
      await updateOrder.mutateAsync({ id: draggedOrder.id, scheduled_start: null, scheduled_end: null, scheduled_station_id: null });
      toast.success(`Zlecenie ${draggedOrder.order_number} cofnięte`);
    } catch { toast.error('Błąd'); }
    resetDrag();
  };

  const resetDrag = () => { setDraggedOrder(null); setDragSource(null); setDragOverCell(null); setDragOverUnplanned(false); };
  const cellKey = (stationId: string, day: Date, hour: number) => `${stationId}-${format(day, 'yyyy-MM-dd')}-${hour}`;

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent, order: any, direction: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();
    const origStartHour = new Date(order.scheduled_start).getHours();
    const span = getOrderSpan(order);
    const origEndHour = origStartHour + span;
    resizeRef.current = { startY: e.clientY, origStartHour, origEndHour, orderId: order.id, direction };
    resizingOrderRef.current = order;
    resizeTargetHourRef.current = origEndHour;
    resizeStartHourRef.current = origStartHour;
    setResizingOrder(order);
    setResizeTargetHour(origEndHour);
    setResizeStartHour(origStartHour);

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaY = ev.clientY - resizeRef.current.startY;
      const deltaHours = Math.round(deltaY / 56);
      if (resizeRef.current.direction === 'bottom') {
        const newEnd = Math.max(resizeRef.current.origStartHour + 1, Math.min(resizeRef.current.origEndHour + deltaHours, HOURS[HOURS.length - 1] + 1));
        resizeTargetHourRef.current = newEnd;
        setResizeTargetHour(newEnd);
      } else {
        const newStart = Math.max(HOURS[0], Math.min(resizeRef.current.origStartHour + deltaHours, resizeRef.current.origEndHour - 1));
        resizeStartHourRef.current = newStart;
        setResizeStartHour(newStart);
      }
    };

    const onMouseUp = async () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const currentOrder = resizingOrderRef.current;
      const currentTargetHour = resizeTargetHourRef.current;
      const currentStartHour = resizeStartHourRef.current;
      if (resizeRef.current && currentOrder) {
        const origStart = new Date(currentOrder.scheduled_start);
        const newStart = new Date(origStart);
        newStart.setHours(currentStartHour ?? resizeRef.current.origStartHour, 0, 0, 0);
        const newEnd = new Date(origStart);
        newEnd.setHours(currentTargetHour ?? resizeRef.current.origEndHour, 0, 0, 0);
        if (newEnd.getTime() > newStart.getTime()) {
          try {
            await updateOrder.mutateAsync({ id: currentOrder.id, scheduled_start: newStart.toISOString(), scheduled_end: newEnd.toISOString() });
            const hours = Math.round((newEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60));
            toast.success(`Czas pracy: ${hours}h`);
          } catch { toast.error('Błąd zmiany czasu'); }
        }
      }
      setResizingOrder(null);
      setResizeTargetHour(null);
      setResizeStartHour(null);
      resizeRef.current = null;
      resizingOrderRef.current = null;
      resizeTargetHourRef.current = null;
      resizeStartHourRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <Button onClick={() => { setSlotData({ day: weekDays[0], hour: HOURS[0], stationId: categoryStations[0]?.id || '__default' }); setShowSlotDialog(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Dodaj zlecenie
        </Button>
      </div>

      {/* Unplanned orders */}
      <Card
        className={`border-2 shadow-sm transition-all ${dragOverUnplanned && dragSource === 'scheduled' ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20' : 'border-border'}`}
        onDragOver={(e) => { if (dragSource === 'scheduled') { e.preventDefault(); setDragOverUnplanned(true); } }}
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
              <div className="text-sm text-muted-foreground py-4 text-center w-full">Brak zadań do rozplanowania</div>
            ) : (
              unplannedOrders.map((o: any) => (
                <OrderCard key={o.id} order={o} onDragStart={() => { setDraggedOrder(o); setDragSource('unplanned'); }} onDragEnd={resetDrag} />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Category tabs + controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/30">
            {categories.map(cat => (
              <Button key={cat} variant={activeCategory === cat ? 'default' : 'ghost'} size="sm" onClick={() => setActiveCategory(cat)} className="text-xs">
                {cat}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setShowAddCategory(true)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { setNewStationCategory(activeCategory); setShowAddStation(true); }}>
            <Plus className="h-3 w-3" /> Stanowisko
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => {
            if (viewMode === 'day') setCurrentWeekStart(subDays(currentWeekStart, 1));
            else setCurrentWeekStart(subWeeks(currentWeekStart, 1));
          }}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={goToToday}>Dziś</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => {
            if (viewMode === 'day') setCurrentWeekStart(addDays(currentWeekStart, 1));
            else setCurrentWeekStart(addWeeks(currentWeekStart, 1));
          }}><ChevronRight className="h-4 w-4" /></Button>
          <h3 className="text-lg font-semibold capitalize">{headerLabel}</h3>
          <div className="flex items-center gap-1 border rounded-lg p-0.5 ml-4">
            {(['day', 'week'] as const).map(mode => (
              <Button key={mode} variant={viewMode === mode ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode(mode)}>
                {mode === 'day' ? 'Dzień' : 'Tydzień'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-column schedule grid */}
      <div className="rounded-xl border-2 border-foreground/20 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-16 bg-[hsl(220,30%,95%)] dark:bg-[hsl(220,20%,20%)] border-b-2 border-r-2 border-foreground/20 p-2 text-left text-foreground font-bold sticky left-0 z-20" rowSpan={2}>
                  Godzina
                </th>
                {categoryStations.map((st: any) => (
                  <th key={st.id} colSpan={weekDays.length} className="bg-[hsl(220,80%,50%)] text-white border-b border-r-2 border-foreground/20 p-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Wrench className="h-3.5 w-3.5" />
                      <span className="font-semibold text-sm">{st.name}</span>
                      {st.id !== '__default' && (
                        <button onClick={() => removeStationMut.mutate(st.id)} className="opacity-50 hover:opacity-100 ml-1">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                {categoryStations.map((st: any) =>
                  weekDays.map(day => {
                    const today = isToday(day);
                    return (
                      <th key={`${st.id}-${day.toISOString()}`} className={`border-b-2 border-r border-foreground/20 p-1.5 text-center min-w-[120px] ${today ? 'bg-[hsl(220,80%,50%)] text-white' : 'bg-[hsl(220,30%,95%)] dark:bg-[hsl(220,20%,20%)] text-foreground'}`}>
                        <div className="font-bold text-xs">{format(day, 'EEE', { locale: pl })}</div>
                        <div className={`text-sm font-black ${today ? 'text-white' : ''}`}>{format(day, 'dd.MM')}</div>
                      </th>
                    );
                  })
                )}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hour, hourIdx) => {
                const isEvenRow = hourIdx % 2 === 0;
                return (
                  <tr key={hour}>
                    <td className={`border-b border-r-2 border-foreground/20 p-2 text-right font-mono font-bold text-sm sticky left-0 z-10 ${isEvenRow ? 'bg-[hsl(220,20%,97%)] dark:bg-[hsl(220,15%,15%)] text-foreground' : 'bg-[hsl(220,25%,93%)] dark:bg-[hsl(220,15%,18%)] text-foreground'}`}>
                      {`${hour}:00`}
                    </td>
                    {categoryStations.map((st: any) =>
                      weekDays.map(day => {
                        const key = cellKey(st.id, day, hour);
                        const isDragOver = dragOverCell === key;
                        const scheduledOrder = getOrderStartingAt(st.id, day, hour);
                        const today = isToday(day);

                        // Check if this cell is part of a multi-hour order (not the starting cell)
                        if (!scheduledOrder) {
                          const dayStr = format(day, 'yyyy-MM-dd');
                          // Check if occupied by a real order's span
                          const isPartOfOrder = orders.some((o: any) => {
                            if (!o.scheduled_start || o.scheduled_station_id !== st.id) return false;
                            const oDate = format(new Date(o.scheduled_start), 'yyyy-MM-dd');
                            if (oDate !== dayStr) return false;
                            const oHour = new Date(o.scheduled_start).getHours();
                            const span = getOrderSpan(o);
                            // Check if resizing changes span
                            if (resizingOrder && resizingOrder.id === o.id) {
                              const effStart = resizeStartHour ?? oHour;
                              const effEnd = resizeTargetHour ?? (oHour + span);
                              return hour > effStart && hour < effEnd;
                            }
                            return hour > oHour && hour < oHour + span;
                          });
                          
                          if (isPartOfOrder) {
                            // This cell is covered by a rowSpan - don't render it
                            return null;
                          }
                        }

                        // Calculate span for the starting cell
                        let displaySpan = 1;
                        if (scheduledOrder) {
                          const origSpan = getOrderSpan(scheduledOrder);
                          if (resizingOrder && resizingOrder.id === scheduledOrder.id) {
                            const effStart = resizeStartHour ?? new Date(scheduledOrder.scheduled_start).getHours();
                            const effEnd = resizeTargetHour ?? (effStart + origSpan);
                            displaySpan = Math.max(1, effEnd - effStart);
                          } else {
                            displaySpan = origSpan;
                          }
                        }

                        return (
                          <td
                            key={key}
                            rowSpan={scheduledOrder ? displaySpan : 1}
                            className={`border-b border-r border-foreground/15 p-0 cursor-pointer transition-all relative ${scheduledOrder ? '' : 'h-14'} ${
                              today
                                ? (isEvenRow ? 'bg-[hsl(220,60%,97%)] dark:bg-[hsl(220,30%,15%)]' : 'bg-[hsl(220,60%,94%)] dark:bg-[hsl(220,30%,18%)]')
                                : (isEvenRow ? 'bg-background' : 'bg-[hsl(220,15%,96%)] dark:bg-[hsl(220,10%,14%)]')
                            } ${isDragOver && draggedOrder ? '!bg-[hsl(220,70%,85%)] dark:!bg-[hsl(220,50%,25%)] ring-2 ring-[hsl(220,70%,50%)] ring-inset' : scheduledOrder ? '' : 'hover:bg-[hsl(220,40%,92%)] dark:hover:bg-[hsl(220,20%,22%)]'}`}
                            style={scheduledOrder ? { height: `${displaySpan * 56}px` } : undefined}
                            onClick={() => !scheduledOrder && handleCellClick(day, hour, st.id)}
                            onDragOver={(e) => { e.preventDefault(); setDragOverCell(key); }}
                            onDragLeave={() => { if (dragOverCell === key) setDragOverCell(null); }}
                            onDrop={() => handleDrop(day, hour, st.id)}
                          >
                            {scheduledOrder ? (
                              <div
                                className="bg-[hsl(220,70%,55%)] text-white rounded-md m-[2px] p-1.5 text-[10px] cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow relative select-none"
                                style={{ height: 'calc(100% - 4px)' }}
                                draggable
                                onDragStart={(e) => { e.stopPropagation(); setDraggedOrder(scheduledOrder); setDragSource('scheduled'); }}
                                onDragEnd={resetDrag}
                              >
                                {/* Resize handle at top */}
                                <div
                                  className="absolute top-0 left-0 right-0 h-3 cursor-n-resize flex items-center justify-center bg-[hsl(220,70%,45%)] rounded-t-md opacity-0 hover:opacity-100 transition-opacity"
                                  onMouseDown={(e) => handleResizeStart(e, scheduledOrder, 'top')}
                                >
                                  <ChevronsUpDown className="h-2.5 w-2.5 text-white/80" />
                                </div>
                                <div className="flex items-center gap-0.5 font-semibold mt-2">
                                  <GripVertical className="h-3 w-3 opacity-60 flex-shrink-0" />
                                  <Car className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{scheduledOrder.vehicle ? `${scheduledOrder.vehicle.brand} ${scheduledOrder.vehicle.model}` : 'Zlecenie'}</span>
                                </div>
                                <div className="text-white/70 truncate ml-4">{scheduledOrder.order_number}</div>
                                {displaySpan > 1 && (
                                  <div className="text-white/60 text-[9px] ml-4 mt-0.5">{displaySpan}h</div>
                                )}
                                {/* Resize handle at bottom */}
                                <div
                                  className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-center justify-center bg-[hsl(220,70%,45%)] rounded-b-md opacity-0 hover:opacity-100 transition-opacity"
                                  onMouseDown={(e) => handleResizeStart(e, scheduledOrder, 'bottom')}
                                >
                                  <ChevronsUpDown className="h-2.5 w-2.5 text-white/80" />
                                </div>
                              </div>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-40 transition-opacity">
                                <Plus className="h-4 w-4 text-foreground" />
                              </div>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Station Dialog */}
      <Dialog open={showAddStation} onOpenChange={setShowAddStation}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Dodaj stanowisko</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nazwa stanowiska</Label>
              <Input value={newStationName} onChange={e => setNewStationName(e.target.value)} placeholder="np. Podnośnik 1" />
            </div>
            <div>
              <Label>Kategoria</Label>
              <Select value={newStationCategory} onValueChange={setNewStationCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStation(false)}>Anuluj</Button>
            <Button onClick={() => { if (newStationName.trim()) { addStationMut.mutate({ name: newStationName.trim(), category: newStationCategory }); setNewStationName(''); setShowAddStation(false); } }}>Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Dodaj kategorię</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Nazwa kategorii</Label>
            <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="np. Myjnia, Lakiernia" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCategory(false)}>Anuluj</Button>
            <Button onClick={() => {
              if (newCategoryName.trim()) {
                addStationMut.mutate({ name: `${newCategoryName.trim()} 1`, category: newCategoryName.trim() });
                setActiveCategory(newCategoryName.trim());
                setNewCategoryName('');
                setShowAddCategory(false);
              }
            }}>Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot dialog */}
      <SlotDialog
        open={showSlotDialog}
        onOpenChange={setShowSlotDialog}
        slotData={slotData}
        providerId={providerId}
        unplannedOrders={unplannedOrders}
        stationName={categoryStations.find((s: any) => s.id === slotData?.stationId)?.name || ''}
        onSchedule={async (orderId, day, hour, stationId) => {
          const scheduledStart = new Date(day);
          scheduledStart.setHours(hour, 0, 0, 0);
          const scheduledEnd = new Date(day);
          scheduledEnd.setHours(hour + 1, 0, 0, 0);
          try {
            await updateOrder.mutateAsync({ id: orderId, scheduled_start: scheduledStart.toISOString(), scheduled_end: scheduledEnd.toISOString(), scheduled_station_id: stationId });
            toast.success('Zlecenie dodane do terminarza');
          } catch { toast.error('Nie udało się zaplanować'); }
        }}
      />
    </div>
  );
}

function OrderCard({ order, onDragStart, onDragEnd }: { order: any; onDragStart: () => void; onDragEnd: () => void }) {
  return (
    <Card
      className="min-w-[240px] flex-shrink-0 border-l-4 border-l-[hsl(220,70%,55%)] cursor-grab active:cursor-grabbing hover:shadow-md transition-all bg-card"
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
    >
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Car className="h-4 w-4 text-muted-foreground" />
          {order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model} ${order.vehicle.plate || ''}` : 'Brak pojazdu'}
        </div>
        <div className="text-xs text-muted-foreground">{order.order_number}</div>
        {order.items?.slice(0, 2).map((item: any, idx: number) => (
          <div key={idx} className="flex items-center text-xs">
            <Wrench className="h-3 w-3 flex-shrink-0 mr-1" /> <span className="truncate">{item.name}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SlotDialog({ open, onOpenChange, slotData, providerId, unplannedOrders, stationName, onSchedule }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  slotData: { day: Date; hour: number; stationId: string } | null;
  providerId: string;
  unplannedOrders: any[]; stationName: string;
  onSchedule: (orderId: string, day: Date, hour: number, stationId: string) => Promise<void>;
}) {
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [activeTab, setActiveTab] = useState<'event' | 'order'>('event');
  const [eventForm, setEventForm] = useState({
    service: '', type: 'Wydarzenie', color: 'Niebieski', allDay: false,
    duration: '1 godz.', worker: '', description: '',
  });
  if (!slotData) return null;

  const endHour = slotData.hour + 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedOrderId(''); setActiveTab('event'); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nowe wydarzenie / zlecenie</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 border rounded-lg p-0.5 bg-muted/30">
            <Button variant={activeTab === 'event' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('event')} className="flex-1 text-xs">
              Nowe wydarzenie
            </Button>
            <Button variant={activeTab === 'order' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('order')} className="flex-1 text-xs">
              Nowe zlecenie
            </Button>
          </div>

          {/* Date/time info */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><label className="font-medium">Data</label><div className="text-muted-foreground mt-1">{format(slotData.day, 'EEEE, d MMM', { locale: pl })}</div></div>
            <div><label className="font-medium">Godzina</label><div className="text-muted-foreground mt-1">{slotData.hour}:00 – {endHour}:00</div></div>
            <div><label className="font-medium">Stanowisko</label><div className="text-muted-foreground mt-1">{stationName}</div></div>
          </div>

          {activeTab === 'event' ? (
            <div className="space-y-3">
              <div>
                <Label>Usługa / czynność</Label>
                <Input value={eventForm.service} onChange={e => setEventForm(f => ({...f, service: e.target.value}))} placeholder="Wybierz usługę lub czynność" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Typ</Label>
                  <Select value={eventForm.type} onValueChange={v => setEventForm(f => ({...f, type: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Wydarzenie">Wydarzenie</SelectItem>
                      <SelectItem value="Zadanie">Zadanie</SelectItem>
                      <SelectItem value="Przerwa">Przerwa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kolor</Label>
                  <Select value={eventForm.color} onValueChange={v => setEventForm(f => ({...f, color: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Niebieski">🔵 Niebieski</SelectItem>
                      <SelectItem value="Fioletowy">🟣 Fioletowy</SelectItem>
                      <SelectItem value="Zielony">🟢 Zielony</SelectItem>
                      <SelectItem value="Czerwony">🔴 Czerwony</SelectItem>
                      <SelectItem value="Pomarańczowy">🟠 Pomarańczowy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Czas trwania</Label>
                <Select value={eventForm.duration} onValueChange={v => setEventForm(f => ({...f, duration: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30 min">30 min</SelectItem>
                    <SelectItem value="1 godz.">1 godz.</SelectItem>
                    <SelectItem value="2 godz.">2 godz.</SelectItem>
                    <SelectItem value="3 godz.">3 godz.</SelectItem>
                    <SelectItem value="4 godz.">4 godz.</SelectItem>
                    <SelectItem value="Cały dzień">Cały dzień</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pracownik</Label>
                <Input value={eventForm.worker} onChange={e => setEventForm(f => ({...f, worker: e.target.value}))} placeholder="Wybierz pracownika (opcjonalnie)" />
              </div>
              <div>
                <Label>Opis</Label>
                <Input value={eventForm.description} onChange={e => setEventForm(f => ({...f, description: e.target.value}))} placeholder="Dodatkowe informacje..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
                <Button onClick={() => { toast.success('Wydarzenie dodane'); onOpenChange(false); }}>Zapisz wydarzenie</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {unplannedOrders.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Wybierz istniejące zlecenie</label>
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
              <div className="text-center text-sm text-muted-foreground py-2">lub</div>
              <Button variant="outline" className="w-full gap-2" onClick={() => { onOpenChange(false); toast.info('Otwórz formularz nowego zlecenia z sekcji Zlecenia'); }}>
                <Plus className="h-4 w-4" /> Utwórz nowe zlecenie
              </Button>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
                <Button onClick={async () => { if (selectedOrderId) { await onSchedule(selectedOrderId, slotData.day, slotData.hour, slotData.stationId); onOpenChange(false); setSelectedOrderId(''); } }} disabled={!selectedOrderId}>Zaplanuj</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
