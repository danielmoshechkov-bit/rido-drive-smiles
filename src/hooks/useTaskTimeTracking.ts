import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  description: string | null;
  created_at: string;
}

export function useTaskTimeTracking(taskId: string | null, userId: string | null, userName: string | null) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const loadEntries = useCallback(async () => {
    if (!taskId) return;
    const { data } = await (supabase as any)
      .from("workspace_time_entries")
      .select("*")
      .eq("task_id", taskId)
      .order("started_at", { ascending: false });
    setEntries((data || []) as TimeEntry[]);

    // Check for active entry
    const active = (data || []).find((e: any) => !e.ended_at && e.user_id === userId);
    if (active) {
      setActiveEntry(active as TimeEntry);
      setIsTracking(true);
      const startedMs = new Date(active.started_at).getTime();
      setElapsed(Math.floor((Date.now() - startedMs) / 1000));
    }
  }, [taskId, userId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (isTracking) {
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTracking]);

  const startTracking = async () => {
    if (!taskId || !userId) return;
    const { data, error } = await (supabase as any)
      .from("workspace_time_entries")
      .insert({ task_id: taskId, user_id: userId, user_name: userName })
      .select()
      .single();
    if (!error && data) {
      setActiveEntry(data as TimeEntry);
      setIsTracking(true);
      setElapsed(0);
      toast.success("Timer uruchomiony");
    }
  };

  const stopTracking = async (description?: string) => {
    if (!activeEntry) return;
    const startedMs = new Date(activeEntry.started_at).getTime();
    const durationMin = Math.max(1, Math.round((Date.now() - startedMs) / 60000));
    
    await (supabase as any)
      .from("workspace_time_entries")
      .update({ ended_at: new Date().toISOString(), duration_minutes: durationMin, description })
      .eq("id", activeEntry.id);

    // Update task total
    await (supabase as any)
      .from("workspace_tasks")
      .update({ time_logged_minutes: entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) + durationMin })
      .eq("id", activeEntry.task_id);

    setIsTracking(false);
    setActiveEntry(null);
    toast.success(`Zapisano ${durationMin} min`);
    loadEntries();
  };

  const addManualEntry = async (minutes: number, desc?: string) => {
    if (!taskId || !userId) return;
    const started = new Date();
    started.setMinutes(started.getMinutes() - minutes);
    
    await (supabase as any)
      .from("workspace_time_entries")
      .insert({
        task_id: taskId, user_id: userId, user_name: userName,
        started_at: started.toISOString(), ended_at: new Date().toISOString(),
        duration_minutes: minutes, description: desc,
      });

    await (supabase as any)
      .from("workspace_tasks")
      .update({ time_logged_minutes: entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) + minutes })
      .eq("id", taskId);

    toast.success(`Dodano ${minutes} min`);
    loadEntries();
  };

  const deleteEntry = async (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    await (supabase as any).from("workspace_time_entries").delete().eq("id", entryId);
    if (entry && taskId) {
      const newTotal = entries.filter(e => e.id !== entryId).reduce((s, e) => s + (e.duration_minutes || 0), 0);
      await (supabase as any).from("workspace_tasks").update({ time_logged_minutes: newTotal }).eq("id", taskId);
    }
    loadEntries();
  };

  const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };

  const formatMinutes = (min: number) => {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const rem = min % 60;
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  };

  return {
    entries, isTracking, activeEntry, elapsed, totalMinutes,
    startTracking, stopTracking, addManualEntry, deleteEntry,
    formatDuration, formatMinutes, loadEntries,
  };
}
