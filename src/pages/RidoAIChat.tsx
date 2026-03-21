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
  ArrowLeft, History, Trash2, ChevronRight, Sparkles,
  Paintbrush, RotateCcw, Download, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AVATAR = '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png';
type MainMode = 'chat' | 'cowork' | 'grafika';
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; images?: string[]; }
interface Conv { id: string; title: string; mode: string; updated_at: string; }

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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
      .from('ai_conversations').select('id,title,mode,updated_at')
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
    setHistoryOpen(false);
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

    // Text streaming
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

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src={AVATAR} alt="RidoAI" className="w-8 h-8 rounded-full" />
            <span className="font-bold text-sm">RidoAI</span>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>

          {/* Mode switcher — Chat / Cowork / Grafika */}
          <div className="flex items-center gap-1 bg-muted rounded-full p-1">
            {([
              { key: 'chat' as const, label: 'Chat', icon: MessageCircle },
              { key: 'cowork' as const, label: 'Cowork', icon: Briefcase },
              { key: 'grafika' as const, label: 'Grafika', icon: Image },
            ]).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => switchMode(key)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                  mainMode === key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setHistoryOpen(!historyOpen)}
            className={cn('p-2 rounded-lg hover:bg-muted transition-colors', historyOpen && 'bg-muted')} title="Historia">
            <History className="h-4 w-4" />
          </button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleNewChat}>
            <Plus className="h-3.5 w-3.5" /> Nowa
          </Button>
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* HISTORY SIDEBAR */}
        {historyOpen && (
          <div className="w-72 border-r bg-muted/20 flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Historia rozmów</h3>
              <button onClick={() => setHistoryOpen(false)} className="p-1 hover:bg-muted rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ScrollArea className="flex-1">
              {conversations.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Brak historii rozmów</p>}
              {conversations.map(conv => (
                <div key={conv.id} onClick={() => loadConversation(conv.id)}
                  className={cn('flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer group hover:bg-muted mx-2 my-0.5', currentConvId === conv.id && 'bg-primary/10')}>
                  <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.title || 'Nowa rozmowa'}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(conv.updated_at).toLocaleDateString('pl-PL')}</p>
                  </div>
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    await (supabase as any).from('ai_conversations').delete().eq('id', conv.id);
                    if (currentConvId === conv.id) handleNewChat();
                    loadConversations();
                  }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-all">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        {/* CHAT AREA */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
            <div className="space-y-4 max-w-3xl mx-auto">
              {displayMsgs.map((msg, i) => (
                <div key={i} className={cn('flex items-end gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  {msg.role === 'assistant' && <img src={AVATAR} alt="AI" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" />}
                  <div className={cn('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md')}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0">
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
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mb-1">
                      <span className="text-xs font-semibold text-primary">Ty</span>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.content === '' && (
                <div className="flex items-end gap-2">
                  <img src={AVATAR} alt="AI" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" />
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {[0, 150, 300].map(d => <span key={d} className={`w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce`} style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="px-4 py-3 border-t bg-background/80 backdrop-blur-sm">
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              <Textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={mainMode === 'cowork' ? 'Co zrobić? np. "wystaw fakturę na 500 zł dla Jana Kowalskiego"...' : mainMode === 'grafika' ? 'Opisz grafikę którą chcesz stworzyć...' : 'Napisz wiadomość...'}
                disabled={isLoading} className="min-h-[44px] max-h-[120px] resize-none rounded-xl text-sm" rows={1} />
              <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon" className="h-[44px] w-[44px] rounded-xl flex-shrink-0">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              {mainMode === 'cowork' ? 'Cowork — RidoAI wykonuje akcje w portalu' : 'RidoAI może się mylić • Sprawdzaj ważne informacje'}
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
              <canvas ref={canvasRef} className="block max-w-full" />
              <canvas ref={maskCanvasRef}
                className={cn('absolute inset-0 w-full h-full', brushActive ? 'cursor-crosshair' : 'pointer-events-none')}
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
    </div>
  );
}
