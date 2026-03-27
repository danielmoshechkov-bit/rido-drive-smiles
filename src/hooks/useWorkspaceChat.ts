import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyMentions } from "@/utils/workspaceNotifications";

export interface ChatChannel {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  type: string;
  created_by: string;
  created_at: string;
  is_archived: boolean;
  unread_count?: number;
}

export interface ChannelParticipant {
  id: string;
  channel_id: string;
  user_id: string;
  last_read_at: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  channel_name: string;
  channel_id: string | null;
  user_id: string;
  user_name: string | null;
  content: string | null;
  original_content: string | null;
  message_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to_id: string | null;
  thread_parent_id: string | null;
  is_pinned: boolean;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  reactions?: MessageReaction[];
  thread_count?: number;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export interface UserStatus {
  status: string; // available, away, dnd, offline
  status_text: string | null;
  status_emoji: string | null;
  focus_mode: boolean;
}

export function useWorkspaceChat(projectId: string, userId: string | null) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [activeThread, setActiveThread] = useState<ChatMessage | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [memberStatuses, setMemberStatuses] = useState<Record<string, UserStatus>>({});
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [showPinned, setShowPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);

  const loadChannels = useCallback(async () => {
    // Load all project channels
    const { data: allChannels } = await (supabase as any)
      .from("workspace_channels")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_archived", false)
      .order("type")
      .order("name");

    if (!allChannels || !userId) {
      setChannels([]);
      return [];
    }

    // Get user's role in this project
    const { data: memberData } = await supabase
      .from("workspace_project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .single();

    const role = memberData?.role || 'member';

    // Get channels where user is a participant (for private/dm/group)
    const { data: participations } = await (supabase as any)
      .from("workspace_channel_participants")
      .select("channel_id")
      .eq("user_id", userId);
    const participantChannelIds = new Set((participations || []).map((p: any) => p.channel_id));

    // Filter channels based on role
    let filtered: ChatChannel[];
    if (role === 'owner') {
      // CEO/Owner sees ALL channels
      filtered = allChannels as ChatChannel[];
    } else if (role === 'manager') {
      // Manager sees: public channels + channels they participate in + channels created by their team members
      // For now: public + participated + own created
      filtered = (allChannels as ChatChannel[]).filter(ch =>
        ch.type === 'public' ||
        ch.created_by === userId ||
        participantChannelIds.has(ch.id)
      );
    } else if (role === 'guest') {
      // Guest sees only channels they're explicitly added to
      filtered = (allChannels as ChatChannel[]).filter(ch =>
        participantChannelIds.has(ch.id)
      );
    } else {
      // Member sees: public + participated
      filtered = (allChannels as ChatChannel[]).filter(ch =>
        ch.type === 'public' ||
        participantChannelIds.has(ch.id)
      );
    }

    setChannels(filtered);
    if (!activeChannel && filtered.length > 0) {
      setActiveChannel(filtered.find(c => c.name === 'general') || filtered[0]);
    }
    return filtered;
  }, [projectId, activeChannel, userId]);

  const loadMessages = useCallback(async (channelName: string) => {
    const { data } = await supabase
      .from("workspace_messages")
      .select("*")
      .eq("project_id", projectId)
      .eq("channel_name", channelName)
      .is("thread_parent_id", null)
      .order("created_at", { ascending: true })
      .limit(200);
    const msgs = (data || []) as ChatMessage[];

    if (msgs.length > 0) {
      const msgIds = msgs.map(m => m.id);
      const [{ data: reactions }, { data: threadCounts }] = await Promise.all([
        (supabase as any).from("workspace_message_reactions").select("*").in("message_id", msgIds),
        supabase.from("workspace_messages").select("thread_parent_id").in("thread_parent_id", msgIds),
      ]);

      const threadCountMap: Record<string, number> = {};
      (threadCounts || []).forEach((t: any) => {
        threadCountMap[t.thread_parent_id] = (threadCountMap[t.thread_parent_id] || 0) + 1;
      });

      const reactionMap: Record<string, Record<string, { count: number; users: string[] }>> = {};
      (reactions || []).forEach((r: any) => {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = {};
        if (!reactionMap[r.message_id][r.emoji]) reactionMap[r.message_id][r.emoji] = { count: 0, users: [] };
        reactionMap[r.message_id][r.emoji].count++;
        reactionMap[r.message_id][r.emoji].users.push(r.user_id);
      });

      msgs.forEach(msg => {
        msg.thread_count = threadCountMap[msg.id] || 0;
        const mr = reactionMap[msg.id];
        if (mr) {
          msg.reactions = Object.entries(mr).map(([emoji, d]) => ({
            emoji, count: d.count, users: d.users,
            hasReacted: d.users.includes(userId || ''),
          }));
        }
      });
    }
    setMessages(msgs);
    return msgs;
  }, [projectId, userId]);

  const loadThread = useCallback(async (parentId: string) => {
    const { data } = await supabase
      .from("workspace_messages")
      .select("*")
      .eq("thread_parent_id", parentId)
      .order("created_at", { ascending: true });
    setThreadMessages((data || []) as ChatMessage[]);
  }, []);

  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from("workspace_project_members")
      .select("*")
      .eq("project_id", projectId);
    setMembers(data || []);

    // Load statuses
    const userIds = (data || []).filter((m: any) => m.user_id).map((m: any) => m.user_id);
    if (userIds.length > 0) {
      const { data: settings } = await (supabase as any)
        .from("user_workspace_settings")
        .select("user_id, status, status_text, status_emoji, focus_mode")
        .in("user_id", userIds);
      const map: Record<string, UserStatus> = {};
      (settings || []).forEach((s: any) => {
        map[s.user_id] = { status: s.status, status_text: s.status_text, status_emoji: s.status_emoji, focus_mode: s.focus_mode };
      });
      setMemberStatuses(map);
    }
  }, [projectId]);

  const loadPinnedMessages = useCallback(async (channelName: string) => {
    const { data } = await supabase
      .from("workspace_messages")
      .select("*")
      .eq("project_id", projectId)
      .eq("channel_name", channelName)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false });
    setPinnedMessages((data || []) as ChatMessage[]);
  }, [projectId]);

  const sendMessage = useCallback(async (
    content: string, channelName: string,
    opts?: { messageType?: string; fileUrl?: string; fileName?: string; threadParentId?: string; channelId?: string; }
  ) => {
    if (!userId) return null;

    // Optimistic update — add message to UI immediately
    const optimisticId = `opt_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      project_id: projectId,
      channel_name: channelName,
      channel_id: opts?.channelId || null,
      user_id: userId,
      user_name: null,
      content,
      original_content: null,
      message_type: opts?.messageType || 'text',
      file_url: opts?.fileUrl || null,
      file_name: opts?.fileName || null,
      file_size: null,
      reply_to_id: null,
      thread_parent_id: opts?.threadParentId || null,
      is_pinned: false,
      is_edited: false,
      edited_at: null,
      created_at: new Date().toISOString(),
      reactions: [],
      thread_count: 0,
    };

    if (!opts?.threadParentId) {
      setMessages(prev => [...prev, optimisticMsg]);
    }

    const { data, error } = await supabase
      .from("workspace_messages")
      .insert({
        project_id: projectId,
        channel_name: channelName,
        channel_id: opts?.channelId || null,
        user_id: userId,
        user_name: null,
        content,
        message_type: opts?.messageType || 'text',
        file_url: opts?.fileUrl || null,
        file_name: opts?.fileName || null,
        thread_parent_id: opts?.threadParentId || null,
      } as any)
      .select()
      .single();

    if (error) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      toast.error("Błąd wysyłania");
      return null;
    }

    // Replace optimistic with real message
    if (!opts?.threadParentId) {
      setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, ...data, id: data.id } : m));
    }

    if (content.includes('@')) {
      notifyMentions(content, projectId, channelName);
    }
    return data as ChatMessage;
  }, [projectId, userId]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg || msg.user_id !== userId) return;
    await supabase
      .from("workspace_messages")
      .update({
        content: newContent,
        original_content: msg.original_content || msg.content,
        is_edited: true,
        edited_at: new Date().toISOString(),
      } as any)
      .eq("id", messageId);
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, is_edited: true } : m));
  }, [messages, userId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg || msg.user_id !== userId) return;
    await supabase.from("workspace_messages").delete().eq("id", messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, [messages, userId]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!userId) return;
    const { data: existing } = await (supabase as any)
      .from("workspace_message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji)
      .single();
    if (existing) {
      await (supabase as any).from("workspace_message_reactions").delete().eq("id", existing.id);
    } else {
      await (supabase as any).from("workspace_message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
    }
  }, [userId]);

  const togglePin = useCallback(async (messageId: string, isPinned: boolean) => {
    await supabase.from("workspace_messages").update({ is_pinned: !isPinned }).eq("id", messageId);
    if (!isPinned && userId) {
      await (supabase as any).from("workspace_message_pins").insert({
        message_id: messageId,
        pinned_by: userId,
        channel_id: activeChannel?.id,
      });
    } else {
      await (supabase as any).from("workspace_message_pins").delete().eq("message_id", messageId);
    }
  }, [userId, activeChannel]);

  const createChannel = useCallback(async (name: string, type: string = 'public', description?: string, participantIds?: string[]) => {
    if (!userId) return null;
    const { data, error } = await (supabase as any)
      .from("workspace_channels")
      .insert({ project_id: projectId, name: name.toLowerCase().replace(/\s+/g, '-'), type, description: description || null, created_by: userId })
      .select()
      .single();
    if (error) { toast.error("Błąd tworzenia kanału"); return null; }
    if ((type === 'dm' || type === 'group') && participantIds) {
      const inserts = [...participantIds, userId].map(uid => ({ channel_id: data.id, user_id: uid }));
      await (supabase as any).from("workspace_channel_participants").insert(inserts);
    }
    toast.success("Kanał utworzony");
    return data as ChatChannel;
  }, [projectId, userId]);

  const createOrGetDM = useCallback(async (otherUserId: string, otherDisplayName: string) => {
    if (!userId) return null;
    const { data: existingParticipants } = await (supabase as any)
      .from("workspace_channel_participants").select("channel_id").eq("user_id", userId);
    if (existingParticipants) {
      for (const p of existingParticipants) {
        const { data: ch } = await (supabase as any)
          .from("workspace_channels").select("*").eq("id", p.channel_id).eq("type", "dm").eq("project_id", projectId).single();
        if (ch) {
          const { data: otherP } = await (supabase as any)
            .from("workspace_channel_participants").select("id").eq("channel_id", ch.id).eq("user_id", otherUserId).single();
          if (otherP) return ch as ChatChannel;
        }
      }
    }
    return createChannel(`dm-${Date.now()}`, 'dm', `DM z ${otherDisplayName}`, [otherUserId]);
  }, [userId, projectId, createChannel]);

  const searchMessages = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    const { data } = await supabase
      .from("workspace_messages")
      .select("*")
      .eq("project_id", projectId)
      .ilike("content", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(50);
    setSearchResults((data || []) as ChatMessage[]);
  }, [projectId]);

  const updateMyStatus = useCallback(async (status: string, statusText?: string, statusEmoji?: string) => {
    if (!userId) return;
    await (supabase as any).from("user_workspace_settings").upsert({
      user_id: userId,
      status,
      status_text: statusText || null,
      status_emoji: statusEmoji || null,
    }, { onConflict: 'user_id' });
    setMemberStatuses(prev => ({ ...prev, [userId]: { status, status_text: statusText || null, status_emoji: statusEmoji || null, focus_mode: false } }));
  }, [userId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadChannels(), loadMembers()]);
      setLoading(false);
    };
    init();
  }, [projectId]);

  useEffect(() => {
    if (activeChannel) {
      loadMessages(activeChannel.name);
      loadPinnedMessages(activeChannel.name);
    }
  }, [activeChannel?.id]);

  return {
    channels, activeChannel, setActiveChannel,
    messages, setMessages, loadMessages,
    threadMessages, activeThread, setActiveThread, loadThread,
    members, memberStatuses,
    pinnedMessages, showPinned, setShowPinned, loadPinnedMessages,
    loading,
    sendMessage, editMessage, deleteMessage,
    toggleReaction, togglePin,
    createChannel, createOrGetDM,
    searchMessages, searchResults,
    updateMyStatus,
    loadChannels, loadMembers,
  };
}
