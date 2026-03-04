import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { Loader2, Send, Sparkles, RotateCcw, MessageCircle, Code, Palette, Eye, Crown, Image, Video, ArrowLeft, Mic, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 image URLs
}

interface AIMode {
  key: string;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

const AI_MODES: AIMode[] = [
  { key: 'rido_chat', label: 'Chat', icon: MessageCircle, description: 'Ogólne pytania i rozmowy', color: 'from-blue-500 to-blue-600' },
  { key: 'rido_code', label: 'Code', icon: Code, description: 'Programowanie i debugowanie', color: 'from-emerald-500 to-emerald-600' },
  { key: 'rido_create', label: 'Grafika', icon: Image, description: 'Generowanie obrazów i grafik', color: 'from-pink-500 to-rose-500' },
  { key: 'rido_vision', label: 'Vision', icon: Eye, description: 'Analiza obrazów i dokumentów', color: 'from-amber-500 to-orange-500' },
  { key: 'rido_pro', label: 'Pro', icon: Crown, description: 'Najwyższa jakość odpowiedzi', color: 'from-purple-500 to-violet-600' },
  { key: 'rido_meeting', label: 'Meeting AI', icon: Mic, description: 'Asystent spotkań', color: 'from-red-500 to-rose-600' },
  { key: 'rido_mail', label: 'Mail AI', icon: Mail, description: 'Asystent poczty email', color: 'from-teal-500 to-cyan-600' },
];

const RIDO_AVATAR = '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png';

const WELCOME_MESSAGE = `Cześć! 👋 Jestem **RidoAI** – Twój inteligentny asystent.

Jak mogę Ci dzisiaj pomóc? Mogę:
🔍 Odpowiadać na pytania
📝 Generować treści i opisy
🎨 **Tworzyć grafiki i obrazy**
📊 Analizować dane
💡 Podpowiadać rozwiązania

Po prostu napisz, czego potrzebujesz!`;

export default function RidoAIChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: WELCOME_MESSAGE },
  ]);
  const [input, setInput] = useState('');
  const [activeMode, setActiveMode] = useState('rido_chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { streamExecute, execute, isLoading } = useGetRidoAI();
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

    // Detect if user wants image generation
    const isImageRequest = activeMode === 'rido_create' || 
      /(?:stwórz|wygeneruj|zrób|narysuj|generuj|create|generate|draw|make).{0,20}(?:grafik|obraz|logo|zdję|image|picture|icon|baner|banner|ilustracj|photo)/i.test(text) ||
      /(?:grafik|obraz|logo|image|picture|baner|banner|ilustracj).{0,20}(?:stwórz|wygeneruj|zrób|narysuj|generuj|create|generate|draw|make)/i.test(text);

    if (isImageRequest) {
      // Image generation mode
      setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
      
      try {
        const result = await execute({
          feature: 'ai_image',
          taskType: 'image',
          query: text,
          mode: 'rido_create',
          stream: false,
        });

        if (result?.images && result.images.length > 0) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { 
              role: 'assistant', 
              content: result.result || 'Oto Twoja grafika! 🎨',
              images: result.images,
            };
            return updated;
          });
        } else {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { 
              role: 'assistant', 
              content: result?.result || 'Przepraszam, nie udało się wygenerować grafiki. Spróbuj ponownie.',
            };
            return updated;
          });
        }
      } catch {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { 
            role: 'assistant', 
            content: 'Wystąpił błąd przy generowaniu grafiki. Spróbuj ponownie.',
          };
          return updated;
        });
      }
      return;
    }

    // Text streaming mode
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
      () => {},
    );
  }, [input, isLoading, messages, streamExecute, execute, activeMode]);

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
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "flex-shrink-0 border-r bg-muted/30 transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        {/* Sidebar Header */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3">
            <img src={RIDO_AVATAR} alt="RidoAI" className="w-10 h-10 rounded-full" />
            <div>
              <h2 className="font-bold text-sm flex items-center gap-1">
                RidoAI <Sparkles className="h-3.5 w-3.5 text-primary" />
              </h2>
              <p className="text-[11px] text-muted-foreground">Twój asystent AI</p>
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">
            Wybierz tryb
          </p>
          {AI_MODES.map((mode) => {
            const Icon = mode.icon;
            const isActive = activeMode === mode.key;
            return (
              <button
                key={mode.key}
                onClick={() => mode.key === 'rido_meeting' ? navigate('/meetings') : mode.key === 'rido_mail' ? navigate('/mail') : setActiveMode(mode.key)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "hover:bg-accent text-foreground"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  isActive ? "bg-primary-foreground/20" : "bg-muted"
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-[13px]">{mode.label}</p>
                  <p className={cn(
                    "text-[10px] truncate",
                    isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>{mode.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-2" />
            Powrót
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-background/80 backdrop-blur-sm">
          <button 
            className="md:hidden p-1.5 rounded-lg hover:bg-muted" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <MessageCircle className="h-5 w-5" />
          </button>
          <div className="relative">
            <img src={RIDO_AVATAR} alt="RidoAI" className="w-10 h-10 rounded-full ring-2 ring-primary/20" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm flex items-center gap-1.5">
              RidoAI
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </h3>
            <p className="text-xs text-muted-foreground">
              Twój asystent AI • {currentMode.label}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleReset} className="h-8 w-8" title="Nowa rozmowa">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-end gap-2',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                {msg.role === 'assistant' && (
                  <img src={RIDO_AVATAR} alt="RidoAI" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" />
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
                      {msg.images && msg.images.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.images.map((img, idx) => (
                            <img 
                              key={idx} 
                              src={img} 
                              alt={`Wygenerowana grafika ${idx + 1}`} 
                              className="rounded-xl max-w-full shadow-lg border border-border"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mb-1">
                    <span className="text-xs font-semibold text-primary">Ty</span>
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex items-end gap-2">
                <img src={RIDO_AVATAR} alt="RidoAI" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" />
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
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Napisz wiadomość do RidoAI...`}
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
            RidoAI może popełniać błędy. Sprawdzaj ważne informacje.
          </p>
        </div>
      </div>
    </div>
  );
}
