import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
  created_at: string;
}

export function useTaskDependencies(taskId: string | null) {
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [dependents, setDependents] = useState<TaskDependency[]>([]);

  const loadDependencies = useCallback(async () => {
    if (!taskId) return;
    const [{ data: deps }, { data: depts }] = await Promise.all([
      (supabase as any).from("workspace_task_dependencies").select("*").eq("task_id", taskId),
      (supabase as any).from("workspace_task_dependencies").select("*").eq("depends_on_task_id", taskId),
    ]);
    setDependencies((deps || []) as TaskDependency[]);
    setDependents((depts || []) as TaskDependency[]);
  }, [taskId]);

  const addDependency = async (dependsOnTaskId: string, type = "blocks") => {
    if (!taskId || taskId === dependsOnTaskId) return;
    const { error } = await (supabase as any).from("workspace_task_dependencies").insert({
      task_id: taskId, depends_on_task_id: dependsOnTaskId, dependency_type: type,
    });
    if (error) {
      toast.error("Zależność już istnieje");
      return;
    }
    toast.success("Dodano zależność");
    loadDependencies();
  };

  const removeDependency = async (depId: string) => {
    await (supabase as any).from("workspace_task_dependencies").delete().eq("id", depId);
    toast.success("Usunięto zależność");
    loadDependencies();
  };

  return { dependencies, dependents, loadDependencies, addDependency, removeDependency };
}
