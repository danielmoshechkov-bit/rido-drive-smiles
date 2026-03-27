import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ListTodo, MessageSquare, FileText, Users, Hash, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "task" | "message" | "document" | "member" | "channel";
  title: string;
  subtitle?: string;
  meta?: string;
  projectId?: string;
}

interface Props {
  projectId: string;
  onNavigate: (type: string, id: string) => void;
}

const TYPE_CONFIG = {
  task: { icon: ListTodo, label: "Zadanie", color: "text-blue-500" },
  message: { icon: MessageSquare, label: "Wiadomość", color: "text-green-500" },
  document: { icon: FileText, label: "Dokument", color: "text-yellow-500" },
  member: { icon: Users, label: "Członek", color: "text-purple-500" },
  channel: { icon: Hash, label: "Kanał", color: "text-muted-foreground" },
};

export function WorkspaceGlobalSearch({ projectId, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) { setResults([]); return; }
    setSearching(true);
    const searchTerm = `%${q.trim()}%`;

    const [tasks, messages, docs, members, channels] = await Promise.all([
      supabase
        .from("workspace_tasks")
        .select("id, title, status, priority, task_number, assigned_name")
        .eq("project_id", projectId)
        .ilike("title", searchTerm)
        .limit(8),
      supabase
        .from("workspace_messages")
        .select("id, content, user_name, channel_name, created_at")
        .eq("project_id", projectId)
        .ilike("content", searchTerm)
        .order("created_at", { ascending: false })
        .limit(5),
      (supabase as any)
        .from("workspace_documents")
        .select("id, title, doc_type, updated_at")
        .eq("project_id", projectId)
        .ilike("title", searchTerm)
        .limit(5),
      supabase
        .from("workspace_project_members")
        .select("id, display_name, email, first_name, last_name, role")
        .eq("project_id", projectId)
        .or(`display_name.ilike.${searchTerm},email.ilike.${searchTerm},first_name.ilike.${searchTerm}`)
        .limit(5),
      supabase
        .from("workspace_channels")
        .select("id, name, description")
        .eq("project_id", projectId)
        .ilike("name", searchTerm)
        .limit(3),
    ]);

    const all: SearchResult[] = [];

    (tasks.data || []).forEach((t: any) => all.push({
      id: t.id, type: "task",
      title: `#${t.task_number || '?'} ${t.title}`,
      subtitle: t.assigned_name || undefined,
      meta: t.priority,
    }));

    (messages.data || []).forEach((m: any) => all.push({
      id: m.id, type: "message",
      title: (m.content || '').slice(0, 80),
      subtitle: `${m.user_name || 'Użytkownik'} w #${m.channel_name}`,
      meta: new Date(m.created_at).toLocaleDateString('pl-PL'),
    }));

    (docs.data || []).forEach((d: any) => all.push({
      id: d.id, type: "document",
      title: d.title,
      subtitle: d.doc_type,
    }));

    (members.data || []).forEach((m: any) => all.push({
      id: m.id, type: "member",
      title: m.first_name ? `${m.first_name} ${m.last_name || ''}`.trim() : m.display_name || m.email || '',
      subtitle: m.role,
    }));

    (channels.data || []).forEach((c: any) => all.push({
      id: c.id, type: "channel",
      title: `#${c.name}`,
      subtitle: c.description || undefined,
    }));

    setResults(all);
    setSearching(false);
  }, [projectId]);

  useEffect(() => {
    const timeout = setTimeout(() => search(query), 300);
    return () => clearTimeout(timeout);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    onNavigate(result.type, result.id);
  };

  const grouped = {
    task: results.filter(r => r.type === "task"),
    message: results.filter(r => r.type === "message"),
    document: results.filter(r => r.type === "document"),
    member: results.filter(r => r.type === "member"),
    channel: results.filter(r => r.type === "channel"),
  };

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm text-muted-foreground hover:bg-accent transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Szukaj...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Szukaj zadań, wiadomości, dokumentów, osób..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.length < 2 ? (
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                <Search className="h-8 w-8 opacity-30" />
                <p className="text-sm">Wpisz min. 2 znaki, aby wyszukać</p>
                <div className="flex gap-3 text-xs mt-2">
                  <span className="flex items-center gap-1"><ListTodo className="h-3 w-3" /> Zadania</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Wiadomości</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Dokumenty</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Osoby</span>
                </div>
              </div>
            </CommandEmpty>
          ) : results.length === 0 && !searching ? (
            <CommandEmpty>Brak wyników dla "{query}"</CommandEmpty>
          ) : (
            <>
              {Object.entries(grouped).map(([type, items]) => {
                if (items.length === 0) return null;
                const config = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
                return (
                  <CommandGroup key={type} heading={
                    <span className="flex items-center gap-1.5">
                      <config.icon className={cn("h-3.5 w-3.5", config.color)} />
                      {config.label} ({items.length})
                    </span>
                  }>
                    {items.map(item => (
                      <CommandItem key={`${item.type}-${item.id}`} onSelect={() => handleSelect(item)} className="cursor-pointer">
                        <config.icon className={cn("h-4 w-4 mr-2 shrink-0", config.color)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{item.title}</p>
                          {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
                        </div>
                        {item.meta && (
                          <Badge variant="outline" className="text-[10px] shrink-0 ml-2">{item.meta}</Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
