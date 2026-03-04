import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { Loader2, Send, Sparkles, RotateCcw, MessageCircle, Code, Palette, Eye, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIMode {
  key: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

const AI_MODES: AIMode[] = [
  { key: 'rido_chat', label: 'Chat', icon: MessageCircle, description: 'Ogólne pytania' },
  { key: 'rido_code', label: 'Code', icon: Code, description: 'Programowanie' },
  { key: 'rido_create', label: 'Create', icon: Palette, description: 'Kreacja wizualna' },
  { key: 'rido_vision', label: 'Vision', icon: Eye, description: 'Analiza obrazów' },
  { key: 'rido_pro', label: 'Pro', icon: Crown, description: 'Najwyższa jakość' },
];

const RIDO_AVATAR = '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png';

const WELCOME_MESSAGE = `Cześć! 👋 Jestem **RidoAI** – Twój inteligentny asystent.

Wybierz tryb pracy i napisz, czego potrzebujesz:
- 💬 **Chat** – pytania, pomoc, rozmowy
- 💻 **Code** – programowanie, debugowanie, strony
- 🎨 **Create** – grafiki, prompty wizualne, logo
- 👁 **Vision** – analiza obrazów i dokumentów
- 👑 **Pro** – najwyższa jakość, zaawansowane analizy

Po prostu napisz – ja dobiorę najlepszy model AI! 🚀`;

export function RidoAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: WELCOME_MESSAGE },
  ]);
  const [input, setInput] = useState('');
  const [activeMode, setActiveMode] = useState('rido_chat');
  const { streamExecute, isLoading } = useGetRidoAI();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    let accumulated = '';

    await streamExecute(
      {
        feature: 'ai_chat',
        taskType: 'text',
        query: text,
        mode: activeMode,
        messages: history.filter(m => m.role !== 'assistant' || m.content !== WELCOME_MESSAGE).map(m => ({ role: m.role, content: m.content })),
        stream: true,
      },
      (delta) => {
        accumulated += delta;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      },
      () => { /* done */ },
    );
  }, [input, isLoading, messages, streamExecute, activeMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGE }]);
    setInput('');
  };

  const currentMode = AI_MODES.find(m => m.key === activeMode) || AI_MODES[0];

  return (
    <Card className="flex flex-col h-[700px] overflow-hidden border-0 shadow-xl bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-background/80 backdrop-blur-sm">
        <div className="relative">
          <img src={RIDO_AVATAR} alt="RidoAI" className="w-10 h-10 rounded-full ring-2 ring-primary/20" />
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            RidoAI
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            Tryb: {currentMode.label} • {currentMode.description}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleReset} className="h-8 w-8" title="Nowa rozmowa">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-1 px-4 py-2 border-b bg-muted/30 overflow-x-auto">
        {AI_MODES.map((mode) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.key;
          return (
            <button
              key={mode.key}
              onClick={() => setActiveMode(mode.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-3 w-3" />
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
        <div className="space-y-4 max-w-2xl mx-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex items-end gap-2',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              {msg.role === 'assistant' && (
                <img src={RIDO_AVATAR} alt="RidoAI" className="w-7 h-7 rounded-full flex-shrink-0 mb-1" />
              )}

              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted rounded-bl-md'
                )}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:mb-1.5 [&>ol]:mb-1.5">
                    <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mb-1">
                  <span className="text-xs font-semibold text-primary">Ty</span>
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.content === '' && (
            <div className="flex items-end gap-2">
              <img src={RIDO_AVATAR} alt="RidoAI" className="w-7 h-7 rounded-full flex-shrink-0 mb-1" />
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t bg-background/80 backdrop-blur-sm">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Napisz do RidoAI (${currentMode.label})...`}
            disabled={isLoading}
            className="min-h-[44px] max-h-[120px] resize-none rounded-xl border-muted-foreground/20 focus-visible:ring-primary/30"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[44px] w-[44px] rounded-xl flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Rido AI • Tryb: {currentMode.label} • Inteligentny routing do najlepszego modelu
        </p>
      </div>
    </Card>
  );
}
