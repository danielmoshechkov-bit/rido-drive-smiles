import { useState, useEffect } from "react";
import { WorkspaceProject, WorkspaceTask } from "@/hooks/useWorkspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, GripVertical, Calendar, User } from "lucide-react";
import { toast } from "sonner";

const COLUMNS = [
  { key: "todo", label: "Do zrobienia", color: "border-t-muted-foreground" },
  { key: "in_progress", label: "W trakcie", color: "border-t-blue-500" },
  { key: "review", label: "Weryfikacja", color: "border-t-yellow-500" },
  { key: "done", label: "Gotowe", color: "border-t-green-500" },
  { key: "blocked", label: "Zablokowane", color: "border-t-red-500" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
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

  useEffect(() => { reload(); }, [project.id]);

  const reload = async () => {
    setLoading(true);
    const t = await workspace.loadTasks(project.id);
    setTasks(t);
    setLoading(false);
  };

  const handleDrop = async (status: string) => {
    if (!draggedTask) return;
    const ok = await workspace.updateTask(draggedTask, { status });
    if (ok) {
      setTasks(prev => prev.map(t => t.id === draggedTask ? { ...t, status } : t));
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
    if (t) {
      setTasks(prev => [...prev, t]);
    }
    setQuickTitle("");
    setQuickAdd(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[400px]">
      {COLUMNS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.key && !t.parent_task_id);

        return (
          <div
            key={col.key}
            className={`flex-shrink-0 w-64 bg-muted/30 rounded-lg border-t-4 ${col.color}`}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(col.key)}
          >
            <div className="p-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
            </div>

            <div className="px-2 pb-2 space-y-2 min-h-[60px]">
              {colTasks.map(task => (
                <Card
                  key={task.id}
                  className="p-3 cursor-grab hover:shadow-md transition-shadow"
                  draggable
                  onDragStart={() => setDraggedTask(task.id)}
                  onDragEnd={() => setDraggedTask(null)}
                >
                  <p className="text-sm font-medium mb-1">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
                  )}
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge className={`text-[10px] px-1 py-0 ${PRIORITY_COLORS[task.priority]}`}>
                      {task.priority}
                    </Badge>
                    {task.assigned_name && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <User className="h-3 w-3" /> {task.assigned_name}
                      </span>
                    )}
                    {task.due_date && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Calendar className="h-3 w-3" />
                        {new Date(task.due_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </Card>
              ))}

              {quickAdd === col.key ? (
                <div className="p-2">
                  <Input
                    autoFocus
                    value={quickTitle}
                    onChange={e => setQuickTitle(e.target.value)}
                    placeholder="Tytuł zadania..."
                    className="text-sm h-8 mb-1"
                    onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(col.key); if (e.key === 'Escape') setQuickAdd(null); }}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleQuickAdd(col.key)}>Dodaj</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setQuickAdd(null)}>Anuluj</Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs text-muted-foreground gap-1"
                  onClick={() => setQuickAdd(col.key)}
                >
                  <Plus className="h-3 w-3" /> Dodaj
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
