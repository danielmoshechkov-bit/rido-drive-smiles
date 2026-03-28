import { useState, useEffect } from "react";
import { WorkspaceTask } from "@/hooks/useWorkspace";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTaskTimeTracking } from "@/hooks/useTaskTimeTracking";
import {
  Calendar, Clock, User, Flag, Tag, MessageSquare, ListChecks,
  Play, Square, Plus, Trash2, Sparkles, AlertTriangle, ArrowRight,
  Paperclip, Bell, ChevronDown, Timer, Activity, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const PRIORITY_CONFIG = {
  low: { label: "Niski", emoji: "🟢", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  medium: { label: "Średni", emoji: "🔵", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  high: { label: "Wysoki", emoji: "🟡", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  critical: { label: "Krytyczny", emoji: "🔴", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  todo: { label: "Do zrobienia", color: "bg-slate-200 text-slate-700" },
  in_progress: { label: "W trakcie", color: "bg-blue-200 text-blue-700" },
  review: { label: "Weryfikacja", color: "bg-amber-200 text-amber-700" },
  done: { label: "Gotowe", color: "bg-green-200 text-green-700" },
  blocked: { label: "Zablokowane", color: "bg-red-200 text-red-700" },
};

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface Comment {
  id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface Props {
  task: WorkspaceTask | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: any) => Promise<boolean>;
  onDelete?: (id: string) => Promise<void>;
  members: any[];
  allTasks?: WorkspaceTask[];
  userId?: string | null;
  userName?: string | null;
}

export function TaskDetailModal({ task, open, onClose, onSave, onDelete, members, allTasks = [], userId, userName }: Props) {
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium", status: "todo",
    due_date: "", assigned_name: "", color: "#3b82f6",
  });
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [reminder, setReminder] = useState("");
  const [saving, setSaving] = useState(false);

  const timeTracking = useTaskTimeTracking(task?.id || null, userId || null, userName || null);

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description || "",
        priority: task.priority,
        status: task.status,
        due_date: task.due_date || "",
        assigned_name: task.assigned_name || "",
        color: task.color || "#3b82f6",
      });
      loadSubtasks(task.id);
      loadComments(task.id);
    }
  }, [task]);

  const loadSubtasks = async (taskId: string) => {
    const { data } = await (supabase as any)
      .from("workspace_tasks")
      .select("id, title, status")
      .eq("parent_task_id", taskId)
      .order("order_index");
    setSubtasks((data || []).map((s: any) => ({ id: s.id, title: s.title, completed: s.status === "done" })));
  };

  const loadComments = async (taskId: string) => {
    const { data } = await (supabase as any)
      .from("workspace_messages")
      .select("*")
      .eq("channel_name", `task_${taskId}`)
      .order("created_at", { ascending: true });
    setComments((data || []).map((c: any) => ({
      id: c.id, user_name: c.user_name || "Użytkownik",
      content: c.content, created_at: c.created_at,
    })));
  };

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    const ok = await onSave(task.id, form);
    if (ok) toast.success("Zadanie zapisane");
    setSaving(false);
    onClose();
  };

  const addSubtask = async () => {
    if (!newSubtask.trim() || !task) return;
    const { data } = await (supabase as any)
      .from("workspace_tasks")
      .insert({
        project_id: task.project_id, title: newSubtask.trim(),
        parent_task_id: task.id, status: "todo", priority: "medium",
        created_by: userId, order_index: subtasks.length,
      })
      .select().single();
    if (data) {
      setSubtasks(prev => [...prev, { id: data.id, title: data.title, completed: false }]);
      setNewSubtask("");
    }
  };

  const toggleSubtask = async (sub: Subtask) => {
    const newStatus = sub.completed ? "todo" : "done";
    await (supabase as any).from("workspace_tasks").update({ status: newStatus }).eq("id", sub.id);
    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: !s.completed } : s));
  };

  const deleteSubtask = async (id: string) => {
    await (supabase as any).from("workspace_tasks").delete().eq("id", id);
    setSubtasks(prev => prev.filter(s => s.id !== id));
  };

  const addComment = async () => {
    if (!newComment.trim() || !task || !userId) return;
    await (supabase as any).from("workspace_messages").insert({
      project_id: task.project_id, channel_name: `task_${task.id}`,
      user_id: userId, user_name: userName, content: newComment.trim(),
      message_type: "text",
    });
    setComments(prev => [...prev, {
      id: Date.now().toString(), user_name: userName || "Ty",
      content: newComment.trim(), created_at: new Date().toISOString(),
    }]);
    setNewComment("");
  };

  const generateAiSuggestion = () => {
    const suggestions = [
      `Rozważ podzielenie "${form.title}" na mniejsze podzadania dla lepszego śledzenia postępów.`,
      `Na podstawie priorytetu "${PRIORITY_CONFIG[form.priority as keyof typeof PRIORITY_CONFIG]?.label}", sugeruję ustawienie terminu na najbliższe 3 dni.`,
      `To zadanie mogłoby skorzystać z dodania kryteriów akceptacji w opisie.`,
      `Sugeruję przypisanie tego zadania do osoby z doświadczeniem w tym obszarze.`,
    ];
    setAiSuggestion(suggestions[Math.floor(Math.random() * suggestions.length)]);
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags(prev => [...prev, newTag.trim()]);
      setNewTag("");
    }
  };

  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;
  const priorityInfo = PRIORITY_CONFIG[form.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;
  const statusInfo = STATUS_CONFIG[form.status] || STATUS_CONFIG.todo;

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b bg-muted/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-muted-foreground">
                  #{(task as any).task_number || '—'}
                </span>

                {/* Status badge - clickable */}
                <div className="relative">
                  <Badge
                    className={cn("cursor-pointer text-xs", statusInfo.color)}
                    onClick={() => setShowStatusPicker(!showStatusPicker)}
                  >
                    {statusInfo.label} <ChevronDown className="h-3 w-3 ml-1" />
                  </Badge>
                  {showStatusPicker && (
                    <div className="absolute top-full left-0 mt-1 bg-background border rounded-lg shadow-lg z-50 py-1 min-w-[160px]">
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2"
                          onClick={() => { setForm(p => ({ ...p, status: key })); setShowStatusPicker(false); }}
                        >
                          <span className={cn("w-2.5 h-2.5 rounded-full", cfg.color.split(' ')[0])} />
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Priority badge - clickable */}
                <div className="relative">
                  <Badge
                    className={cn("cursor-pointer text-xs", priorityInfo.color)}
                    onClick={() => setShowPriorityPicker(!showPriorityPicker)}
                  >
                    {priorityInfo.emoji} {priorityInfo.label} <ChevronDown className="h-3 w-3 ml-1" />
                  </Badge>
                  {showPriorityPicker && (
                    <div className="absolute top-full left-0 mt-1 bg-background border rounded-lg shadow-lg z-50 py-1 min-w-[160px]">
                      {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2"
                          onClick={() => { setForm(p => ({ ...p, priority: key })); setShowPriorityPicker(false); }}
                        >
                          <span>{cfg.emoji}</span> {cfg.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="text-lg font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0 bg-transparent"
                placeholder="Tytuł zadania..."
              />
            </div>

            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] gap-1">
                <Tag className="h-2.5 w-2.5" /> {tag}
                <button onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="ml-0.5 hover:text-destructive">×</button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="+ Tag"
                className="h-6 text-[10px] w-16 border-dashed"
              />
            </div>
          </div>
        </div>

        {/* Content with Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b px-6 h-10 bg-transparent">
            <TabsTrigger value="details" className="text-xs gap-1.5 data-[state=active]:text-primary">
              <ListChecks className="h-3.5 w-3.5" /> Szczegóły
            </TabsTrigger>
            <TabsTrigger value="subtasks" className="text-xs gap-1.5 data-[state=active]:text-primary">
              <ListChecks className="h-3.5 w-3.5" /> Podzadania
              {subtasks.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1">{completedSubtasks}/{subtasks.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="time" className="text-xs gap-1.5 data-[state=active]:text-primary">
              <Timer className="h-3.5 w-3.5" /> Czas
            </TabsTrigger>
            <TabsTrigger value="comments" className="text-xs gap-1.5 data-[state=active]:text-primary">
              <MessageSquare className="h-3.5 w-3.5" /> Komentarze
              {comments.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1">{comments.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs gap-1.5 data-[state=active]:text-primary">
              <Sparkles className="h-3.5 w-3.5" /> AI
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[50vh]">
            {/* Details Tab */}
            <TabsContent value="details" className="p-6 space-y-4 mt-0">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Opis</Label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={4}
                  placeholder="Dodaj szczegółowy opis zadania, kryteria akceptacji, notatki..."
                  className="mt-1.5 resize-none"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Przypisz do
                  </Label>
                  <Select value={form.assigned_name || "__none__"} onValueChange={v => setForm(p => ({ ...p, assigned_name: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Wybierz osobę..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Brak przypisania</SelectItem>
                      {members.map((m: any) => (
                        <SelectItem key={m.id} value={m.display_name || m.email || m.user_id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[8px]">
                                {(m.display_name || m.email || '?').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {m.display_name || m.email || 'Użytkownik'}
                            {m.role && <Badge variant="outline" className="text-[9px] ml-1">{m.role}</Badge>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Termin (deadline)
                  </Label>
                  <Input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    className="mt-1.5"
                  />
                  {form.due_date && new Date(form.due_date) < new Date() && (
                    <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Termin minął!
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5" /> Przypomnienie
                  </Label>
                  <Select value={reminder} onValueChange={setReminder}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Ustaw przypomnienie..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15min">15 minut przed</SelectItem>
                      <SelectItem value="1h">1 godzina przed</SelectItem>
                      <SelectItem value="1d">1 dzień przed</SelectItem>
                      <SelectItem value="3d">3 dni przed</SelectItem>
                      <SelectItem value="1w">1 tydzień przed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Flag className="h-3.5 w-3.5" /> Kolor zadania
                  </Label>
                  <div className="flex gap-2 mt-2">
                    {["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"].map(c => (
                      <button
                        key={c}
                        className={cn("w-7 h-7 rounded-full transition-all", form.color === c && "ring-2 ring-offset-2 ring-primary scale-110")}
                        style={{ backgroundColor: c }}
                        onClick={() => setForm(p => ({ ...p, color: c }))}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Activity preview */}
              <Separator />
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p className="flex items-center gap-1.5"><Activity className="h-3 w-3" /> Utworzono: {new Date(task.created_at).toLocaleString('pl-PL')}</p>
                <p className="flex items-center gap-1.5"><Activity className="h-3 w-3" /> Ostatnia zmiana: {new Date(task.updated_at).toLocaleString('pl-PL')}</p>
              </div>
            </TabsContent>

            {/* Subtasks Tab */}
            <TabsContent value="subtasks" className="p-6 space-y-3 mt-0">
              {subtasks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Postęp: {completedSubtasks}/{subtasks.length}</span>
                    <span className="font-semibold">{subtaskProgress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${subtaskProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {subtasks.map(sub => (
                  <div key={sub.id} className={cn(
                    "flex items-center gap-2.5 p-2.5 rounded-lg border bg-background hover:bg-muted/50 transition-colors group",
                    sub.completed && "opacity-60"
                  )}>
                    <Checkbox checked={sub.completed} onCheckedChange={() => toggleSubtask(sub)} />
                    <span className={cn("flex-1 text-sm", sub.completed && "line-through text-muted-foreground")}>
                      {sub.title}
                    </span>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteSubtask(sub.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  placeholder="Dodaj podzadanie..."
                  className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && addSubtask()}
                />
                <Button size="sm" onClick={addSubtask} disabled={!newSubtask.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            {/* Time Tracking Tab */}
            <TabsContent value="time" className="p-6 space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Śledzenie czasu</p>
                  <p className="text-xs text-muted-foreground">Łącznie: {timeTracking.formatMinutes(timeTracking.totalMinutes)}</p>
                </div>

                {timeTracking.isTracking ? (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-mono font-bold text-primary animate-pulse">
                      {timeTracking.formatDuration(timeTracking.elapsed)}
                    </span>
                    <Button size="sm" variant="destructive" onClick={() => timeTracking.stopTracking()}>
                      <Square className="h-3.5 w-3.5 mr-1" /> Stop
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={timeTracking.startTracking}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Start
                  </Button>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Historia</p>
                {timeTracking.entries.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Brak wpisów czasu</p>
                )}
                {timeTracking.entries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-background text-sm">
                    <div>
                      <p className="font-medium">{entry.user_name || 'Użytkownik'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.started_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                      {entry.description && <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{entry.duration_minutes ? timeTracking.formatMinutes(entry.duration_minutes) : '...'}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => timeTracking.deleteEntry(entry.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Comments Tab */}
            <TabsContent value="comments" className="p-6 space-y-3 mt-0">
              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Brak komentarzy — bądź pierwszy!</p>
                )}
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2.5">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-bold">
                        {c.user_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold">{c.user_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Napisz komentarz..."
                  className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && addComment()}
                />
                <Button size="sm" onClick={addComment} disabled={!newComment.trim()}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            {/* AI Tab */}
            <TabsContent value="ai" className="p-6 space-y-4 mt-0">
              <div className="text-center space-y-3 py-4">
                <Sparkles className="h-10 w-10 text-primary mx-auto" />
                <div>
                  <p className="font-semibold">Asystent AI</p>
                  <p className="text-sm text-muted-foreground">Otrzymaj sugestie dotyczące tego zadania</p>
                </div>

                <div className="flex flex-col gap-2">
                  <Button variant="outline" onClick={generateAiSuggestion} className="gap-2">
                    <Sparkles className="h-4 w-4" /> Sugestia usprawnień
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setForm(p => ({
                      ...p,
                      description: p.description + "\n\n✅ Kryteria akceptacji:\n- [ ] \n- [ ] \n- [ ] "
                    }));
                    setActiveTab("details");
                    toast.success("Dodano szablon kryteriów");
                  }} className="gap-2">
                    <ListChecks className="h-4 w-4" /> Dodaj kryteria akceptacji
                  </Button>
                  <Button variant="outline" onClick={() => {
                    const subs = ["Analiza wymagań", "Implementacja", "Testy", "Code review", "Dokumentacja"];
                    subs.forEach(async (s, i) => {
                      if (task) {
                        const { data } = await (supabase as any).from("workspace_tasks").insert({
                          project_id: task.project_id, title: `${form.title} — ${s}`,
                          parent_task_id: task.id, status: "todo", priority: form.priority,
                          created_by: userId, order_index: subtasks.length + i,
                        }).select().single();
                        if (data) setSubtasks(prev => [...prev, { id: data.id, title: data.title, completed: false }]);
                      }
                    });
                    toast.success("Wygenerowano podzadania");
                    setActiveTab("subtasks");
                  }} className="gap-2">
                    <ListChecks className="h-4 w-4" /> Generuj podzadania
                  </Button>
                </div>

                {aiSuggestion && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-left mt-4">
                    <p className="font-semibold text-primary mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Sugestia AI
                    </p>
                    <p>{aiSuggestion}</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1.5" onClick={() => { onDelete(task.id); onClose(); }}>
                <Trash2 className="h-3.5 w-3.5" /> Usuń
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Anuluj</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Zapisywanie..." : "Zapisz zmiany"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
