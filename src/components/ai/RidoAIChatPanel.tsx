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
  Trash2, Sparkles, X, Search, PanelLeftOpen, PanelLeftClose
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ridoMascot from '@/assets/rido-mascot.png';

type MainMode = 'chat' | 'cowork' | 'grafika';
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; images?: string[]; }
interface Conv { id: string; title: string; mode: string; updated_at: string; }

const WELCOME: Record<string, string> = {
  chat: 'Cześć! 👋 Jestem **RidoAI** – Twój inteligentny asystent.\n\nMogę pomóc Ci z pytaniami, zadaniami, analizami i wieloma innymi rzeczami. Po prostu napisz czego potrzebujesz!',
  cowork: 'Cześć! 👋 Jestem **RidoAI Cowork**.\n\nMówisz — ja działam w portalu.',
  grafika: 'Cześć! 🎨 Jestem **RidoAI Grafika**.\n\nNapisz co wygenerować.',
};

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
  const [activeMode, setActiveMode] = useState('rido_chat');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

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

  const loadConversation = async (convId: string) => {
    const { data } = await (supabase as any).from('ai_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (data) setMessages(data.map((m: any) => ({ id: m.id, role: m.role, content: m.content, images: m.images })));
    setCurrentConvId(convId);
  };

  const handleNewChat = () => { setMessages([]); setCurrentConvId(null); setInput(''); };

  const switchMode = (mode: MainMode) => {
    setMainMode(mode);
    setActiveMode(mode === 'cowork' ? 'cowork' : mode === 'grafika' ? 'rido_create' : 'rido_chat');
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

    const isImg = mainMode === 'grafika' ||
      /(?:stwórz|wygeneruj|narysuj|zrób).{0,20}(?:obraz|grafik|logo|zdję|baner|ilustracj)/i.test(text);

    if (isImg) {
      setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
      const result = await execute({ taskType: 'image', query: text, mode: 'rido_create', stream: false });
      const aMsg: Msg = { role: 'assistant', content: result?.result || 'Gotowe!', images: result?.images };
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = aMsg; return u; });
      await saveMsg(convId!, aMsg);
      loadConversations();
      return;
    }

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    let acc = '';
    await streamExecute(
      { taskType: 'text', query: text, mode: activeMode, messages: newMsgs.map(m => ({ role: m.role, content: m.content })), stream: true },
      delta => { acc += delta; setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: acc }; return u; }); },
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
  }, [input, isLoading, messages, mainMode, activeMode, currentConvId, userId, streamExecute, execute, navigate, loadConversations]);

  const displayMsgs = messages.length === 0 ? [{ role: 'assistant' as const, content: WELCOME[mainMode] }] : messages;

  const filteredConvs = searchQuery
    ? conversations.filter(c => c.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  // Group conversations by date
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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-2xl h-full flex bg-background border-l shadow-2xl animate-in slide-in-from-right duration-300">

        {/* Sidebar — conversation history */}
        {sidebarOpen && (
          <div className="w-64 flex flex-col border-r bg-muted/20 flex-shrink-0">
            {/* Sidebar header */}
            <div className="px-3 py-3 border-b flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleNewChat} className="flex-1 justify-start gap-2 text-xs h-8">
                <Plus className="h-3.5 w-3.5" />
                Nowa rozmowa
              </Button>
            </div>

            {/* Search */}
            <div className="px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Szukaj..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md bg-muted/50 border-0 outline-none focus:bg-muted placeholder:text-muted-foreground/60 text-foreground"
                />
              </div>
            </div>

            {/* Conversation list grouped */}
            <ScrollArea className="flex-1">
              <div className="px-2 py-1 space-y-3">
                {groupedConvs.length === 0 && (
                  <p className="text-center text-[10px] text-muted-foreground py-8">Brak rozmów</p>
                )}
                {groupedConvs.map(group => (
                  <div key={group.label}>
                    <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{group.label}</p>
                    {group.items.map(conv => (
                      <div
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        className={cn(
                          'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-xs transition-colors',
                          currentConvId === conv.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        )}
                      >
                        <MessageCircle className="h-3 w-3 flex-shrink-0" />
                        <span className="flex-1 min-w-0 truncate">{conv.title || 'Nowa rozmowa'}</span>
                        <button
                          onClick={async e => {
                            e.stopPropagation();
                            await (supabase as any).from('ai_conversations').delete().eq('id', conv.id);
                            if (currentConvId === conv.id) handleNewChat();
                            loadConversations();
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/10 rounded flex-shrink-0"
                        >
                          <Trash2 className="h-2.5 w-2.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title={sidebarOpen ? 'Ukryj historię' : 'Pokaż historię'}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" /> : <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />}
            </button>
            <img src={ridoMascot} alt="RidoAI" className="w-8 h-8 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                RidoAI
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </h3>
              <p className="text-[11px] text-muted-foreground">Asystent AI portalu GetRido</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleNewChat} className="p-2 rounded-lg hover:bg-muted" title="Nowa rozmowa">
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" title="Zamknij">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex items-center justify-center px-4 py-2 border-b bg-muted/20">
            <div className="flex items-center gap-0.5 bg-muted/60 rounded-full p-0.5">
              {([
                { key: 'chat' as const, label: 'Chat', icon: MessageCircle },
                { key: 'cowork' as const, label: 'Cowork', icon: Briefcase },
                { key: 'grafika' as const, label: 'Grafika', icon: Image },
              ]).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => switchMode(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    mainMode === key
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}>
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
            <div className="space-y-4">
              {displayMsgs.map((msg, i) => (
                <div key={i} className={cn('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  {msg.role === 'assistant' && (
                    <img src={ridoMascot} alt="AI" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-1" />
                  )}
                  <div className={cn(
                    'max-w-[85%] text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3.5 py-2'
                      : ''
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0">
                        <ReactMarkdown>{(msg.content || '...').replace(/ACTION:\{.*?\}/s, '').trim()}</ReactMarkdown>
                        {msg.images?.map((img, idx) => (
                          <img key={idx} src={img} alt="" className="rounded-xl max-w-full shadow-lg border border-border mt-2" />
                        ))}
                      </div>
                    ) : <p className="whitespace-pre-wrap">{msg.content}</p>}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-[9px] font-semibold text-primary">Ty</span>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.content === '' && (
                <div className="flex gap-2.5">
                  <img src={ridoMascot} alt="AI" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-1" />
                  <div className="flex items-center gap-1.5 py-2">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="px-4 py-3 border-t bg-background">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={
                  mainMode === 'cowork' ? 'Co zrobić w portalu?...'
                    : mainMode === 'grafika' ? 'Opisz grafikę...'
                      : 'Napisz wiadomość...'
                }
                disabled={isLoading}
                className="min-h-[40px] max-h-[100px] resize-none rounded-xl text-sm"
                rows={1}
              />
              <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon" className="h-[40px] w-[40px] rounded-xl flex-shrink-0">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              RidoAI • Sprawdzaj ważne informacje
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
