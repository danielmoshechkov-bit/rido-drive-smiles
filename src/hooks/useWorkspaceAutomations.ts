import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WorkspaceAutomation {
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  conditions: Array<{ field: string; operator: string; value: string }>;
  actions: Array<{ type: string; config: Record<string, any> }>;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  automation_id: string;
  trigger_data: Record<string, any>;
  actions_executed: Array<Record<string, any>>;
  status: string;
  error_message: string | null;
  executed_at: string;
}

export const TRIGGER_TYPES = [
  { key: "task_status_changed", label: "Zmiana statusu zadania", icon: "🔄" },
  { key: "task_assigned", label: "Przypisanie zadania", icon: "👤" },
  { key: "task_created", label: "Nowe zadanie utworzone", icon: "➕" },
  { key: "deadline_approaching", label: "Zbliżający się deadline", icon: "⏰" },
  { key: "member_joined", label: "Nowy członek dołączył", icon: "🤝" },
  { key: "chat_keyword", label: "Słowo kluczowe w czacie", icon: "💬" },
] as const;

export const ACTION_TYPES = [
  { key: "send_notification", label: "Wyślij powiadomienie", icon: "🔔" },
  { key: "assign_task", label: "Przypisz zadanie", icon: "👤" },
  { key: "change_status", label: "Zmień status zadania", icon: "🔄" },
  { key: "change_priority", label: "Zmień priorytet", icon: "🎯" },
  { key: "send_chat_message", label: "Wyślij wiadomość na czat", icon: "💬" },
  { key: "create_task", label: "Utwórz nowe zadanie", icon: "📝" },
  { key: "move_to_column", label: "Przenieś do kolumny Kanban", icon: "📋" },
] as const;

export const CONDITION_OPERATORS = [
  { key: "equals", label: "jest równe" },
  { key: "not_equals", label: "nie jest równe" },
  { key: "contains", label: "zawiera" },
  { key: "not_contains", label: "nie zawiera" },
  { key: "greater_than", label: "większe niż" },
  { key: "less_than", label: "mniejsze niż" },
] as const;

export const AUTOMATION_TEMPLATES = [
  {
    name: "Auto-priorytet na deadline",
    description: "Zmień priorytet na wysoki gdy deadline za mniej niż 2 dni",
    trigger_type: "deadline_approaching",
    trigger_config: { days_before: 2 },
    conditions: [],
    actions: [{ type: "change_priority", config: { priority: "high" } }, { type: "send_notification", config: { title: "Zbliża się deadline!", body: "Zadanie ma termin za mniej niż 2 dni" } }],
  },
  {
    name: "Powiadomienie o nowym zadaniu",
    description: "Wyślij powiadomienie zespołowi gdy nowe zadanie zostanie utworzone",
    trigger_type: "task_created",
    trigger_config: {},
    conditions: [],
    actions: [{ type: "send_notification", config: { title: "Nowe zadanie", body: "Utworzono nowe zadanie w projekcie" } }],
  },
  {
    name: "Auto-przypisanie po statusie",
    description: "Gdy zadanie zmieni status na 'W trakcie', wyślij wiadomość na czat",
    trigger_type: "task_status_changed",
    trigger_config: { to_status: "in_progress" },
    conditions: [],
    actions: [{ type: "send_chat_message", config: { channel: "general", message: "Zadanie rozpoczęte! 🚀" } }],
  },
  {
    name: "Powitanie nowego członka",
    description: "Wyślij wiadomość powitalną gdy ktoś dołączy do projektu",
    trigger_type: "member_joined",
    trigger_config: {},
    conditions: [],
    actions: [{ type: "send_chat_message", config: { channel: "general", message: "Witamy nowego członka w zespole! 👋" } }, { type: "send_notification", config: { title: "Witamy!", body: "Dołączyłeś do projektu" } }],
  },
];

export function useWorkspaceAutomations(projectId: string) {
  const [automations, setAutomations] = useState<WorkspaceAutomation[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAutomations = useCallback(async () => {
    const { data, error } = await supabase
      .from("workspace_automations")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setAutomations(data.map(d => ({
        ...d,
        is_active: d.is_active ?? true,
        trigger_config: (d.trigger_config as Record<string, any>) ?? {},
        conditions: (d.conditions as any[]) ?? [],
        actions: (d.actions as any[]) ?? [],
        trigger_count: d.trigger_count ?? 0,
      })));
    }
    setLoading(false);
  }, [projectId]);

  const fetchLogs = useCallback(async (automationId?: string) => {
    let query = supabase
      .from("workspace_automation_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("executed_at", { ascending: false })
      .limit(50);

    if (automationId) query = query.eq("automation_id", automationId);
    const { data } = await query;
    if (data) {
      setLogs(data.map(d => ({
        ...d,
        trigger_data: (d.trigger_data as Record<string, any>) ?? {},
        actions_executed: (d.actions_executed as any[]) ?? [],
      })));
    }
  }, [projectId]);

  useEffect(() => {
    fetchAutomations();
    fetchLogs();
  }, [fetchAutomations, fetchLogs]);

  const createAutomation = async (auto: Partial<WorkspaceAutomation>) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error } = await supabase.from("workspace_automations").insert({
      project_id: projectId,
      created_by: userData.user.id,
      name: auto.name || "Nowa automatyzacja",
      description: auto.description || null,
      trigger_type: auto.trigger_type || "task_created",
      trigger_config: auto.trigger_config || {},
      conditions: auto.conditions || [],
      actions: auto.actions || [],
    });

    if (error) {
      toast.error("Nie udało się utworzyć automatyzacji");
    } else {
      toast.success("Automatyzacja utworzona!");
      fetchAutomations();
    }
  };

  const updateAutomation = async (id: string, updates: Partial<WorkspaceAutomation>) => {
    const { error } = await supabase
      .from("workspace_automations")
      .update(updates as any)
      .eq("id", id);

    if (error) {
      toast.error("Nie udało się zaktualizować");
    } else {
      toast.success("Zaktualizowano");
      fetchAutomations();
    }
  };

  const toggleAutomation = async (id: string, active: boolean) => {
    await updateAutomation(id, { is_active: active } as any);
  };

  const deleteAutomation = async (id: string) => {
    const { error } = await supabase.from("workspace_automations").delete().eq("id", id);
    if (error) {
      toast.error("Nie udało się usunąć");
    } else {
      toast.success("Usunięto automatyzację");
      fetchAutomations();
    }
  };

  return {
    automations,
    logs,
    loading,
    createAutomation,
    updateAutomation,
    toggleAutomation,
    deleteAutomation,
    fetchLogs,
    refetch: fetchAutomations,
  };
}
