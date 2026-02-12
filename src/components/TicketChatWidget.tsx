import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  screenshots?: string[];
}

const TicketChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Cześć! Opisz problem, który napotkałeś na portalu. Możesz dodać screenshot (przeciągnij lub kliknij 📎).' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingScreenshots, setPendingScreenshots] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setChecking(false);
      return;
    }
    const { data } = await supabase
      .from('ticket_chat_whitelist')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();
    setHasAccess(!!data);
    setChecking(false);
  };

  const handleFileUpload = async (files: FileList) => {
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('ticket-screenshots').upload(path, file);
      if (error) {
        toast.error(`Błąd uploadu: ${file.name}`);
        continue;
      }
      const { data: { publicUrl } } = supabase.storage.from('ticket-screenshots').getPublicUrl(path);
      urls.push(publicUrl);
    }
    setPendingScreenshots((prev) => [...prev, ...urls]);
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files);
  };

  const sendMessage = async () => {
    if (!input.trim() && pendingScreenshots.length === 0) return;
    const description = input.trim();
    const screenshots = [...pendingScreenshots];

    const userMsg: ChatMessage = { role: 'user', content: description, screenshots };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPendingScreenshots([]);
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke('ticket-ai-chat', {
        body: { description, screenshot_urls: screenshots },
      });
      const result = resp.data;
      if (resp.error) throw new Error(resp.error.message || 'Błąd');
      if (result?.error) throw new Error(result.error);
      setMessages((prev) => [...prev, { role: 'assistant', content: result.message }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Błąd: ${e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  if (checking || !hasAccess) return null;

  return (
    <>
      <div className="fixed bottom-6 left-6 z-50">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="w-12 h-12 rounded-full shadow-lg bg-primary hover:bg-primary/90"
          size="icon"
        >
          {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        </Button>
      </div>

      {isOpen && (
        <div className="fixed bottom-20 left-6 z-40 w-80 sm:w-96">
          <Card
            className="flex flex-col h-[420px] shadow-xl border"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* Header */}
            <div className="p-3 border-b bg-primary/5">
              <h3 className="font-semibold text-sm">🐛 Zgłoś problem</h3>
              <p className="text-[10px] text-muted-foreground">Opisz bug i dodaj screenshot</p>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.screenshots?.map((url, j) => (
                      <img key={j} src={url} alt="" className="mt-2 rounded border max-h-32 w-auto" />
                    ))}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Pending screenshots */}
            {pendingScreenshots.length > 0 && (
              <div className="px-3 flex gap-1 overflow-x-auto">
                {pendingScreenshots.map((url, i) => (
                  <img key={i} src={url} className="h-10 w-auto rounded border" alt="" />
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-2 border-t flex gap-1 items-end">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Opisz problem..."
                className="min-h-[36px] max-h-20 text-xs resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={sendMessage}
                disabled={sending || (!input.trim() && pendingScreenshots.length === 0)}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default TicketChatWidget;
