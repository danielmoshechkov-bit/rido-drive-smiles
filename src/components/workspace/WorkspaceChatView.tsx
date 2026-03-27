import { useState, useEffect } from "react";
import { WorkspaceProject } from "@/hooks/useWorkspace";
import { useWorkspaceChat } from "@/hooks/useWorkspaceChat";
import { ChatSidebar } from "./chat/ChatSidebar";
import { ChatMessageArea } from "./chat/ChatMessageArea";
import { ChatThreadPanel } from "./chat/ChatThreadPanel";
import { ChatSearchModal } from "./chat/ChatSearchModal";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceChatView({ project, workspace }: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const chat = useWorkspaceChat(project.id, workspace.userId);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Realtime subscription
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
        if (chat.activeChannel && msg.channel_name === chat.activeChannel.name && !msg.thread_parent_id) {
          chat.setMessages(prev => [...prev, msg]);
        }
        if (chat.activeThread && msg.thread_parent_id === chat.activeThread.id) {
          chat.loadThread(chat.activeThread.id);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [project.id, chat.activeChannel?.name, chat.activeThread?.id]);

  const handleOpenThread = (msg: any) => {
    chat.setActiveThread(msg);
    chat.loadThread(msg.id);
  };

  const handleRefresh = () => {
    if (chat.activeChannel) {
      chat.loadMessages(chat.activeChannel.name);
    }
  };

  if (chat.loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[600px] rounded-xl border bg-card overflow-hidden">
      {/* Sidebar with channels/DMs */}
      <div className="hidden md:flex">
        <ChatSidebar
          channels={chat.channels}
          activeChannel={chat.activeChannel}
          members={chat.members}
          userId={workspace.userId}
          onSelectChannel={(ch) => {
            chat.setActiveChannel(ch);
            chat.setActiveThread(null);
          }}
          onCreateChannel={chat.createChannel}
          onCreateDM={async (uid, name) => {
            const dm = await chat.createOrGetDM(uid, name);
            if (dm) {
              await chat.loadChannels();
              chat.setActiveChannel(dm);
            }
          }}
          onSearch={() => setShowSearch(true)}
        />
      </div>

      {/* Main message area */}
      <ChatMessageArea
        channel={chat.activeChannel}
        messages={chat.messages}
        members={chat.members}
        userId={workspace.userId}
        projectId={project.id}
        onSend={chat.sendMessage}
        onReaction={async (msgId, emoji) => {
          await chat.toggleReaction(msgId, emoji);
          handleRefresh();
        }}
        onPin={async (msgId, isPinned) => {
          await chat.togglePin(msgId, isPinned);
          handleRefresh();
        }}
        onOpenThread={handleOpenThread}
        onRefresh={handleRefresh}
      />

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

      {/* Search modal */}
      <ChatSearchModal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSearch={chat.searchMessages}
        results={chat.searchResults}
        onSelectResult={(msg) => {
          const ch = chat.channels.find(c => c.name === msg.channel_name);
          if (ch) chat.setActiveChannel(ch);
        }}
      />
    </div>
  );
}
