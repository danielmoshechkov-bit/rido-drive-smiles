import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Edit, ListTodo, MessageSquare } from "lucide-react";

interface RoadmapTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  module: string | null;
  assigned_to: string | null;
  deadline: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  idea: { label: "Pomysł", color: "bg-gray-500" },
  todo: { label: "Do zrobienia", color: "bg-blue-500" },
  in_progress: { label: "W trakcie", color: "bg-yellow-500" },
  testing: { label: "Testy", color: "bg-purple-500" },
  done: { label: "Gotowe", color: "bg-green-500" },
  on_hold: { label: "Wstrzymane", color: "bg-red-500" },
};

const PRIORITY_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "Niski", variant: "secondary" },
  medium: { label: "Średni", variant: "outline" },
  high: { label: "Wysoki", variant: "default" },
  critical: { label: "Krytyczny", variant: "destructive" },
};

const MODULES = ["AI", "OCR", "Kalendarz", "Marketplace", "Flota", "Faktury", "Nieruchomości", "Usługi", "Inne"];

export function RoadmapPanel() {
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<RoadmapTask | null>(null);
  const [filter, setFilter] = useState({ status: "all", module: "all", search: "" });
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");

  // Form state
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", status: "idea", module: "", deadline: "" });

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    setLoading(true);
    const { data } = await supabase.from("admin_roadmap_tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data as any[]);
    setLoading(false);
  };

  const saveTask = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (editTask) {
      const { error } = await supabase.from("admin_roadmap_tasks").update({
        title: form.title, description: form.description, priority: form.priority,
        status: form.status, module: form.module || null, deadline: form.deadline || null,
      }).eq("id", editTask.id);
      if (error) { toast.error("Błąd"); return; }
      toast.success("Zadanie zaktualizowane");
    } else {
      const { error } = await supabase.from("admin_roadmap_tasks").insert({
        title: form.title, description: form.description, priority: form.priority,
        status: form.status, module: form.module || null, deadline: form.deadline || null,
        created_by: user?.id,
      });
      if (error) { toast.error("Błąd"); return; }
      toast.success("Zadanie dodane");
    }
    setShowForm(false);
    setEditTask(null);
    setForm({ title: "", description: "", priority: "medium", status: "idea", module: "", deadline: "" });
    loadTasks();
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("admin_roadmap_tasks").delete().eq("id", id);
    if (error) toast.error("Błąd"); else { toast.success("Usunięto"); loadTasks(); }
  };

  const openEdit = (task: RoadmapTask) => {
    setEditTask(task);
    setForm({ title: task.title, description: task.description || "", priority: task.priority, status: task.status, module: task.module || "", deadline: task.deadline || "" });
    setShowForm(true);
  };

  const loadComments = async (taskId: string) => {
    setSelectedTaskId(taskId);
    const { data } = await supabase.from("admin_roadmap_comments").select("*").eq("task_id", taskId).order("created_at");
    if (data) setComments(data as any[]);
  };

  const addComment = async () => {
    if (!newComment.trim() || !selectedTaskId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("admin_roadmap_comments").insert({ task_id: selectedTaskId, user_id: user?.id!, content: newComment });
    if (error) toast.error("Błąd"); else { setNewComment(""); loadComments(selectedTaskId); }
  };

  const quickStatusChange = async (taskId: string, newStatus: string) => {
    const { error } = await supabase.from("admin_roadmap_tasks").update({ status: newStatus }).eq("id", taskId);
    if (!error) { setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t)); }
  };

  const filtered = tasks.filter(t => {
    if (filter.status !== "all" && t.status !== filter.status) return false;
    if (filter.module !== "all" && t.module !== filter.module) return false;
    if (filter.search && !t.title.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2"><ListTodo className="h-6 w-6" />Roadmap / Zadania</h2>
        <Button onClick={() => { setEditTask(null); setForm({ title: "", description: "", priority: "medium", status: "idea", module: "", deadline: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" />Nowe zadanie
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Szukaj..." value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} className="max-w-[200px] text-sm" />
        <Select value={filter.status} onValueChange={v => setFilter(f => ({ ...f, status: v }))}>
          <SelectTrigger className="w-[140px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.module} onValueChange={v => setFilter(f => ({ ...f, module: v }))}>
          <SelectTrigger className="w-[140px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie moduły</SelectItem>
            {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Task Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editTask ? "Edytuj zadanie" : "Nowe zadanie"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Tytuł</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Opis</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Priorytet</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Moduł</Label>
                <Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v }))}>
                  <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
                  <SelectContent>{MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} /></div>
            </div>
            <Button onClick={saveTask} disabled={!form.title.trim()} className="w-full">{editTask ? "Zapisz zmiany" : "Dodaj zadanie"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task List */}
      <ScrollArea className="h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Tytuł</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Priorytet</TableHead>
              <TableHead className="text-xs">Moduł</TableHead>
              <TableHead className="text-xs">Deadline</TableHead>
              <TableHead className="text-xs">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Brak zadań</TableCell></TableRow>
            ) : filtered.map(task => (
              <TableRow key={task.id}>
                <TableCell className="text-sm font-medium max-w-[200px] truncate" title={task.title}>{task.title}</TableCell>
                <TableCell>
                  <Select value={task.status} onValueChange={v => quickStatusChange(task.id, v)}>
                    <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Badge variant={PRIORITY_LABELS[task.priority]?.variant || "outline"} className="text-xs">{PRIORITY_LABELS[task.priority]?.label || task.priority}</Badge></TableCell>
                <TableCell className="text-xs">{task.module || "-"}</TableCell>
                <TableCell className="text-xs">{task.deadline || "-"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(task)}><Edit className="h-3 w-3" /></Button>
                    <Dialog>
                      <DialogTrigger asChild><Button size="icon" variant="ghost" onClick={() => loadComments(task.id)}><MessageSquare className="h-3 w-3" /></Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Komentarze: {task.title}</DialogTitle></DialogHeader>
                        <ScrollArea className="h-[200px] mb-3">
                          {comments.filter(c => c.task_id === task.id).map(c => (
                            <div key={c.id} className="p-2 border-b text-sm">{c.content}<span className="text-xs text-muted-foreground ml-2">{new Date(c.created_at).toLocaleString("pl")}</span></div>
                          ))}
                        </ScrollArea>
                        <div className="flex gap-2">
                          <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Dodaj komentarz..." />
                          <Button size="sm" onClick={addComment}>Dodaj</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteTask(task.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
