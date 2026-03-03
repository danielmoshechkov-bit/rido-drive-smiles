import { useState, useEffect, useRef, useCallback } from "react";
import { WorkspaceProject, WorkspaceMessage } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Paperclip, Mic, MicOff, Image, File, Hash, Plus, Pin, Download } from "lucide-react";
import { toast } from "sonner";

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceChatView({ project, workspace }: Props) {
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannel, setActiveChannel] = useState("general");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    loadData();
    // Realtime subscription
    const channel = supabase
      .channel(`workspace_messages_${project.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "workspace_messages",
        filter: `project_id=eq.${project.id}`,
      }, (payload) => {
        const msg = payload.new as WorkspaceMessage;
        if (msg.channel_name === activeChannel) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [project.id, activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadData = async () => {
    setLoading(true);
    const [msgs, chs] = await Promise.all([
      workspace.loadMessages(project.id, activeChannel),
      workspace.loadChannels(project.id),
    ]);
    setMessages(msgs);
    setChannels(chs);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const msg = await workspace.sendMessage(project.id, input.trim(), activeChannel);
    if (msg) {
      setInput("");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Plik za duży (max 20MB)");
      return;
    }

    const ext = file.name.split('.').pop();
    const path = `workspace/${project.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("workspace-files").upload(path, file);
    if (error) { toast.error("Błąd uploadu"); return; }

    const { data: urlData } = supabase.storage.from("workspace-files").getPublicUrl(path);
    const msgType = file.type.startsWith("image/") ? "image" : "file";

    await workspace.sendMessage(
      project.id,
      file.name,
      activeChannel,
      msgType,
      urlData.publicUrl,
      file.name,
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleRecording = async () => {
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
        const path = `workspace/${project.id}/audio-${Date.now()}.webm`;
        const { error } = await supabase.storage.from("workspace-files").upload(path, blob);
        if (error) { toast.error("Błąd uploadu audio"); return; }
        const { data: urlData } = supabase.storage.from("workspace-files").getPublicUrl(path);
        await workspace.sendMessage(project.id, "Wiadomość głosowa", activeChannel, "audio", urlData.publicUrl, "audio.webm");
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error("Brak dostępu do mikrofonu");
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    await workspace.createChannel(project.id, newChannelName.trim());
    setNewChannelName("");
    setShowNewChannel(false);
    const chs = await workspace.loadChannels(project.id);
    setChannels(chs);
  };

  const renderMessage = (msg: WorkspaceMessage) => {
    const isOwn = msg.user_id === workspace.userId;
    return (
      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          {!isOwn && (
            <p className="text-[10px] font-medium opacity-70 mb-0.5">{msg.user_name || 'Użytkownik'}</p>
          )}

          {msg.message_type === 'image' && msg.file_url && (
            <img src={msg.file_url} alt="" className="rounded-lg max-w-full mb-1 max-h-48 object-cover" />
          )}

          {msg.message_type === 'audio' && msg.file_url && (
            <audio controls src={msg.file_url} className="max-w-full mb-1" />
          )}

          {msg.message_type === 'file' && msg.file_url && (
            <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
              className={`flex items-center gap-2 mb-1 ${isOwn ? 'text-primary-foreground/80' : 'text-primary'}`}>
              <File className="h-4 w-4" />
              <span className="text-xs underline">{msg.file_name || 'Pobierz plik'}</span>
            </a>
          )}

          {msg.content && msg.message_type !== 'file' && (
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
          )}

          <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
            {new Date(msg.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-3 h-[500px]">
      {/* Channels sidebar */}
      <div className="w-48 shrink-0 bg-muted/30 rounded-lg p-2 space-y-1 hidden sm:block">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Kanały</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowNewChannel(!showNewChannel)}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {showNewChannel && (
          <div className="px-1 mb-2">
            <Input
              autoFocus
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              placeholder="Nazwa kanału"
              className="h-7 text-xs mb-1"
              onKeyDown={e => { if (e.key === 'Enter') handleCreateChannel(); }}
            />
            <Button size="sm" className="w-full h-6 text-xs" onClick={handleCreateChannel}>Utwórz</Button>
          </div>
        )}

        {[{ name: 'general' }, ...channels.filter((c: any) => c.name !== 'general')].map((ch: any) => (
          <button
            key={ch.name}
            className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-1.5 ${activeChannel === ch.name ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => { setActiveChannel(ch.name); }}
          >
            <Hash className="h-3.5 w-3.5" />
            {ch.name}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-background border rounded-lg overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Ładowanie...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Brak wiadomości w kanale #{activeChannel}</p>
              <p className="text-xs">Napisz pierwszą wiadomość!</p>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-3 flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className={`h-8 w-8 shrink-0 ${isRecording ? 'text-red-500 animate-pulse' : ''}`}
            onClick={toggleRecording}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Napisz wiadomość..."
            className="flex-1 h-9"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSend} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
