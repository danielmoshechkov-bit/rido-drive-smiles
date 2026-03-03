import { useState, useEffect, useMemo } from "react";
import { WorkspaceProject, WorkspaceTask } from "@/hooks/useWorkspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DAYS_PL = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Ndz"];
const MONTHS_PL = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

const PRIORITY_COLORS: Record<string, string> = {
  low: "#9ca3af", medium: "#3b82f6", high: "#f59e0b", critical: "#ef4444",
};

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceCalendarView({ project, workspace }: Props) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [form, setForm] = useState({ title: "", priority: "medium", due_date: "" });

  useEffect(() => { reload(); }, [project.id]);

  const reload = async () => {
    const t = await workspace.loadTasks(project.id);
    setTasks(t);
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month, -i), isCurrentMonth: false });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    while (days.length % 7 !== 0) {
      const next = days.length - startOffset - lastDay.getDate() + 1;
      days.push({ date: new Date(year, month + 1, next), isCurrentMonth: false });
    }
    return days;
  }, [year, month]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, WorkspaceTask[]> = {};
    tasks.filter(t => t.due_date).forEach(t => {
      const key = new Date(t.due_date!).toISOString().slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const today = new Date().toISOString().slice(0, 10);

  const handleDayClick = (date: Date) => {
    const ds = date.toISOString().slice(0, 10);
    setSelectedDate(ds);
    setForm({ title: "", priority: "medium", due_date: ds });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold">{MONTHS_PL[month]} {year}</h3>
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {DAYS_PL.map(d => (
          <div key={d} className="bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {calendarDays.map(({ date, isCurrentMonth }, i) => {
          const key = date.toISOString().slice(0, 10);
          const dayTasks = tasksByDate[key] || [];
          const isToday = key === today;

          return (
            <div
              key={i}
              className={`bg-background p-1 min-h-[80px] cursor-pointer hover:bg-muted/30 transition-colors ${!isCurrentMonth ? 'opacity-40' : ''}`}
              onClick={() => handleDayClick(date)}
            >
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : ''}`}>
                {date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <div
                    key={t.id}
                    className="text-[10px] px-1 py-0.5 rounded truncate text-white"
                    style={{ backgroundColor: PRIORITY_COLORS[t.priority] || '#6C4AE2' }}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-muted-foreground text-center">+{dayTasks.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dodaj zadanie — {selectedDate}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tytuł *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Co trzeba zrobić?" />
            </div>
            <div className="space-y-2">
              <Label>Priorytet</Label>
              <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Niski</SelectItem>
                  <SelectItem value="medium">Średni</SelectItem>
                  <SelectItem value="high">Wysoki</SelectItem>
                  <SelectItem value="critical">Krytyczny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
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
