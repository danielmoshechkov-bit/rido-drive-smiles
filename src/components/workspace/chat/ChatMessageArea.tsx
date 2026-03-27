import { useState, useRef, useEffect, useMemo, useCallback, Fragment } from "react";
import { ChatChannel, ChatMessage, UserStatus } from "@/hooks/useWorkspaceChat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Send, Paperclip, Mic, MicOff, Smile, MessageSquare,
  Pin, PinOff, MoreHorizontal, File, Hash, Lock, Reply,
  Pencil, Trash2, X, Check, Upload, Code, Bold, Italic,
  Globe, Loader2, Eye, EyeOff, Crown
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMessageTranslation, SUPPORTED_LANGUAGES } from "@/hooks/useMessageTranslation";

const EMOJI_LIST = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏', '✅', '❌', '👀', '💯'];

interface Props {
  channel: ChatChannel | null;
  messages: ChatMessage[];
  pinnedMessages: ChatMessage[];
  showPinned: boolean;
  onTogglePinned: (v: boolean) => void;
  members: any[];
  memberStatuses: Record<string, UserStatus>;
  userId: string | null;
  projectId: string;
  onSend: (content: string, channelName: string, opts?: any) => Promise<any>;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onReaction: (messageId: string, emoji: string) => Promise<void>;
  onPin: (messageId: string, isPinned: boolean) => Promise<void>;
  onOpenThread: (msg: ChatMessage) => void;
  onRefresh: () => void;
}

// Format text: *bold*, _italic_, `code`, ```code blocks```
function formatText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by code blocks first
  const codeBlockRegex = /```([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  const processInline = (str: string, keyPrefix: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    const inlineRegex = /(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(@\S+)|(#\d+)/g;
    let idx = 0;
    let m;
    while ((m = inlineRegex.exec(str)) !== null) {
      if (m.index > idx) result.push(<span key={`${keyPrefix}-t${idx}`}>{str.slice(idx, m.index)}</span>);
      if (m[2]) result.push(<strong key={`${keyPrefix}-b${m.index}`} className="font-bold">{m[2]}</strong>);
      else if (m[4]) result.push(<em key={`${keyPrefix}-i${m.index}`} className="italic">{m[4]}</em>);
      else if (m[6]) result.push(<code key={`${keyPrefix}-c${m.index}`} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{m[6]}</code>);
      else if (m[0].startsWith('@')) result.push(<span key={`${keyPrefix}-m${m.index}`} className="bg-primary/20 text-primary rounded px-0.5 font-medium">{m[0]}</span>);
      else if (m[0].startsWith('#')) result.push(<span key={`${keyPrefix}-h${m.index}`} className="bg-accent text-accent-foreground rounded px-0.5 font-medium cursor-pointer hover:underline">{m[0]}</span>);
      idx = m.index + m[0].length;
    }
    if (idx < str.length) result.push(<span key={`${keyPrefix}-e`}>{str.slice(idx)}</span>);
    return result;
  };

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...processInline(text.slice(lastIndex, match.index), `pre-${lastIndex}`));
    }
    nodes.push(
      <pre key={`cb-${match.index}`} className="bg-muted rounded-lg p-2 my-1 text-xs font-mono overflow-x-auto whitespace-pre">
        {match[1].trim()}
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(...processInline(text.slice(lastIndex), `post-${lastIndex}`));
  }
  return nodes;
}

export function ChatMessageArea({
  channel, messages, pinnedMessages, showPinned, onTogglePinned,
  members, memberStatuses, userId, projectId,
  onSend, onEdit, onDelete, onReaction, onPin, onOpenThread, onRefresh
}: Props) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [myLanguage, setMyLanguage] = useState(() => {
    const browserLang = navigator.language?.slice(0, 2) || 'pl';
    return SUPPORTED_LANGUAGES.find(l => l.code === browserLang)?.code || 'pl';
  });
  const [isPremium] = useState(true); // TODO: check actual plan
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const translation = useMessageTranslation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getMemberName = (member: any) => {
    if (member?.first_name) return `${member.first_name} ${member.last_name || ''}`.trim();
    return member?.display_name || member?.email || 'Użytkownik';
  };
  const getMemberByUserId = (uid: string) => members.find(m => m.user_id === uid);
  const getInitials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const filteredMentions = mentionQuery !== null
    ? members.filter(m => getMemberName(m).toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const handleInputChange = (val: string) => {
    setInput(val);
    const lastAtIndex = val.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const afterAt = val.slice(lastAtIndex + 1);
      if (!afterAt.includes(' ')) { setMentionQuery(afterAt); return; }
    }
    setMentionQuery(null);
  };

  const insertMention = (member: any) => {
    const name = getMemberName(member);
    const lastAtIndex = input.lastIndexOf('@');
    setInput(input.slice(0, lastAtIndex) + `@${name} `);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    if (!input.trim() || !channel) return;
    await onSend(input.trim(), channel.name, { channelId: channel.id });
    setInput("");
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleFileUpload = async (file: globalThis.File) => {
    if (!channel) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("Max 20MB"); return; }
    const ext = file.name.split('.').pop();
    const path = `workspace/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("workspace-files").upload(path, file);
    if (error) { toast.error("Błąd uploadu"); return; }
    const { data: urlData } = supabase.storage.from("workspace-files").getPublicUrl(path);
    const msgType = file.type.startsWith("image/") ? "image" : "file";
    await onSend(file.name, channel.name, { messageType: msgType, fileUrl: urlData.publicUrl, fileName: file.name, channelId: channel.id });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag & Drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(f => handleFileUpload(f));
  }, [channel, projectId]);

  const toggleRecording = async () => {
    if (!channel) return;
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
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
    } catch { toast.error("Brak dostępu do mikrofonu"); }
  };

  const startEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditContent(msg.content || "");
  };

  const saveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    await onEdit(editingId, editContent.trim());
    setEditingId(null);
    setEditContent("");
  };

  const getStatusIndicator = (uid: string) => {
    const s = memberStatuses[uid];
    if (!s) return null;
    const colors: Record<string, string> = {
      available: "bg-green-500",
      away: "bg-yellow-500",
      dnd: "bg-red-500",
      offline: "bg-gray-400",
    };
    return <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card", colors[s.status] || "bg-gray-400")} />;
  };

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Wybierz kanał</p>
          <p className="text-xs">aby rozpocząć rozmowę</p>
        </div>
      </div>
    );
  }

  const ChannelIcon = channel.type === 'private' ? Lock : channel.type === 'dm' ? MessageSquare : Hash;

  return (
    <div
      className={cn("flex-1 flex flex-col h-full overflow-hidden relative", isDragOver && "ring-2 ring-primary ring-inset")}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-primary/10 flex items-center justify-center pointer-events-none">
          <div className="bg-card border-2 border-dashed border-primary rounded-xl p-8 text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">Upuść plik tutaj</p>
          </div>
        </div>
      )}

      {/* Channel header */}
      <div className="h-12 border-b flex items-center gap-2 px-4 shrink-0 bg-card">
        <ChannelIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">
          {channel.type === 'dm' ? channel.description?.replace('DM z ', '') : channel.name}
        </span>
        {channel.description && channel.type !== 'dm' && (
          <span className="text-xs text-muted-foreground ml-2 hidden md:inline">{channel.description}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={showPinned ? "secondary" : "ghost"}
            size="icon" className="h-7 w-7"
            onClick={() => onTogglePinned(!showPinned)}
          >
            <Pin className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Pinned messages bar */}
      {showPinned && pinnedMessages.length > 0 && (
        <div className="border-b bg-muted/30 px-4 py-2 max-h-40 overflow-y-auto">
          <div className="flex items-center gap-1 mb-1.5">
            <Pin className="h-3 w-3 text-primary" />
            <span className="text-xs font-semibold text-primary">Przypięte ({pinnedMessages.length})</span>
          </div>
          {pinnedMessages.map(pm => (
            <div key={pm.id} className="flex items-center gap-2 py-1 text-xs">
              <span className="font-medium truncate flex-1">{pm.content?.slice(0, 80)}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => onPin(pm.id, true)}>
                <PinOff className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ChannelIcon className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-sm font-medium">Początek konwersacji w #{channel.name}</p>
            <p className="text-xs">Napisz pierwszą wiadomość!</p>
            <div className="mt-4 text-xs space-y-0.5 text-center opacity-60">
              <p><strong>*bold*</strong> · <em>_italic_</em> · <code className="bg-muted px-1 rounded">`code`</code></p>
              <p>@wzmianka · #123 link do zadania</p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prevMsg = messages[idx - 1];
            const showHeader = !prevMsg || prevMsg.user_id !== msg.user_id ||
              (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 300000);
            const member = getMemberByUserId(msg.user_id);
            const displayName = msg.user_name || getMemberName(member) || 'Użytkownik';
            const isOwn = msg.user_id === userId;
            const isEditing = editingId === msg.id;

            return (
              <div key={msg.id} className="group relative hover:bg-accent/20 rounded-lg px-2 py-0.5 -mx-2 transition-colors">
                {showHeader && (
                  <div className="flex items-center gap-2 mt-3 mb-0.5">
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(displayName)}</AvatarFallback>
                      </Avatar>
                      {getStatusIndicator(msg.user_id)}
                    </div>
                    <span className="font-semibold text-sm">{displayName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.created_at).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </span>
                    {msg.is_edited && <span className="text-[10px] text-muted-foreground italic">(edytowano)</span>}
                    {msg.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                  </div>
                )}

                <div className="pl-10">
                  {isEditing ? (
                    <div className="space-y-1">
                      <Textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        className="min-h-[60px] text-sm"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                          if (e.key === 'Escape') { setEditingId(null); }
                        }}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" /> Anuluj
                        </Button>
                        <Button size="sm" className="h-6 text-xs gap-1" onClick={saveEdit}>
                          <Check className="h-3 w-3" /> Zapisz
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                      {msg.content && msg.message_type !== 'file' && (() => {
                        const tr = translation.getTranslation(msg.id, myLanguage);
                        const isLoadingTr = translation.isLoading(msg.id, myLanguage);
                        const showOrig = translation.isShowingOriginal(msg.id);
                        const displayText = (tr && !showOrig) ? tr.translated_text : msg.content;
                        const srcLang = tr?.source_language;
                        const srcLabel = SUPPORTED_LANGUAGES.find(l => l.code === srcLang);

                        return (
                          <div>
                            <div className="text-sm whitespace-pre-wrap leading-relaxed">
                              {formatText(displayText)}
                            </div>
                            {tr && (
                              <div className="flex items-center gap-2 mt-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Globe className="h-3 w-3" />
                                        Przetłumaczono{srcLabel ? ` z ${srcLabel.flag} ${srcLabel.label}` : ''}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Auto-tłumaczenie Premium 🌍</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <button
                                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                                  onClick={() => translation.toggleOriginal(msg.id)}
                                >
                                  {showOrig ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  {showOrig ? 'Pokaż tłumaczenie' : 'Pokaż oryginał'}
                                </button>
                              </div>
                            )}
                            {isLoadingTr && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Tłumaczenie...
                              </span>
                            )}
                          </div>
                        );
                      })()}

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
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="inline-flex items-center text-xs rounded-full px-1.5 py-0.5 border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-border transition-colors">
                                <Smile className="h-3 w-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" side="top">
                              <div className="flex gap-1 flex-wrap max-w-[200px]">
                                {EMOJI_LIST.map(e => (
                                  <button key={e} className="text-lg hover:bg-accent rounded p-1 transition-colors"
                                    onClick={() => onReaction(msg.id, e)}>{e}</button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      {/* Thread */}
                      {(msg.thread_count ?? 0) > 0 && (
                        <button className="flex items-center gap-1 mt-1 text-xs text-primary hover:underline" onClick={() => onOpenThread(msg)}>
                          <Reply className="h-3 w-3" />
                          {msg.thread_count} {msg.thread_count === 1 ? 'odpowiedź' : 'odpowiedzi'}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Hover toolbar */}
                {!isEditing && (
                  <div className="absolute right-2 top-0 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-card border rounded-lg shadow-sm p-0.5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6"><Smile className="h-3.5 w-3.5" /></Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" side="top">
                        <div className="flex gap-1 flex-wrap max-w-[200px]">
                          {EMOJI_LIST.map(e => (
                            <button key={e} className="text-lg hover:bg-accent rounded p-1 transition-colors"
                              onClick={() => onReaction(msg.id, e)}>{e}</button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenThread(msg)}>
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPin(msg.id, msg.is_pinned)}>
                      {msg.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </Button>
                    {isOwn && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => startEdit(msg)} className="gap-2 text-xs">
                            <Pencil className="h-3 w-3" /> Edytuj
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDelete(msg.id)} className="gap-2 text-xs text-destructive">
                            <Trash2 className="h-3 w-3" /> Usuń
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 shrink-0 bg-card">
        {mentionQuery !== null && filteredMentions.length > 0 && (
          <div className="mb-2 bg-popover border rounded-lg shadow-lg p-1 max-h-40 overflow-y-auto">
            {filteredMentions.map((m, i) => (
              <button
                key={m.id}
                className={cn("w-full flex items-center gap-2 px-3 py-2 rounded text-sm", i === mentionIndex ? "bg-accent" : "hover:bg-accent/50")}
                onClick={() => insertMention(m)}
              >
                <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{getInitials(getMemberName(m))}</AvatarFallback></Avatar>
                <span>{getMemberName(m)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Formatting hints */}
        <div className="hidden md:flex items-center gap-3 mb-1.5 px-1">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Bold className="h-2.5 w-2.5" /> *bold*</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Italic className="h-2.5 w-2.5" /> _italic_</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Code className="h-2.5 w-2.5" /> `code`</span>
        </div>

        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInputChange} />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className={cn("h-8 w-8 shrink-0", isRecording && "text-destructive animate-pulse")}
            onClick={toggleRecording}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            placeholder={`Wiadomość w #${channel.type === 'dm' ? 'DM' : channel.name}...`}
            className="flex-1 min-h-[36px] max-h-[120px] resize-none text-sm py-2"
            rows={1}
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
