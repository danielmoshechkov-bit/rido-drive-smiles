import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WorkspaceNotification {
  id: string;
  user_id: string;
  project_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link_type: string | null;
  link_id: string | null;
  is_read: boolean;
  created_at: string;
  sender_user_id: string | null;
  sender_name: string | null;
}

export function useWorkspaceNotifications() {
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data, error } = await supabase
      .from("workspace_notifications")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setNotifications(data as WorkspaceNotification[]);
      setUnreadCount(data.filter((n: any) => !n.is_read).length);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();

    // Real-time subscription
    const channel = supabase
      .channel('workspace-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'workspace_notifications',
      }, (payload) => {
        const newNotif = payload.new as WorkspaceNotification;
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id === newNotif.user_id) {
            setNotifications(prev => [newNotif, ...prev].slice(0, 50));
            setUnreadCount(prev => prev + 1);
          }
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("workspace_notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase
      .from("workspace_notifications")
      .update({ is_read: true })
      .eq("user_id", session.user.id)
      .eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    const notif = notifications.find(n => n.id === id);
    await supabase.from("workspace_notifications").delete().eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (notif && !notif.is_read) setUnreadCount(prev => Math.max(0, prev - 1));
  }, [notifications]);

  const clearAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase.from("workspace_notifications").delete().eq("user_id", session.user.id);
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Helper to create a notification for another user
  const sendNotification = useCallback(async (
    targetUserId: string,
    title: string,
    opts?: {
      body?: string;
      projectId?: string;
      type?: string;
      linkType?: string;
      linkId?: string;
      senderName?: string;
    }
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("workspace_notifications").insert({
      user_id: targetUserId,
      title,
      body: opts?.body || null,
      project_id: opts?.projectId || null,
      type: opts?.type || 'info',
      link_type: opts?.linkType || null,
      link_id: opts?.linkId || null,
      sender_user_id: session?.user?.id || null,
      sender_name: opts?.senderName || session?.user?.email || null,
    });
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    sendNotification,
    refresh: loadNotifications,
  };
}
