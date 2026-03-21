import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import {
  Loader2, Send, Plus, MessageCircle, Briefcase, Image,
  Trash2, Sparkles, X, Search, PanelLeftOpen, PanelLeftClose, Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ridoMascot from '@/assets/rido-mascot.png';

type MainMode = 'chat' | 'grafika' | 'cowork';
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; images?: string[]; }
interface Conv { id: string; title: string; mode: string; updated_at: string; }

const WELCOME: Record<string, string> = {
  chat: `Cześć! 👋 Jestem **RidoAI** – Twój inteligentny asystent.

Mogę Ci pomóc z:
• 💬 Pytania i rozmowy
• 🎨 Generowanie grafik — wystarczy napisać np. *"stwórz logo"*
• 🏠 Wyszukiwanie nieruchomości i usług
• 📄 Tworzenie treści i analiz

Po prostu napisz czego potrzebujesz!`,
  grafika: `🎨 **Tryb Grafika**

Opisz co chcesz wygenerować — np:
• *"Logo firmy transportowej w stylu minimalistycznym"*
• *"Baner reklamowy z samochodem na tle miasta"*
• *"Zdjęcie małpy w lesie z butelką"*`,
  cowork: '',
};

const IMAGE_PATTERNS = /(?:stwórz|wygeneruj|narysuj|zrób|zrob|stworz|stworzysz|namaluj|zaprojektuj|pokaż|pokaz|daj|make|create|draw|generate).{0,30}(?:obraz|grafik|logo|zdję|zdjecie|baner|ilustracj|ikona|ikonk|obrazek|plakat|rysunek|foto|image|picture|graphic)/i;

const parseAction = (text: string) => {
  const match = text.match(/ACTION:(\{.*?\})/s);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
};

interface RidoAIChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function RidoAIChatPanel({ open, onClose }: RidoAIChatPanelProps) {
  const navigate = useNavigate();
  const [mainMode, setMainMode] = useState<MainMode>('chat');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const { streamExecute, execute, isLoading } = useGetRidoAI();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUserId(data.user.id); });
  }, []);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const { data } = await (supabase as any)
      .from('ai_conversations').select('id,title,mode,updated_at')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(50);
    if (data) setConversations(data);
  }, [userId]);

  useEffect(() => { if (open) loadConversations(); }, [open, loadConversations]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const createConv = async (text: string, mode: string) => {
    if (!userId) return '';
    const { data } = await (supabase as any).from('ai_conversations')
      .insert({ user_id: userId, title: text.substring(0, 60), mode }).select().single();
    return data?.id || '';
  };

  const saveMsg = async (convId: string, msg: Msg) => {
    if (!userId || !convId) return;
    await (supabase as any).from('ai_messages').insert({
      conversation_id: convId, user_id: userId, role: msg.role, content: msg.content, images: msg.images || null
    });
    await (supabase as any).from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await (supabase as any).from('ai_conversations').delete().eq('id', convId);
    if (currentConvId === convId) handleNewChat();
    loadConversations();
  };

  const loadConversation = async (convId: string) => {
    const { data } = await (supabase as any).from('ai_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (data) setMessages(data.map((m: any) => ({ id: m.id, role: m.role, content: m.content, images: m.images })));
    setCurrentConvId(convId);
  };

  const handleNewChat = () => { setMessages([]); setCurrentConvId(null); setInput(''); };

  const switchMode = (mode: MainMode) => {
    setMainMode(mode);
    if (mode !== 'cowork') handleNewChat();
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg: Msg = { role: 'user', content: text };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');

    let convId = currentConvId;
    if (!convId) { convId = await createConv(text, mainMode); setCurrentConvId(convId); }
    await saveMsg(convId!, userMsg);

    // Auto-detect image requests in any mode
    const isImgMode = mainMode as string === 'grafika';
    const isImg = isImgMode || IMAGE_PATTERNS.test(text);

    if (isImg) {
      setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
      const result = await execute({ taskType: 'image', query: text, mode: 'rido_create', stream: false });
      const aMsg: Msg = { role: 'assistant', content: result?.result || '❌ Nie udało się wygenerować.', images: result?.images };
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = aMsg; return u; });
      await saveMsg(convId!, aMsg);
      loadConversations();
      return;
    }

    // Text chat with streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    let acc = '';
    const activeMode = mainMode === 'cowork' ? 'cowork' : mainMode === 'grafika' ? 'rido_create' : 'rido_chat';

    await streamExecute(
      { taskType: 'text', query: text, mode: activeMode, messages: newMsgs.map(m => ({ role: m.role, content: m.content })), stream: true },
      delta => {
        acc += delta;
        setMessages(prev => {
          const u = [...prev];
          u[u.length - 1] = { role: 'assistant', content: acc };
          return u;
        });
      },
      async () => {
        const aMsg: Msg = { role: 'assistant', content: acc };
        await saveMsg(convId!, aMsg);
        const action = parseAction(acc);
        if (action) {
          const routes: Record<string, string> = {
            CREATE_INVOICE: '/invoices/new', CREATE_TASK: '/tasks',
            FIND_SERVICE: '/services', SEARCH_PROPERTY: '/real-estate',
          };
          const path = action.params?.path || routes[action.type];
          if (path) navigate(path);
        }
        loadConversations();
      }
    );
  }, [input, isLoading, messages, mainMode, currentConvId, userId, streamExecute, execute, navigate, loadConversations]);

  const displayMsgs = messages.length === 0
    ? [{ role: 'assistant' as const, content: WELCOME[mainMode] || '' }]
    : messages;

  const filteredConvs = searchQuery
    ? conversations.filter(c => c.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  // Group by date
  const groupedConvs = (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const groups: { label: string; items: Conv[] }[] = [
      { label: 'Dzisiaj', items: [] },
      { label: 'Wczoraj', items: [] },
      { label: 'Wcześniej', items: [] },
    ];
    filteredConvs.forEach(c => {
      const d = new Date(c.updated_at); d.setHours(0, 0, 0, 0);
      if (d >= today) groups[0].items.push(c);
      else if (d >= yesterday) groups[1].items.push(c);
      else groups[2].items.push(c);
    });
    return groups.filter(g => g.items.length > 0);
  })();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-[720px] h-full flex bg-background shadow-2xl animate-in slide-in-from-right duration-300">

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-[240px] flex flex-col border-r bg-muted/30 flex-shrink-0">
            {/* New chat button */}
            <div className="p-3 border-b">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                className="w-full justify-start gap-2 h-9 text-xs font-medium rounded-lg"
              >
                <Plus className="h-3.5 w-3.5" />
                Nowa rozmowa
              </Button>
            </div>

            {/* Search */}
            <div className="px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Szukaj rozmów..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-background border border-border/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50 text-foreground transition-all"
                />
              </div>
            </div>

            {/* Conversations */}
            <ScrollArea className="flex-1">
              <div className="px-2 py-1 space-y-2">
                {groupedConvs.length === 0 && (
                  <div className="text-center py-12 px-4">
                    <MessageCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground/60">Brak rozmów</p>
                  </div>
                )}
                {groupedConvs.map(group => (
                  <div key={group.label}>
                    <p className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map(conv => (
                        <div
                          key={conv.id}
                          onClick={() => loadConversation(conv.id)}
                          className={cn(
                            'group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] transition-all',
                            currentConvId === conv.id
                              ? 'bg-primary/10 text-foreground font-semibold'
                              : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                          <span className="flex-1 min-w-0 truncate font-medium">{conv.title || 'Nowa rozmowa'}</span>
                          <button
                            onClick={(e) => deleteConversation(conv.id, e)}
                            className="p-1 hover:bg-destructive/10 rounded transition-all flex-shrink-0"
                            title="Usuń rozmowę"
                          >
                            <X className="h-3.5 w-3.5 text-destructive/70 hover:text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background/95 backdrop-blur-sm">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title={sidebarOpen ? 'Ukryj historię' : 'Pokaż historię'}
            >
              {sidebarOpen
                ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
                : <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
              }
            </button>

            <div className="relative">
              <img
                src={ridoMascot}
                alt="RidoAI"
                className="w-9 h-9 rounded-full object-cover bg-white border-2 border-foreground/10"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm flex items-center gap-1.5 tracking-tight">
                RidoAI
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </h3>
              <p className="text-[11px] text-muted-foreground font-medium">Asystent AI portalu GetRido</p>
            </div>

            <div className="flex items-center gap-0.5">
              <button onClick={handleNewChat} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Nowa rozmowa">
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Zamknij">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Mode tabs: Chat, Grafika, Cowork */}
          <div className="flex items-center justify-center px-4 py-2 border-b">
            <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
              {([
                { key: 'chat' as const, label: 'Chat', icon: MessageCircle },
                { key: 'grafika' as const, label: 'Grafika', icon: Image },
                { key: 'cowork' as const, label: 'Cowork', icon: Briefcase, locked: true },
              ]).map(({ key, label, icon: Icon, locked }) => (
                <button
                  key={key}
                  onClick={() => !locked && switchMode(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    mainMode === key && !locked
                      ? 'bg-background shadow-sm text-foreground'
                      : locked
                        ? 'text-muted-foreground/40 cursor-not-allowed'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  {locked ? <Lock className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cowork coming soon */}
          {mainMode === 'cowork' ? (
            <div className="flex-1 flex items-center justify-center px-8">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Briefcase className="h-8 w-8 text-primary/50" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Cowork — wkrótce!</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Tryb Cowork pozwoli Ci sterować portalem głosem i tekstem.
                    Wystawiaj faktury, szukaj usług, zarządzaj zadaniami — wszystko przez AI.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => switchMode('chat')} className="rounded-lg">
                  Wróć do chatu
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <ScrollArea ref={scrollRef} className="flex-1 px-5 py-5">
                <div className="space-y-5 max-w-lg mx-auto">
                  {displayMsgs.map((msg, i) => {
                    if (msg.role === 'assistant' && msg.content === '' && isLoading && i === displayMsgs.length - 1) return null;
                    return (
                      <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                        {msg.role === 'assistant' && (
                          <img
                            src={ridoMascot}
                            alt="AI"
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5 bg-white border-2 border-foreground/10"
                          />
                        )}
                        <div className={cn(
                          'max-w-[85%] text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm font-medium'
                            : 'bg-muted/50 rounded-2xl rounded-bl-sm px-4 py-3'
                        )}>
                          {msg.role === 'assistant' ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&>li]:mb-0.5 [&_strong]:text-foreground [&>p]:text-sm [&>p]:font-normal [&>li]:text-sm">
                              <ReactMarkdown>{(msg.content || '...').replace(/ACTION:\{.*?\}/s, '').replace(/IMAGE_REQUEST:true/g, '').trim()}</ReactMarkdown>
                              {msg.images?.map((img, idx) => (
                                <img key={idx} src={img} alt="Generated" className="rounded-xl max-w-full shadow-lg border border-border/50 mt-3" />
                              ))}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
                          )}
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[10px] font-bold text-primary">Ty</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  {isLoading && (
                    <div className="flex gap-3">
                      <img src={ridoMascot} alt="AI" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5 bg-white border-2 border-foreground/10" />
                      <div className="bg-muted/50 rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {[0, 150, 300].map(d => (
                            <span key={d} className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="px-4 py-3 border-t bg-background/95 backdrop-blur-sm">
                <div className="flex items-end gap-2 max-w-lg mx-auto">
                  <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder={
                      mainMode === 'grafika'
                        ? 'Opisz grafikę którą chcesz stworzyć...'
                        : 'Zadaj pytanie RidoAI...'
                    }
                    disabled={isLoading}
                    className="min-h-[44px] max-h-[120px] resize-none rounded-xl text-sm border-border/50 focus-visible:ring-primary/30"
                    rows={1}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    size="icon"
                    className="h-[44px] w-[44px] rounded-xl flex-shrink-0 shadow-sm"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/60 text-center mt-2 font-medium">
                  RidoAI • Sprawdzaj ważne informacje
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
