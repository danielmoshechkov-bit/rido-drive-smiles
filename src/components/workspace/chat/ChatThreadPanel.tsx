import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/hooks/useWorkspaceChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { X, Send } from "lucide-react";

interface Props {
  parentMessage: ChatMessage;
  threadMessages: ChatMessage[];
  members: any[];
  userId: string | null;
  onClose: () => void;
  onSend: (content: string, channelName: string, opts?: any) => Promise<any>;
}

export function ChatThreadPanel({ parentMessage, threadMessages, members, userId, onClose, onSend }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const getMemberName = (uid: string) => {
    const m = members.find(mem => mem.user_id === uid);
    if (m?.first_name) return `${m.first_name} ${m.last_name || ''}`.trim();
    return m?.display_name || m?.email || 'Użytkownik';
  };

  const getInitials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const handleSend = async () => {
    if (!input.trim()) return;
    await onSend(input.trim(), parentMessage.channel_name, {
      threadParentId: parentMessage.id,
      channelId: parentMessage.channel_id,
    });
    setInput("");
  };

  const renderMsg = (msg: ChatMessage) => {
    const name = msg.user_name || getMemberName(msg.user_id);
    return (
      <div key={msg.id} className="px-3 py-2 hover:bg-accent/30 rounded">
        <div className="flex items-center gap-2 mb-0.5">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{getInitials(name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold">{name}</span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(msg.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-sm pl-8 whitespace-pre-wrap">{msg.content}</p>
      </div>
    );
  };

  return (
    <div className="w-80 border-l flex flex-col h-full bg-card">
      <div className="h-12 border-b flex items-center justify-between px-3 shrink-0">
        <span className="font-semibold text-sm">Wątek</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Parent message */}
        <div className="bg-muted/50 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">
                {getInitials(parentMessage.user_name || getMemberName(parentMessage.user_id))}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold">{parentMessage.user_name || getMemberName(parentMessage.user_id)}</span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{parentMessage.content}</p>
        </div>

        <div className="border-t my-2" />
        <p className="text-xs text-muted-foreground px-2 mb-1">{threadMessages.length} odpowiedzi</p>

        {threadMessages.map(renderMsg)}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex items-center gap-2 shrink-0">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Odpowiedz w wątku..."
          className="flex-1 h-8 text-sm"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <Button size="icon" className="h-8 w-8" onClick={handleSend} disabled={!input.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
