import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon,
  List,
  Grid3X3,
  LayoutGrid,
  Clock,
  Loader2,
  Monitor,
  Trash2,
  UserPlus,
  X
} from "lucide-react";
import { format, addDays, addHours, addWeeks, addMonths, subDays, subWeeks, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, isSameMonth, getHours, getMinutes, differenceInMinutes, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { 
  useDefaultCalendar, 
  useCalendarEvents, 
  CalendarEvent 
} from "@/hooks/useCalendar";
import { CalendarEventDialog } from "./CalendarEventDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ViewType = "day" | "week" | "month" | "agenda";

const HOUR_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 22;

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("week");
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);

  // Workstation & employee dialogs
  const [showAddWorkstation, setShowAddWorkstation] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newWorkstationName, setNewWorkstationName] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePhone, setNewEmployeePhone] = useState("");
  const [newEmployeeEmail, setNewEmployeeEmail] = useState("");
  const [selectedWorkstation, setSelectedWorkstation] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Get provider ID
  useEffect(() => {
    const fetchProvider = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setProviderId(data.id);
    };
    fetchProvider();
  }, []);

  // DB-backed workstations
  const { data: workstations = [] } = useQuery({
    queryKey: ['calendar-workstations', providerId],
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

  // DB-backed employees
  const { data: employees = [] } = useQuery({
    queryKey: ['calendar-employees', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []).map((e: any) => ({ id: e.id, name: e.name }));
    },
  });

  const addWorkstationMut = useMutation({
    mutationFn: async (name: string) => {
      const maxSort = workstations.length;
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .insert({ provider_id: providerId, name, sort_order: maxSort });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success('Stanowisko dodane');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeWorkstationMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
    },
  });

  const addEmployeeMut = useMutation({
    mutationFn: async (emp: { name: string; phone?: string; email?: string }) => {
      const { error } = await (supabase as any)
        .from('workshop_employees')
        .insert({ provider_id: providerId, ...emp });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-employees'] });
      toast.success('Pracownik dodany');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeEmployeeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('workshop_employees')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-employees'] });
    },
  });

  const addWorkstation = () => {
    if (!newWorkstationName.trim() || !providerId) return;
    addWorkstationMut.mutate(newWorkstationName.trim());
    setNewWorkstationName("");
    setShowAddWorkstation(false);
  };

  const addEmployee = () => {
    if (!newEmployeeName.trim() || !providerId) return;
    addEmployeeMut.mutate({
      name: newEmployeeName.trim(),
      phone: newEmployeePhone.trim() || undefined,
      email: newEmployeeEmail.trim() || undefined,
    });
    setNewEmployeeName("");
    setNewEmployeePhone("");
    setNewEmployeeEmail("");
    setShowAddEmployee(false);
  };

  const { data: calendar, isLoading: calendarLoading } = useDefaultCalendar();
  const calendarIds = calendar ? [calendar.id] : [];
  
  const { data: events = [], isLoading: eventsLoading } = useCalendarEvents(
    calendarIds,
    view,
    currentDate
  );

  const navigatePrev = () => {
    switch (view) {
      case "day": setCurrentDate(subDays(currentDate, 1)); break;
      case "week": setCurrentDate(subWeeks(currentDate, 1)); break;
      case "month": setCurrentDate(subMonths(currentDate, 1)); break;
      case "agenda": setCurrentDate(subWeeks(currentDate, 1)); break;
    }
  };

  const navigateNext = () => {
    switch (view) {
      case "day": setCurrentDate(addDays(currentDate, 1)); break;
      case "week": setCurrentDate(addWeeks(currentDate, 1)); break;
      case "month": setCurrentDate(addMonths(currentDate, 1)); break;
      case "agenda": setCurrentDate(addWeeks(currentDate, 1)); break;
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const getDateRangeLabel = () => {
    switch (view) {
      case "day":
        return format(currentDate, "EEEE, d MMMM yyyy", { locale: pl });
      case "week":
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        if (isSameMonth(weekStart, weekEnd)) {
          return `${format(weekStart, "d")} - ${format(weekEnd, "d MMMM yyyy", { locale: pl })}`;
        }
        return `${format(weekStart, "d MMM", { locale: pl })} - ${format(weekEnd, "d MMM yyyy", { locale: pl })}`;
      case "month":
        return format(currentDate, "LLLL yyyy", { locale: pl });
      case "agenda":
        return `Od ${format(currentDate, "d MMMM", { locale: pl })}`;
    }
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const hours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  }, []);

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(parseISO(event.start_at), day));
  };

  const getEventPosition = (event: CalendarEvent) => {
    const startDate = parseISO(event.start_at);
    const endDate = parseISO(event.end_at);
    const startHour = getHours(startDate);
    const startMinute = getMinutes(startDate);
    const top = ((startHour - START_HOUR) * HOUR_HEIGHT) + ((startMinute / 60) * HOUR_HEIGHT);
    const duration = differenceInMinutes(endDate, startDate);
    const height = (duration / 60) * HOUR_HEIGHT;
    return { top, height: Math.max(height, 20) };
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (calendarLoading) {
      toast.error("Kalendarz się ładuje, spróbuj za chwilę");
      return;
    }
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1, 0, 0, 0);
    setSelectedSlot({ start, end });
    setSelectedEvent(null);
    setShowEventDialog(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setSelectedSlot(null);
    setShowEventDialog(true);
  };

  const handleAddButtonClick = () => {
    if (calendarLoading) {
      toast.error("Kalendarz się ładuje, spróbuj za chwilę");
      return;
    }
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    const end = addHours(start, 1);
    setSelectedEvent(null);
    setSelectedSlot({ start, end });
    setShowEventDialog(true);
  };

  const renderTimeGrid = (days: Date[]) => (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-16 flex-shrink-0 border-r">
        <div className="h-12" />
        {hours.map(hour => (
          <div key={hour} className="h-[60px] text-xs text-muted-foreground pr-2 text-right border-b border-dashed">
            {format(new Date().setHours(hour, 0), "HH:mm")}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-x-auto">
        <div className="flex min-w-full">
          {days.map(day => (
            <div key={day.toISOString()} className="flex-1 min-w-[100px] border-r last:border-r-0">
              <div className={cn("h-12 border-b p-2 text-center sticky top-0 bg-background z-10", isToday(day) && "bg-primary/10")}>
                <div className="text-xs text-muted-foreground">{format(day, "EEE", { locale: pl })}</div>
                <div className={cn("text-sm font-medium", isToday(day) && "text-primary")}>{format(day, "d")}</div>
              </div>
              <div className="relative">
                {hours.map(hour => (
                  <div key={hour} className="h-[60px] border-b border-dashed cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSlotClick(day, hour)} />
                ))}
                <div className="absolute inset-0 pointer-events-none">
                  {getEventsForDay(day).map(event => {
                    const { top, height } = getEventPosition(event);
                    return (
                      <div
                        key={event.id}
                        className={cn("absolute left-1 right-1 rounded px-1.5 py-0.5 text-xs font-medium overflow-hidden cursor-pointer pointer-events-auto", "bg-primary text-primary-foreground hover:brightness-90 transition-all")}
                        style={{ top: `${top}px`, height: `${height}px`, backgroundColor: event.color || undefined }}
                        onClick={(e) => { e.stopPropagation(); handleEventClick(event); }}
                      >
                        <div className="truncate">{event.title}</div>
                        {height > 30 && <div className="text-[10px] opacity-80">{format(parseISO(event.start_at), "HH:mm")}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderMonthView = () => {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b">
          {["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"].map(day => (
            <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground">{day}</div>
          ))}
        </div>
        <div className="flex-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b min-h-[100px]">
              {week.map(day => {
                const dayEvents = getEventsForDay(day);
                return (
                  <div key={day.toISOString()} className={cn("p-1 border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors", !isSameMonth(day, currentDate) && "opacity-40", isToday(day) && "bg-primary/5")} onClick={() => { setCurrentDate(day); setView("day"); }}>
                    <div className={cn("text-xs font-medium mb-1", isToday(day) && "text-primary")}>{format(day, "d")}</div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map(event => (
                        <div key={event.id} className="text-[10px] px-1 py-0.5 rounded truncate bg-primary/10 text-primary cursor-pointer hover:bg-primary/20" style={{ backgroundColor: event.color ? `${event.color}20` : undefined }} onClick={(e) => { e.stopPropagation(); handleEventClick(event); }}>{event.title}</div>
                      ))}
                      {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} więcej</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAgendaView = () => {
    const sortedEvents = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    const eventsByDay: Record<string, CalendarEvent[]> = {};
    sortedEvents.forEach(event => {
      const dayKey = format(parseISO(event.start_at), "yyyy-MM-dd");
      if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
      eventsByDay[dayKey].push(event);
    });

    return (
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {Object.entries(eventsByDay).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Brak wydarzeń w wybranym okresie</p>
          </div>
        ) : (
          Object.entries(eventsByDay).map(([dayKey, dayEvents]) => (
            <div key={dayKey}>
              <h3 className="font-medium mb-2 text-sm">{format(parseISO(dayKey), "EEEE, d MMMM", { locale: pl })}</h3>
              <div className="space-y-2">
                {dayEvents.map(event => (
                  <Card key={event.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleEventClick(event)}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-1 h-10 rounded-full" style={{ backgroundColor: event.color || "hsl(var(--primary))" }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(event.start_at), "HH:mm")} - {format(parseISO(event.end_at), "HH:mm")}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">{event.type === "booking" ? "Rezerwacja" : "Wydarzenie"}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  if (calendarLoading && !calendar) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
      <CardHeader className="flex-shrink-0 pb-2 space-y-3">
        {/* Workstation tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <Monitor className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground mr-1">Stanowiska:</span>
          {workstations.length === 0 ? (
            <span className="text-xs text-muted-foreground">Brak stanowisk</span>
          ) : (
            workstations.map((ws: any) => (
              <Button
                key={ws.id}
                variant={selectedWorkstation === ws.id ? "default" : "outline"}
                size="sm"
                className="gap-1 h-7 text-xs"
                onClick={() => setSelectedWorkstation(ws.id)}
              >
                {ws.name}
                <button onClick={(e) => { e.stopPropagation(); removeWorkstationMut.mutate(ws.id); }} className="ml-1 opacity-50 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </Button>
            ))
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAddWorkstation(true)}>
            <Plus className="h-3 w-3" /> Dodaj stanowisko
          </Button>
          <div className="border-l pl-2 ml-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAddEmployee(true)}>
              <UserPlus className="h-3 w-3" /> Pracownik
            </Button>
          </div>
          {employees.map((emp: any) => (
            <Badge key={emp.id} variant="secondary" className="gap-1 text-xs">
              {emp.name}
              <button onClick={() => removeEmployeeMut.mutate(emp.id)} className="opacity-50 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>Dziś</Button>
            <div className="flex items-center">
              <Button variant="ghost" size="icon" onClick={navigatePrev}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={navigateNext}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <h2 className="text-lg font-semibold capitalize">{getDateRangeLabel()}</h2>
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
              <TabsList className="h-8">
                <TabsTrigger value="day" className="text-xs px-2"><Clock className="h-3 w-3 mr-1" />Dzień</TabsTrigger>
                <TabsTrigger value="week" className="text-xs px-2"><Grid3X3 className="h-3 w-3 mr-1" />Tydzień</TabsTrigger>
                <TabsTrigger value="month" className="text-xs px-2"><LayoutGrid className="h-3 w-3 mr-1" />Miesiąc</TabsTrigger>
                <TabsTrigger value="agenda" className="text-xs px-2"><List className="h-3 w-3 mr-1" />Agenda</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button size="sm" onClick={handleAddButtonClick}>
              <Plus className="h-4 w-4 mr-1" /> Dodaj
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        {eventsLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {view === "day" && renderTimeGrid([currentDate])}
            {view === "week" && renderTimeGrid(weekDays)}
            {view === "month" && renderMonthView()}
            {view === "agenda" && renderAgendaView()}
          </>
        )}
      </CardContent>

      {/* Event Dialog - always render, check calendarId inside */}
      <CalendarEventDialog
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
        event={selectedEvent}
        defaultStart={selectedSlot?.start}
        defaultEnd={selectedSlot?.end}
        calendarId={calendar?.id || ""}
        employees={employees}
      />

      {/* Add Workstation Dialog */}
      <Dialog open={showAddWorkstation} onOpenChange={setShowAddWorkstation}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Dodaj stanowisko</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Nazwa stanowiska</Label>
            <Input value={newWorkstationName} onChange={e => setNewWorkstationName(e.target.value)} placeholder="np. Podnośnik 1, Stanowisko detailing" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWorkstation(false)}>Anuluj</Button>
            <Button onClick={addWorkstation} disabled={!newWorkstationName.trim() || addWorkstationMut.isPending}>Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Employee Dialog */}
      <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Dodaj pracownika</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Imię i nazwisko *</Label>
              <Input value={newEmployeeName} onChange={e => setNewEmployeeName(e.target.value)} placeholder="np. Jan Kowalski" />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={newEmployeePhone} onChange={e => setNewEmployeePhone(e.target.value)} placeholder="+48 000 000 000" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={newEmployeeEmail} onChange={e => setNewEmployeeEmail(e.target.value)} placeholder="jan@firma.pl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEmployee(false)}>Anuluj</Button>
            <Button onClick={addEmployee} disabled={!newEmployeeName.trim() || addEmployeeMut.isPending}>Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
