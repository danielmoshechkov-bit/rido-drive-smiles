import { useState } from "react";
import { WorkspaceProject, WorkspaceTask } from "@/hooks/useWorkspace";
import { useGetRidoAI } from "@/hooks/useGetRidoAI";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ListTodo, Brain, BarChart3, Loader2, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

interface AISuggestion {
  title: string;
  priority: string;
  description?: string;
}

export function WorkspaceAIPlannerView({ project, workspace }: Props) {
  const { execute, isLoading } = useGetRidoAI();
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [mode, setMode] = useState<"break" | "plan" | "summary">("break");
  const [result, setResult] = useState<string>("");
  const [addedTasks, setAddedTasks] = useState<Set<number>>(new Set());

  const handleGenerate = async () => {
    if (!prompt.trim() && mode !== "summary") {
      toast.error("Wpisz treść");
      return;
    }

    let taskType: string;
    let query: string;

    if (mode === "break") {
      taskType = "task_breakdown";
      query = `Rozbij poniższe zdanie na konkretne zadania projektowe (3-7 zadań). Dla każdego zadania podaj tytuł, priorytet (low/medium/high/critical) i krótki opis. Odpowiedz w JSON: { "tasks": [{ "title": "...", "priority": "...", "description": "..." }] }\n\nZdanie: ${prompt}`;
    } else if (mode === "plan") {
      taskType = "project_planning";
      query = `Wygeneruj plan projektu na podstawie opisu. Zaproponuj listę zadań z priorytetami i opisami. Odpowiedz w JSON: { "tasks": [{ "title": "...", "priority": "...", "description": "..." }] }\n\nProjekt: ${project.name}\nOpis: ${prompt}`;
    } else {
      taskType = "project_summary";
      const tasks = await workspace.loadTasks(project.id);
      const taskSummary = tasks.map((t: WorkspaceTask) => `- [${t.status}] ${t.title} (${t.priority})`).join("\n");
      query = `Podsumuj stan projektu "${project.name}" na podstawie listy zadań. Wymień co jest gotowe, co w trakcie, co opóźnione. Podaj rekomendacje.\n\nZadania:\n${taskSummary}`;
    }

    const data = await execute({
      feature: "workspace_ai_planner",
      taskType,
      query,
      mode: "accurate",
    });

    if (data?.result) {
      if (mode === "summary") {
        setResult(data.result);
        setSuggestions([]);
      } else {
        try {
          const parsed = JSON.parse(data.result);
          setSuggestions(parsed.tasks || []);
          setResult("");
        } catch {
          // Try to extract tasks from text
          setResult(data.result);
          setSuggestions([]);
        }
      }
      setAddedTasks(new Set());
    }
  };

  const handleAddTask = async (suggestion: AISuggestion, idx: number) => {
    const t = await workspace.createTask({
      project_id: project.id,
      title: suggestion.title,
      description: suggestion.description || null,
      priority: suggestion.priority || "medium",
    });
    if (t) {
      setAddedTasks(prev => new Set(prev).add(idx));
      toast.success(`Zadanie "${suggestion.title}" dodane`);
    }
  };

  const handleAddAll = async () => {
    for (let i = 0; i < suggestions.length; i++) {
      if (!addedTasks.has(i)) {
        await handleAddTask(suggestions[i], i);
      }
    }
  };

  const PRIORITY_COLORS: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-blue-100 text-blue-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Planner
          </CardTitle>
          <CardDescription>Użyj AI do planowania zadań, rozbijania celów i analizy projektu</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            <Button
              variant={mode === "break" ? "default" : "outline"} size="sm"
              onClick={() => setMode("break")} className="gap-1.5"
            >
              <ListTodo className="h-4 w-4" /> Rozbij na zadania
            </Button>
            <Button
              variant={mode === "plan" ? "default" : "outline"} size="sm"
              onClick={() => setMode("plan")} className="gap-1.5"
            >
              <Brain className="h-4 w-4" /> Zaplanuj projekt
            </Button>
            <Button
              variant={mode === "summary" ? "default" : "outline"} size="sm"
              onClick={() => setMode("summary")} className="gap-1.5"
            >
              <BarChart3 className="h-4 w-4" /> Podsumowanie
            </Button>
          </div>

          {mode !== "summary" && (
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={
                mode === "break"
                  ? 'np. "Przygotuj ofertę dla klienta X do piątku i wyślij ją po akceptacji"'
                  : 'Opisz projekt, który chcesz zaplanować...'
              }
              rows={3}
            />
          )}

          <Button onClick={handleGenerate} disabled={isLoading} className="gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {mode === "break" ? "Rozbij" : mode === "plan" ? "Zaplanuj" : "Podsumuj"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Proponowane zadania ({suggestions.length})</CardTitle>
              <Button size="sm" className="gap-1.5" onClick={handleAddAll}>
                <Plus className="h-4 w-4" /> Dodaj wszystkie
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.title}</p>
                  {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                </div>
                <Badge className={`text-xs ${PRIORITY_COLORS[s.priority] || ''}`}>{s.priority}</Badge>
                {addedTasks.has(i) ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleAddTask(s, i)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="p-4">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap">{result}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
