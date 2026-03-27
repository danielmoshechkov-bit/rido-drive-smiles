import { useState, useEffect, useMemo } from "react";
import { WorkspaceProject, WorkspaceTask } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, List, LayoutGrid, Clock } from "lucide-react";
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, isSameMonth, startOfMonth, endOfMonth } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";

const HOUR_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 22;

type ViewType = "day" | "week" | "month" | "agenda";

const PRIORITY_COLORS: Record<string, string> = {
  low: "#22c55e", medium: "#3b82f6", high: "#f59e0b", critical: "#ef4444",
};

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceCalendarView({ project, workspace }: Props) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("week");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [form, setForm] = useState({ title: "", priority: "medium", due_date: "", start_time: "09:00", end_time: "10:00" });

  useEffect(() => { reload(); }, [project.id]);

  const reload = async () => {
    const t = await workspace.loadTasks(project.id);
    setTasks(t);
  };

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

  const getDateRangeLabel = () => {
    switch (view) {
      case "day":
        return format(currentDate, "EEEE, d MMMM yyyy", { locale: pl });
      case "week": {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
        const we = endOfWeek(currentDate, { weekStartsOn: 1 });
        if (isSameMonth(ws, we)) return `${format(ws, "d")} - ${format(we, "d MMMM yyyy", { locale: pl })}`;
        return `${format(ws, "d MMM", { locale: pl })} - ${format(we, "d MMM yyyy", { locale: pl })}`;
      }
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

  const hours = useMemo(() => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i), []);

  const getTasksForDay = (day: Date) => tasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), day));

  const handleSlotClick = (day: Date, hour?: number) => {
    const ds = format(day, "yyyy-MM-dd");
    setSelectedDate(ds);
    setForm({
      title: "", priority: "medium", due_date: ds,
      start_time: hour ? `${String(hour).padStart(2, '0')}:00` : "09:00",
      end_time: hour ? `${String(hour + 1).padStart(2, '0')}:00` : "10:00",
    });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    const t = await workspace.createTask({
      project_id: project.id,
      title: form.title.trim(),
      priority: form.priority,
      due_date: form.due_date || null,
    });
    if (t) setTasks(prev => [...prev, t]);
    setShowCreate(false);
  };

  // Time grid (day/week)
  const renderTimeGrid = (days: Date[]) => (
    <div className="flex flex-1 overflow-hidden rounded-lg border bg-card">
      {/* Hours column */}
      <div className="w-16 flex-shrink-0 border-r bg-muted/30">
        <div className="h-12" />
        {hours.map(hour => (
          <div key={hour} className="h-[60px] text-xs text-muted-foreground pr-2 text-right border-b border-dashed flex items-start justify-end pt-1">
            {String(hour).padStart(2, '0')}:00
          </div>
        ))}
      </div>
      {/* Day columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex min-w-full">
          {days.map(day => {
            const dayTasks = getTasksForDay(day);
            return (
              <div key={day.toISOString()} className="flex-1 min-w-[120px] border-r last:border-r-0">
                {/* Day header */}
                <div className={cn(
                  "h-12 border-b p-2 text-center sticky top-0 z-10 bg-card",
                  isToday(day) && "bg-primary/10"
                )}>
                  <div className="text-[11px] text-muted-foreground font-medium uppercase">{format(day, "EEE", { locale: pl })}</div>
                  <div className={cn(
                    "text-sm font-bold w-7 h-7 mx-auto flex items-center justify-center rounded-full",
                    isToday(day) && "bg-primary text-primary-foreground"
                  )}>
                    {format(day, "d")}
                  </div>
                </div>
                {/* Time slots */}
                <div className="relative">
                  {hours.map(hour => (
                    <div
                      key={hour}
                      className="h-[60px] border-b border-dashed border-border/50 cursor-pointer hover:bg-primary/5 transition-colors"
                      onClick={() => handleSlotClick(day, hour)}
                    />
                  ))}
                  {/* Tasks overlay */}
                  <div className="absolute inset-0 pointer-events-none">
                    {dayTasks.map((task, idx) => {
                      const top = idx * 28 + 8;
                      return (
                        <div
                          key={task.id}
                          className="absolute left-1 right-1 rounded-md px-2 py-1 text-[11px] font-semibold text-white truncate pointer-events-auto cursor-pointer hover:brightness-110 transition-all shadow-sm"
                          style={{
                            top: `${top}px`,
                            backgroundColor: PRIORITY_COLORS[task.priority] || '#8b5cf6',
                          }}
                          title={task.title}
                        >
                          {task.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Month view
  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    return (
      <div className="flex-1 overflow-auto rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b">
          {["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"].map(day => (
            <div key={day} className="p-2 text-center text-xs font-semibold text-muted-foreground bg-muted/30">{day}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map(day => {
              const dayTasks = getTasksForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[90px] p-1.5 cursor-pointer hover:bg-muted/30 transition-colors border-r last:border-r-0",
                    !isCurrentMonth && "opacity-40 bg-muted/10"
                  )}
                  onClick={() => handleSlotClick(day)}
                >
                  <div className={cn(
                    "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                    isToday(day) && "bg-primary text-primary-foreground font-bold"
                  )}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(t => (
                      <div
                        key={t.id}
                        className="text-[10px] px-1.5 py-0.5 rounded-sm truncate text-white font-medium"
                        style={{ backgroundColor: PRIORITY_COLORS[t.priority] || '#8b5cf6' }}
                        title={t.title}
                      >
                        {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-[10px] text-muted-foreground text-center font-medium">+{dayTasks.length - 3}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // Agenda view
  const renderAgendaView = () => {
    const agendaDays = eachDayOfInterval({ start: currentDate, end: addDays(currentDate, 13) });
    return (
      <div className="space-y-2 rounded-lg border bg-card p-3">
        {agendaDays.map(day => {
          const dayTasks = getTasksForDay(day);
          if (dayTasks.length === 0 && !isToday(day)) return null;
          return (
            <div key={day.toISOString()} className={cn("rounded-lg p-3", isToday(day) ? "bg-primary/5 border border-primary/20" : "border")}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn(
                  "text-sm font-bold",
                  isToday(day) && "text-primary"
                )}>
                  {format(day, "EEEE, d MMM", { locale: pl })}
                </span>
                {isToday(day) && <Badge variant="default" className="text-[10px] h-5">Dziś</Badge>}
              </div>
              {dayTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Brak zadań</p>
              ) : (
                <div className="space-y-1">
                  {dayTasks.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-sm py-1">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[t.priority] || '#8b5cf6' }} />
                      <span className="font-medium">{t.title}</span>
                      {t.assigned_name && <span className="text-xs text-muted-foreground ml-auto">→ {t.assigned_name}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }).filter(Boolean)}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs font-semibold" onClick={() => setCurrentDate(new Date())}>
            Dziś
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navigatePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h3 className="font-bold text-base capitalize">{getDateRangeLabel()}</h3>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={v => setView(v as ViewType)}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="text-xs px-3 h-7 gap-1">
                <Clock className="h-3 w-3" /> Dzień
              </TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3 h-7 gap-1">
                <LayoutGrid className="h-3 w-3" /> Tydzień
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-3 h-7 gap-1">
                <CalendarIcon className="h-3 w-3" /> Miesiąc
              </TabsTrigger>
              <TabsTrigger value="agenda" className="text-xs px-3 h-7 gap-1">
                <List className="h-3 w-3" /> Agenda
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => handleSlotClick(currentDate)}>
            <Plus className="h-3.5 w-3.5" /> Dodaj
          </Button>
        </div>
      </div>

      {/* Calendar content */}
      <div className="flex-1 overflow-auto">
        {view === "day" && renderTimeGrid([currentDate])}
        {view === "week" && renderTimeGrid(weekDays)}
        {view === "month" && renderMonthView()}
        {view === "agenda" && renderAgendaView()}
      </div>

      {/* Create task dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dodaj zadanie — {selectedDate}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tytuł *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Co trzeba zrobić?" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priorytet</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟢 Niski</SelectItem>
                    <SelectItem value="medium">🔵 Średni</SelectItem>
                    <SelectItem value="high">🟡 Wysoki</SelectItem>
                    <SelectItem value="critical">🔴 Krytyczny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Od</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Do</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Anuluj</Button>
            <Button onClick={handleCreate} disabled={!form.title.trim()}>Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
