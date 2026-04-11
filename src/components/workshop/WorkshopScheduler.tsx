import { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkshopOrders, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Search, Car, Wrench, Plus, GripVertical, Undo2, X, ChevronsUpDown, Phone, User, Eye } from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks, isToday, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';

interface Props {
  providerId: string;
  onBack: () => void;
  title?: string;
  focusOrderId?: string;
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);

export function WorkshopScheduler({ providerId, onBack, title = 'Terminarz', focusOrderId }: Props) {
  const queryClient = useQueryClient();
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
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

  // Employees for quick preview
  const { data: employees = [] } = useQuery({
    queryKey: ['workshop-employees', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  });

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let filtered = orders.filter((o: any) => {
      if (o.status_name === 'Zakończone') return false;
      if (!o.scheduled_start) return true;
      const scheduledDate = new Date(o.scheduled_start);
      scheduledDate.setHours(0, 0, 0, 0);
      return scheduledDate < today;
    });
    
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((o: any) =>
        o.order_number?.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q) ||
        o.vehicle?.brand?.toLowerCase().includes(q) || o.vehicle?.model?.toLowerCase().includes(q) ||
        o.vehicle?.plate?.toLowerCase().includes(q)
      );
    }
    if (focusOrderId) {
      const focusOrder = orders.find((o: any) => o.id === focusOrderId && o.status_name !== 'Zakończone');
      const rest = filtered.filter((o: any) => o.id !== focusOrderId);
      if (focusOrder) {
        return [focusOrder, ...rest.slice(0, 19)];
      }
    }
    return filtered.slice(0, 20);
  }, [orders, search, focusOrderId]);

  const getOrderSpan = useCallback((order: any): number => {
    if (!order.scheduled_start || !order.scheduled_end) return 1;
    const start = new Date(order.scheduled_start);
    const end = new Date(order.scheduled_end);
    const hours = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60)));
    return Math.min(hours, HOURS.length);
  }, []);

  const getOrderStartingAt = (stationId: string, day: Date, hour: number) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return orders.find((o: any) => {
      if (!o.scheduled_start || o.scheduled_station_id !== stationId) return false;
      const oDate = format(new Date(o.scheduled_start), 'yyyy-MM-dd');
      const oHour = new Date(o.scheduled_start).getHours();
      return oDate === dayStr && oHour === hour;
    });
  };

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

  const goToToday = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setCurrentMonth(new Date());
  };
  const currentDay = weekDays[0];
  const weekEnd = addDays(currentWeekStart, 4);
  const headerLabel = viewMode === 'day'
    ? format(currentDay, 'EEEE, d MMMM yyyy', { locale: pl })
    : viewMode === 'month'
    ? format(currentMonth, 'LLLL yyyy', { locale: pl })
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

  // Month view helpers
  const monthDays = useMemo(() => {
    if (viewMode !== 'month') return [];
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    // Pad start to Monday
    const firstDayOfWeek = getDay(start);
    const padStart = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    const paddedDays: (Date | null)[] = Array(padStart).fill(null);
    paddedDays.push(...days);
    // Pad end to fill last row
    while (paddedDays.length % 7 !== 0) paddedDays.push(null);
    return paddedDays;
  }, [currentMonth, viewMode]);

  const getOrdersForDay = useCallback((day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return orders.filter((o: any) => {
      if (!o.scheduled_start) return false;
      return format(new Date(o.scheduled_start), 'yyyy-MM-dd') === dayStr;
    });
  }, [orders]);

  // Navigation
  const handlePrev = () => {
    if (viewMode === 'day') setCurrentWeekStart(subDays(currentWeekStart, 1));
    else if (viewMode === 'week') setCurrentWeekStart(subWeeks(currentWeekStart, 1));
    else setCurrentMonth(subMonths(currentMonth, 1));
  };
  const handleNext = () => {
    if (viewMode === 'day') setCurrentWeekStart(addDays(currentWeekStart, 1));
    else if (viewMode === 'week') setCurrentWeekStart(addWeeks(currentWeekStart, 1));
    else setCurrentMonth(addMonths(currentMonth, 1));
  };

  // Total columns for grid
  const totalColumns = categoryStations.length * weekDays.length;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {title && <h2 className="text-2xl font-bold tracking-tight mb-3">{title}</h2>}

      {/* Unplanned orders */}
      <Card
        className={`border-2 shadow-sm transition-all flex-shrink-0 ${dragOverUnplanned && dragSource === 'scheduled' ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20' : 'border-border'}`}
        onDragOver={(e) => { if (dragSource === 'scheduled') { e.preventDefault(); setDragOverUnplanned(true); } }}
        onDragLeave={() => setDragOverUnplanned(false)}
        onDrop={handleDropToUnplanned}
      >
        <CardContent className="py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">Zadania do rozplanowania</h3>
              <Button size="sm" onClick={() => { setSlotData({ day: weekDays[0], hour: HOURS[0], stationId: categoryStations[0]?.id || '__default' }); setShowSlotDialog(true); }} className="gap-1.5 ml-2 h-7 text-xs">
                <Plus className="h-3.5 w-3.5" /> Dodaj
              </Button>
              {dragSource === 'scheduled' && (
                <span className="text-xs text-orange-600 font-medium flex items-center gap-1 animate-pulse">
                  <Undo2 className="h-3 w-3" /> Upuść tutaj aby cofnąć
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj" className="pl-9 w-[200px] h-8" />
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {unplannedOrders.length === 0 ? (
              <div className="text-sm text-muted-foreground py-3 text-center w-full">Brak zadań do rozplanowania</div>
            ) : (
              unplannedOrders.map((o: any) => (
                <OrderCard key={o.id} order={o} onDragStart={() => { setDraggedOrder(o); setDragSource('unplanned'); }} onDragEnd={resetDrag} isFocused={o.id === focusOrderId} employees={employees} updateOrder={updateOrder} />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Category tabs + controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 my-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/30">
            {categories.map(cat => (
              <Button key={cat} variant={activeCategory === cat ? 'default' : 'ghost'} size="sm" onClick={() => setActiveCategory(cat)} className="text-xs h-7">
                {cat}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => setShowAddCategory(true)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => { setNewStationCategory(activeCategory); setShowAddStation(true); }}>
            <Plus className="h-3 w-3" /> Stanowisko
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handlePrev}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToToday}>Dziś</Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleNext}><ChevronRight className="h-4 w-4" /></Button>
          <h3 className="text-sm font-semibold capitalize">{headerLabel}</h3>
          <div className="flex items-center gap-0.5 border rounded-lg p-0.5 ml-2">
            {(['day', 'week', 'month'] as const).map(mode => (
              <Button key={mode} variant={viewMode === mode ? 'default' : 'ghost'} size="sm" className="h-7 text-xs" onClick={() => setViewMode(mode)}>
                {mode === 'day' ? 'Dzień' : mode === 'week' ? 'Tydzień' : 'Miesiąc'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Month View */}
      {viewMode === 'month' ? (
        <div className="flex-1 overflow-auto rounded-xl border-2 border-foreground/20 shadow-lg">
          <div className="grid grid-cols-7 bg-[hsl(220,30%,95%)] dark:bg-[hsl(220,20%,20%)]">
            {['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map(d => (
              <div key={d} className="p-2 text-center text-xs font-bold text-foreground border-b border-r border-foreground/15">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day, idx) => {
              if (!day) return <div key={idx} className="p-2 min-h-[80px] border-b border-r border-foreground/10 bg-muted/30" />;
              const dayOrders = getOrdersForDay(day);
              const today = isToday(day);
              return (
                <div key={idx} className={`p-1.5 min-h-[80px] border-b border-r border-foreground/10 cursor-pointer hover:bg-accent/30 transition-colors ${today ? 'bg-primary/5' : ''} ${!isSameMonth(day, currentMonth) ? 'opacity-40' : ''}`}
                  onClick={() => { setCurrentWeekStart(startOfWeek(day, { weekStartsOn: 1 })); setViewMode('day'); }}>
                  <div className={`text-xs font-bold mb-1 ${today ? 'text-primary' : 'text-foreground'}`}>{format(day, 'd')}</div>
                  {dayOrders.slice(0, 3).map((o: any) => (
                    <div key={o.id} className="text-[9px] bg-primary/20 text-primary rounded px-1 py-0.5 mb-0.5 truncate">{o.vehicle?.plate || o.order_number}</div>
                  ))}
                  {dayOrders.length > 3 && <div className="text-[9px] text-muted-foreground">+{dayOrders.length - 3} więcej</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Day/Week grid */
        <div className="flex-1 overflow-hidden rounded-xl border-2 border-foreground/20 shadow-lg">
          <div className="overflow-auto h-full">
            <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '60px' }} />
                {categoryStations.map((st: any) =>
                  weekDays.map((day, dayIdx) => (
                    <col key={`${st.id}-${dayIdx}`} style={{ width: `${(100 - 5) / totalColumns}%` }} />
                  ))
                )}
              </colgroup>
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="bg-[hsl(220,30%,95%)] dark:bg-[hsl(220,20%,20%)] border-b-2 border-r-2 border-foreground/20 p-2 text-left text-foreground font-bold" rowSpan={2}>
                    Godzina
                  </th>
                  {categoryStations.map((st: any, stIdx: number) => (
                    <th key={st.id} colSpan={weekDays.length} className={`bg-[hsl(220,80%,50%)] text-white border-b border-foreground/20 p-1.5 text-center ${stIdx < categoryStations.length - 1 ? 'border-r-[3px] border-r-foreground/40' : 'border-r-2 border-r-foreground/20'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <Wrench className="h-3 w-3" />
                        <span className="font-semibold text-xs truncate">{st.name}</span>
                        {st.id !== '__default' && (
                          <button onClick={() => removeStationMut.mutate(st.id)} className="opacity-50 hover:opacity-100 ml-0.5">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
                <tr>
                  {categoryStations.map((st: any, stIdx: number) =>
                    weekDays.map((day, dayIdx) => {
                      const today = isToday(day);
                      const isLastDayOfStation = dayIdx === weekDays.length - 1 && stIdx < categoryStations.length - 1;
                      return (
                        <th key={`${st.id}-${day.toISOString()}`} className={`border-b-2 border-r border-foreground/20 p-1 text-center ${isLastDayOfStation ? 'border-r-[3px] border-r-foreground/40' : ''} ${today ? 'bg-[hsl(220,80%,50%)] text-white' : 'bg-[hsl(220,30%,95%)] dark:bg-[hsl(220,20%,20%)] text-foreground'}`}>
                          <div className="font-bold text-[10px]">{format(day, 'EEE', { locale: pl })}</div>
                          <div className={`text-xs font-black ${today ? 'text-white' : ''}`}>{format(day, 'dd.MM')}</div>
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
                      <td className={`border-b border-r-2 border-foreground/20 p-1.5 text-right font-mono font-bold text-xs sticky left-0 z-10 ${isEvenRow ? 'bg-[hsl(220,20%,97%)] dark:bg-[hsl(220,15%,15%)] text-foreground' : 'bg-[hsl(220,25%,93%)] dark:bg-[hsl(220,15%,18%)] text-foreground'}`}>
                        {`${hour}:00`}
                      </td>
                      {categoryStations.map((st: any, stIdx: number) =>
                        weekDays.map((day, dayIdx) => {
                          const key = cellKey(st.id, day, hour);
                          const isDragOver = dragOverCell === key;
                          const scheduledOrder = getOrderStartingAt(st.id, day, hour);
                          const today = isToday(day);

                          if (!scheduledOrder) {
                            const dayStr = format(day, 'yyyy-MM-dd');
                            const isPartOfOrder = orders.some((o: any) => {
                              if (!o.scheduled_start || o.scheduled_station_id !== st.id) return false;
                              const oDate = format(new Date(o.scheduled_start), 'yyyy-MM-dd');
                              if (oDate !== dayStr) return false;
                              const oHour = new Date(o.scheduled_start).getHours();
                              const span = getOrderSpan(o);
                              if (resizingOrder && resizingOrder.id === o.id) {
                                const effStart = resizeStartHour ?? oHour;
                                const effEnd = resizeTargetHour ?? (oHour + span);
                                return hour > effStart && hour < effEnd;
                              }
                              return hour > oHour && hour < oHour + span;
                            });
                            
                            if (isPartOfOrder) return null;
                          }

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

                          const isLastDayOfStation = dayIdx === weekDays.length - 1 && stIdx < categoryStations.length - 1;
                          return (
                            <td
                              key={key}
                              rowSpan={scheduledOrder ? displaySpan : 1}
                              className={`border-b border-r border-foreground/15 p-0 cursor-pointer transition-all relative ${scheduledOrder ? '' : 'h-14'} ${isLastDayOfStation ? 'border-r-[3px] border-r-foreground/40' : ''} ${
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
                                <ScheduledOrderBlock
                                  order={scheduledOrder}
                                  displaySpan={displaySpan}
                                  employees={employees}
                                  updateOrder={updateOrder}
                                  onDragStart={() => { setDraggedOrder(scheduledOrder); setDragSource('scheduled'); }}
                                  onDragEnd={resetDrag}
                                  onResizeStart={handleResizeStart}
                                />
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
      )}

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
        stations={categoryStations}
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
        onStationChange={(stationId) => {
          if (slotData) setSlotData({ ...slotData, stationId });
        }}
      />
    </div>
  );
}

// ---- Scheduled order block with quick preview ----
function ScheduledOrderBlock({ order, displaySpan, employees, updateOrder, onDragStart, onDragEnd, onResizeStart }: {
  order: any; displaySpan: number; employees: any[]; updateOrder: any;
  onDragStart: () => void; onDragEnd: () => void;
  onResizeStart: (e: React.MouseEvent, order: any, direction: 'top' | 'bottom') => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [assignedEmployee, setAssignedEmployee] = useState(order.assigned_employee_id || '');

  const handleAssignEmployee = async (empId: string) => {
    setAssignedEmployee(empId);
    try {
      await updateOrder.mutateAsync({ id: order.id, assigned_employee_id: empId || null });
      toast.success('Pracownik przypisany');
    } catch { toast.error('Błąd przypisania'); }
  };

  return (
    <Popover open={showPreview} onOpenChange={setShowPreview}>
      <PopoverTrigger asChild>
        <div
          className="bg-[hsl(220,70%,55%)] text-white rounded-md m-[2px] p-1.5 text-[10px] cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow relative select-none"
          style={{ height: 'calc(100% - 4px)' }}
          draggable
          onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
          onDragEnd={onDragEnd}
          onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-3 cursor-n-resize flex items-center justify-center bg-[hsl(220,70%,45%)] rounded-t-md opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => onResizeStart(e, order, 'top')}
          >
            <ChevronsUpDown className="h-2.5 w-2.5 text-white/80" />
          </div>
          <div className="flex items-center gap-0.5 font-semibold mt-2">
            <GripVertical className="h-3 w-3 opacity-60 flex-shrink-0" />
            <Car className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model}` : 'Zlecenie'}</span>
          </div>
          <div className="text-white/70 truncate ml-4">{order.order_number}</div>
          {displaySpan > 1 && (
            <div className="text-white/60 text-[9px] ml-4 mt-0.5">{displaySpan}h</div>
          )}
          <div
            className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-center justify-center bg-[hsl(220,70%,45%)] rounded-b-md opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => onResizeStart(e, order, 'bottom')}
          >
            <ChevronsUpDown className="h-2.5 w-2.5 text-white/80" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="right" align="start">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm flex items-center gap-1.5"><Eye className="h-4 w-4" /> Podgląd zlecenia</h4>
            <span className="text-xs text-muted-foreground">{order.order_number}</span>
          </div>
          
          {/* Client */}
          {order.client && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Klient</div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {order.client.first_name} {order.client.last_name}
              </div>
              {order.client.phone && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {order.client.phone}
                </div>
              )}
            </div>
          )}

          {/* Vehicle */}
          {order.vehicle && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pojazd</div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5" />
                {order.vehicle.brand} {order.vehicle.model}
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {order.vehicle.plate && <span>Nr rej: <b className="text-foreground">{order.vehicle.plate}</b></span>}
                {order.vehicle.vin && <span>VIN: <b className="text-foreground text-[10px]">{order.vehicle.vin}</b></span>}
                {order.vehicle.engine && <span>Silnik: <b className="text-foreground">{order.vehicle.engine}</b></span>}
                {order.vehicle.power && <span>Moc: <b className="text-foreground">{order.vehicle.power}</b></span>}
              </div>
            </div>
          )}

          {/* Tasks */}
          {order.items?.length > 0 && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Zadania ({order.items.length})</div>
              {order.items.slice(0, 5).map((item: any, idx: number) => (
                <div key={idx} className="text-xs flex items-start gap-1">
                  <Wrench className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>{item.name}</span>
                </div>
              ))}
              {order.items.length > 5 && <div className="text-[10px] text-muted-foreground">...i {order.items.length - 5} więcej</div>}
            </div>
          )}

          {/* Assign employee */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pracownik</div>
            <Select value={assignedEmployee} onValueChange={handleAssignEmployee}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Przypisz pracownika..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Brak</SelectItem>
                {employees.map((emp: any) => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OrderCard({ order, onDragStart, onDragEnd, isFocused, employees, updateOrder }: { order: any; onDragStart: () => void; onDragEnd: () => void; isFocused?: boolean; employees: any[]; updateOrder: any }) {
  const [showPreview, setShowPreview] = useState(false);
  const [assignedEmployee, setAssignedEmployee] = useState(order.assigned_employee_id || '');

  const handleAssignEmployee = async (empId: string) => {
    setAssignedEmployee(empId);
    try {
      await updateOrder.mutateAsync({ id: order.id, assigned_employee_id: empId || null });
      toast.success('Pracownik przypisany');
    } catch { toast.error('Błąd'); }
  };

  return (
    <Popover open={showPreview} onOpenChange={setShowPreview}>
      <PopoverTrigger asChild>
        <Card
          className={`min-w-[220px] flex-shrink-0 border-l-4 cursor-grab active:cursor-grabbing hover:shadow-md transition-all bg-card ${isFocused ? 'border-l-amber-500 ring-2 ring-amber-400 shadow-lg' : 'border-l-[hsl(220,70%,55%)]'}`}
          draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
          onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
        >
          <CardContent className="p-2.5 space-y-0.5">
            {isFocused && (
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">← Bieżące zlecenie</div>
            )}
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <Car className="h-3.5 w-3.5 text-muted-foreground" />
              {order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model} ${order.vehicle.plate || ''}` : 'Brak pojazdu'}
            </div>
            <div className="text-[10px] text-muted-foreground">{order.order_number}</div>
            {order.items?.slice(0, 2).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center text-[10px]">
                <Wrench className="h-2.5 w-2.5 flex-shrink-0 mr-1" /> <span className="truncate">{item.name}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="bottom" align="start">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm flex items-center gap-1.5"><Eye className="h-4 w-4" /> Podgląd zlecenia</h4>
            <span className="text-xs text-muted-foreground">{order.order_number}</span>
          </div>
          {order.client && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Klient</div>
              <div className="text-sm font-semibold flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{order.client.first_name} {order.client.last_name}</div>
              {order.client.phone && <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {order.client.phone}</div>}
            </div>
          )}
          {order.vehicle && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pojazd</div>
              <div className="text-sm font-semibold flex items-center gap-1.5"><Car className="h-3.5 w-3.5" />{order.vehicle.brand} {order.vehicle.model}</div>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {order.vehicle.plate && <span>Nr rej: <b className="text-foreground">{order.vehicle.plate}</b></span>}
                {order.vehicle.vin && <span>VIN: <b className="text-foreground text-[10px]">{order.vehicle.vin}</b></span>}
                {order.vehicle.engine && <span>Silnik: <b className="text-foreground">{order.vehicle.engine}</b></span>}
                {order.vehicle.power && <span>Moc: <b className="text-foreground">{order.vehicle.power}</b></span>}
              </div>
            </div>
          )}
          {order.items?.length > 0 && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Zadania ({order.items.length})</div>
              {order.items.slice(0, 5).map((item: any, idx: number) => (
                <div key={idx} className="text-xs flex items-start gap-1"><Wrench className="h-3 w-3 flex-shrink-0 mt-0.5" /><span>{item.name}</span></div>
              ))}
              {order.items.length > 5 && <div className="text-[10px] text-muted-foreground">...i {order.items.length - 5} więcej</div>}
            </div>
          )}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pracownik</div>
            <Select value={assignedEmployee} onValueChange={handleAssignEmployee}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Przypisz pracownika..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Brak</SelectItem>
                {employees.map((emp: any) => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SlotDialog({ open, onOpenChange, slotData, providerId, unplannedOrders, stations, stationName, onSchedule, onStationChange }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  slotData: { day: Date; hour: number; stationId: string } | null;
  providerId: string;
  unplannedOrders: any[]; stations: any[]; stationName: string;
  onSchedule: (orderId: string, day: Date, hour: number, stationId: string) => Promise<void>;
  onStationChange: (stationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [activeTab, setActiveTab] = useState<'client' | 'event' | 'order'>('client');
  const [editDate, setEditDate] = useState('');
  const [editHourStr, setEditHourStr] = useState('08');
  const [editMinStr, setEditMinStr] = useState('00');
  const [editStationId, setEditStationId] = useState('');
  const [eventForm, setEventForm] = useState({
    service: '', type: 'Wydarzenie', color: 'Niebieski', allDay: false,
    duration: '1 godz.', worker: '', description: '',
  });
  const [clientForm, setClientForm] = useState({
    phone: '', firstName: '', lastName: '', plate: '',
    brand: '', model: '', serviceDesc: '', duration: '60',
    reminderOptions: ['24h', '2h'] as string[],
  });
  const [saving, setSaving] = useState(false);

  // Sync editDate/editHour when slotData changes
  const prevSlotRef = useRef(slotData);
  if (slotData && slotData !== prevSlotRef.current) {
    prevSlotRef.current = slotData;
    setEditDate(format(slotData.day, 'yyyy-MM-dd'));
    setEditHourStr(String(slotData.hour).padStart(2, '0'));
    setEditMinStr('00');
    setEditStationId(slotData.stationId);
  }

  if (!slotData) return null;

  const handleSaveClient = async () => {
    if (!clientForm.phone) {
      toast.error('Numer telefonu jest wymagany');
      return;
    }
    setSaving(true);
    try {
      const appointmentDay = editDate || format(slotData.day, 'yyyy-MM-dd');
      const appointmentHour = parseInt(editHourStr) || 0;
      const appointmentMin = parseInt(editMinStr) || 0;
      const stationId = editStationId || slotData.stationId;
      const { error } = await supabase.from('workshop_client_bookings' as any).insert({
        provider_id: providerId,
        phone: clientForm.phone,
        first_name: clientForm.firstName || null,
        last_name: clientForm.lastName || null,
        plate: clientForm.plate || null,
        brand: clientForm.brand || null,
        model: clientForm.model || null,
        service_description: clientForm.serviceDesc || null,
        appointment_date: appointmentDay,
        appointment_time: `${appointmentHour.toString().padStart(2, '0')}:${appointmentMin.toString().padStart(2, '0')}:00`,
        duration_minutes: parseInt(clientForm.duration) || 60,
        station_id: stationId,
        reminder_enabled: clientForm.reminderOptions.length > 0,
        reminder_times: clientForm.reminderOptions,
        status: 'scheduled',
      });
      if (error) throw error;
      toast.success('Klient umówiony');
      queryClient.invalidateQueries({ queryKey: ['workshop-bookings'] });
      onOpenChange(false);
      setClientForm({ phone: '', firstName: '', lastName: '', plate: '', brand: '', model: '', serviceDesc: '', duration: '60', reminderOptions: ['24h', '2h'] });
    } catch (err: any) {
      toast.error(err.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const REMINDER_OPTIONS = [
    { value: '24h', label: '24h przed wizytą' },
    { value: '12h', label: '12h przed wizytą' },
    { value: '6h', label: '6h przed wizytą' },
    { value: '4h', label: '4h przed wizytą' },
    { value: '2h', label: '2h przed wizytą' },
    { value: '1h', label: '1h przed wizytą' },
  ];

  const toggleReminder = (val: string) => {
    setClientForm(f => ({
      ...f,
      reminderOptions: f.reminderOptions.includes(val)
        ? f.reminderOptions.filter(v => v !== val)
        : [...f.reminderOptions, val],
    }));
  };

  const ALL_HOURS_LIST = Array.from({ length: 15 }, (_, i) => i + 6);
  const MINUTES_LIST = ['00', '15', '30', '45'];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedOrderId(''); setActiveTab('client'); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowy termin</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 border rounded-lg p-0.5 bg-muted/30">
            <Button variant={activeTab === 'client' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('client')} className="flex-1 text-xs">
              Umów klienta
            </Button>
            <Button variant={activeTab === 'event' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('event')} className="flex-1 text-xs">
              Nowe wydarzenie
            </Button>
            <Button variant={activeTab === 'order' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('order')} className="flex-1 text-xs">
              Nowe zlecenie
            </Button>
          </div>

          {/* Editable date/time/station info */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <Label className="font-medium text-xs">Data</Label>
              <Input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <Label className="font-medium text-xs">Godzina</Label>
              <div className="flex gap-1 mt-1">
                <Select value={editHourStr} onValueChange={setEditHourStr}>
                  <SelectTrigger className="h-8 text-xs w-16"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_HOURS_LIST.map(h => (
                      <SelectItem key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="flex items-center text-xs font-bold">:</span>
                <Select value={editMinStr} onValueChange={setEditMinStr}>
                  <SelectTrigger className="h-8 text-xs w-16"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MINUTES_LIST.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="font-medium text-xs">Stanowisko</Label>
              <Select value={editStationId} onValueChange={(v) => { setEditStationId(v); onStationChange(v); }}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stations.map((st: any) => (
                    <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeTab === 'client' ? (
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Nr telefonu *</Label>
                <Input value={clientForm.phone} onChange={e => setClientForm(f => ({...f, phone: e.target.value}))} placeholder="+48 600 000 000" type="tel" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Imię</Label>
                  <Input value={clientForm.firstName} onChange={e => setClientForm(f => ({...f, firstName: e.target.value}))} placeholder="Jan" />
                </div>
                <div>
                  <Label className="text-sm">Nazwisko</Label>
                  <Input value={clientForm.lastName} onChange={e => setClientForm(f => ({...f, lastName: e.target.value}))} placeholder="Kowalski" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm">Nr rejestracyjny</Label>
                  <div className="relative">
                    <Input value={clientForm.plate} onChange={e => setClientForm(f => ({...f, plate: e.target.value.toUpperCase()}))} placeholder="KRA 12345" />
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Marka</Label>
                  <Input value={clientForm.brand} onChange={e => setClientForm(f => ({...f, brand: e.target.value}))} placeholder="np. Toyota" />
                </div>
                <div>
                  <Label className="text-sm">Model</Label>
                  <Input value={clientForm.model} onChange={e => setClientForm(f => ({...f, model: e.target.value}))} placeholder="np. Corolla" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Opis usługi</Label>
                <Input value={clientForm.serviceDesc} onChange={e => setClientForm(f => ({...f, serviceDesc: e.target.value}))} placeholder="np. Wymiana oleju + filtrów" />
              </div>
              <div>
                <Label className="text-sm">Czas na usługę</Label>
                <Select value={clientForm.duration} onValueChange={v => setClientForm(f => ({...f, duration: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 godz.</SelectItem>
                    <SelectItem value="120">2 godz.</SelectItem>
                    <SelectItem value="180">3 godz.</SelectItem>
                    <SelectItem value="240">4 godz.</SelectItem>
                    <SelectItem value="480">Cały dzień</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Reminder checkboxes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">📱 Przypomnienia SMS</Label>
                <div className="grid grid-cols-2 gap-2">
                  {REMINDER_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer p-1.5 rounded border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <input
                        type="checkbox"
                        checked={clientForm.reminderOptions.includes(opt.value)}
                        onChange={() => toggleReminder(opt.value)}
                        className="rounded"
                      />
                      <span className="text-xs">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
                <Button onClick={handleSaveClient} disabled={saving}>
                  {saving ? 'Zapisywanie...' : 'Umów klienta'}
                </Button>
              </div>
            </div>
          ) : activeTab === 'event' ? (
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
                <Button onClick={async () => {
                  if (selectedOrderId) {
                    const stationId = editStationId || slotData.stationId;
                    const hourNum = parseInt(editHourStr) || slotData.hour;
                    await onSchedule(selectedOrderId, slotData.day, hourNum, stationId);
                    onOpenChange(false); setSelectedOrderId('');
                  }
                }} disabled={!selectedOrderId}>Zaplanuj</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
