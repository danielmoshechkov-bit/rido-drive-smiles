import { useState, useEffect } from "react";
import { WorkspaceProject, WorkspaceTask } from "@/hooks/useWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckCircle2, Circle, Clock, AlertTriangle, XCircle, Trash2, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  todo: { label: "Do zrobienia", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "W trakcie", icon: Clock, color: "text-blue-500" },
  review: { label: "Weryfikacja", icon: AlertTriangle, color: "text-yellow-500" },
  done: { label: "Gotowe", icon: CheckCircle2, color: "text-green-500" },
  blocked: { label: "Zablokowane", icon: XCircle, color: "text-red-500" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Niski", color: "bg-muted text-muted-foreground" },
  medium: { label: "Średni", color: "bg-blue-100 text-blue-700" },
  high: { label: "Wysoki", color: "bg-orange-100 text-orange-700" },
  critical: { label: "Krytyczny", color: "bg-red-100 text-red-700" },
};

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceTasksView({ project, workspace }: Props) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<WorkspaceTask | null>(null);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "", assigned_name: "" });
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => { reload(); }, [project.id]);

  const reload = async () => {
    setLoading(true);
    const t = await workspace.loadTasks(project.id);
    setTasks(t);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    await workspace.createTask({
      project_id: project.id,
      title: form.title.trim(),
      description: form.description || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_name: form.assigned_name || null,
    });
    setShowCreate(false);
    setForm({ title: "", description: "", priority: "medium", due_date: "", assigned_name: "" });
    reload();
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await workspace.updateTask(taskId, { status: newStatus });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const handleDelete = async (taskId: string) => {
    await workspace.deleteTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const rootTasks = tasks.filter(t => !t.parent_task_id);
  const childrenOf = (id: string) => tasks.filter(t => t.parent_task_id === id);
  const filtered = filter === "all" ? rootTasks : rootTasks.filter(t => t.status === filter);

  const toggleExpand = (id: string) => {
    setExpandedTasks(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const renderTask = (task: WorkspaceTask, depth = 0) => {
    const children = childrenOf(task.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedTasks.has(task.id);
    const StatusIcon = STATUS_CONFIG[task.status]?.icon || Circle;
    const statusColor = STATUS_CONFIG[task.status]?.color || "";
    const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

    return (
      <div key={task.id}>
        <div
          className="flex items-center gap-2 p-3 border-b hover:bg-muted/50 transition-colors group"
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(task.id)} className="shrink-0">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <button onClick={() => handleStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')}>
            <StatusIcon className={`h-5 w-5 ${statusColor} shrink-0`} />
          </button>

          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-muted-foreground truncate">{task.description}</p>
            )}
          </div>

          <Badge className={`text-[10px] px-1.5 py-0 ${priorityCfg.color}`}>{priorityCfg.label}</Badge>

          {task.assigned_name && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{task.assigned_name}</span>
          )}

          {task.due_date && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {new Date(task.due_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
            </span>
          )}

          <Select value={task.status} onValueChange={v => handleStatusChange(task.id, v)}>
            <SelectTrigger className="w-auto h-7 text-xs border-0 bg-transparent gap-1 opacity-0 group-hover:opacity-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
            onClick={() => handleDelete(task.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {isExpanded && children.map(c => renderTask(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Dodaj zadanie
        </Button>
        <div className="flex gap-1 ml-auto">
          {["all", "todo", "in_progress", "review", "done", "blocked"].map(s => (
            <Button
              key={s}
              variant={filter === s ? "secondary" : "ghost"}
              size="sm"
              className="text-xs h-7"
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "Wszystkie" : STATUS_CONFIG[s]?.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Ładowanie...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ListTodoIcon className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Brak zadań. Dodaj pierwsze zadanie!</p>
            </div>
          ) : (
            filtered.map(t => renderTask(t))
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nowe zadanie</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tytuł *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Co trzeba zrobić?" />
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Szczegóły zadania..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priorytet</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Termin</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Przypisana osoba</Label>
              <Input value={form.assigned_name} onChange={e => setForm(p => ({ ...p, assigned_name: e.target.value }))} placeholder="Imię lub email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Anuluj</Button>
            <Button onClick={handleCreate} disabled={!form.title.trim()}>Dodaj zadanie</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListTodoIcon(props: any) {
  return <Circle {...props} />;
}
