import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WorkspaceProject {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string;
  status: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_user_id: string | null;
  assigned_name: string | null;
  created_by: string;
  due_date: string | null;
  parent_task_id: string | null;
  order_index: number;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMessage {
  id: string;
  project_id: string;
  channel_name: string;
  user_id: string;
  user_name: string | null;
  content: string | null;
  message_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to_id: string | null;
  is_pinned: boolean;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  project_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  role: string;
  status: string;
  created_at: string;
}

export interface WorkspaceTaskComment {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string | null;
  content: string;
  created_at: string;
}

export function useWorkspace() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
      }
      await loadProjects();
    };
    init();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error loading projects:", error);
    } else {
      setProjects((data || []) as WorkspaceProject[]);
    }
    setLoading(false);
  };

  const createProject = useCallback(async (name: string, description?: string, color?: string) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("workspace_projects")
      .insert({ name, description: description || null, owner_user_id: userId, color: color || '#6C4AE2' })
      .select()
      .single();
    if (error) {
      toast.error("Błąd tworzenia projektu");
      return null;
    }
    // Add owner as member
    await supabase.from("workspace_project_members").insert({
      project_id: data.id,
      user_id: userId,
      display_name: userEmail,
      role: 'owner',
      status: 'active',
    });
    // Add default channel
    await supabase.from("workspace_channels").insert({
      project_id: data.id,
      name: 'general',
      description: 'Kanał ogólny',
      created_by: userId,
    });
    setProjects(prev => [data as WorkspaceProject, ...prev]);
    toast.success("Projekt utworzony");
    return data as WorkspaceProject;
  }, [userId, userEmail]);

  const updateProject = useCallback(async (id: string, updates: Partial<WorkspaceProject>) => {
    const { error } = await supabase.from("workspace_projects").update(updates).eq("id", id);
    if (error) { toast.error("Błąd aktualizacji"); return; }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    toast.success("Zapisano");
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await supabase.from("workspace_projects").delete().eq("id", id);
    if (error) { toast.error("Błąd usuwania"); return; }
    setProjects(prev => prev.filter(p => p.id !== id));
    toast.success("Projekt usunięty");
  }, []);

  // Tasks
  const loadTasks = useCallback(async (projectId: string) => {
    const { data, error } = await supabase
      .from("workspace_tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("order_index");
    if (error) { console.error(error); return []; }
    return (data || []) as WorkspaceTask[];
  }, []);

  const createTask = useCallback(async (task: Partial<WorkspaceTask>) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("workspace_tasks")
      .insert({ ...task, created_by: userId } as any)
      .select()
      .single();
    if (error) { toast.error("Błąd tworzenia zadania"); return null; }
    toast.success("Zadanie dodane");
    return data as WorkspaceTask;
  }, [userId]);

  const updateTask = useCallback(async (id: string, updates: Partial<WorkspaceTask>) => {
    const { error } = await supabase.from("workspace_tasks").update(updates).eq("id", id);
    if (error) { toast.error("Błąd aktualizacji"); return false; }
    return true;
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await supabase.from("workspace_tasks").delete().eq("id", id);
    if (error) { toast.error("Błąd usuwania"); return; }
    toast.success("Zadanie usunięte");
  }, []);

  // Members
  const loadMembers = useCallback(async (projectId: string) => {
    const { data } = await supabase
      .from("workspace_project_members")
      .select("*")
      .eq("project_id", projectId);
    return (data || []) as WorkspaceMember[];
  }, []);

  const addMember = useCallback(async (projectId: string, email: string, role = 'member') => {
    const { error } = await supabase.from("workspace_project_members").insert({
      project_id: projectId, email, display_name: email, role, status: 'invited',
    });
    if (error) { toast.error("Błąd dodawania"); return; }
    toast.success(`Zaproszono ${email}`);
  }, []);

  const removeMember = useCallback(async (memberId: string) => {
    await supabase.from("workspace_project_members").delete().eq("id", memberId);
    toast.success("Usunięto z projektu");
  }, []);

  // Messages
  const loadMessages = useCallback(async (projectId: string, channel = 'general') => {
    const { data } = await supabase
      .from("workspace_messages")
      .select("*")
      .eq("project_id", projectId)
      .eq("channel_name", channel)
      .order("created_at", { ascending: true })
      .limit(200);
    return (data || []) as WorkspaceMessage[];
  }, []);

  const sendMessage = useCallback(async (projectId: string, content: string, channel = 'general', messageType = 'text', fileUrl?: string, fileName?: string) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("workspace_messages")
      .insert({
        project_id: projectId,
        channel_name: channel,
        user_id: userId,
        user_name: userEmail,
        content,
        message_type: messageType,
        file_url: fileUrl || null,
        file_name: fileName || null,
      })
      .select()
      .single();
    if (error) { toast.error("Błąd wysyłania"); return null; }
    return data as WorkspaceMessage;
  }, [userId, userEmail]);

  // Channels
  const loadChannels = useCallback(async (projectId: string) => {
    const { data } = await supabase
      .from("workspace_channels")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at");
    return data || [];
  }, []);

  const createChannel = useCallback(async (projectId: string, name: string, description?: string) => {
    if (!userId) return;
    const { error } = await supabase.from("workspace_channels").insert({
      project_id: projectId, name, description: description || null, created_by: userId,
    });
    if (error) { toast.error("Błąd tworzenia kanału"); return; }
    toast.success("Kanał utworzony");
  }, [userId]);

  // Task comments
  const loadComments = useCallback(async (taskId: string) => {
    const { data } = await supabase
      .from("workspace_task_comments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at");
    return (data || []) as WorkspaceTaskComment[];
  }, []);

  const addComment = useCallback(async (taskId: string, content: string) => {
    if (!userId) return;
    await supabase.from("workspace_task_comments").insert({
      task_id: taskId, user_id: userId, user_name: userEmail, content,
    });
  }, [userId, userEmail]);

  return {
    projects, loading, userId, userEmail,
    loadProjects, createProject, updateProject, deleteProject,
    loadTasks, createTask, updateTask, deleteTask,
    loadMembers, addMember, removeMember,
    loadMessages, sendMessage,
    loadChannels, createChannel,
    loadComments, addComment,
  };
}
