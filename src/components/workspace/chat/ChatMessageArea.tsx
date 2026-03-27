import { useState, useRef, useEffect } from "react";
import { ChatChannel, ChatMessage } from "@/hooks/useWorkspaceChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Send, Paperclip, Mic, MicOff, Smile, MessageSquare, 
  Pin, MoreHorizontal, File, Hash, Lock, Image as ImageIcon,
  Reply
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EMOJI_LIST = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏', '✅', '❌', '👀', '💯'];

interface Props {
  channel: ChatChannel | null;
  messages: ChatMessage[];
  members: any[];
  userId: string | null;
  projectId: string;
  onSend: (content: string, channelName: string, opts?: any) => Promise<any>;
  onReaction: (messageId: string, emoji: string) => Promise<void>;
  onPin: (messageId: string, isPinned: boolean) => Promise<void>;
  onOpenThread: (msg: ChatMessage) => void;
  onRefresh: () => void;
}

export function ChatMessageArea({ channel, messages, members, userId, projectId, onSend, onReaction, onPin, onOpenThread, onRefresh }: Props) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getMemberName = (member: any) => {
    if (member?.first_name) return `${member.first_name} ${member.last_name || ''}`.trim();
    return member?.display_name || member?.email || 'Użytkownik';
  };

  const getMemberByUserId = (uid: string) => members.find(m => m.user_id === uid);

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.map(p => p[0]).slice(0, 2).join('').toUpperCase();
  };

  // Filter members for @mention
  const filteredMentions = mentionQuery !== null
    ? members.filter(m => {
        const name = getMemberName(m).toLowerCase();
        return name.includes(mentionQuery.toLowerCase());
      }).slice(0, 5)
    : [];

  const handleInputChange = (val: string) => {
    setInput(val);
    // Check for @mention
    const lastAtIndex = val.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const afterAt = val.slice(lastAtIndex + 1);
      if (!afterAt.includes(' ')) {
        setMentionQuery(afterAt);
        return;
      }
    }
    setMentionQuery(null);
  };

  const insertMention = (member: any) => {
    const name = getMemberName(member);
    const lastAtIndex = input.lastIndexOf('@');
    const newInput = input.slice(0, lastAtIndex) + `@${name} `;
    setInput(newInput);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!input.trim() || !channel) return;
    await onSend(input.trim(), channel.name, { channelId: channel.id });
    setInput("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !channel) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("Max 20MB"); return; }

    const ext = file.name.split('.').pop();
    const path = `workspace/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("workspace-files").upload(path, file);
    if (error) { toast.error("Błąd uploadu"); return; }

    const { data: urlData } = supabase.storage.from("workspace-files").getPublicUrl(path);
    const msgType = file.type.startsWith("image/") ? "image" : "file";
    await onSend(file.name, channel.name, { messageType: msgType, fileUrl: urlData.publicUrl, fileName: file.name, channelId: channel.id });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleRecording = async () => {
    if (!channel) return;
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const path = `workspace/${projectId}/audio-${Date.now()}.webm`;
        const { error } = await supabase.storage.from("workspace-files").upload(path, blob);
        if (error) { toast.error("Błąd uploadu audio"); return; }
        const { data: urlData } = supabase.storage.from("workspace-files").getPublicUrl(path);
        await onSend("Wiadomość głosowa", channel.name, { messageType: "audio", fileUrl: urlData.publicUrl, fileName: "audio.webm", channelId: channel.id });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error("Brak dostępu do mikrofonu");
    }
  };

  const renderContent = (content: string | null) => {
    if (!content) return null;
    // Highlight @mentions
    const parts = content.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} className="bg-primary/20 text-primary rounded px-0.5 font-medium">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Wybierz kanał aby rozpocząć rozmowę</p>
      </div>
    );
  }

  const ChannelIcon = channel.type === 'private' ? Lock : channel.type === 'dm' ? MessageSquare : Hash;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Channel header */}
      <div className="h-12 border-b flex items-center gap-2 px-4 shrink-0">
        <ChannelIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">
          {channel.type === 'dm' ? channel.description?.replace('DM z ', '') : channel.name}
        </span>
        {channel.description && channel.type !== 'dm' && (
          <span className="text-xs text-muted-foreground ml-2 hidden md:inline">{channel.description}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
            const pinned = messages.filter(m => m.is_pinned);
            if (pinned.length === 0) toast.info("Brak przypiętych wiadomości");
          }}>
            <Pin className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ChannelIcon className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm font-medium">Początek konwersacji w #{channel.name}</p>
            <p className="text-xs">Napisz pierwszą wiadomość!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prevMsg = messages[idx - 1];
            const showHeader = !prevMsg || prevMsg.user_id !== msg.user_id || 
              (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 300000);
            const member = getMemberByUserId(msg.user_id);
            const displayName = msg.user_name || getMemberName(member) || 'Użytkownik';

            return (
              <div key={msg.id} className="group relative hover:bg-accent/30 rounded-lg px-2 py-0.5 -mx-2 transition-colors">
                {showHeader && (
                  <div className="flex items-center gap-2 mt-3 mb-0.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-sm">{displayName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.created_at).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                )}

                <div className={cn("pl-10", !showHeader && "")}>
                  {/* Message content */}
                  {msg.message_type === 'image' && msg.file_url && (
                    <img src={msg.file_url} alt="" className="rounded-lg max-w-sm max-h-64 object-cover mb-1 cursor-pointer hover:opacity-90" />
                  )}
                  {msg.message_type === 'audio' && msg.file_url && (
                    <audio controls src={msg.file_url} className="max-w-xs mb-1" />
                  )}
                  {msg.message_type === 'file' && msg.file_url && (
                    <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-muted rounded-lg px-3 py-2 text-xs hover:bg-muted/80 mb-1">
                      <File className="h-4 w-4 text-primary" />
                      <span>{msg.file_name || 'Plik'}</span>
                    </a>
                  )}
                  {msg.content && msg.message_type !== 'file' && (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{renderContent(msg.content)}</p>
                  )}

                  {/* Reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {msg.reactions.map(r => (
                        <button
                          key={r.emoji}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border transition-colors",
                            r.hasReacted ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-transparent hover:border-border"
                          )}
                          onClick={() => onReaction(msg.id, r.emoji)}
                        >
                          {r.emoji} <span className="font-medium">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Thread indicator */}
                  {(msg.thread_count ?? 0) > 0 && (
                    <button
                      className="flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                      onClick={() => onOpenThread(msg)}
                    >
                      <Reply className="h-3 w-3" />
                      {msg.thread_count} {msg.thread_count === 1 ? 'odpowiedź' : 'odpowiedzi'}
                    </button>
                  )}
                </div>

                {/* Hover actions */}
                <div className="absolute right-2 top-0 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-card border rounded-lg shadow-sm p-0.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <Smile className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" side="top">
                      <div className="flex gap-1 flex-wrap max-w-[200px]">
                        {EMOJI_LIST.map(e => (
                          <button key={e} className="text-lg hover:bg-accent rounded p-1 transition-colors"
                            onClick={() => { onReaction(msg.id, e); }}>
                            {e}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenThread(msg)}>
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPin(msg.id, msg.is_pinned)}>
                    <Pin className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-3 shrink-0">
        {/* Mention autocomplete */}
        {mentionQuery !== null && filteredMentions.length > 0 && (
          <div className="mb-2 bg-popover border rounded-lg shadow-lg p-1 max-h-40 overflow-y-auto">
            {filteredMentions.map((m, i) => (
              <button
                key={m.id}
                className={cn("w-full flex items-center gap-2 px-3 py-2 rounded text-sm", i === mentionIndex ? "bg-accent" : "hover:bg-accent/50")}
                onClick={() => insertMention(m)}
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">{getInitials(getMemberName(m))}</AvatarFallback>
                </Avatar>
                <span>{getMemberName(m)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className={cn("h-8 w-8 shrink-0", isRecording && "text-red-500 animate-pulse")}
            onClick={toggleRecording}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Input
            ref={inputRef}
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            placeholder={`Wiadomość w #${channel.type === 'dm' ? 'DM' : channel.name}...`}
            className="flex-1 h-9"
            onKeyDown={e => {
              if (mentionQuery !== null && filteredMentions.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentions[mentionIndex]); return; }
                if (e.key === 'Escape') { setMentionQuery(null); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSend} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
