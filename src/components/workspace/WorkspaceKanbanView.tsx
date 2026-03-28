import { useState, useEffect } from "react";
import { WorkspaceProject, WorkspaceTask } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskDetailModal } from "./TaskDetailModal";
import { Plus, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { key: "todo", label: "Do zrobienia", color: "border-t-slate-400", bgColor: "bg-slate-50 dark:bg-slate-900/30" },
  { key: "in_progress", label: "W trakcie", color: "border-t-blue-500", bgColor: "bg-blue-50/50 dark:bg-blue-900/20" },
  { key: "review", label: "Weryfikacja", color: "border-t-amber-500", bgColor: "bg-amber-50/50 dark:bg-amber-900/20" },
  { key: "done", label: "Gotowe", color: "border-t-green-500", bgColor: "bg-green-50/50 dark:bg-green-900/20" },
  { key: "blocked", label: "Zablokowane", color: "border-t-red-500", bgColor: "bg-red-50/50 dark:bg-red-900/20" },
];

const STICKY_COLORS: Record<string, { bg: string; border: string }> = {
  low: { bg: "bg-emerald-100 dark:bg-emerald-900/40", border: "border-l-emerald-400" },
  medium: { bg: "bg-sky-100 dark:bg-sky-900/40", border: "border-l-sky-400" },
  high: { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-l-amber-400" },
  critical: { bg: "bg-rose-100 dark:bg-rose-900/40", border: "border-l-rose-400" },
};

const PRIORITY_EMOJI: Record<string, string> = {
  low: "🟢", medium: "🔵", high: "🟡", critical: "🔴",
};

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceKanbanView({ project, workspace }: Props) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<WorkspaceTask | null>(null);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => { reload(); }, [project.id]);

  const reload = async () => {
    setLoading(true);
    const [t, m] = await Promise.all([
      workspace.loadTasks(project.id),
      workspace.loadMembers(project.id),
    ]);
    setTasks(t);
    setMembers(m);
    setLoading(false);
  };

  const handleDrop = async (status: string) => {
    setDragOverCol(null);
    if (!draggedTask) return;
    const ok = await workspace.updateTask(draggedTask, { status });
    if (ok) {
      setTasks(prev => prev.map(t => t.id === draggedTask ? { ...t, status } : t));
      toast.success("Przeniesiono zadanie");
    }
    setDraggedTask(null);
  };

  const handleQuickAdd = async (status: string) => {
    if (!quickTitle.trim()) return;
    const t = await workspace.createTask({
      project_id: project.id,
      title: quickTitle.trim(),
      status,
    });
    if (t) setTasks(prev => [...prev, t]);
    setQuickTitle("");
    setQuickAdd(null);
  };

  const openDetail = (task: WorkspaceTask) => {
    setShowDetail(task);
  };

  const handleSaveTask = async (id: string, data: any) => {
    const ok = await workspace.updateTask(id, data);
    if (ok) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
    }
    setShowDetail(null);
    return ok;
  };

  const handleDeleteTask = async (id: string) => {
    await workspace.deleteTask(id);
    setTasks(prev => prev.filter(t => t.id !== id));
    toast.success("Zadanie usunięte");
  };

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date() && new Date(date).toDateString() !== new Date().toDateString();
  };

  const getDaysLeft = (date: string | null) => {
    if (!date) return null;
    const diff = Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)}d temu`;
    if (diff === 0) return "Dziś";
    if (diff === 1) return "Jutro";
    return `${diff}d`;
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px]">
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key && !t.parent_task_id);
          const isDragOver = dragOverCol === col.key;

          return (
            <div
              key={col.key}
              className={cn(
                "flex-shrink-0 w-72 rounded-xl border-t-4 transition-all",
                col.color, col.bgColor,
                isDragOver && "ring-2 ring-primary/40 scale-[1.01]"
              )}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.key)}
            >
              <div className="p-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">{col.label}</h3>
                <Badge variant="secondary" className="text-xs font-semibold">{colTasks.length}</Badge>
              </div>

              <div className="px-2 pb-2 space-y-2 min-h-[80px]">
                {colTasks.map(task => {
                  const stickyStyle = STICKY_COLORS[task.priority] || STICKY_COLORS.medium;
                  const overdue = isOverdue(task.due_date);
                  const daysLeft = getDaysLeft(task.due_date);

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "rounded-lg border-l-4 p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:-translate-y-0.5",
                        stickyStyle.bg, stickyStyle.border,
                        draggedTask === task.id && "opacity-40 scale-95",
                        "shadow-sm"
                      )}
                      draggable
                      onDragStart={() => setDraggedTask(task.id)}
                      onDragEnd={() => { setDraggedTask(null); setDragOverCol(null); }}
                      onClick={() => openDetail(task)}
                    >
                      {/* Priority + Task number */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {PRIORITY_EMOJI[task.priority]} #{(task as any).task_number || '—'}
                        </span>
                        {task.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                      </div>

                      {/* Title */}
                      <p className="text-sm font-semibold text-foreground leading-tight mb-1.5 line-clamp-2">
                        {task.title}
                      </p>

                      {/* Description preview */}
                      {task.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">
                          {task.description}
                        </p>
                      )}

                      {/* Footer: assignee, date, comments */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                        {task.assigned_name && (
                          <div className="flex items-center gap-1">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-bold">
                                {task.assigned_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                              {task.assigned_name}
                            </span>
                          </div>
                        )}

                        {task.due_date && (
                          <span className={cn(
                            "text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded-full",
                            overdue
                              ? "bg-red-200 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-semibold"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {overdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
                            {daysLeft}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Quick add */}
                {quickAdd === col.key ? (
                  <div className="p-2 bg-background rounded-lg border">
                    <Input
                      autoFocus
                      value={quickTitle}
                      onChange={e => setQuickTitle(e.target.value)}
                      placeholder="Tytuł zadania..."
                      className="text-sm h-8 mb-1.5"
                      onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(col.key); if (e.key === 'Escape') setQuickAdd(null); }}
                    />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleQuickAdd(col.key)}>Dodaj</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setQuickAdd(null)}>✕</Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs text-muted-foreground gap-1 hover:bg-background/60"
                    onClick={() => setQuickAdd(col.key)}
                  >
                    <Plus className="h-3 w-3" /> Dodaj karteczkę
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task detail modal */}
      <TaskDetailModal
        task={showDetail}
        open={!!showDetail}
        onClose={() => setShowDetail(null)}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        members={members}
        allTasks={tasks}
      />
    </>
  );
}
