import { useState, useEffect, useRef, useCallback } from "react";
import { WorkspaceProject } from "@/hooks/useWorkspace";
import { useWorkspaceChat, ChatMessage } from "@/hooks/useWorkspaceChat";
import { ChatSidebar } from "./chat/ChatSidebar";
import { ChatMessageArea } from "./chat/ChatMessageArea";
import { ChatThreadPanel } from "./chat/ChatThreadPanel";
import { ChatSearchModal } from "./chat/ChatSearchModal";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare, Hash, LayoutGrid, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceChatView({ project, workspace }: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const [mobileTab, setMobileTab] = useState<'sidebar' | 'chat'>('chat');
  const chat = useWorkspaceChat(project.id, workspace.userId);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Use refs to avoid stale closures in realtime callback
  const activeChannelRef = useRef(chat.activeChannel);
  const activeThreadRef = useRef(chat.activeThread);
  const setMessagesRef = useRef(chat.setMessages);
  const loadThreadRef = useRef(chat.loadThread);

  useEffect(() => { activeChannelRef.current = chat.activeChannel; }, [chat.activeChannel]);
  useEffect(() => { activeThreadRef.current = chat.activeThread; }, [chat.activeThread]);
  useEffect(() => { setMessagesRef.current = chat.setMessages; }, [chat.setMessages]);
  useEffect(() => { loadThreadRef.current = chat.loadThread; }, [chat.loadThread]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`ws_chat_${project.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "workspace_messages",
        filter: `project_id=eq.${project.id}`,
      }, (payload) => {
        const msg = payload.new as any;
        const currentChannel = activeChannelRef.current;
        const currentThread = activeThreadRef.current;

        if (currentChannel && msg.channel_name === currentChannel.name && !msg.thread_parent_id) {
          setMessagesRef.current(prev => {
            // Replace optimistic message
            const optimistic = prev.find(m => m.id.startsWith('opt_') && m.user_id === msg.user_id && m.content === msg.content);
            if (optimistic) {
              return prev.map(m => m.id === optimistic.id ? { ...m, ...msg, id: msg.id } : m);
            }
            // Skip if already present
            if (prev.some(m => m.id === msg.id)) {
              return prev;
            }
            return [...prev, msg];
          });
        }
        if (currentThread && msg.thread_parent_id === currentThread.id) {
          loadThreadRef.current(currentThread.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "workspace_messages",
        filter: `project_id=eq.${project.id}`,
      }, (payload) => {
        const msg = payload.new as any;
        setMessagesRef.current(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "workspace_messages",
        filter: `project_id=eq.${project.id}`,
      }, (payload) => {
        const oldMsg = payload.old as any;
        setMessagesRef.current(prev => prev.filter(m => m.id !== oldMsg.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id]);

  const handleOpenThread = (msg: any) => {
    chat.setActiveThread(msg);
    chat.loadThread(msg.id);
  };

  const handleRefresh = () => {
    if (chat.activeChannel) {
      chat.loadMessages(chat.activeChannel.name);
      chat.loadPinnedMessages(chat.activeChannel.name);
    }
  };

  const handleEditChannel = async (channelId: string, name: string, description?: string) => {
    const { error } = await (supabase as any)
      .from("workspace_channels")
      .update({ name, description: description || null })
      .eq("id", channelId);
    if (error) { toast.error("Błąd edycji kanału"); return; }
    toast.success("Kanał zaktualizowany");
    await chat.loadChannels();
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten kanał? Wszystkie wiadomości zostaną utracone.")) return;
    const { error } = await (supabase as any)
      .from("workspace_channels")
      .delete()
      .eq("id", channelId);
    if (error) { toast.error("Błąd usuwania kanału"); return; }
    toast.success("Kanał usunięty");
    chat.setActiveChannel(null);
    await chat.loadChannels();
  };

  if (chat.loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
      {/* Mobile tab switcher */}
      <div className="flex md:hidden border-b mb-2">
        <button
          className={cn("flex-1 py-2 text-xs font-medium text-center gap-1 flex items-center justify-center",
            mobileTab === 'sidebar' ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}
          onClick={() => setMobileTab('sidebar')}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Kanały
        </button>
        <button
          className={cn("flex-1 py-2 text-xs font-medium text-center gap-1 flex items-center justify-center",
            mobileTab === 'chat' ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}
          onClick={() => setMobileTab('chat')}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Czat
        </button>
        <button
          className="flex-1 py-2 text-xs font-medium text-center gap-1 flex items-center justify-center text-muted-foreground"
          onClick={() => setShowSearch(true)}
        >
          <Search className="h-3.5 w-3.5" /> Szukaj
        </button>
      </div>

      <div className="flex flex-1 rounded-xl border bg-card overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <ChatSidebar
            channels={chat.channels}
            activeChannel={chat.activeChannel}
            members={chat.members}
            memberStatuses={chat.memberStatuses}
            userId={workspace.userId}
            projectName={project.name}
            projectColor={project.color}
            onSelectChannel={ch => { chat.setActiveChannel(ch); chat.setActiveThread(null); }}
            onCreateChannel={async (name, type, desc, pIds) => {
              const ch = await chat.createChannel(name, type, desc, pIds);
              if (ch) { await chat.loadChannels(); chat.setActiveChannel(ch); }
              return ch;
            }}
            onCreateDM={async (uid, name) => {
              const dm = await chat.createOrGetDM(uid, name);
              if (dm) { await chat.loadChannels(); chat.setActiveChannel(dm); }
            }}
            onSearch={() => setShowSearch(true)}
            onStatusChange={chat.updateMyStatus}
            onEditChannel={handleEditChannel}
            onDeleteChannel={handleDeleteChannel}
          />
        </div>

        {/* Mobile sidebar */}
        {mobileTab === 'sidebar' && (
          <div className="flex md:hidden w-full">
            <ChatSidebar
              channels={chat.channels}
              activeChannel={chat.activeChannel}
              members={chat.members}
              memberStatuses={chat.memberStatuses}
              userId={workspace.userId}
              projectName={project.name}
              projectColor={project.color}
              onSelectChannel={ch => { chat.setActiveChannel(ch); chat.setActiveThread(null); setMobileTab('chat'); }}
              onCreateChannel={async (name, type, desc, pIds) => {
                const ch = await chat.createChannel(name, type, desc, pIds);
                if (ch) { await chat.loadChannels(); chat.setActiveChannel(ch); setMobileTab('chat'); }
                return ch;
              }}
              onCreateDM={async (uid, name) => {
                const dm = await chat.createOrGetDM(uid, name);
                if (dm) { await chat.loadChannels(); chat.setActiveChannel(dm); setMobileTab('chat'); }
              }}
              onSearch={() => setShowSearch(true)}
              onStatusChange={chat.updateMyStatus}
              onEditChannel={handleEditChannel}
              onDeleteChannel={handleDeleteChannel}
            />
          </div>
        )}

        {/* Chat area - hidden on mobile when sidebar is open */}
        <div className={cn("flex-1 flex", mobileTab === 'sidebar' && "hidden md:flex")}>
          <ChatMessageArea
            channel={chat.activeChannel}
            messages={chat.messages}
            pinnedMessages={chat.pinnedMessages}
            showPinned={chat.showPinned}
            onTogglePinned={chat.setShowPinned}
            members={chat.members}
            memberStatuses={chat.memberStatuses}
            userId={workspace.userId}
            projectId={project.id}
            onSend={chat.sendMessage}
            onEdit={chat.editMessage}
            onDelete={chat.deleteMessage}
            onReaction={async (msgId, emoji) => { await chat.toggleReaction(msgId, emoji); handleRefresh(); }}
            onPin={async (msgId, isPinned) => { await chat.togglePin(msgId, isPinned); handleRefresh(); }}
            onOpenThread={handleOpenThread}
            onRefresh={handleRefresh}
          />
        </div>

        {/* Thread panel */}
        {chat.activeThread && (
          <ChatThreadPanel
            parentMessage={chat.activeThread}
            threadMessages={chat.threadMessages}
            members={chat.members}
            userId={workspace.userId}
            onClose={() => chat.setActiveThread(null)}
            onSend={chat.sendMessage}
          />
        )}
      </div>

      <ChatSearchModal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSearch={chat.searchMessages}
        results={chat.searchResults}
        onSelectResult={msg => {
          const ch = chat.channels.find(c => c.name === msg.channel_name);
          if (ch) { chat.setActiveChannel(ch); setMobileTab('chat'); }
        }}
      />
    </div>
  );
}
