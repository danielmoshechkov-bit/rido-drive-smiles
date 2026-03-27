import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ChatChannel {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  type: string; // public, private, dm, group
  created_by: string;
  created_at: string;
  is_archived: boolean;
  unread_count?: number;
  participants?: ChannelParticipant[];
}

export interface ChannelParticipant {
  id: string;
  channel_id: string;
  user_id: string;
  last_read_at: string;
  display_name?: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  channel_name: string;
  channel_id: string | null;
  user_id: string;
  user_name: string | null;
  content: string | null;
  message_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to_id: string | null;
  thread_parent_id: string | null;
  is_pinned: boolean;
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

export function useWorkspaceChat(projectId: string, userId: string | null) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [activeThread, setActiveThread] = useState<ChatMessage | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);

  // Load channels
  const loadChannels = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("workspace_channels")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_archived", false)
      .order("type")
      .order("name");
    
    const chs = (data || []) as ChatChannel[];
    setChannels(chs);
    
    // Auto-select general if no active
    if (!activeChannel && chs.length > 0) {
      const general = chs.find(c => c.name === 'general') || chs[0];
      setActiveChannel(general);
    }
    return chs;
  }, [projectId, activeChannel]);

  // Load messages for active channel
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
    
    // Load reactions for these messages
    if (msgs.length > 0) {
      const msgIds = msgs.map(m => m.id);
      const { data: reactions } = await (supabase as any)
        .from("workspace_message_reactions")
        .select("*")
        .in("message_id", msgIds);
      
      // Load thread counts
      const { data: threadCounts } = await supabase
        .from("workspace_messages")
        .select("thread_parent_id")
        .in("thread_parent_id", msgIds);
      
      const threadCountMap: Record<string, number> = {};
      (threadCounts || []).forEach((t: any) => {
        threadCountMap[t.thread_parent_id] = (threadCountMap[t.thread_parent_id] || 0) + 1;
      });

      // Group reactions by message
      const reactionMap: Record<string, Record<string, { count: number; users: string[] }>> = {};
      (reactions || []).forEach((r: any) => {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = {};
        if (!reactionMap[r.message_id][r.emoji]) reactionMap[r.message_id][r.emoji] = { count: 0, users: [] };
        reactionMap[r.message_id][r.emoji].count++;
        reactionMap[r.message_id][r.emoji].users.push(r.user_id);
      });

      msgs.forEach(msg => {
        msg.thread_count = threadCountMap[msg.id] || 0;
        const msgReactions = reactionMap[msg.id];
        if (msgReactions) {
          msg.reactions = Object.entries(msgReactions).map(([emoji, data]) => ({
            emoji,
            count: data.count,
            users: data.users,
            hasReacted: data.users.includes(userId || ''),
          }));
        }
      });
    }
    
    setMessages(msgs);
    return msgs;
  }, [projectId, userId]);

  // Load thread messages
  const loadThread = useCallback(async (parentId: string) => {
    const { data } = await supabase
      .from("workspace_messages")
      .select("*")
      .eq("thread_parent_id", parentId)
      .order("created_at", { ascending: true });
    
    setThreadMessages((data || []) as ChatMessage[]);
  }, []);

  // Load members
  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from("workspace_project_members")
      .select("*")
      .eq("project_id", projectId);
    setMembers(data || []);
  }, [projectId]);

  // Send message
  const sendMessage = useCallback(async (
    content: string,
    channelName: string,
    opts?: {
      messageType?: string;
      fileUrl?: string;
      fileName?: string;
      threadParentId?: string;
      channelId?: string;
    }
  ) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("workspace_messages")
      .insert({
        project_id: projectId,
        channel_name: channelName,
        channel_id: opts?.channelId || null,
        user_id: userId,
        user_name: null, // Will be resolved from members
        content,
        message_type: opts?.messageType || 'text',
        file_url: opts?.fileUrl || null,
        file_name: opts?.fileName || null,
        thread_parent_id: opts?.threadParentId || null,
      } as any)
      .select()
      .single();
    
    if (error) { toast.error("Błąd wysyłania"); return null; }
    return data as ChatMessage;
  }, [projectId, userId]);

  // Toggle reaction
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!userId) return;
    
    // Check if already reacted
    const { data: existing } = await (supabase as any)
      .from("workspace_message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji)
      .single();
    
    if (existing) {
      await (supabase as any)
        .from("workspace_message_reactions")
        .delete()
        .eq("id", existing.id);
    } else {
      await (supabase as any)
        .from("workspace_message_reactions")
        .insert({ message_id: messageId, user_id: userId, emoji });
    }
  }, [userId]);

  // Pin/unpin message
  const togglePin = useCallback(async (messageId: string, isPinned: boolean) => {
    await supabase
      .from("workspace_messages")
      .update({ is_pinned: !isPinned })
      .eq("id", messageId);
  }, []);

  // Create channel
  const createChannel = useCallback(async (name: string, type: string = 'public', description?: string, participantIds?: string[]) => {
    if (!userId) return null;
    const { data, error } = await (supabase as any)
      .from("workspace_channels")
      .insert({
        project_id: projectId,
        name: name.toLowerCase().replace(/\s+/g, '-'),
        type,
        description: description || null,
        created_by: userId,
      })
      .select()
      .single();
    
    if (error) { toast.error("Błąd tworzenia kanału"); return null; }
    
    // Add participants for DM/group
    if ((type === 'dm' || type === 'group') && participantIds) {
      const inserts = [...participantIds, userId].map(uid => ({
        channel_id: data.id,
        user_id: uid,
      }));
      await (supabase as any).from("workspace_channel_participants").insert(inserts);
    }
    
    toast.success("Kanał utworzony");
    return data as ChatChannel;
  }, [projectId, userId]);

  // Create DM
  const createOrGetDM = useCallback(async (otherUserId: string, otherDisplayName: string) => {
    if (!userId) return null;
    
    // Check if DM already exists between these two users
    const { data: existingParticipants } = await (supabase as any)
      .from("workspace_channel_participants")
      .select("channel_id")
      .eq("user_id", userId);
    
    if (existingParticipants) {
      for (const p of existingParticipants) {
        const { data: ch } = await (supabase as any)
          .from("workspace_channels")
          .select("*")
          .eq("id", p.channel_id)
          .eq("type", "dm")
          .eq("project_id", projectId)
          .single();
        
        if (ch) {
          const { data: otherP } = await (supabase as any)
            .from("workspace_channel_participants")
            .select("id")
            .eq("channel_id", ch.id)
            .eq("user_id", otherUserId)
            .single();
          
          if (otherP) {
            return ch as ChatChannel;
          }
        }
      }
    }
    
    // Create new DM channel
    return createChannel(`dm-${Date.now()}`, 'dm', `DM z ${otherDisplayName}`, [otherUserId]);
  }, [userId, projectId, createChannel]);

  // Search messages
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

  // Init
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadChannels(), loadMembers()]);
      setLoading(false);
    };
    init();
  }, [projectId]);

  // Load messages when channel changes
  useEffect(() => {
    if (activeChannel) {
      loadMessages(activeChannel.name);
    }
  }, [activeChannel?.id]);

  return {
    channels, activeChannel, setActiveChannel,
    messages, setMessages, loadMessages,
    threadMessages, activeThread, setActiveThread, loadThread,
    members,
    loading,
    sendMessage, toggleReaction, togglePin,
    createChannel, createOrGetDM,
    searchQuery, setSearchQuery, searchMessages, searchResults,
    loadChannels, loadMembers,
  };
}
