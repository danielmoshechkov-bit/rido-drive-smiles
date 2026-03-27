import { useState } from "react";
import { WorkspaceProject } from "@/hooks/useWorkspace";
import {
  useWorkspaceAutomations,
  TRIGGER_TYPES,
  ACTION_TYPES,
  AUTOMATION_TEMPLATES,
  WorkspaceAutomation,
} from "@/hooks/useWorkspaceAutomations";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Zap, Plus, Trash2, Play, Pause, ChevronRight, History,
  AlertTriangle, CheckCircle2, XCircle, Copy, Settings2, Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceAutomationsView({ project }: Props) {
  const { automations, logs, loading, createAutomation, toggleAutomation, deleteAutomation, fetchLogs } =
    useWorkspaceAutomations(project.id);

  const [showCreator, setShowCreator] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedLogAutoId, setSelectedLogAutoId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Creator state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("task_created");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [actions, setActions] = useState<Array<{ type: string; config: Record<string, any> }>>([]);

  const resetCreator = () => {
    setName("");
    setDescription("");
    setTriggerType("task_created");
    setTriggerConfig({});
    setActions([]);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    createAutomation({
      name,
      description,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      actions,
    });
    resetCreator();
    setShowCreator(false);
  };

  const handleUseTemplate = (tpl: typeof AUTOMATION_TEMPLATES[number]) => {
    setName(tpl.name);
    setDescription(tpl.description);
    setTriggerType(tpl.trigger_type);
    setTriggerConfig(tpl.trigger_config);
    setActions(tpl.actions);
    setShowTemplates(false);
    setShowCreator(true);
  };

  const addAction = () => {
    setActions((prev) => [...prev, { type: "send_notification", config: {} }]);
  };

  const removeAction = (idx: number) => {
    setActions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateActionType = (idx: number, type: string) => {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, type } : a)));
  };

  const triggerLabel = (key: string) =>
    TRIGGER_TYPES.find((t) => t.key === key)?.label || key;
  const triggerIcon = (key: string) =>
    TRIGGER_TYPES.find((t) => t.key === key)?.icon || "⚡";
  const actionLabel = (key: string) =>
    ACTION_TYPES.find((a) => a.key === key)?.label || key;
  const actionIcon = (key: string) =>
    ACTION_TYPES.find((a) => a.key === key)?.icon || "▶️";

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h3 className="font-bold text-sm">Automatyzacje</h3>
          <span className="text-xs text-muted-foreground">({automations.length})</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              fetchLogs();
              setShowLogs(true);
            }}
          >
            <History className="h-3.5 w-3.5" />
            Historia
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowTemplates(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Szablony
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              resetCreator();
              setShowCreator(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Nowa
          </Button>
        </div>
      </div>

      {/* Automation List */}
      {automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
            <Zap className="h-8 w-8 text-amber-500" />
          </div>
          <h4 className="font-bold mb-1">Brak automatyzacji</h4>
          <p className="text-xs text-muted-foreground max-w-xs mb-4">
            Utwórz automatyzacje aby przyspieszyć pracę zespołu. Użyj szablonów lub stwórz własną.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Użyj szablonu
            </Button>
            <Button size="sm" onClick={() => { resetCreator(); setShowCreator(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Utwórz od zera
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {automations.map((auto) => (
            <AutomationCard
              key={auto.id}
              auto={auto}
              onToggle={(active) => toggleAutomation(auto.id, active)}
              onDelete={() => deleteAutomation(auto.id)}
              onViewLogs={() => {
                setSelectedLogAutoId(auto.id);
                fetchLogs(auto.id);
                setShowLogs(true);
              }}
              triggerLabel={triggerLabel}
              triggerIcon={triggerIcon}
              actionLabel={actionLabel}
              actionIcon={actionIcon}
            />
          ))}
        </div>
      )}

      {/* Creator Sheet */}
      <Sheet open={showCreator} onOpenChange={setShowCreator}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Nowa automatyzacja
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Nazwa</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Auto-priorytet na deadline"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Opis (opcjonalnie)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Co robi ta automatyzacja?"
                rows={2}
              />
            </div>

            {/* Trigger */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Jeśli (trigger)
                </span>
              </div>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      <span className="flex items-center gap-2">
                        <span>{t.icon}</span>
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {triggerType === "deadline_approaching" && (
                <div>
                  <label className="text-xs text-muted-foreground">Ile dni przed deadline?</label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={triggerConfig.days_before || 2}
                    onChange={(e) =>
                      setTriggerConfig({ ...triggerConfig, days_before: parseInt(e.target.value) || 2 })
                    }
                  />
                </div>
              )}

              {triggerType === "task_status_changed" && (
                <div>
                  <label className="text-xs text-muted-foreground">Na jaki status?</label>
                  <Select
                    value={triggerConfig.to_status || ""}
                    onValueChange={(v) => setTriggerConfig({ ...triggerConfig, to_status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">Do zrobienia</SelectItem>
                      <SelectItem value="in_progress">W trakcie</SelectItem>
                      <SelectItem value="review">Do przeglądu</SelectItem>
                      <SelectItem value="done">Zakończone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {triggerType === "chat_keyword" && (
                <div>
                  <label className="text-xs text-muted-foreground">Słowo kluczowe</label>
                  <Input
                    value={triggerConfig.keyword || ""}
                    onChange={(e) => setTriggerConfig({ ...triggerConfig, keyword: e.target.value })}
                    placeholder="np. urgent, pilne"
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">▶️</span>
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    To (akcje)
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addAction}>
                  <Plus className="h-3 w-3 mr-1" />
                  Dodaj
                </Button>
              </div>

              {actions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Dodaj co najmniej jedną akcję
                </p>
              )}

              {actions.map((action, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                  <span className="text-sm">{actionIcon(action.type)}</span>
                  <Select
                    value={action.type}
                    onValueChange={(v) => updateActionType(idx, v)}
                  >
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((a) => (
                        <SelectItem key={a.key} value={a.key}>
                          <span className="flex items-center gap-2">
                            <span>{a.icon}</span>
                            {a.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => removeAction(idx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              className="w-full"
              disabled={!name.trim() || actions.length === 0}
              onClick={handleCreate}
            >
              <Zap className="h-4 w-4 mr-2" />
              Utwórz automatyzację
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Templates Sheet */}
      <Sheet open={showTemplates} onOpenChange={setShowTemplates}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Szablony automatyzacji
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="space-y-3 pr-2">
              {AUTOMATION_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  className="w-full text-left rounded-xl border p-4 hover:bg-muted/50 transition-colors group"
                  onClick={() => handleUseTemplate(tpl)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold">{tpl.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                    </div>
                    <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <span className="bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full">
                      {triggerIcon(tpl.trigger_type)} {triggerLabel(tpl.trigger_type)}
                    </span>
                    <ChevronRight className="h-3 w-3" />
                    <span>{tpl.actions.length} akcji</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Logs Sheet */}
      <Sheet open={showLogs} onOpenChange={setShowLogs}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historia wykonań
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Brak historii wykonań</p>
              </div>
            ) : (
              <div className="space-y-2 pr-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={cn(
                      "rounded-lg border p-3 text-xs",
                      log.status === "error" && "border-destructive/30 bg-destructive/5"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {log.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : log.status === "error" ? (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span className="font-medium">
                        {log.status === "success" ? "Sukces" : log.status === "error" ? "Błąd" : "Pominięto"}
                      </span>
                      <span className="text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(log.executed_at), { addSuffix: true, locale: pl })}
                      </span>
                    </div>
                    {log.error_message && (
                      <p className="text-destructive mt-1">{log.error_message}</p>
                    )}
                    {log.actions_executed.length > 0 && (
                      <p className="text-muted-foreground mt-1">
                        {log.actions_executed.length} akcji wykonanych
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AutomationCard({
  auto,
  onToggle,
  onDelete,
  onViewLogs,
  triggerLabel,
  triggerIcon,
  actionLabel,
  actionIcon,
}: {
  auto: WorkspaceAutomation;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
  onViewLogs: () => void;
  triggerLabel: (k: string) => string;
  triggerIcon: (k: string) => string;
  actionLabel: (k: string) => string;
  actionIcon: (k: string) => string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        auto.is_active ? "bg-card" : "bg-muted/30 opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Zap className={cn("h-4 w-4 shrink-0", auto.is_active ? "text-amber-500" : "text-muted-foreground")} />
            <h4 className="text-sm font-semibold truncate">{auto.name}</h4>
          </div>
          {auto.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{auto.description}</p>
          )}
        </div>
        <Switch checked={auto.is_active} onCheckedChange={onToggle} />
      </div>

      {/* Flow visualization */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full">
          {triggerIcon(auto.trigger_type)} {triggerLabel(auto.trigger_type)}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        {auto.actions.map((a, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full"
          >
            {actionIcon(a.type)} {actionLabel(a.type)}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {auto.trigger_count > 0 && (
            <span>Uruchomiono {auto.trigger_count}×</span>
          )}
          {auto.last_triggered_at && (
            <span>
              Ostatnio{" "}
              {formatDistanceToNow(new Date(auto.last_triggered_at), { addSuffix: true, locale: pl })}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onViewLogs}>
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
