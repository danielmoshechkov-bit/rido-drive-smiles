import { useState, useEffect, useCallback } from "react";
import { WorkspaceProject, WorkspaceTask, WorkspaceMember, WorkspaceTaskComment } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { notifyTaskAssigned, notifyTaskCompleted } from "@/utils/workspaceNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { 
  Plus, CheckCircle2, Circle, Clock, AlertTriangle, XCircle, Trash2, 
  ChevronDown, ChevronRight, MessageSquare, History, ListChecks, Send,
  Users, CalendarDays
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  todo: { label: "Do zrobienia", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "W trakcie", icon: Clock, color: "text-blue-500" },
  review: { label: "Weryfikacja", icon: AlertTriangle, color: "text-yellow-500" },
  done: { label: "Gotowe", icon: CheckCircle2, color: "text-green-500" },
  blocked: { label: "Zablokowane", icon: XCircle, color: "text-red-500" },
};

const PRIORITY_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  low: { label: "Niski", emoji: "🟢", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  medium: { label: "Średni", emoji: "🟡", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  high: { label: "Wysoki", emoji: "🔴", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  critical: { label: "Krytyczny", emoji: "🚨", color: "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
};

interface ChecklistItem {
  id: string;
  title: string;
  is_completed: boolean;
  sort_order: number;
}

interface TaskHistoryEntry {
  id: string;
  user_name: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceTasksView({ project, workspace }: Props) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "", assigned_name: "" });
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("all");
  const [detailTask, setDetailTask] = useState<WorkspaceTask | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<WorkspaceTaskComment[]>([]);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [checklistInput, setChecklistInput] = useState("");
  const [detailTab, setDetailTab] = useState<'detail' | 'checklist' | 'comments' | 'history'>('detail');

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

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    const newTask = await workspace.createTask({
      project_id: project.id,
      title: form.title.trim(),
      description: form.description || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_name: form.assigned_name || null,
    });
    // Send notification if task is assigned
    if (newTask && form.assigned_name) {
      notifyTaskAssigned(project.id, form.title.trim(), form.assigned_name, newTask.id, workspace.userEmail || undefined);
    }
    setShowCreate(false);
    setForm({ title: "", description: "", priority: "medium", due_date: "", assigned_name: "" });
    reload();
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      await logHistory(taskId, 'status', STATUS_CONFIG[task.status]?.label, STATUS_CONFIG[newStatus]?.label);
    }
    await workspace.updateTask(taskId, { status: newStatus });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const handleDelete = async (taskId: string) => {
    await workspace.deleteTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  // Task detail panel
  const openDetail = async (task: WorkspaceTask) => {
    setDetailTask(task);
    setDetailTab('detail');
    loadChecklist(task.id);
    loadComments(task.id);
    loadHistory(task.id);
  };

  const loadChecklist = async (taskId: string) => {
    const { data } = await (supabase as any)
      .from("workspace_task_checklist")
      .select("*")
      .eq("task_id", taskId)
      .order("sort_order");
    setChecklist((data || []) as ChecklistItem[]);
  };

  const loadComments = async (taskId: string) => {
    const c = await workspace.loadComments(taskId);
    setComments(c);
  };

  const loadHistory = async (taskId: string) => {
    const { data } = await (supabase as any)
      .from("workspace_task_history")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(30);
    setHistory((data || []) as TaskHistoryEntry[]);
  };

  const logHistory = async (taskId: string, field: string, oldVal: string | null | undefined, newVal: string | null | undefined) => {
    if (!workspace.userId) return;
    await (supabase as any).from("workspace_task_history").insert({
      task_id: taskId,
      user_id: workspace.userId,
      user_name: workspace.userEmail,
      field_name: field,
      old_value: oldVal || null,
      new_value: newVal || null,
    });
  };

  const addChecklistItem = async () => {
    if (!checklistInput.trim() || !detailTask) return;
    const { error } = await (supabase as any).from("workspace_task_checklist").insert({
      task_id: detailTask.id,
      title: checklistInput.trim(),
      sort_order: checklist.length,
    });
    if (!error) {
      setChecklistInput("");
      loadChecklist(detailTask.id);
    }
  };

  const toggleChecklistItem = async (item: ChecklistItem) => {
    await (supabase as any).from("workspace_task_checklist")
      .update({ is_completed: !item.is_completed, completed_by: workspace.userId })
      .eq("id", item.id);
    loadChecklist(detailTask!.id);
  };

  const deleteChecklistItem = async (id: string) => {
    await (supabase as any).from("workspace_task_checklist").delete().eq("id", id);
    loadChecklist(detailTask!.id);
  };

  const addComment = async () => {
    if (!commentInput.trim() || !detailTask) return;
    await workspace.addComment(detailTask.id, commentInput.trim());
    setCommentInput("");
    loadComments(detailTask.id);
  };

  const getMemberName = (m: WorkspaceMember) => {
    if (m.first_name) return `${m.first_name} ${m.last_name || ''}`.trim();
    return m.display_name || m.email || 'Użytkownik';
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
          className="flex items-center gap-2 p-3 border-b hover:bg-accent/30 transition-colors group cursor-pointer"
          style={{ paddingLeft: `${12 + depth * 24}px` }}
          onClick={() => openDetail(task)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }} className="shrink-0">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <button onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, task.status === 'done' ? 'todo' : 'done'); }}>
            <StatusIcon className={cn("h-5 w-5 shrink-0", statusColor)} />
          </button>

          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-medium truncate", task.status === 'done' && "line-through text-muted-foreground")}>
              {task.title}
            </p>
          </div>

          <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", priorityCfg.color)}>
            {priorityCfg.emoji} {priorityCfg.label}
          </Badge>

          {task.assigned_name && (
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                {task.assigned_name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}

          {task.due_date && (
            <span className={cn(
              "text-xs shrink-0 hidden sm:inline",
              new Date(task.due_date) < new Date() ? "text-red-500 font-medium" : "text-muted-foreground"
            )}>
              {new Date(task.due_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
            </span>
          )}

          <Select value={task.status} onValueChange={v => { handleStatusChange(task.id, v); }}>
            <SelectTrigger className="w-auto h-7 text-xs border-0 bg-transparent gap-1 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
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
            onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
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
        <div className="flex gap-1 ml-auto flex-wrap">
          {["all", "todo", "in_progress", "review", "done", "blocked"].map(s => (
            <button
              key={s}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                filter === s
                  ? "bg-[hsl(var(--nav-bar-color))] text-white"
                  : "text-muted-foreground hover:bg-accent"
              )}
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "Wszystkie" : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Ładowanie...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ListChecks className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Brak zadań. Dodaj pierwsze zadanie!</p>
            </div>
          ) : (
            filtered.map(t => renderTask(t))
          )}
        </CardContent>
      </Card>

      {/* Create task dialog */}
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
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priorytet</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
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
              <Label>Przypisz do</Label>
              <Select value={form.assigned_name} onValueChange={v => setForm(p => ({ ...p, assigned_name: v }))}>
                <SelectTrigger><SelectValue placeholder="Wybierz osobę" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={getMemberName(m)}>{getMemberName(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Anuluj</Button>
            <Button onClick={handleCreate} disabled={!form.title.trim()}>Dodaj zadanie</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task detail sheet */}
      <Sheet open={!!detailTask} onOpenChange={(o) => { if (!o) setDetailTask(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detailTask && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left flex items-center gap-2">
                  <Badge className={cn("text-xs", PRIORITY_CONFIG[detailTask.priority]?.color)}>
                    {PRIORITY_CONFIG[detailTask.priority]?.emoji} {PRIORITY_CONFIG[detailTask.priority]?.label}
                  </Badge>
                  {detailTask.title}
                </SheetTitle>
              </SheetHeader>

              {/* Sub tabs */}
              <div className="flex gap-1 mt-4 mb-4 border-b pb-2">
                {[
                  { key: 'detail', label: 'Szczegóły', icon: CalendarDays },
                  { key: 'checklist', label: `Checklist (${checklist.length})`, icon: ListChecks },
                  { key: 'comments', label: `Komentarze (${comments.length})`, icon: MessageSquare },
                  { key: 'history', label: 'Historia', icon: History },
                ].map(t => (
                  <button
                    key={t.key}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                      detailTab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                    )}
                    onClick={() => setDetailTab(t.key as any)}
                  >
                    <t.icon className="h-3 w-3" />
                    {t.label}
                  </button>
                ))}
              </div>

              {detailTab === 'detail' && (
                <div className="space-y-4">
                  {detailTask.description && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Opis</Label>
                      <p className="text-sm mt-1">{detailTask.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={detailTask.status} onValueChange={v => {
                        handleStatusChange(detailTask.id, v);
                        setDetailTask(prev => prev ? { ...prev, status: v } : null);
                      }}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Priorytet</Label>
                      <Select value={detailTask.priority} onValueChange={async v => {
                        await logHistory(detailTask.id, 'priority', PRIORITY_CONFIG[detailTask.priority]?.label, PRIORITY_CONFIG[v]?.label);
                        await workspace.updateTask(detailTask.id, { priority: v });
                        setDetailTask(prev => prev ? { ...prev, priority: v } : null);
                        setTasks(prev => prev.map(t => t.id === detailTask.id ? { ...t, priority: v } : t));
                      }}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Przypisane do</Label>
                    <p className="text-sm mt-1">{detailTask.assigned_name || 'Brak'}</p>
                  </div>
                  {detailTask.due_date && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Termin</Label>
                      <p className="text-sm mt-1">{new Date(detailTask.due_date).toLocaleDateString('pl-PL')}</p>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'checklist' && (
                <div className="space-y-3">
                  {/* Progress */}
                  {checklist.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all"
                          style={{ width: `${(checklist.filter(c => c.is_completed).length / checklist.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {checklist.filter(c => c.is_completed).length}/{checklist.length}
                      </span>
                    </div>
                  )}

                  {checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <Checkbox
                        checked={item.is_completed}
                        onCheckedChange={() => toggleChecklistItem(item)}
                      />
                      <span className={cn("text-sm flex-1", item.is_completed && "line-through text-muted-foreground")}>
                        {item.title}
                      </span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                        onClick={() => deleteChecklistItem(item.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Input
                      value={checklistInput}
                      onChange={e => setChecklistInput(e.target.value)}
                      placeholder="Dodaj element..."
                      className="h-8 text-sm"
                      onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
                    />
                    <Button size="sm" onClick={addChecklistItem} disabled={!checklistInput.trim()}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {detailTab === 'comments' && (
                <div className="space-y-3">
                  {comments.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Brak komentarzy</p>
                  )}
                  {comments.map(c => (
                    <div key={c.id} className="bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[8px]">{(c.user_name || '?')[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{c.user_name || 'Użytkownik'}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Input
                      value={commentInput}
                      onChange={e => setCommentInput(e.target.value)}
                      placeholder="Dodaj komentarz..."
                      className="h-8 text-sm"
                      onKeyDown={e => e.key === 'Enter' && addComment()}
                    />
                    <Button size="sm" onClick={addComment} disabled={!commentInput.trim()}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {detailTab === 'history' && (
                <div className="space-y-2">
                  {history.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Brak historii zmian</p>
                  )}
                  {history.map(h => (
                    <div key={h.id} className="flex items-start gap-2 text-xs py-2 border-b last:border-0">
                      <History className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">{h.user_name || 'System'}</span>
                        <span className="text-muted-foreground"> zmienił(a) </span>
                        <span className="font-medium">{h.field_name}</span>
                        {h.old_value && <span className="text-muted-foreground"> z "{h.old_value}"</span>}
                        {h.new_value && <span className="text-muted-foreground"> na "{h.new_value}"</span>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(h.created_at).toLocaleString('pl-PL')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
