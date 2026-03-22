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
  ArrowLeft, Trash2, ChevronRight, Sparkles,
  Paintbrush, RotateCcw, Download, X, Search, Settings, MoreHorizontal,
  Star, Pencil, FolderPlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const AVATAR = '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png';
type MainMode = 'chat' | 'cowork' | 'grafika';
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; images?: string[]; }
interface Conv { id: string; title: string; mode: string; updated_at: string; is_starred?: boolean; project_id?: string | null; }

const parseAction = (text: string) => {
  const match = text.match(/ACTION:(\{.*?\})/s);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
};

const executePortalAction = (action: any, navigate: (path: string) => void) => {
  if (!action) return;
  const routes: Record<string, string> = {
    CREATE_INVOICE: '/invoices/new',
    CREATE_TASK: '/tasks',
    FIND_SERVICE: '/services',
    SEARCH_PROPERTY: '/real-estate',
    BOOK_APPOINTMENT: '/services',
  };
  const path = action.params?.path || routes[action.type];
  if (path) navigate(path);
};

const WELCOME: Record<string, string> = {
  chat: 'Cześć! 👋 Jestem **RidoAI** – Twój asystent.\n\nJak mogę Ci pomóc?',
  cowork: 'Cześć! 👋 Jestem **RidoAI Cowork**.\n\nMówisz — ja działam w portalu:\n📄 Wystaw fakturę\n✅ Dodaj zadanie\n🏠 Znajdź nieruchomość\n✂️ Umów do fryzjera\n📧 Wyślij email\n\nCo chcesz zrobić?',
  grafika: 'Cześć! 🎨 Jestem **RidoAI Grafika**.\n\nNapisz co wygenerować.\nPo wygenerowaniu możesz **edytować pędzelkiem** dowolny obszar obrazu!',
};

export default function RidoAIChatPage() {
  const navigate = useNavigate();
  const [mainMode, setMainMode] = useState<MainMode>('chat');
  const [activeMode, setActiveMode] = useState('rido_chat');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectDialogConvId, setProjectDialogConvId] = useState<string | null>(null);

  // Image editor state
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [brushActive, setBrushActive] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  const { streamExecute, execute, isLoading } = useGetRidoAI();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUserId(data.user.id); });
  }, []);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const { data } = await (supabase as any)
      .from('ai_conversations').select('id,title,mode,updated_at,is_starred,project_id')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(50);
    if (data) setConversations(data);
  }, [userId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
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
        if (action) executePortalAction(action, navigate);
        loadConversations();
      }
    );
  }, [input, isLoading, messages, mainMode, activeMode, currentConvId, userId, streamExecute, execute, navigate, loadConversations]);

  // Image editor
  const openEditor = (src: string) => { setEditingImage(src); setBrushActive(false); setEditPrompt(''); };

  useEffect(() => {
    if (!editingImage || !canvasRef.current || !maskCanvasRef.current) return;
    const img = new window.Image();
    img.onload = () => {
      const w = Math.min(img.width, 680), h = (img.height / img.width) * w;
      [canvasRef.current!, maskCanvasRef.current!].forEach(c => { c.width = w; c.height = h; });
      canvasRef.current!.getContext('2d')!.drawImage(img, 0, 0, w, h);
      maskCanvasRef.current!.getContext('2d')!.clearRect(0, 0, w, h);
    };
    img.src = editingImage;
  }, [editingImage]);

  const onDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !brushActive || !maskCanvasRef.current) return;
    const rect = maskCanvasRef.current.getBoundingClientRect();
    const sx = maskCanvasRef.current.width / rect.width, sy = maskCanvasRef.current.height / rect.height;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    ctx.fillStyle = 'rgba(124,58,237,0.55)';
    ctx.beginPath(); ctx.arc((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy, 20, 0, Math.PI * 2); ctx.fill();
  };

  const applyEdit = async () => {
    if (!editPrompt || !canvasRef.current || !maskCanvasRef.current) return;
    const result = await execute({
      taskType: 'inpaint', query: editPrompt,
      imageBase64: canvasRef.current.toDataURL('image/png').split(',')[1],
      maskBase64: maskCanvasRef.current.toDataURL('image/png').split(',')[1],
    });
    if (result?.images?.[0]) { setEditingImage(result.images[0]); setEditPrompt(''); setBrushActive(false); }
  };

  const displayMsgs = messages.length === 0 ? [{ role: 'assistant' as const, content: WELCOME[mainMode] }] : messages;

  const filteredConversations = searchQuery
    ? conversations.filter(c => c.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  // Group conversations by date
  const today = new Date();
  const todayStr = today.toDateString();
  const yesterdayStr = new Date(today.getTime() - 86400000).toDateString();
  
  const grouped = filteredConversations.reduce<{ today: Conv[]; yesterday: Conv[]; older: Conv[] }>((acc, c) => {
    const d = new Date(c.updated_at).toDateString();
    if (d === todayStr) acc.today.push(c);
    else if (d === yesterdayStr) acc.yesterday.push(c);
    else acc.older.push(c);
    return acc;
  }, { today: [], yesterday: [], older: [] });

  return (
    <div className="h-[100dvh] flex bg-background overflow-hidden">
      {/* LEFT SIDEBAR — responsive */}
      <div
        className={cn(
          "flex-col border-r bg-muted/20 flex-shrink-0 min-w-0",
          "absolute md:relative inset-0 z-40 bg-background md:bg-muted/20",
          sidebarOpen ? "flex" : "hidden"
        )}
        style={{ width: '256px', minWidth: '256px', maxWidth: '256px', overflow: 'hidden' }}
      >
        {/* Sidebar header */}
        <div className="p-3 space-y-1 flex-shrink-0 min-w-0 border-b">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              <span className="truncate block">Nowa rozmowa</span>
            </button>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1.5 rounded-lg hover:bg-muted flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation links */}
        <div className="px-3 py-2 space-y-0.5 flex-shrink-0 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2.5 w-full min-w-0 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 flex-shrink-0" />
            <span className="truncate block">Wróć do portalu</span>
          </button>
        </div>

        {/* PROJEKTY — fixed, not scrolled */}
        <div className="flex-shrink-0 min-w-0 border-y bg-background/60">
          <div className="px-3 py-3 min-w-0">
            <div className="flex items-center justify-between mb-2 px-1 min-w-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Projekty</span>
            </div>
            {conversations.filter(c => c.project_id).length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-background px-3 py-6 text-center min-w-0">
                <FolderPlus className="h-7 w-7 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">Brak projektów</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[112px] overflow-y-auto min-w-0">
                {Array.from(new Set(conversations.filter(c => c.project_id).map(c => c.project_id!))).slice(0, 5).map(pid => (
                  <div key={pid} className="flex items-center gap-2 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs text-muted-foreground min-w-0 overflow-hidden">
                    <FolderPlus className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate block min-w-0 flex-1">Projekt</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 px-3 py-3 border-b min-w-0 bg-background/80">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Szukaj rozmów..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full min-w-0 pl-9 pr-3 py-2 text-sm rounded-full bg-muted/50 border border-border/50 outline-none focus:bg-muted placeholder:text-muted-foreground/60 text-foreground"
            />
          </div>
        </div>

        {/* KONWERSACJE — scrollable separately */}
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="px-2 py-2 min-w-0 overflow-hidden">
              {!searchQuery && filteredConversations.some(c => c.is_starred) && (
                <div className="mb-3 min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-[0.18em]">⭐ Ulubione</p>
                  {filteredConversations.filter(c => c.is_starred).map(conv => (
                    <ConvItem key={conv.id} conv={conv} active={currentConvId === conv.id}
                      onClick={() => { loadConversation(conv.id); setSidebarOpen(false); }}
                      onStar={async () => {
                        await (supabase as any).from('ai_conversations').update({ is_starred: !conv.is_starred }).eq('id', conv.id);
                        loadConversations();
                      }}
                      onRename={async (newTitle) => {
                        await (supabase as any).from('ai_conversations').update({ title: newTitle }).eq('id', conv.id);
                        loadConversations();
                      }}
                      onAddToProject={() => setProjectDialogConvId(conv.id)}
                      onDelete={async () => {
                        if (!window.confirm('Usunąć tę rozmowę?')) return;
                        await (supabase as any).from('ai_conversations').delete().eq('id', conv.id);
                        if (currentConvId === conv.id) handleNewChat();
                        loadConversations();
                      }} />
                  ))}
                </div>
              )}

              {grouped.today.length > 0 && (
                <div className="mb-3 min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-[0.18em]">Dzisiaj</p>
                  {grouped.today.filter(c => searchQuery || !c.is_starred).map(conv => (
                    <ConvItem key={conv.id} conv={conv} active={currentConvId === conv.id}
                      onClick={() => { loadConversation(conv.id); setSidebarOpen(false); }}
                      onStar={async () => {
                        await (supabase as any).from('ai_conversations').update({ is_starred: !conv.is_starred }).eq('id', conv.id);
                        loadConversations();
                      }}
                      onRename={async (newTitle) => {
                        await (supabase as any).from('ai_conversations').update({ title: newTitle }).eq('id', conv.id);
                        loadConversations();
                      }}
                      onAddToProject={() => setProjectDialogConvId(conv.id)}
                      onDelete={async () => {
                        if (!window.confirm('Usunąć tę rozmowę?')) return;
                        await (supabase as any).from('ai_conversations').delete().eq('id', conv.id);
                        if (currentConvId === conv.id) handleNewChat();
                        loadConversations();
                      }} />
                  ))}
                </div>
              )}

              {grouped.yesterday.length > 0 && (
                <div className="mb-3 min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-[0.18em]">Wczoraj</p>
                  {grouped.yesterday.filter(c => searchQuery || !c.is_starred).map(conv => (
                    <ConvItem key={conv.id} conv={conv} active={currentConvId === conv.id}
                      onClick={() => { loadConversation(conv.id); setSidebarOpen(false); }}
                      onStar={async () => {
                        await (supabase as any).from('ai_conversations').update({ is_starred: !conv.is_starred }).eq('id', conv.id);
                        loadConversations();
                      }}
                      onRename={async (newTitle) => {
                        await (supabase as any).from('ai_conversations').update({ title: newTitle }).eq('id', conv.id);
                        loadConversations();
                      }}
                      onAddToProject={() => setProjectDialogConvId(conv.id)}
                      onDelete={async () => {
                        if (!window.confirm('Usunąć tę rozmowę?')) return;
                        await (supabase as any).from('ai_conversations').delete().eq('id', conv.id);
                        if (currentConvId === conv.id) handleNewChat();
                        loadConversations();
                      }} />
                  ))}
                </div>
              )}

              {grouped.older.length > 0 && (
                <div className="mb-3 min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-[0.18em]">Wcześniej</p>
                  {grouped.older.filter(c => searchQuery || !c.is_starred).map(conv => (
                    <ConvItem key={conv.id} conv={conv} active={currentConvId === conv.id}
                      onClick={() => { loadConversation(conv.id); setSidebarOpen(false); }}
                      onStar={async () => {
                        await (supabase as any).from('ai_conversations').update({ is_starred: !conv.is_starred }).eq('id', conv.id);
                        loadConversations();
                      }}
                      onRename={async (newTitle) => {
                        await (supabase as any).from('ai_conversations').update({ title: newTitle }).eq('id', conv.id);
                        loadConversations();
                      }}
                      onAddToProject={() => setProjectDialogConvId(conv.id)}
                      onDelete={async () => {
                        if (!window.confirm('Usunąć tę rozmowę?')) return;
                        await (supabase as any).from('ai_conversations').delete().eq('id', conv.id);
                        if (currentConvId === conv.id) handleNewChat();
                        loadConversations();
                      }} />
                  ))}
                </div>
              )}

              {filteredConversations.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  {searchQuery ? 'Brak wyników' : 'Brak rozmów'}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP BAR with centered tabs */}
        <div className="flex items-center justify-center px-4 py-2 border-b bg-background relative">
          {/* Left: sidebar toggle + model name */}
          <div className="absolute left-2 md:left-4 flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title={sidebarOpen ? 'Ukryj panel' : 'Pokaż panel'}
            >
              <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            <div className="hidden md:flex items-center gap-1.5">
              <img src={AVATAR} alt="RidoAI" className="w-6 h-6 rounded-full" />
              <span className="text-sm font-medium text-muted-foreground">RidoAI</span>
            </div>
          </div>

          {/* Center: Mode tabs */}
          <div className="flex items-center gap-0.5 bg-muted/60 rounded-full p-0.5">
            {([
              { key: 'chat' as const, label: 'Chat', icon: MessageCircle },
              { key: 'cowork' as const, label: 'Cowork', icon: Briefcase },
              { key: 'grafika' as const, label: 'Grafika', icon: Image },
            ]).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => switchMode(key)}
                className={cn(
                  'flex items-center gap-1 md:gap-1.5 px-2.5 md:px-4 py-1.5 rounded-full text-xs md:text-sm font-medium transition-all',
                  mainMode === key
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* CHAT AREA */}
        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea ref={scrollRef} className="flex-1 px-4 py-6">
            <div className="space-y-5 max-w-3xl mx-auto">
              {displayMsgs.map((msg, i) => (
                <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  {msg.role === 'assistant' && (
                    <img src={AVATAR} alt="AI" className="w-7 h-7 rounded-full flex-shrink-0 mt-1" />
                  )}
                  <div className={cn(
                    'max-w-[75%] text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5'
                      : ''
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&_strong]:font-semibold">
                        <ReactMarkdown>{(msg.content || '...').replace(/ACTION:\{.*?\}/s, '').trim()}</ReactMarkdown>
                        {msg.images?.map((img, idx) => (
                          <div key={idx} className="mt-3 relative group/img">
                            <img src={img} alt={`Grafika ${idx + 1}`} className="rounded-xl max-w-full shadow-lg border border-border cursor-pointer" onClick={() => openEditor(img)} />
                            <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
                              <button onClick={() => openEditor(img)} className="flex items-center gap-1 bg-background/90 backdrop-blur text-xs px-2.5 py-1.5 rounded-full shadow border font-medium hover:bg-muted">
                                <Paintbrush className="h-3 w-3" /> Edytuj
                              </button>
                              <button onClick={() => { const a = document.createElement('a'); a.href = img; a.download = 'rido.png'; a.click(); }}
                                className="bg-background/90 backdrop-blur text-xs px-2.5 py-1.5 rounded-full shadow border hover:bg-muted">
                                <Download className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="whitespace-pre-wrap">{msg.content}</p>}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-[10px] font-semibold text-primary">Ty</span>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.content === '' && (
                <div className="flex gap-3">
                  <img src={AVATAR} alt="AI" className="w-7 h-7 rounded-full flex-shrink-0 mt-1" />
                  <div className="flex items-center gap-1.5 py-2">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="px-4 py-3 border-t bg-background" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              <Textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={
                  mainMode === 'cowork' ? 'Co zrobić? np. "wystaw fakturę na 500 zł"...'
                    : mainMode === 'grafika' ? 'Opisz grafikę którą chcesz stworzyć...'
                      : 'Napisz wiadomość...'
                }
                disabled={isLoading}
                className="min-h-[44px] max-h-[120px] resize-none rounded-xl text-base md:text-sm"
                style={{ fontSize: '16px' }}
                rows={1}
              />
              <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon" className="h-[44px] w-[44px] rounded-xl flex-shrink-0">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              RidoAI może się mylić • Sprawdzaj ważne informacje
            </p>
          </div>
        </div>
      </div>

      {/* IMAGE EDITOR OVERLAY */}
      {editingImage && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b bg-background shadow-sm flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src={AVATAR} alt="" className="w-7 h-7 rounded-full" />
              <span className="font-semibold text-sm">Edytor grafiki RidoAI</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setBrushActive(!brushActive)}
                className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                  brushActive ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border')}>
                <Paintbrush className="h-3.5 w-3.5" />
                {brushActive ? 'Pędzel włączony' : 'Włącz pędzel'}
              </button>
              {brushActive && (
                <button onClick={() => { const c = maskCanvasRef.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height); }}
                  className="p-2 rounded-xl hover:bg-muted border" title="Wyczyść">
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => { const a = document.createElement('a'); a.href = editingImage; a.download = 'rido.png'; a.click(); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm hover:bg-muted border">
                <Download className="h-4 w-4" /> Pobierz
              </button>
              <button onClick={() => setEditingImage(null)} className="p-2 rounded-xl hover:bg-muted border">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-start justify-center p-6">
            <div className="relative inline-block shadow-2xl rounded-2xl overflow-hidden border border-border">
              <canvas ref={canvasRef} className="block max-w-full" style={{ touchAction: 'none' }} />
              <canvas ref={maskCanvasRef}
                className={cn('absolute inset-0 w-full h-full', brushActive ? 'cursor-crosshair' : 'pointer-events-none')}
                style={{ touchAction: 'none' }}
                onMouseDown={() => setIsDrawing(true)} onMouseUp={() => setIsDrawing(false)}
                onMouseLeave={() => setIsDrawing(false)} onMouseMove={onDraw} />
              {brushActive && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground text-xs px-3 py-1.5 rounded-full pointer-events-none">
                  🖌️ Zamaluj obszar który chcesz zmienić
                </div>
              )}
            </div>
          </div>
          <div className="px-5 py-4 border-t bg-background flex-shrink-0">
            <div className="max-w-2xl mx-auto flex items-end gap-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1.5">
                  {brushActive ? '✏️ Opisz co zmienić w zaznaczonym miejscu:' : '💡 Włącz pędzel i zamaluj obszar który chcesz zmienić'}
                </p>
                <Textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)}
                  placeholder='np. "zmień kolor ściany na niebieski", "dodaj okno", "usuń tło"'
                  disabled={!brushActive || isLoading}
                  className="resize-none rounded-xl text-sm min-h-[44px]" rows={1}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && brushActive) { e.preventDefault(); applyEdit(); } }} />
              </div>
              <Button onClick={applyEdit} disabled={!editPrompt.trim() || !brushActive || isLoading} className="h-[44px] px-5 rounded-xl gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Zastosuj
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add to project dialog */}
      <AddToProjectDialog
        convId={projectDialogConvId}
        userId={userId}
        onClose={() => setProjectDialogConvId(null)}
        onDone={() => { setProjectDialogConvId(null); loadConversations(); }}
      />
    </div>
  );
}

/* Add to project dialog */
function AddToProjectDialog({ convId, userId, onClose, onDone }: {
  convId: string | null; userId: string | null; onClose: () => void; onDone: () => void;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!convId || !userId) return;
    (supabase as any).from('workspace_projects').select('id,name')
      .eq('owner_user_id', userId).order('name').then(({ data }: any) => {
        if (data) setProjects(data);
      });
  }, [convId, userId]);

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const assignProject = async (projectId: string) => {
    if (!convId) return;
    await (supabase as any).from('ai_conversations').update({ project_id: projectId }).eq('id', convId);
    onDone();
  };

  const createAndAssign = async () => {
    if (!newName.trim() || !userId || !convId) return;
    const { data } = await (supabase as any).from('workspace_projects')
      .insert({ name: newName.trim(), owner_user_id: userId, status: 'active' }).select().single();
    if (data) {
      await (supabase as any).from('workspace_project_members')
        .insert({ project_id: data.id, user_id: userId, role: 'owner' });
      await assignProject(data.id);
    }
  };

  return (
    <Dialog open={!!convId} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dodaj do projektu</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Wybierz projekt, do którego chcesz przypisać tę rozmowę.</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj lub utwórz projekt..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="max-h-[240px] overflow-auto space-y-1">
          {filtered.map(p => (
            <button key={p.id} onClick={() => assignProject(p.id)}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-sm text-left">
              <FolderPlus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {filtered.length === 0 && !creating && (
            <p className="text-center text-xs text-muted-foreground py-4">Brak projektów</p>
          )}
        </div>
        {!creating ? (
          <Button variant="outline" size="sm" onClick={() => { setCreating(true); setNewName(search); }} className="w-full gap-2">
            <Plus className="h-4 w-4" /> Nowy projekt
          </Button>
        ) : (
          <div className="flex gap-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nazwa projektu..." autoFocus
              onKeyDown={e => { if (e.key === 'Enter') createAndAssign(); }} />
            <Button onClick={createAndAssign} disabled={!newName.trim()} size="sm">Utwórz</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* Conversation list item component */
function ConvItem({ conv, active, onClick, onStar, onRename, onAddToProject, onDelete }: {
  conv: Conv; active: boolean; onClick: () => void;
  onStar: () => void; onRename: (title: string) => void;
  onAddToProject: () => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conv.title || '');

  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 w-full min-w-0 overflow-hidden">
        <input
          autoFocus
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onRename(renameValue); setRenaming(false); }
            if (e.key === 'Escape') setRenaming(false);
          }}
          onBlur={() => { onRename(renameValue); setRenaming(false); }}
          className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg bg-muted border border-border outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    );
  }

  const showMenu = hovered || menuOpen;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors w-full min-w-0 overflow-hidden',
        active ? 'bg-primary text-primary-foreground font-medium' : 'text-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {conv.is_starred && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />}
      <span
        className="block min-w-0 flex-1"
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '13px',
        }}
      >
        {conv.title || 'Nowa rozmowa'}
      </span>
      <div
        className="flex-shrink-0"
        style={{
          width: '24px',
          marginLeft: '4px',
          opacity: showMenu ? 1 : 0,
          pointerEvents: showMenu ? 'auto' : 'none',
          transition: 'opacity 0.15s',
        }}
      >
        <DropdownMenu onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); }}
              className={cn(
                'p-1 rounded-lg transition-colors',
                active ? 'hover:bg-primary-foreground/20' : 'hover:bg-muted'
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]" onClick={e => e.stopPropagation()}>
            <DropdownMenuItem onClick={onStar}>
              <Star className={cn('h-4 w-4 mr-2', conv.is_starred && 'fill-yellow-400 text-yellow-400')} />
              {conv.is_starred ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setRenameValue(conv.title || ''); setRenaming(true); }}>
              <Pencil className="h-4 w-4 mr-2" />
              Zmień nazwę
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddToProject}>
              <FolderPlus className="h-4 w-4 mr-2" />
              Dodaj do projektu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Usuń
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
