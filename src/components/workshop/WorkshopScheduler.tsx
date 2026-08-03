import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { buildPublicUrl } from '@/lib/publicUrl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkshopOrders, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Search, Car, Wrench, Plus, GripVertical, Undo2, X, ChevronsUpDown, Phone, User, Eye, Clock } from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks, isToday, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth } from 'date-fns';
import { getDateLocale } from '@/lib/dateLocale';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DEFAULT_WS_CATEGORY } from '@/lib/workshopCategories';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useWorkshopTranslations, TranslatableField } from '@/hooks/useWorkshopTranslations';
import { useVehicleLookup } from '@/hooks/useVehicleLookup';
import { Loader2 } from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
  title?: string;
  focusOrderId?: string;
}

const ROW_HEIGHT = 56; // px — stała wysokość każdego wiersza godziny

export function WorkshopScheduler({ providerId, onBack: _onBack, title, focusOrderId }: Props) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const resolvedTitle = title ?? t('workshop.scheduler.title');
  // For 'day' view: anchor = current day. For 'week' view: anchor = Monday of week.
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [showSlotDialog, setShowSlotDialog] = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);

  const cancelDetailItem = async (item: any) => {
    try {
      if (item?._isPortal) await (supabase as any).from('service_bookings').update({ status: 'cancelled' }).eq('id', item._bookingId);
      else if (item?._isBooking) await (supabase as any).from('workshop_client_bookings').update({ status: 'cancelled' }).eq('id', item._bookingId);
      else return;
      toast.success(t('workshop.bookings.status.cancelled') || 'Anulowano');
      setDetailItem(null);
    } catch (e: any) { toast.error(e?.message || 'Błąd anulowania'); }
  };
  const [slotData, setSlotData] = useState<{ day: Date; hour: number; stationId: string } | null>(null);
  const [draggedOrder, setDraggedOrder] = useState<any>(null);
  const [dragSource, setDragSource] = useState<'unplanned' | 'scheduled' | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [dragOverUnplanned, setDragOverUnplanned] = useState(false);
  const [showAddStation, setShowAddStation] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [newStationCategory, setNewStationCategory] = useState('');
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

  // Working hours from provider settings (service_working_hours)
  const { data: workingHoursRows = [] } = useQuery({
    queryKey: ['service-working-hours', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('service_working_hours')
        .select('day_of_week, start_time, end_time, is_working')
        .eq('provider_id', providerId)
        .is('employee_id', null);
      if (error) throw error;
      return data || [];
    },
  });

  // Pełna doba — godziny pracy podświetlone, reszta przyciemniona
  const HOURS = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  // Mapa: dzień tygodnia (0=niedz) -> [startHour, endHour)
  const workRangeByDow = useMemo(() => {
    const map: Record<number, { from: number; to: number } | null> = {};
    const rows = workingHoursRows as any[];
    for (let d = 0; d < 7; d++) {
      const row = rows.find(r => Number(r.day_of_week) === d);
      if (rows.length === 0) { map[d] = d === 0 ? null : { from: 8, to: 18 }; continue; }
      if (!row || row.is_working === false) { map[d] = null; continue; }
      const from = parseInt(String(row.start_time).split(':')[0], 10);
      const to = parseInt(String(row.end_time).split(':')[0], 10);
      map[d] = { from: isNaN(from) ? 8 : from, to: isNaN(to) ? 18 : to };
    }
    return map;
  }, [workingHoursRows]);

  const isWorkHour = useCallback((day: Date, hour: number) => {
    const r = workRangeByDow[getDay(day)];
    if (!r) return false;
    return hour >= r.from && hour < r.to;
  }, [workRangeByDow]);

  const firstWorkHour = useMemo(() => {
    const vals = Object.values(workRangeByDow).filter(Boolean) as { from: number }[];
    return vals.length ? Math.min(...vals.map(v => v.from)) : 8;
  }, [workRangeByDow]);

  // Auto-scroll do pierwszej godziny pracy
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current || !gridScrollRef.current) return;
    didAutoScroll.current = true;
    gridScrollRef.current.scrollTop = Math.max(0, (firstWorkHour - 1) * ROW_HEIGHT);
  }, [firstWorkHour]);


  // PERF C2: kalendarz pokazuje też zakończone (historia tygodnia) — 'all'
  const { data: orders = [] } = useWorkshopOrders(providerId, { view: 'all' });

  // Fetch client bookings to show on calendar
  const { data: clientBookings = [] } = useQuery({
    queryKey: ['workshop-bookings', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_client_bookings')
        .select('*, confirmed_at')
        .eq('provider_id', providerId)
        // 'reschedule_requested' też — inaczej prośba klienta o zmianę znikała
        // z kalendarza bez śladu (data-loss). Zostaje widoczna na starym terminie.
        .in('status', ['scheduled', 'confirmed', 'reschedule_requested']);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch portal bookings (service_bookings) — verified, not cancelled
  const { data: portalBookings = [] } = useQuery({
    queryKey: ['workshop-portal-bookings-cal', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('service_bookings')
        .select('id, booking_number, customer_name, customer_phone, vehicle_brand, vehicle_model, vehicle_plate, scheduled_date, scheduled_time, duration_minutes, status, customer_notes')
        .eq('provider_id', providerId)
        .in('status', ['pending', 'confirmed', 'in_progress']);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!providerId) return;
    const ch = (supabase as any)
      .channel(`portal-bookings-cal-${providerId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'service_bookings',
        filter: `provider_id=eq.${providerId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ['workshop-portal-bookings-cal', providerId] }))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'workshop_client_bookings',
        filter: `provider_id=eq.${providerId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ['workshop-bookings', providerId] }))
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [providerId, queryClient]);

  // Powiadomienia od klientów: prośby o zmianę terminu + świeże odwołania.
  const { data: cancelledBookings = [] } = useQuery({
    queryKey: ['workshop-bookings-cancelled', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await (supabase as any)
        .from('workshop_client_bookings')
        .select('id, first_name, last_name, phone, plate, appointment_date, appointment_time, cancelled_at, cancellation_reason')
        .eq('provider_id', providerId).eq('status', 'cancelled').gte('cancelled_at', since)
        .order('cancelled_at', { ascending: false });
      return data || [];
    },
  });
  const rescheduleRequests = useMemo(
    () => (clientBookings as any[]).filter(b => b.status === 'reschedule_requested'),
    [clientBookings],
  );
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const acceptReschedule = async (b: any) => {
    try {
      await (supabase as any).from('workshop_client_bookings').update({
        appointment_date: b.proposed_date, appointment_time: b.proposed_time,
        status: 'confirmed', confirmed_at: new Date().toISOString(),
        proposed_date: null, proposed_time: null, reschedule_requested_at: null,
      }).eq('id', b.id);
      toast.success(t('workshop.scheduler.rescheduleAccepted', 'Zaakceptowano nowy termin'));
      queryClient.invalidateQueries({ queryKey: ['workshop-bookings', providerId] });

      // Drugi SMS: "Twoja wizyta zostala zmieniona" + link do karty z nowym terminem
      void (async () => {
        try {
          const rmPl = (s: string) => s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => (
            { 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z','Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z' } as any)[c] || c);
          let phone = (b.phone || '').replace(/\D/g, '');
          if (phone.length === 9) phone = `+48${phone}`; else if (phone.startsWith('48')) phone = `+${phone}`;
          const [y, mo, d] = String(b.proposed_date).split('-');
          const rToken = b.public_token || b.confirmation_token;
          const link = rToken ? buildPublicUrl(`/r/${rToken}`) : '';
          let msg = rmPl(`Nowy termin wizyty: ${d}.${mo}.${y} ${String(b.proposed_time).slice(0,5)}.`);
          if (link) msg += ` ${link}`;
          if (phone) await supabase.functions.invoke('workshop-send-sms', {
            body: { phone, message: msg, sms_type: 'reschedule_confirmed', provider_id: providerId },
          });
        } catch (smsErr) { console.warn('[reschedule SMS] failed', smsErr); }
      })();
    } catch (e: any) { toast.error(e.message); }
  };
  const rejectReschedule = async (b: any) => {
    try {
      await (supabase as any).from('workshop_client_bookings').update({
        status: 'scheduled', proposed_date: null, proposed_time: null, reschedule_requested_at: null,
      }).eq('id', b.id);
      toast.success(t('workshop.scheduler.rescheduleRejected', 'Zachowano pierwotny termin'));
      queryClient.invalidateQueries({ queryKey: ['workshop-bookings', providerId] });
    } catch (e: any) { toast.error(e.message); }
  };

  // Convert bookings to virtual order-like objects for calendar display
  const allCalendarItems = useMemo(() => {
    const bookingItems = clientBookings.map((b: any) => {
      const startDate = new Date(`${b.appointment_date}T${b.appointment_time}`);
      const durationHours = Math.max(1, Math.ceil((b.duration_minutes || 60) / 60));
      const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
      return {
        id: `booking-${b.id}`,
        _bookingId: b.id,
        _isBooking: true,
        _bookingStatus: b.status,
        _confirmedAt: b.confirmed_at,
        order_number: `${b.first_name || ''} ${b.last_name || ''}`.trim() || t('workshop.scheduler.booking'),
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString(),
        scheduled_station_id: b.station_id,
        status_name: b.status === 'confirmed' ? 'Potwierdzona' : 'Zaplanowane',
        vehicle: b.plate ? { brand: b.brand || '', model: b.model || '', plate: b.plate } : null,
        client: { first_name: b.first_name, last_name: b.last_name, phone: b.phone },
        items: b.service_description ? [{ name: b.service_description }] : [],
        description: b.service_description,
      };
    });
    const portalItems = (portalBookings as any[]).map((b: any) => {
      const startDate = new Date(`${b.scheduled_date}T${b.scheduled_time}`);
      const durationHours = Math.max(1, Math.ceil((b.duration_minutes || 60) / 60));
      const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
      return {
        id: `portal-${b.id}`,
        _bookingId: b.id,
        _isBooking: true,
        _isPortal: true,
        order_number: `🌐 ${b.customer_name || t('workshop.scheduler.portal')} (${b.booking_number})`,
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString(),
        scheduled_station_id: null,
        status_name: b.status === 'confirmed' ? 'Potwierdzona' : 'Portal — oczekuje',
        vehicle: b.vehicle_plate ? { brand: b.vehicle_brand || '', model: b.vehicle_model || '', plate: b.vehicle_plate } : null,
        client: { first_name: b.customer_name, last_name: '', phone: b.customer_phone },
        items: b.customer_notes ? [{ name: b.customer_notes }] : [],
        description: b.customer_notes,
      };
    });
    return [...orders, ...bookingItems, ...portalItems];
  }, [orders, clientBookings, portalBookings]);

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
    // Świeże konto: brak zaszytego "Warsztat" — kategorie pojawiają się dopiero po "Dodaj kategorię".
    workstations.forEach((ws: any) => cats.add(ws.category || DEFAULT_WS_CATEGORY));
    return Array.from(cats);
  }, [workstations]);

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [activeCategory, categories]);

  const categoryStations = useMemo(() => {
    const filtered = workstations.filter((ws: any) => (ws.category || DEFAULT_WS_CATEGORY) === activeCategory);
    return filtered.length > 0 ? filtered : [{ id: '__default', name: 'Stanowisko 1', category: activeCategory }];
  }, [workstations, activeCategory]);

  // CORE: tłumaczenie treści (stanowiska, kategorie, pozycje) na język oglądającego.
  // auto — treść mógł wpisać admin (PL) lub mechanik (UA/RU); kluczujemy po treści.
  const schedTexts = useMemo(() => {
    const set = new Set<string>();
    (workstations as any[]).forEach((ws: any) => { if (ws?.name) set.add(String(ws.name)); });
    categories.forEach((c: string) => { if (c) set.add(c); });
    (allCalendarItems as any[]).forEach((o: any) => {
      (o.items || []).forEach((it: any) => { if (it?.name) set.add(String(it.name)); });
    });
    return Array.from(set);
  }, [workstations, categories, allCalendarItems]);
  const schedTransFields = useMemo<TranslatableField[]>(
    () => schedTexts.map((txt) => ({ entity_type: 'sched', entity_id: txt, field: 'name', text: txt })),
    [schedTexts],
  );
  const { t: tcMap } = useWorkshopTranslations(schedTransFields, 'auto');
  const tc = (txt?: string) => (txt ? (tcMap('sched', txt, 'name', txt) || txt) : (txt || ''));

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
      queryClient.invalidateQueries({ queryKey: ['calendar-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['settings-workstations'] });
      toast.success(t('workshop.scheduler.stationAdded'));
    },
  });

  const removeStationMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('workshop_workstations').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['settings-workstations'] });
    },
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
    return allCalendarItems.find((o: any) => {
      if (!o.scheduled_start || o.scheduled_station_id !== stationId) return false;
      const oDate = format(new Date(o.scheduled_start), 'yyyy-MM-dd');
      const oHour = new Date(o.scheduled_start).getHours();
      return oDate === dayStr && oHour === hour;
    });
  };

  const isCellOccupied = (stationId: string, day: Date, hour: number) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return allCalendarItems.some((o: any) => {
      if (!o.scheduled_start || o.scheduled_station_id !== stationId) return false;
      const oDate = format(new Date(o.scheduled_start), 'yyyy-MM-dd');
      if (oDate !== dayStr) return false;
      const oHour = new Date(o.scheduled_start).getHours();
      const span = getOrderSpan(o);
      return hour >= oHour && hour < oHour + span;
    });
  };

  const weekDays = useMemo(() => {
    if (viewMode === 'day') return [currentWeekStart];
    const monday = startOfWeek(currentWeekStart, { weekStartsOn: 1 });
    return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  }, [currentWeekStart, viewMode]);

  const goToToday = () => {
    setCurrentWeekStart(new Date());
    setCurrentMonth(new Date());
  };
  const currentDay = weekDays[0];
  const weekStartMonday = startOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStartMonday, 4);
  const headerLabel = viewMode === 'day'
    ? format(currentDay, 'EEEE, d MMMM yyyy', { locale: getDateLocale(i18n.language) })
    : viewMode === 'month'
    ? format(currentMonth, 'LLLL yyyy', { locale: getDateLocale(i18n.language) })
    : `${format(weekStartMonday, 'd', { locale: getDateLocale(i18n.language) })} – ${format(weekEnd, 'd MMM yyyy', { locale: getDateLocale(i18n.language) })}`;

  const handleCellClick = (day: Date, hour: number, stationId: string) => {
    if (isCellOccupied(stationId, day, hour)) return;
    setSlotData({ day, hour, stationId });
    setShowSlotDialog(true);
  };

  const handleDrop = async (day: Date, hour: number, stationId: string) => {
    if (!draggedOrder) return;
    if (isCellOccupied(stationId, day, hour) && !getOrderStartingAt(stationId, day, hour)) {
      toast.error(t('workshop.scheduler.slotTaken'));
      resetDrag();
      return;
    }
    const existing = getOrderStartingAt(stationId, day, hour);
    if (existing && existing.id !== draggedOrder.id) { toast.error(t('workshop.scheduler.slotTaken')); resetDrag(); return; }
    const scheduledStart = new Date(day);
    scheduledStart.setHours(hour, 0, 0, 0);
    const span = getOrderSpan(draggedOrder);
    const scheduledEnd = new Date(scheduledStart);
    scheduledEnd.setHours(hour + span, 0, 0, 0);
    try {
      await updateOrder.mutateAsync({ id: draggedOrder.id, scheduled_start: scheduledStart.toISOString(), scheduled_end: scheduledEnd.toISOString(), scheduled_station_id: stationId });
      toast.success(t('workshop.scheduler.orderScheduledTo', { order: draggedOrder.order_number, date: format(day, 'dd.MM'), hour }));
    } catch { toast.error(t('workshop.scheduler.scheduleFailed')); }
    resetDrag();
  };

  const handleDropToUnplanned = async () => {
    if (!draggedOrder || dragSource !== 'scheduled') return;
    try {
      await updateOrder.mutateAsync({ id: draggedOrder.id, scheduled_start: null, scheduled_end: null, scheduled_station_id: null });
      toast.success(t('workshop.scheduler.orderUnscheduled', { order: draggedOrder.order_number }));
    } catch { toast.error(t('workshop.scheduler.error')); }
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
            toast.success(t('workshop.scheduler.workTime', { hours }));
          } catch { toast.error(t('workshop.scheduler.timeChangeError')); }
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
    return allCalendarItems.filter((o: any) => {
      if (!o.scheduled_start) return false;
      return format(new Date(o.scheduled_start), 'yyyy-MM-dd') === dayStr;
    });
  }, [allCalendarItems]);

  // Navigation
  const handlePrev = () => {
    if (viewMode === 'day') setCurrentWeekStart(subDays(currentWeekStart, 1));
    else if (viewMode === 'week') setCurrentWeekStart(subWeeks(startOfWeek(currentWeekStart, { weekStartsOn: 1 }), 1));
    else setCurrentMonth(subMonths(currentMonth, 1));
  };
  const handleNext = () => {
    if (viewMode === 'day') setCurrentWeekStart(addDays(currentWeekStart, 1));
    else if (viewMode === 'week') setCurrentWeekStart(addWeeks(startOfWeek(currentWeekStart, { weekStartsOn: 1 }), 1));
    else setCurrentMonth(addMonths(currentMonth, 1));
  };

  // Total columns for grid
  const totalColumns = categoryStations.length * weekDays.length;

  return (
    <div className="flex min-h-0 flex-col">
      {resolvedTitle && <h2 className="text-2xl font-bold tracking-tight mb-3">{resolvedTitle}</h2>}

      {/* Powiadomienia od klientów: prośby o zmianę terminu + odwołania */}
      {(rescheduleRequests.length > 0 || cancelledBookings.filter((c: any) => !dismissedAlerts.includes(c.id)).length > 0) && (
        <div className="mb-3 space-y-2">
          {rescheduleRequests.map((b: any) => (
            <div key={b.id} className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm min-w-0">
                  <span className="font-semibold">{[b.first_name, b.last_name].filter(Boolean).join(' ') || b.phone}</span>
                  {' '}{t('workshop.scheduler.wantsReschedule', 'prosi o zmianę terminu na')}{' '}
                  <span className="font-medium whitespace-nowrap">{b.proposed_date ? b.proposed_date.split('-').reverse().join('.') : '—'} {b.proposed_time?.slice(0,5)}</span>
                  {b.plate && <span className="text-muted-foreground"> · {b.plate}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" className="h-8" onClick={() => acceptReschedule(b)}>{t('workshop.scheduler.accept', 'Akceptuj')}</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => rejectReschedule(b)}>{t('workshop.scheduler.reject', 'Odrzuć')}</Button>
              </div>
            </div>
          ))}
          {cancelledBookings.filter((c: any) => !dismissedAlerts.includes(c.id)).map((c: any) => (
            <div key={c.id} className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 flex items-center gap-2">
              <X className="h-4 w-4 text-red-600 shrink-0" />
              <div className="text-sm flex-1 min-w-0">
                <span className="font-semibold">{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone}</span>
                {' '}{t('workshop.scheduler.cancelledVisit', 'odwołał(a) wizytę')}{' '}
                <span className="whitespace-nowrap">{c.appointment_date ? c.appointment_date.split('-').reverse().join('.') : ''} {c.appointment_time?.slice(0,5)}</span>
                {c.cancellation_reason && <span className="text-muted-foreground"> — {c.cancellation_reason}</span>}
              </div>
              <button type="button" onClick={() => setDismissedAlerts(prev => [...prev, c.id])} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-red-100 text-red-600 shrink-0" title={t('common.dismiss', 'Ukryj')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

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
              <h3 className="font-semibold text-base">{t('workshop.scheduler.tasksToSchedule')}</h3>
              <Button size="sm" onClick={() => { setSlotData({ day: weekDays[0], hour: HOURS[0], stationId: categoryStations[0]?.id || '__default' }); setShowSlotDialog(true); }} className="gap-1.5 ml-2 h-7 text-xs">
                <Plus className="h-3.5 w-3.5" /> {t('workshop.scheduler.add')}
              </Button>
              {dragSource === 'scheduled' && (
                <span className="text-xs text-orange-600 font-medium flex items-center gap-1 animate-pulse">
                  <Undo2 className="h-3 w-3" /> {t('workshop.scheduler.dropToUnschedule')}
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('workshop.scheduler.search')} className="pl-9 w-[200px] h-8" />
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {unplannedOrders.length === 0 ? (
              <div className="text-sm text-muted-foreground py-3 text-center w-full">{t('workshop.scheduler.noTasksToSchedule')}</div>
            ) : (
              unplannedOrders.map((o: any) => (
                <OrderCard key={o.id} tc={tc} order={o} onDragStart={() => { setDraggedOrder(o); setDragSource('unplanned'); }} onDragEnd={resetDrag} isFocused={o.id === focusOrderId} employees={employees} updateOrder={updateOrder} />
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
                {tc(cat)}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => setShowAddCategory(true)}>
              <Plus className="h-3 w-3" /> Dodaj kategorię
            </Button>
          </div>
          <Button variant="outline" size="sm" className={`gap-1 text-xs h-7 ${categories.length === 0 ? 'opacity-60' : ''}`} title={categories.length === 0 ? 'Najpierw dodaj kategorię' : undefined} onClick={() => {
            // Klikalny mimo braku kategorii — pokazujemy CZEMU nie działa (nie tylko szary przycisk).
            if (categories.length === 0) { toast.info('Najpierw dodaj kategorię'); return; }
            setNewStationCategory(activeCategory); setShowAddStation(true);
          }}>
            <Plus className="h-3 w-3" /> {t('workshop.scheduler.station')}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handlePrev}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0" onClick={goToToday}>{t('workshop.scheduler.today')}</Button>
          <Button variant="outline" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleNext}><ChevronRight className="h-4 w-4" /></Button>
          <h3 className="text-sm font-semibold capitalize text-left" style={{ minWidth: '240px' }}>{headerLabel}</h3>
          <div className="flex items-center gap-0.5 border rounded-lg p-0.5 ml-2">
            {(['day', 'week', 'month'] as const).map(mode => (
              <Button key={mode} variant={viewMode === mode ? 'default' : 'ghost'} size="sm" className="h-7 text-xs" onClick={() => setViewMode(mode)}>
                {mode === 'day' ? t('workshop.scheduler.viewDay') : mode === 'week' ? t('workshop.scheduler.viewWeek') : t('workshop.scheduler.viewMonth')}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Month View */}
      {viewMode === 'month' ? (
        <div className="h-[calc(100vh-240px)] min-h-[420px] overflow-auto rounded-xl border-2 border-foreground/20 shadow-lg">
          <div className="grid grid-cols-7 bg-[hsl(220,30%,95%)] dark:bg-[hsl(220,20%,20%)]">
            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => (
              <div key={d} className="p-2 text-center text-xs font-bold text-foreground border-b border-r border-foreground/15">{t(`workshop.scheduler.weekday.${d}`)}</div>
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
                  {dayOrders.length > 3 && <div className="text-[9px] text-muted-foreground">{t('workshop.scheduler.andMore', { count: dayOrders.length - 3 })}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Day/Week grid */
        <div className="h-[calc(100vh-240px)] min-h-[420px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm flex flex-col">
          <div ref={gridScrollRef} className="flex-1 min-h-0 overflow-auto">

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
                  <th className="bg-card border-b border-r border-border p-2 text-left text-muted-foreground font-semibold text-[10px] uppercase tracking-wide" rowSpan={2}>
                    {t('workshop.scheduler.hour')}
                  </th>
                  {categoryStations.map((st: any, stIdx: number) => (
                    <th key={st.id} colSpan={weekDays.length} className={`bg-card border-b border-border p-0 text-center ${stIdx < categoryStations.length - 1 ? 'border-r-2 border-r-border' : ''}`}>
                      <div className="h-1 bg-primary/80 rounded-b-full mx-2" />
                      <div className="flex items-center justify-center gap-1.5 py-1.5">
                        <Wrench className="h-3 w-3 text-primary" />
                        <span className="font-bold text-xs truncate text-foreground">{st.id === '__default' ? t('workshop.scheduler.defaultStation') : tc(st.name)}</span>
                        {st.id !== '__default' && (
                          <button onClick={() => removeStationMut.mutate(st.id)} className="opacity-40 hover:opacity-100 ml-0.5">
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
                        <th key={`${st.id}-${day.toISOString()}`} className={`border-b border-r border-border/60 p-1 text-center ${isLastDayOfStation ? 'border-r-2 border-r-border' : ''} ${today ? 'bg-primary/10 text-primary' : 'bg-card text-muted-foreground'}`}>
                          <div className="font-semibold text-[10px] uppercase">{format(day, 'EEE', { locale: getDateLocale(i18n.language) })}</div>
                          <div className={`text-xs font-bold ${today ? 'text-primary' : 'text-foreground'}`}>{format(day, 'dd.MM')}</div>
                        </th>
                      );
                    })
                  )}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((hour) => {
                  const anyWork = weekDays.some(d => isWorkHour(d, hour));
                  return (
                    <tr key={hour} style={{ height: `${ROW_HEIGHT}px` }}>
                      <td className={`border-b border-r border-border/60 p-1.5 text-right font-mono text-[11px] sticky left-0 z-10 bg-card ${anyWork ? 'text-foreground font-bold' : 'text-muted-foreground/50 font-medium'}`} style={{ height: `${ROW_HEIGHT}px` }}>
                        {`${String(hour).padStart(2, '0')}:00`}
                      </td>

                      {categoryStations.map((st: any, stIdx: number) =>
                        weekDays.map((day, dayIdx) => {
                          const key = cellKey(st.id, day, hour);
                          const isDragOver = dragOverCell === key;
                          const scheduledOrder = getOrderStartingAt(st.id, day, hour);
                          const today = isToday(day);

                          if (!scheduledOrder) {
                            const dayStr = format(day, 'yyyy-MM-dd');
                            const isPartOfOrder = allCalendarItems.some((o: any) => {
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
                          const work = isWorkHour(day, hour);
                          return (
                            <td
                              key={key}
                              rowSpan={scheduledOrder ? displaySpan : 1}
                              className={`border-b border-r border-border/50 p-0 cursor-pointer transition-colors relative ${isLastDayOfStation ? 'border-r-2 border-r-border' : ''} ${
                                work
                                  ? (today ? 'bg-primary/[0.06]' : 'bg-background')
                                  : (today ? 'bg-muted/60' : 'bg-muted/40')
                              } ${isDragOver && draggedOrder ? '!bg-primary/20 ring-2 ring-primary ring-inset' : scheduledOrder ? '' : 'hover:bg-primary/10'}`}

                              style={{ height: `${(scheduledOrder ? displaySpan : 1) * ROW_HEIGHT}px` }}
                              onClick={() => scheduledOrder ? setDetailItem(scheduledOrder) : handleCellClick(day, hour, st.id)}
                              onDragOver={(e) => { e.preventDefault(); setDragOverCell(key); }}
                              onDragLeave={() => { if (dragOverCell === key) setDragOverCell(null); }}
                              onDrop={() => handleDrop(day, hour, st.id)}
                            >
                              {scheduledOrder ? (
                                <ScheduledOrderBlock
                                  tc={tc}
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
          <DialogHeader><DialogTitle>{t('workshop.scheduler.addStation')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('workshop.scheduler.stationName')}</Label>
              <Input value={newStationName} onChange={e => setNewStationName(e.target.value)} placeholder={t('workshop.scheduler.stationNamePlaceholder')} />
            </div>
            <div>
              <Label>{t('workshop.scheduler.category')}</Label>
              <Select value={newStationCategory} onValueChange={setNewStationCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{tc(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStation(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => { if (newStationName.trim()) { addStationMut.mutate({ name: newStationName.trim(), category: newStationCategory }); setNewStationName(''); setShowAddStation(false); } }}>{t('workshop.scheduler.add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Szczegóły zaplanowanej pozycji (klik w kalendarzu) */}
      <Dialog open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{detailItem?.order_number}</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-3 text-sm">
              {detailItem.vehicle && <div>🚗 {[detailItem.vehicle.brand, detailItem.vehicle.model, detailItem.vehicle.plate].filter(Boolean).join(' · ')}</div>}
              {detailItem.client?.phone && <div>📞 {detailItem.client.phone}</div>}
              <div>🕐 {new Date(detailItem.scheduled_start).toLocaleString('pl-PL')}</div>
              <div><span className="inline-block rounded-full border px-2 py-0.5 text-xs">{detailItem.status_name}</span></div>
              {detailItem.description && (
                <div>
                  <div className="font-medium mb-1">Co do zrobienia:</div>
                  <ul className="space-y-0.5">
                    {String(detailItem.description).split('\n').map((l: string) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).map((l: string, i: number) => (
                      <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{l}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {detailItem._isBooking && <p className="text-xs text-muted-foreground">Przypomnienie 24h: włączone. Aby przesunąć — przeciągnij kafelek na inny termin.</p>}
              {!detailItem._isBooking && <p className="text-xs text-muted-foreground">To zlecenie — pełne zarządzanie w karcie zlecenia.</p>}
            </div>
          )}
          <DialogFooter className="gap-2">
            {detailItem?._isBooking && <Button variant="destructive" onClick={() => cancelDetailItem(detailItem)}>Anuluj rezerwację</Button>}
            <Button variant="outline" onClick={() => setDetailItem(null)}>Zamknij</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('workshop.scheduler.addCategory')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>{t('workshop.scheduler.categoryName')}</Label>
            <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder={t('workshop.scheduler.categoryNamePlaceholder')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCategory(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => {
              if (newCategoryName.trim()) {
                addStationMut.mutate({ name: `${newCategoryName.trim()} 1`, category: newCategoryName.trim() });
                setActiveCategory(newCategoryName.trim());
                setNewCategoryName('');
                setShowAddCategory(false);
              }
            }}>{t('workshop.scheduler.add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot dialog */}
      <SlotDialog
        tc={tc}
        open={showSlotDialog}
        onOpenChange={setShowSlotDialog}
        slotData={slotData}
        providerId={providerId}
        unplannedOrders={unplannedOrders}
        stations={categoryStations}
        allWorkstations={workstations}
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        stationName={categoryStations.find((s: any) => s.id === slotData?.stationId)?.name || ''}
        onSchedule={async (orderId, day, hour, stationId) => {
          const scheduledStart = new Date(day);
          scheduledStart.setHours(hour, 0, 0, 0);
          const scheduledEnd = new Date(day);
          scheduledEnd.setHours(hour + 1, 0, 0, 0);
          try {
            await updateOrder.mutateAsync({ id: orderId, scheduled_start: scheduledStart.toISOString(), scheduled_end: scheduledEnd.toISOString(), scheduled_station_id: stationId });
            toast.success(t('workshop.scheduler.orderAddedToSchedule'));
          } catch { toast.error(t('workshop.scheduler.scheduleFailed')); }
        }}
        onStationChange={(stationId) => {
          if (slotData) setSlotData({ ...slotData, stationId });
        }}
      />
    </div>
  );
}

// ---- Scheduled order block with quick preview ----
function ScheduledOrderBlock({ order, displaySpan, employees, updateOrder, onDragStart, onDragEnd, onResizeStart, tc }: {
  order: any; displaySpan: number; employees: any[]; updateOrder: any; tc: (t?: string) => string;
  onDragStart: () => void; onDragEnd: () => void;
  onResizeStart: (e: React.MouseEvent, order: any, direction: 'top' | 'bottom') => void;
}) {
  const { t, i18n } = useTranslation();
  const isBooking = !!order._isBooking;
  const [showPreview, setShowPreview] = useState(false);
  const [assignedEmployee, setAssignedEmployee] = useState(order.assigned_employee_id || 'none');

  const handleAssignEmployee = async (empId: string) => {
    setAssignedEmployee(empId || 'none');
    if (isBooking) return;
    try {
      await updateOrder.mutateAsync({ id: order.id, assigned_employee_id: empId === 'none' ? null : empId });
      toast.success(t('workshop.scheduler.employeeAssigned'));
    } catch { toast.error(t('workshop.scheduler.assignError')); }
  };

  const isConfirmed = order._bookingStatus === 'confirmed' || !!order._confirmedAt;
  const bgColor = isBooking
    ? (isConfirmed ? 'bg-[hsl(142,70%,42%)]' : 'bg-[hsl(28,90%,55%)]')
    : 'bg-[hsl(220,70%,55%)]';
  const bgDark = isBooking
    ? (isConfirmed ? 'bg-[hsl(142,70%,32%)]' : 'bg-[hsl(28,90%,45%)]')
    : 'bg-[hsl(220,70%,45%)]';

  return (
    <Popover open={showPreview} onOpenChange={setShowPreview}>
      <PopoverTrigger asChild>
        <div
          className={`${bgColor} text-white rounded-md m-[2px] p-1.5 text-[10px] cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow relative select-none`}
          style={{ height: 'calc(100% - 4px)' }}
          draggable={!isBooking}
          onDragStart={(e) => { if (isBooking) { e.preventDefault(); return; } e.stopPropagation(); onDragStart(); }}
          onDragEnd={onDragEnd}
          onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
        >
          {!isBooking && (
            <div
              className={`absolute top-0 left-0 right-0 h-3 cursor-n-resize flex items-center justify-center ${bgDark} rounded-t-md opacity-0 hover:opacity-100 transition-opacity`}
              onMouseDown={(e) => onResizeStart(e, order, 'top')}
            >
              <ChevronsUpDown className="h-2.5 w-2.5 text-white/80" />
            </div>
          )}
          <div className={`flex items-center gap-0.5 font-semibold ${isBooking ? '' : 'mt-2'}`}>
            {!isBooking && <GripVertical className="h-3 w-3 opacity-60 flex-shrink-0" />}
            {isBooking ? <Phone className="h-3 w-3 flex-shrink-0" /> : <Car className="h-3 w-3 flex-shrink-0" />}
            <span className="truncate">{isBooking ? order.order_number : (order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model}` : t('workshop.scheduler.order'))}</span>
          </div>
          {isBooking ? (
            <>
              {order.vehicle?.plate && <div className="text-white/70 truncate ml-4">{order.vehicle.plate}</div>}
              {order.items?.[0]?.name && <div className="text-white/60 truncate ml-4 text-[9px]">{tc(order.items[0].name)}</div>}
            </>
          ) : (
            <>
              <div className="text-white/70 truncate ml-4">{order.order_number}</div>
              {displaySpan > 1 && <div className="text-white/60 text-[9px] ml-4 mt-0.5">{displaySpan}h</div>}
            </>
          )}
          {!isBooking && (
            <div
              className={`absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-center justify-center ${bgDark} rounded-b-md opacity-0 hover:opacity-100 transition-opacity`}
              onMouseDown={(e) => onResizeStart(e, order, 'bottom')}
            >
              <ChevronsUpDown className="h-2.5 w-2.5 text-white/80" />
            </div>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="right" align="start">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm flex items-center gap-1.5"><Eye className="h-4 w-4" /> {isBooking ? t('workshop.scheduler.bookingPreview') : t('workshop.scheduler.orderPreview')}</h4>
            <span className="text-xs text-muted-foreground">{order.order_number}</span>
          </div>

          {/* Client */}
          {order.client && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('workshop.scheduler.client')}</div>
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
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('workshop.scheduler.vehicle')}</div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5" />
                {order.vehicle.brand} {order.vehicle.model}
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {order.vehicle.plate && <span>{t('workshop.scheduler.plate')}: <b className="text-foreground">{order.vehicle.plate}</b></span>}
                {order.vehicle.vin && <span>VIN: <b className="text-foreground text-[10px]">{order.vehicle.vin}</b></span>}
                {order.vehicle.engine && <span>{t('workshop.scheduler.engine')}: <b className="text-foreground">{order.vehicle.engine}</b></span>}
                {order.vehicle.power && <span>{t('workshop.scheduler.power')}: <b className="text-foreground">{order.vehicle.power}</b></span>}
              </div>
            </div>
          )}

          {/* Tasks */}
          {order.items?.length > 0 && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('workshop.scheduler.tasks', { count: order.items.length })}</div>
              {order.items.slice(0, 5).map((item: any, idx: number) => (
                <div key={idx} className="text-xs flex items-start gap-1">
                  <Wrench className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>{tc(item.name)}</span>
                </div>
              ))}
              {order.items.length > 5 && <div className="text-[10px] text-muted-foreground">{t('workshop.scheduler.andMoreEllipsis', { count: order.items.length - 5 })}</div>}
            </div>
          )}

          {!isBooking && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('workshop.scheduler.employee')}</div>
              <Select value={assignedEmployee} onValueChange={handleAssignEmployee}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('workshop.scheduler.assignEmployeePlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('workshop.scheduler.none')}</SelectItem>
                  {employees.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OrderCard({ order, onDragStart, onDragEnd, isFocused, employees, updateOrder, tc }: { order: any; onDragStart: () => void; onDragEnd: () => void; isFocused?: boolean; employees: any[]; updateOrder: any; tc: (t?: string) => string; }) {
  const { t, i18n } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const [assignedEmployee, setAssignedEmployee] = useState(order.assigned_employee_id || 'none');

  const handleAssignEmployee = async (empId: string) => {
    setAssignedEmployee(empId || 'none');
    try {
      await updateOrder.mutateAsync({ id: order.id, assigned_employee_id: empId === 'none' ? null : empId });
      toast.success(t('workshop.scheduler.employeeAssigned'));
    } catch { toast.error(t('workshop.scheduler.error')); }
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
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">{t('workshop.scheduler.currentOrder')}</div>
            )}
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <Car className="h-3.5 w-3.5 text-muted-foreground" />
              {order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model} ${order.vehicle.plate || ''}` : t('workshop.scheduler.noVehicle')}
            </div>
            <div className="text-[10px] text-muted-foreground">{order.order_number}</div>
            {order.items?.slice(0, 2).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center text-[10px]">
                <Wrench className="h-2.5 w-2.5 flex-shrink-0 mr-1" /> <span className="truncate">{tc(item.name)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="bottom" align="start">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm flex items-center gap-1.5"><Eye className="h-4 w-4" /> {t('workshop.scheduler.orderPreview')}</h4>
            <span className="text-xs text-muted-foreground">{order.order_number}</span>
          </div>
          {order.client && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('workshop.scheduler.client')}</div>
              <div className="text-sm font-semibold flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{order.client.first_name} {order.client.last_name}</div>
              {order.client.phone && <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {order.client.phone}</div>}
            </div>
          )}
          {order.vehicle && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('workshop.scheduler.vehicle')}</div>
              <div className="text-sm font-semibold flex items-center gap-1.5"><Car className="h-3.5 w-3.5" />{order.vehicle.brand} {order.vehicle.model}</div>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {order.vehicle.plate && <span>{t('workshop.scheduler.plate')}: <b className="text-foreground">{order.vehicle.plate}</b></span>}
                {order.vehicle.vin && <span>VIN: <b className="text-foreground text-[10px]">{order.vehicle.vin}</b></span>}
                {order.vehicle.engine && <span>{t('workshop.scheduler.engine')}: <b className="text-foreground">{order.vehicle.engine}</b></span>}
                {order.vehicle.power && <span>{t('workshop.scheduler.power')}: <b className="text-foreground">{order.vehicle.power}</b></span>}
              </div>
            </div>
          )}
          {order.items?.length > 0 && (
            <div className="space-y-1 border-b pb-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('workshop.scheduler.tasks', { count: order.items.length })}</div>
              {order.items.slice(0, 5).map((item: any, idx: number) => (
                <div key={idx} className="text-xs flex items-start gap-1"><Wrench className="h-3 w-3 flex-shrink-0 mt-0.5" /><span>{tc(item.name)}</span></div>
              ))}
              {order.items.length > 5 && <div className="text-[10px] text-muted-foreground">{t('workshop.scheduler.andMoreEllipsis', { count: order.items.length - 5 })}</div>}
            </div>
          )}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('workshop.scheduler.employee')}</div>
            <Select value={assignedEmployee} onValueChange={handleAssignEmployee}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('workshop.scheduler.assignEmployeePlaceholder')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('workshop.scheduler.none')}</SelectItem>
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

// Zapamiętywanie preferencji przypomnień SMS (jak w poprzednim zleceniu)
const REMINDER_PREFS_KEY = 'workshop_booking_reminder_prefs';
function readReminderPrefs(): { reminders: string[]; sms: boolean } {
  try {
    const raw = localStorage.getItem(REMINDER_PREFS_KEY);
    if (raw) { const p = JSON.parse(raw); return { reminders: Array.isArray(p.reminders) ? p.reminders : ['24h', '2h'], sms: p.sms !== false }; }
  } catch { /* ignore */ }
  return { reminders: ['24h', '2h'], sms: true };
}
function saveReminderPrefs(reminders: string[], sms: boolean) {
  try { localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify({ reminders, sms })); } catch { /* ignore */ }
}

function SlotDialog({ open, onOpenChange, slotData, providerId, unplannedOrders, stations, allWorkstations, categories, activeCategory, onCategoryChange, stationName: _stationName, onSchedule, onStationChange, tc }: {
  tc: (t?: string) => string;
  open: boolean; onOpenChange: (v: boolean) => void;
  slotData: { day: Date; hour: number; stationId: string } | null;
  providerId: string;
  unplannedOrders: any[]; stations: any[]; stationName: string;
  allWorkstations: any[]; categories: string[]; activeCategory: string;
  onCategoryChange: (cat: string) => void;
  onSchedule: (orderId: string, day: Date, hour: number, stationId: string) => Promise<void>;
  onStationChange: (stationId: string) => void;
}) {
  const { t, i18n } = useTranslation();
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
  const [clientForm, setClientForm] = useState(() => {
    const prefs = readReminderPrefs();
    return {
      phone: '', firstName: '', lastName: '', plate: '',
      brand: '', model: '', year: '', serviceDesc: '', duration: '60',
      reminderOptions: prefs.reminders as string[],
      sendConfirmationSms: prefs.sms,
    };
  });
  const [saving, setSaving] = useState(false);

  // Lista usług/pozycji (plus lub Enter dodaje kolejną) + bieżący wpis
  const [serviceItems, setServiceItems] = useState<string[]>([]);
  const [serviceInput, setServiceInput] = useState('');

  // Telefon → wyszukiwarka klientów z bazy; nr rej → wybór auta z bazy
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSuggest, setClientSuggest] = useState<any[]>([]);
  const [showClientSuggest, setShowClientSuggest] = useState(false);
  const [vehicleSuggest, setVehicleSuggest] = useState<any[]>([]);
  const [showVehicleSuggest, setShowVehicleSuggest] = useState(false);
  const [ownerVehicles, setOwnerVehicles] = useState<any[]>([]);

  const clientLabel = (c: any) => c?.client_type === 'company'
    ? (c.company_name || '')
    : `${c?.first_name || ''} ${c?.last_name || ''}`.trim();

  const searchClientsByPhone = async (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 3) { setClientSuggest([]); setShowClientSuggest(false); return; }
    const { data } = await (supabase as any).from('workshop_clients')
      .select('id, phone, first_name, last_name, company_name, client_type')
      .eq('provider_id', providerId).ilike('phone', `%${digits}%`).limit(6);
    setClientSuggest(data || []);
    setShowClientSuggest((data || []).length > 0);
  };

  const pickClient = async (c: any) => {
    setClientId(c.id);
    setClientForm(f => ({ ...f, phone: c.phone || f.phone, firstName: c.first_name || '', lastName: c.last_name || '' }));
    setShowClientSuggest(false);
    const { data: vs } = await (supabase as any).from('workshop_vehicles')
      .select('id, plate, brand, model, year').eq('provider_id', providerId).eq('owner_client_id', c.id).limit(10);
    setOwnerVehicles(vs || []);
  };

  const searchVehiclesByPlate = async (plate: string) => {
    const p = plate.trim();
    if (p.length < 2) { setVehicleSuggest([]); setShowVehicleSuggest(false); return; }
    const { data } = await (supabase as any).from('workshop_vehicles')
      .select('id, plate, brand, model, year').eq('provider_id', providerId).ilike('plate', `%${p}%`).limit(6);
    setVehicleSuggest(data || []);
    setShowVehicleSuggest((data || []).length > 0);
  };

  const pickVehicle = (v: any) => {
    setClientForm(f => ({ ...f, plate: v.plate || '', brand: v.brand || '', model: v.model || '', year: v.year ? String(v.year) : '' }));
    setShowVehicleSuggest(false);
    setVehicleSuggest([]);
  };

  // Wyszukiwarka pojazdu po nr rej (lupka) — auto-fill marka/model/rok + zapis do bazy
  const [userId, setUserId] = useState<string | undefined>(undefined);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id)); }, []);
  const { credits: lookupCredits, loading: lookupLoading, checkRegistration } = useVehicleLookup(userId);

  const addServiceItem = () => {
    const v = serviceInput.trim();
    if (!v) return;
    setServiceItems(prev => [...prev, v]);
    setServiceInput('');
  };
  const removeServiceItem = (idx: number) => setServiceItems(prev => prev.filter((_, i) => i !== idx));

  const trimModelName = (m: string) => (m || '').split(/\s+/).slice(0, 2).join(' ').trim();

  const handleLookupPlate = async () => {
    const plate = clientForm.plate.trim();
    if (plate.length < 3) { toast.error(t('workshop.vehicles.enterPlate', 'Wpisz numer rejestracyjny')); return; }
    // Bez lokalnego pre-checku kredytów (lookupCredits ładuje się async → fałszywe
    // "brak kredytów" przy szybkim kliknięciu). checkRegistration weryfikuje kredyty
    // po stronie serwera i zwraca trafny komunikat (NO_CREDITS / nie znaleziono / itd.).
    const data: any = await checkRegistration(plate);
    if (!data) return;
    // Auto-fill
    setClientForm(f => ({
      ...f,
      brand: data.make || f.brand,
      model: data.model ? trimModelName(data.model) : f.model,
      year: data.registration_year ? String(data.registration_year) : f.year,
    }));
    // Zapis pojazdu do bazy warsztatu (UPSERT po nr rej / VIN)
    try {
      const plateUp = (data.registration_number || plate).toUpperCase();
      const vinUp = data.vin ? String(data.vin).toUpperCase() : null;
      const payload: any = {
        brand: data.make || null,
        model: data.model ? trimModelName(data.model) : null,
        vin: vinUp,
        plate: plateUp,
        year: data.registration_year || null,
        fuel_type: data.fuel_type || null,
      };
      // Przypisz do właściciela, jeśli wybrano klienta z bazy
      if (clientId) payload.owner_client_id = clientId;
      let existingId: string | null = null;
      const { data: ex } = await (supabase as any).from('workshop_vehicles')
        .select('id').eq('provider_id', providerId).ilike('plate', plateUp).limit(1).maybeSingle();
      if (ex) existingId = ex.id;
      if (existingId) await (supabase as any).from('workshop_vehicles').update(payload).eq('id', existingId);
      else await (supabase as any).from('workshop_vehicles').insert({ provider_id: providerId, ...payload });
      queryClient.invalidateQueries({ queryKey: ['workshop-vehicles'] });
      toast.success(t('workshop.scheduler.vehicleFound', 'Znaleziono pojazd i zapisano w bazie'));
    } catch (e) {
      console.error('[SlotDialog] auto-save vehicle error', e);
    }
  };

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

  const removePl = (s: string): string => {
    const m: Record<string, string> = {
      'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
      'Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z',
    };
    return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, c => m[c] || c);
  };

  const formatPhoneForSms = (raw: string): string => {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0048')) digits = digits.substring(2);
    while (digits.startsWith('4848')) digits = digits.substring(2);
    if (digits.startsWith('48') && digits.length >= 11) digits = digits.slice(-9);
    if (digits.startsWith('0') && digits.length >= 10) digits = digits.slice(-9);
    if (digits.length === 9) return `+48${digits}`;
    return `+${digits}`;
  };

  const compactSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

  const handleSaveClient = async () => {
    if (!clientForm.phone) {
      toast.error(t('workshop.scheduler.phoneRequired'));
      return;
    }
    setSaving(true);
    try {
      // Wszystkie pozycje usług (lista + ewentualny niezatwierdzony wpis)
      const allServices = [...serviceItems, serviceInput.trim()].filter(Boolean);
      const serviceDescription = allServices.join(', ');
      const appointmentDay = editDate || format(slotData.day, 'yyyy-MM-dd');
      const appointmentHour = parseInt(editHourStr) || 0;
      const appointmentMin = parseInt(editMinStr) || 0;
      const appointmentTime = `${appointmentHour.toString().padStart(2, '0')}:${appointmentMin.toString().padStart(2, '0')}:00`;
      let stationId = editStationId || slotData.stationId;
      if (stationId === '__default') stationId = null;
      const { data: insertedBooking, error } = await (supabase as any).from('workshop_client_bookings').insert({
        provider_id: providerId,
        phone: clientForm.phone,
        first_name: clientForm.firstName || null,
        last_name: clientForm.lastName || null,
        plate: clientForm.plate || null,
        brand: clientForm.brand || null,
        model: clientForm.model || null,
        service_description: serviceDescription || null,
        appointment_date: appointmentDay,
        appointment_time: appointmentTime,
        duration_minutes: parseInt(clientForm.duration) || 60,
        station_id: stationId,
        reminder_enabled: clientForm.reminderOptions.length > 0,
        reminder_times: clientForm.reminderOptions,
        confirmation_sms_sent: false,
        status: 'scheduled',
      }).select('id, confirmation_token, public_token').single();
      if (error) throw error;

      // Sukces OD RAZU — nie czekamy na SMS. Wcześniej cały zapis czekał na
      // cold-start edge SMS ("długo zapisuje"), a przy błędzie SMS user klikał
      // ponownie → DUPLIKAT. Teraz: zamykamy i potwierdzamy natychmiast po insercie,
      // SMS potwierdzenia leci w tle.
      queryClient.invalidateQueries({ queryKey: ['workshop-bookings'] });
      toast.success(t('workshop.scheduler.clientBooked'));
      const sendSms = clientForm.sendConfirmationSms;
      const phoneForSms = clientForm.phone;
      // Zapamiętaj wybór przypomnień — następne umawianie podstawi to samo
      saveReminderPrefs(clientForm.reminderOptions, clientForm.sendConfirmationSms);
      onOpenChange(false);
      setClientForm({ phone: '', firstName: '', lastName: '', plate: '', brand: '', model: '', year: '', serviceDesc: '', duration: '60', reminderOptions: clientForm.reminderOptions, sendConfirmationSms: clientForm.sendConfirmationSms });
      setServiceItems([]);
      setServiceInput('');
      setClientId(null);
      setClientSuggest([]); setShowClientSuggest(false);
      setVehicleSuggest([]); setShowVehicleSuggest(false);
      setOwnerVehicles([]);

      // Powiąż auto z właścicielem (gdy wybrano klienta z bazy i podano nr rej)
      if (clientId && clientForm.plate?.trim()) {
        void (supabase as any).from('workshop_vehicles')
          .update({ owner_client_id: clientId })
          .eq('provider_id', providerId).ilike('plate', clientForm.plate.trim());
      }

      if (sendSms) {
        void (async () => {
          try {
            const { data: providerInfo } = await supabase
              .from('service_providers')
              .select('company_name, company_address, company_city, company_postal_code, user_id')
              .eq('id', providerId)
              .maybeSingle();
            let workshopShortName = '', wsAddress = '', wsCity = '';
            if (providerInfo?.user_id) {
              const { data: wsSettings } = await (supabase as any)
                .from('workshop_settings')
                .select('short_name, address, city, postal_code')
                .eq('user_id', providerInfo.user_id)
                .maybeSingle();
              if (wsSettings) {
                workshopShortName = wsSettings.short_name || '';
                wsAddress = wsSettings.address || '';
                wsCity = wsSettings.city || '';
              }
            }
            const smsPhone = formatPhoneForSms(phoneForSms);
            const [y, mo, d] = appointmentDay.split('-');
            const dateStr = `${d}.${mo}.${y}`;
            const timeStr = appointmentTime.slice(0, 5);
            const nameForSms = workshopShortName || providerInfo?.company_name || 'Warsztat';
            const workshopName = compactSpaces(removePl(nameForSms)).slice(0, 28);
            const finalAddress = providerInfo?.company_address || wsAddress;
            const finalCity = providerInfo?.company_city || wsCity;
            const addressText = compactSpaces(removePl([finalAddress, finalCity].filter(Boolean).join(', ')));
            const token = insertedBooking?.public_token || insertedBooking?.confirmation_token;
            const manageUrl = token ? buildPublicUrl(`/r/${token}`) : '';
            // Skrócony szablon (krótki public_token) — 1 SMS; drop adresu jeśli > 160.
            let smsMessage = `${workshopName}: potwierdzamy wizyte ${dateStr} ${timeStr}.`;
            if (addressText) smsMessage += ` ${addressText}.`;
            if (manageUrl) smsMessage += ` Zarzadzaj: ${manageUrl}`;
            smsMessage = compactSpaces(smsMessage);
            if (smsMessage.length > 160 && addressText) {
              smsMessage = compactSpaces(`${workshopName}: potwierdzamy wizyte ${dateStr} ${timeStr}.${manageUrl ? ` Zarzadzaj: ${manageUrl}` : ''}`);
            }
            const { error: smsError } = await supabase.functions.invoke('workshop-send-sms', {
              body: { phone: smsPhone, message: smsMessage, sms_type: 'booking_confirmation', provider_id: providerId },
            });
            if (smsError) {
              toast.error(t('workshop.scheduler.bookingSavedSmsFailed'));
            } else {
              await (supabase as any).from('workshop_client_bookings').update({ confirmation_sms_sent: true }).eq('id', insertedBooking.id);
              queryClient.invalidateQueries({ queryKey: ['sms-credits'] });
            }
          } catch (smsErr) {
            console.error('SMS send failed:', smsErr);
            toast.error(t('workshop.scheduler.bookingSavedSmsFailed'));
          }
        })();
      }
    } catch (err: any) {
      toast.error(err.message || t('workshop.scheduler.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const REMINDER_OPTIONS = [
    { value: '24h', labelKey: 'workshop.scheduler.reminderBefore.h24' },
    { value: '12h', labelKey: 'workshop.scheduler.reminderBefore.h12' },
    { value: '6h', labelKey: 'workshop.scheduler.reminderBefore.h6' },
    { value: '4h', labelKey: 'workshop.scheduler.reminderBefore.h4' },
    { value: '2h', labelKey: 'workshop.scheduler.reminderBefore.h2' },
    { value: '1h', labelKey: 'workshop.scheduler.reminderBefore.h1' },
  ];

  const toggleReminder = (val: string) => {
    setClientForm(f => ({
      ...f,
      reminderOptions: f.reminderOptions.includes(val)
        ? f.reminderOptions.filter(v => v !== val)
        : [...f.reminderOptions, val],
    }));
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedOrderId(''); setActiveTab('client'); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold tracking-tight">{t('workshop.scheduler.newAppointment')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-xl p-1 bg-muted/50">
            <Button variant={activeTab === 'client' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('client')} className="w-full text-xs font-semibold rounded-lg">
              {t('workshop.scheduler.bookClient')}
            </Button>
            <Button variant={activeTab === 'event' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('event')} className="w-full text-xs font-semibold rounded-lg">
              {t('workshop.scheduler.newEvent')}
            </Button>
            <Button variant={activeTab === 'order' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('order')} className="w-full text-xs font-semibold rounded-lg">
              {t('workshop.scheduler.newOrder')}
            </Button>
          </div>

          {/* Editable date/time/category/station info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm rounded-xl border bg-muted/20 p-3">
            <div className="min-w-0">
              <Label className="font-medium text-xs text-muted-foreground">{t('workshop.scheduler.date')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="mt-1 h-9 w-full justify-start text-sm font-normal bg-background rounded-xl">
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {editDate ? format(new Date(editDate), 'dd.MM.yyyy') : '—'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[100]" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={editDate ? new Date(editDate) : undefined}
                    onSelect={(d: Date | undefined) => { if (d) setEditDate(format(d, 'yyyy-MM-dd')); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="min-w-0">
              <Label className="font-medium text-xs text-muted-foreground">{t('workshop.scheduler.time')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="mt-1 h-9 w-full justify-start text-sm font-normal bg-background rounded-xl">
                    <Clock className="mr-2 h-4 w-4 text-primary" />
                    {`${(editHourStr || '00').padStart(2, '0')}:${(editMinStr || '00').padStart(2, '0')}`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-2 z-[100]" align="start">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Input
                      inputMode="numeric" value={editHourStr}
                      onFocus={e => e.target.select()}
                      onChange={e => setEditHourStr(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      onBlur={e => { const n = Math.min(23, Math.max(0, parseInt(e.target.value || '0'))); setEditHourStr(String(n).padStart(2, '0')); }}
                      className="h-8 text-sm text-center" placeholder="HH"
                    />
                    <span className="text-sm font-bold">:</span>
                    <Input
                      inputMode="numeric" value={editMinStr}
                      onFocus={e => e.target.select()}
                      onChange={e => setEditMinStr(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      onBlur={e => { const n = Math.min(59, Math.max(0, parseInt(e.target.value || '0'))); setEditMinStr(String(n).padStart(2, '0')); }}
                      className="h-8 text-sm text-center" placeholder="MM"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto grid grid-cols-3 gap-1">
                    {TIME_SLOTS.map(s => {
                      const active = s === `${(editHourStr || '00').padStart(2, '0')}:${(editMinStr || '00').padStart(2, '0')}`;
                      return (
                        <button
                          key={s} type="button"
                          onClick={() => { const [h, m] = s.split(':'); setEditHourStr(h); setEditMinStr(m); }}
                          className={`text-xs rounded-lg py-1 transition-colors ${active ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-primary/10'}`}
                        >{s}</button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="min-w-0">
              <Label className="font-medium text-xs text-muted-foreground">{t('workshop.scheduler.category')}</Label>
              <Select
                value={activeCategory}
                onValueChange={(v) => {
                  onCategoryChange(v);
                  const first = (allWorkstations || []).find((w: any) => (w.category || DEFAULT_WS_CATEGORY) === v);
                  if (first) { setEditStationId(first.id); onStationChange(first.id); }
                }}
              >
                <SelectTrigger className="mt-1 h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: string) => (
                    <SelectItem key={c} value={c}>{tc(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="font-medium text-xs text-muted-foreground">{t('workshop.scheduler.stationLabel')}</Label>
              <Select value={editStationId} onValueChange={(v) => { setEditStationId(v); onStationChange(v); }}>
                <SelectTrigger className="mt-1 h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stations.map((st: any) => (
                    <SelectItem key={st.id} value={st.id}>{tc(st.name)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>


          {activeTab === 'client' ? (
            <div className="space-y-3">
              <div className="relative">
                <Label className="text-sm">{t('workshop.scheduler.phoneLabel')}</Label>
                <Input
                  value={clientForm.phone}
                  onChange={e => { const v = e.target.value; setClientForm(f => ({...f, phone: v})); setClientId(null); searchClientsByPhone(v); }}
                  onFocus={() => { if (clientSuggest.length) setShowClientSuggest(true); }}
                  onBlur={() => setTimeout(() => setShowClientSuggest(false), 150)}
                  placeholder="+48 600 000 000" type="tel"
                />
                {showClientSuggest && clientSuggest.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border bg-popover shadow-lg max-h-52 overflow-y-auto">
                    {clientSuggest.map(c => (
                      <button
                        key={c.id} type="button"
                        onMouseDown={e => { e.preventDefault(); pickClient(c); }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
                      >
                        <span className="text-sm font-medium truncate">{clientLabel(c) || t('workshop.scheduler.clientNoName', 'Klient')}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {clientId && <p className="text-[10px] text-emerald-600 mt-0.5">✓ {t('workshop.scheduler.clientFromBase', 'Klient z bazy')}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">{t('workshop.scheduler.firstName')}</Label>
                  <Input value={clientForm.firstName} onChange={e => setClientForm(f => ({...f, firstName: e.target.value}))} placeholder={t('workshop.scheduler.firstNamePlaceholder')} />
                </div>
                <div>
                  <Label className="text-sm">{t('workshop.scheduler.lastName')}</Label>
                  <Input value={clientForm.lastName} onChange={e => setClientForm(f => ({...f, lastName: e.target.value}))} placeholder={t('workshop.scheduler.lastNamePlaceholder')} />
                </div>
              </div>
              {/* Nr rejestracyjny — wybór auta z bazy / auta właściciela / lookup po numerze */}
              <div>
                <Label className="text-sm">{t('workshop.scheduler.plateLabel')}</Label>
                {/* Szybki wybór aut wybranego klienta */}
                {ownerVehicles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {ownerVehicles.map(v => (
                      <button
                        key={v.id} type="button" onClick={() => pickVehicle(v)}
                        className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-xs hover:bg-accent transition-colors"
                      >
                        <Car className="h-3 w-3" /> {v.plate}{v.brand ? ` · ${v.brand} ${v.model || ''}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Input
                    value={clientForm.plate}
                    onChange={e => { const v = e.target.value.toUpperCase(); setClientForm(f => ({...f, plate: v})); searchVehiclesByPlate(v); }}
                    onFocus={() => { if (vehicleSuggest.length) setShowVehicleSuggest(true); }}
                    onBlur={() => setTimeout(() => setShowVehicleSuggest(false), 150)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleLookupPlate(); } }}
                    placeholder="KRA 12345"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={handleLookupPlate}
                    disabled={lookupLoading}
                    title={t('workshop.scheduler.lookupPlate', 'Wyszukaj pojazd po numerze')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground disabled:opacity-50"
                  >
                    {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                  {showVehicleSuggest && vehicleSuggest.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border bg-popover shadow-lg max-h-52 overflow-y-auto">
                      {vehicleSuggest.map(v => (
                        <button
                          key={v.id} type="button"
                          onMouseDown={e => { e.preventDefault(); pickVehicle(v); }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
                        >
                          <span className="text-sm font-medium">{v.plate}</span>
                          <span className="text-xs text-muted-foreground truncate">{v.brand} {v.model} {v.year ? `· ${v.year}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {typeof lookupCredits?.remaining_credits === 'number' && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t('workshop.scheduler.lookupCredits', 'Kredyty wyszukiwania')}: {lookupCredits.remaining_credits}</p>
                )}
              </div>
              {/* Marka / Model / Rok — responsywnie (1 kol. na telefonie) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm">{t('workshop.scheduler.brand')}</Label>
                  <Input value={clientForm.brand} onChange={e => setClientForm(f => ({...f, brand: e.target.value}))} placeholder={t('workshop.scheduler.brandPlaceholder')} />
                </div>
                <div>
                  <Label className="text-sm">{t('workshop.scheduler.model')}</Label>
                  <Input value={clientForm.model} onChange={e => setClientForm(f => ({...f, model: e.target.value}))} placeholder={t('workshop.scheduler.modelPlaceholder')} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-sm">{t('workshop.scheduler.year', 'Rok')}</Label>
                  <Input value={clientForm.year} onChange={e => setClientForm(f => ({...f, year: e.target.value.replace(/\D/g, '').slice(0, 4)}))} inputMode="numeric" placeholder="2019" />
                </div>
              </div>
              {/* Usługi — wiele pozycji: Enter lub plusik dodaje, X usuwa */}
              <div>
                <Label className="text-sm">{t('workshop.scheduler.serviceDesc')}</Label>
                {serviceItems.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {serviceItems.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5">
                        <span className="text-muted-foreground text-xs shrink-0">{idx + 1}.</span>
                        <span className="text-sm flex-1 min-w-0 break-words">{s}</span>
                        <button type="button" onClick={() => removeServiceItem(idx)} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={serviceInput}
                    onChange={e => setServiceInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addServiceItem(); } }}
                    placeholder={t('workshop.scheduler.serviceDescPlaceholder')}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addServiceItem} disabled={!serviceInput.trim()} title={t('workshop.scheduler.addService', 'Dodaj pozycję')}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{t('workshop.scheduler.serviceAddHint', 'Enter lub + dodaje kolejną pozycję')}</p>
              </div>
              <div>
                <Label className="text-sm">{t('workshop.scheduler.serviceDuration')}</Label>
                <Select value={clientForm.duration} onValueChange={v => setClientForm(f => ({...f, duration: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">{t('workshop.scheduler.dur30min')}</SelectItem>
                    <SelectItem value="60">{t('workshop.scheduler.dur1h')}</SelectItem>
                    <SelectItem value="120">{t('workshop.scheduler.dur2h')}</SelectItem>
                    <SelectItem value="180">{t('workshop.scheduler.dur3h')}</SelectItem>
                    <SelectItem value="240">{t('workshop.scheduler.dur4h')}</SelectItem>
                    <SelectItem value="480">{t('workshop.scheduler.durAllDay')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Reminder checkboxes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">📱 {t('workshop.scheduler.smsReminders')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {REMINDER_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer p-1.5 rounded border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <input
                        type="checkbox"
                        checked={clientForm.reminderOptions.includes(opt.value)}
                        onChange={() => toggleReminder(opt.value)}
                        className="rounded"
                      />
                      <span className="text-xs">{t(opt.labelKey)}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* SMS confirmation checkbox */}
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded border bg-primary/5 hover:bg-primary/10 transition-colors">
                <input
                  type="checkbox"
                  checked={clientForm.sendConfirmationSms}
                  onChange={() => setClientForm(f => ({ ...f, sendConfirmationSms: !f.sendConfirmationSms }))}
                  className="rounded"
                />
                <div>
                  <span className="text-xs font-medium">📩 {t('workshop.scheduler.sendConfirmationSms')}</span>
                  <p className="text-[10px] text-muted-foreground">{t('workshop.scheduler.confirmationSmsHint')}</p>
                </div>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                <Button onClick={handleSaveClient} disabled={saving}>
                  {saving ? t('common.saving') : t('workshop.scheduler.bookClient')}
                </Button>
              </div>
            </div>
          ) : activeTab === 'event' ? (
            <div className="space-y-3">
              <div>
                <Label>{t('workshop.scheduler.serviceOrActivity')}</Label>
                <Input value={eventForm.service} onChange={e => setEventForm(f => ({...f, service: e.target.value}))} placeholder={t('workshop.scheduler.serviceOrActivityPlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('workshop.scheduler.type')}</Label>
                  <Select value={eventForm.type} onValueChange={v => setEventForm(f => ({...f, type: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Wydarzenie">{t('workshop.scheduler.eventType.event')}</SelectItem>
                      <SelectItem value="Zadanie">{t('workshop.scheduler.eventType.task')}</SelectItem>
                      <SelectItem value="Przerwa">{t('workshop.scheduler.eventType.break')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('workshop.scheduler.color')}</Label>
                  <Select value={eventForm.color} onValueChange={v => setEventForm(f => ({...f, color: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Niebieski">🔵 {t('workshop.scheduler.colorOpt.blue')}</SelectItem>
                      <SelectItem value="Fioletowy">🟣 {t('workshop.scheduler.colorOpt.purple')}</SelectItem>
                      <SelectItem value="Zielony">🟢 {t('workshop.scheduler.colorOpt.green')}</SelectItem>
                      <SelectItem value="Czerwony">🔴 {t('workshop.scheduler.colorOpt.red')}</SelectItem>
                      <SelectItem value="Pomarańczowy">🟠 {t('workshop.scheduler.colorOpt.orange')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t('workshop.scheduler.duration')}</Label>
                <Select value={eventForm.duration} onValueChange={v => setEventForm(f => ({...f, duration: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30 min">{t('workshop.scheduler.dur30min')}</SelectItem>
                    <SelectItem value="1 godz.">{t('workshop.scheduler.dur1h')}</SelectItem>
                    <SelectItem value="2 godz.">{t('workshop.scheduler.dur2h')}</SelectItem>
                    <SelectItem value="3 godz.">{t('workshop.scheduler.dur3h')}</SelectItem>
                    <SelectItem value="4 godz.">{t('workshop.scheduler.dur4h')}</SelectItem>
                    <SelectItem value="Cały dzień">{t('workshop.scheduler.durAllDay')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('workshop.scheduler.employee')}</Label>
                <Input value={eventForm.worker} onChange={e => setEventForm(f => ({...f, worker: e.target.value}))} placeholder={t('workshop.scheduler.selectEmployeeOptional')} />
              </div>
              <div>
                <Label>{t('workshop.scheduler.descriptionLabel')}</Label>
                <Input value={eventForm.description} onChange={e => setEventForm(f => ({...f, description: e.target.value}))} placeholder={t('workshop.scheduler.additionalInfoPlaceholder')} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                <Button onClick={() => { toast.success(t('workshop.scheduler.eventAdded')); onOpenChange(false); }}>{t('workshop.scheduler.saveEvent')}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {unplannedOrders.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{t('workshop.scheduler.selectExistingOrder')}</label>
                  <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                    <SelectTrigger><SelectValue placeholder={t('workshop.scheduler.selectOrderPlaceholder')} /></SelectTrigger>
                    <SelectContent>
                      {unplannedOrders.map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.order_number} — {o.vehicle ? `${o.vehicle.brand} ${o.vehicle.model}` : t('workshop.scheduler.noVehicle')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="text-center text-sm text-muted-foreground py-2">{t('workshop.scheduler.or')}</div>
              <Button variant="outline" className="w-full gap-2" onClick={() => { onOpenChange(false); toast.info(t('workshop.scheduler.openNewOrderForm')); }}>
                <Plus className="h-4 w-4" /> {t('workshop.scheduler.createNewOrder')}
              </Button>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                <Button onClick={async () => {
                  if (selectedOrderId) {
                    const stationId = editStationId || slotData.stationId;
                    const hourNum = parseInt(editHourStr) || slotData.hour;
                    await onSchedule(selectedOrderId, slotData.day, hourNum, stationId);
                    onOpenChange(false); setSelectedOrderId('');
                  }
                }} disabled={!selectedOrderId}>{t('workshop.scheduler.schedule')}</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
