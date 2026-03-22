import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import {
  Loader2, Send, Plus, MessageCircle, Briefcase,
  Sparkles, X, Search, Lock,
  Download, Paintbrush, Paperclip, FileText, Trash2, MoreHorizontal,
  ChevronLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ridoMascot from '@/assets/rido-mascot.png';
import { AIProjectsSection } from './AIProjectsSection';
import { ImageEditorMobile } from './ImageEditorMobile';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

type MainMode = 'chat' | 'grafika' | 'cowork';
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; images?: string[]; files?: { name: string; type: string }[]; }
interface Conv { id: string; title: string; mode: string; updated_at: string; is_starred?: boolean; project_id?: string | null; }

const WELCOME: Record<string, string> = {
  chat: `Cześć! 👋 Jestem **RidoAI** – Twój inteligentny asystent.\n\nMogę Ci pomóc z:\n• 💬 Pytania i rozmowy\n• 🎨 Generowanie grafik\n• 🏠 Wyszukiwanie nieruchomości i usług\n• 📄 Tworzenie treści i analiz\n\nPo prostu napisz czego potrzebujesz!`,
  grafika: `🎨 **Tryb Grafika**\n\nOpisz co chcesz wygenerować.`,
  cowork: '',
};

const IMAGE_PATTERNS = /(?:stw[oó]rz|wygeneruj|narysuj|zr[oó]b|stworzysz|namaluj|zaprojektuj|poka[zż]|daj|make|create|draw|generate|zrob|stworz|pokaz|wygenerować|narysowaĆ).{0,40}(?:obraz|grafik|logo|zdj[eę]|zdjecie|baner|ilustracj|ikona|ikonk|obrazek|plakat|rysunek|foto|image|picture|graphic|goryl|banana|kot|pies|samoch[oó]d|krajobraz)/i;
const WEATHER_PATTERNS = /(?:pogod|weather|forecast|temperatur|meteo|klimat|температур|погод|прогноз)/i;

const parseAction = (text: string) => {
  const match = text.match(/ACTION:(\{.*?\})/s);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
};

const IMAGE_REPLY_VARIANTS = {
  create: ['Gotowe — przygotowałem grafikę.', 'Jasne, oto przygotowany obraz.', 'Grafika jest gotowa.'],
  edit: ['Gotowe — wprowadziłem zmiany.', 'Zmiany zostały naniesione.', 'Obraz został zaktualizowany.'],
} as const;
const pickImageReply = (type: keyof typeof IMAGE_REPLY_VARIANTS) => {
  const v = IMAGE_REPLY_VARIANTS[type];
  return v[Math.floor(Math.random() * v.length)];
};

const MAX_CONV_TITLE_WORDS = 2;
const MAX_CONV_TITLE_CHARS = 18;
const CONVERSATION_TITLE_STOPWORDS = new Set([
  'a','aby','albo','ale','bo','co','czy','dla','do','gdzie','i','ile','jak','jaka','jaki','jakie',
  'jest','kiedy','mam','mi','na','nad','nie','o','od','oraz','po','pod','proszę','sie','się','ten',
  'to','tu','w','we','za','z','ze'
]);

function formatConversationTitle(title?: string | null) {
  const normalized = (title || '').replace(/\s+/g, ' ').replace(/[?!.,:;()\[\]{}"']/g, ' ').replace(/[\n\r]+/g, ' ').trim();
  if (!normalized) return 'Nowa rozmowa';
  const allWords = normalized.split(' ').map(w => w.trim()).filter(Boolean);
  const keywordWords = allWords.filter(w => !CONVERSATION_TITLE_STOPWORDS.has(w.toLowerCase()));
  const shortWords = (keywordWords.length ? keywordWords : allWords).slice(0, MAX_CONV_TITLE_WORDS).join(' ');
  return shortWords.length > MAX_CONV_TITLE_CHARS ? `${shortWords.slice(0, MAX_CONV_TITLE_CHARS - 1).trimEnd()}…` : shortWords;
}

const QUICK_REPLIES = [
  'Jak wystawić fakturę?',
  'Pokaż moje leady',
  'Jak dodać usługę?',
  'Uruchom AI Agenta',
  'Pomoc z KSeF',
];

interface RidoAIChatPanelProps {
  open: boolean;
  onClose: () => void;
}

type AnnotationTool = 'brush' | 'ellipse' | 'rectangle';

export function RidoAIChatPanel({ open, onClose }: RidoAIChatPanelProps) {
  const navigate = useNavigate();
  const [mainMode, setMainMode] = useState<MainMode>('chat');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [projectPickerConvId, setProjectPickerConvId] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [newProjectInline, setNewProjectInline] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mobile: which view is active
  const [activeView, setActiveView] = useState<'list' | 'chat'>('list');
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);

  // Image editor state
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);


  const { streamExecute, execute, isLoading } = useGetRidoAI();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, [open]);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const { data } = await (supabase as any)
      .from('ai_conversations').select('id,title,mode,updated_at,is_starred,project_id')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(50);
    if (data) {
      setConversations(data.map((c: Conv) => ({ ...c, title: formatConversationTitle(c.title) })));
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) loadConversations();
  }, [open, userId, loadConversations]);

  useEffect(() => { scrollToBottom(); }, [messages, currentConvId, open, scrollToBottom]);

  // ── Data operations ──
  const createConv = async (text: string, mode: string): Promise<string> => {
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data?.user?.id || null;
      if (uid) setUserId(uid);
    }
    if (!uid) return '';
    const { data, error } = await (supabase as any).from('ai_conversations')
      .insert({ user_id: uid, title: formatConversationTitle(text) || 'Nowa rozmowa', mode }).select().single();
    if (error) return '';
    return data?.id || '';
  };

  const saveMsg = async (convId: string, msg: Msg) => {
    if (!convId) return;
    let uid = userId;
    if (!uid) { const { data } = await supabase.auth.getUser(); uid = data?.user?.id || null; }
    if (!uid) return;
    await (supabase as any).from('ai_messages').insert({
      conversation_id: convId, user_id: uid, role: msg.role, content: msg.content,
      images: msg.role === 'assistant' ? (msg.images || null) : null
    });
    await (supabase as any).from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!window.confirm('Usunąć tę rozmowę?')) return;
    await (supabase as any).from('ai_messages').delete().eq('conversation_id', convId);
    await (supabase as any).from('ai_conversations').delete().eq('id', convId);
    if (currentConvId === convId) handleNewChat();
    loadConversations();
  };

  const toggleStar = async (convId: string) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    await (supabase as any).from('ai_conversations').update({ is_starred: !conv.is_starred }).eq('id', convId);
    loadConversations();
  };

  const renameConversation = async (convId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    await (supabase as any).from('ai_conversations').update({ title: newTitle.trim() }).eq('id', convId);
    setRenamingConvId(null);
    loadConversations();
  };

  const openProjectPicker = async (convId: string) => {
    setProjectPickerConvId(convId);
    const { data } = await (supabase as any).from('workspace_projects').select('id,name,color').order('updated_at', { ascending: false });
    setProjectsList(data || []);
  };

  const assignToProject = async (convId: string, projectId: string | null) => {
    await (supabase as any).from('ai_conversations').update({ project_id: projectId }).eq('id', convId);
    setProjectPickerConvId(null);
    setNewProjectInline(false);
    setNewProjectName('');
    loadConversations();
    toast.success(projectId ? 'Dodano do projektu' : 'Usunięto z projektu');
  };

  const createProjectInPicker = async () => {
    if (!newProjectName.trim() || !userId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('workspace_projects').insert({ name: newProjectName.trim(), owner_user_id: userId, status: 'active' })
        .select('id,name,color').single();
      if (error) throw error;
      await (supabase as any).from('workspace_project_members').insert({ project_id: data.id, user_id: userId, role: 'owner' });
      setProjectsList(prev => [data, ...prev]);
      if (projectPickerConvId) await assignToProject(projectPickerConvId, data.id);
      toast.success(`Projekt "${data.name}" utworzony`);
    } catch { toast.error('Nie udało się utworzyć projektu'); }
  };

  const loadConversation = async (convId: string) => {
    const { data } = await (supabase as any).from('ai_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (data) setMessages(data.map((m: any) => ({ id: m.id, role: m.role, content: m.content, images: m.images })));
    setCurrentConvId(convId);
    setActiveView('chat');
    setTimeout(scrollToBottom, 50);
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentConvId(null);
    setInput('');
    setAttachedFiles([]);
    setActiveView('chat');
  };

  const switchMode = (mode: MainMode) => {
    setMainMode(mode);
    if (mode !== 'cowork') handleNewChat();
  };

  // ── Files ──
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    setAttachedFiles(prev => [...prev, ...Array.from(files).slice(0, 5)].slice(0, 5));
  };
  const removeFile = (idx: number) => setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  const readFileAsBase64 = (file: File): Promise<string> => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
  const readFileAsDataUrl = (file: File): Promise<string> => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  const readFileAsText = (file: File): Promise<string> => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsText(file); });
  const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); };
  const openAttachedImageEditor = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    try { const dataUrl = await readFileAsDataUrl(file); openEditor(dataUrl); } catch {}
  };

  // ── Send ──
  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || isLoading) return;
    const fileNames = attachedFiles.map(f => f.name);
    const contentWithFiles = fileNames.length > 0 ? `${text}\n\n📎 Załączniki: ${fileNames.join(', ')}` : text;

    let fileContents: { name: string; type: string; data?: string; text?: string }[] = [];
    let attachmentPreviewImages: string[] = [];
    for (const file of attachedFiles) {
      try {
        if (file.type.startsWith('image/')) {
          const b64 = await readFileAsBase64(file);
          fileContents.push({ name: file.name, type: file.type, data: b64 });
          attachmentPreviewImages.push(`data:${file.type};base64,${b64}`);
        } else if (file.type === 'text/plain' || file.type === 'text/csv' || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
          const txt = await readFileAsText(file);
          fileContents.push({ name: file.name, type: file.type, text: txt });
        } else {
          const b64 = await readFileAsBase64(file);
          fileContents.push({ name: file.name, type: file.type, data: b64 });
        }
      } catch {}
    }

    const userMsg: Msg = { role: 'user', content: contentWithFiles, files: attachedFiles.map(f => ({ name: f.name, type: f.type })), images: attachmentPreviewImages.length > 0 ? attachmentPreviewImages : undefined };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setAttachedFiles([]);
    setActiveView('chat');

    let convId = currentConvId;
    if (!convId) {
      convId = await createConv(text, mainMode);
      if (convId) setCurrentConvId(convId);
    }
    if (convId) await saveMsg(convId, userMsg);

    const isImg = IMAGE_PATTERNS.test(text);
    const shouldUseNonStreaming = fileContents.length > 0 || WEATHER_PATTERNS.test(text);

    if (isImg && fileContents.length === 0) {
      setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
      const result = await execute({ taskType: 'image', query: text, mode: 'rido_create', stream: false });
      const aMsg: Msg = { role: 'assistant', content: result?.images?.length ? pickImageReply('create') : (result?.result || '❌ Nie udało się wygenerować.'), images: result?.images };
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = aMsg; return u; });
      if (convId) await saveMsg(convId, aMsg);
      loadConversations();
      return;
    }

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    const activeMode = mainMode === 'cowork' ? 'cowork' : 'rido_chat';

    if (shouldUseNonStreaming) {
      const result = await execute({ taskType: 'text', query: text, mode: activeMode, messages: newMsgs.map(m => ({ role: m.role, content: m.content })), stream: false, files: fileContents.length > 0 ? fileContents : undefined });
      const assistantContent = result?.result || '⚠️ Nie udało się uzyskać odpowiedzi.';
      const assistantMsg: Msg = { role: 'assistant', content: assistantContent };
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = assistantMsg; return u; });
      if (convId) await saveMsg(convId, assistantMsg);
      if (/IMAGE_REQUEST:true/.test(assistantContent)) {
        setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
        const imageResult = await execute({ taskType: 'image', query: text, mode: 'rido_create', stream: false });
        const imageMsg: Msg = { role: 'assistant', content: imageResult?.images?.length ? pickImageReply('create') : (imageResult?.result || '❌'), images: imageResult?.images };
        setMessages(prev => { const u = [...prev]; u[u.length - 1] = imageMsg; return u; });
        if (convId) await saveMsg(convId, imageMsg);
      }
      const action = parseAction(assistantContent);
      if (action) { const routes: Record<string, string> = { CREATE_INVOICE: '/invoices/new', CREATE_TASK: '/tasks', FIND_SERVICE: '/services', SEARCH_PROPERTY: '/real-estate' }; const path = action.params?.path || routes[action.type]; if (path) navigate(path); }
      loadConversations();
      return;
    }

    let acc = '';
    await streamExecute(
      { taskType: 'text', query: text, mode: activeMode, messages: newMsgs.map(m => ({ role: m.role, content: m.content })), stream: true, files: fileContents.length > 0 ? fileContents : undefined },
      delta => { acc += delta; setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: acc }; return u; }); },
      async () => {
        const aMsg: Msg = { role: 'assistant', content: acc };
        if (convId) await saveMsg(convId, aMsg);
        if (/IMAGE_REQUEST:true/.test(acc)) {
          setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
          const imageResult = await execute({ taskType: 'image', query: text, mode: 'rido_create', stream: false });
          const imageMsg: Msg = { role: 'assistant', content: imageResult?.images?.length ? pickImageReply('create') : (imageResult?.result || '❌'), images: imageResult?.images };
          setMessages(prev => { const u = [...prev]; u[u.length - 1] = imageMsg; return u; });
          if (convId) await saveMsg(convId, imageMsg);
        }
        const action = parseAction(acc);
        if (action) { const routes: Record<string, string> = { CREATE_INVOICE: '/invoices/new', CREATE_TASK: '/tasks', FIND_SERVICE: '/services', SEARCH_PROPERTY: '/real-estate' }; const path = action.params?.path || routes[action.type]; if (path) navigate(path); }
        loadConversations();
      }
    );
  }, [input, isLoading, messages, mainMode, currentConvId, userId, streamExecute, execute, navigate, loadConversations, attachedFiles]);

  // ── Image Editor ──
  const openEditor = (imgSrc: string) => { setEditorImage(imgSrc); };
  const downloadImage = (imgSrc: string) => { const a = document.createElement('a'); a.href = imgSrc; a.download = 'rido-grafika.png'; a.click(); };

  const handleApplyEdit = async (imageBase64: string, maskBase64: string, prompt: string) => {
    return await execute({ taskType: 'inpaint', query: prompt, imageBase64, maskBase64 });
  };

  const handleSaveEditedImage = async (editedSrc: string) => {
    const imageMsg: Msg = { role: 'assistant', content: pickImageReply('edit'), images: [editedSrc] };
    setMessages(prev => [...prev, imageMsg]);
    if (currentConvId) { await saveMsg(currentConvId, imageMsg); loadConversations(); }
  };

  // ── Display helpers ──
  const filteredConvs = searchQuery ? conversations.filter(c => c.title?.toLowerCase().includes(searchQuery.toLowerCase())) : conversations;
  const groupedConvs = (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const groups: { label: string; items: Conv[] }[] = [{ label: '⭐ Ulubione', items: [] }, { label: 'Dzisiaj', items: [] }, { label: 'Wczoraj', items: [] }, { label: 'Wcześniej', items: [] }];
    filteredConvs.forEach(c => {
      if (c.is_starred) { groups[0].items.push(c); return; }
      const d = new Date(c.updated_at); d.setHours(0, 0, 0, 0);
      if (d >= today) groups[1].items.push(c);
      else if (d >= yesterday) groups[2].items.push(c);
      else groups[3].items.push(c);
    });
    return groups.filter(g => g.items.length > 0);
  })();

  if (!open) return null;

  // ── Image Editor (fullscreen) ──
  if (editorImage) {
    return (
      <div className="fixed inset-0 z-[60]">
        <ImageEditorMobile
          imageSrc={editorImage}
          onClose={() => setEditorImage(null)}
          onApplyEdit={handleApplyEdit}
          onSaveEditedImage={handleSaveEditedImage}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
        />
      </div>
    );
  }

  const listView = (
    <div className="flex flex-col h-full bg-muted/20">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b bg-background">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <img src={ridoMascot} alt="RidoAI" className="w-9 h-9 object-contain" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-sm tracking-tight truncate">RidoAI</h2>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider truncate">Asystent GetRido</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors flex-shrink-0"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Szukaj rozmów..." className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl bg-muted/50 border border-border/50 outline-none focus:border-primary/50 font-medium" />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Projects */}
        <AIProjectsSection userId={userId} onSelectProject={(id, name) => { setActiveProjectId(id); }} activeProjectId={activeProjectId} />

        {/* Conversations */}
        <div className="px-2 py-1">
          {groupedConvs.length === 0 && (
            <div className="text-center py-8"><MessageCircle className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" /><p className="text-[10px] text-muted-foreground/50 font-medium">Brak rozmów</p></div>
          )}
          {groupedConvs.map(group => (
            <div key={group.label}>
              <p className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map(conv => (
                  <ConvItemInline
                    key={conv.id}
                    title={conv.title}
                    active={currentConvId === conv.id}
                    starred={conv.is_starred}
                    onClick={() => loadConversation(conv.id)}
                    onDelete={(e) => deleteConversation(conv.id, e)}
                    onToggleStar={() => toggleStar(conv.id)}
                    onRename={() => { setRenamingConvId(conv.id); setRenameValue(conv.title || ''); }}
                    onAddToProject={() => openProjectPicker(conv.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New chat button */}
      <div className="flex-shrink-0 p-3 border-t bg-background">
        <Button onClick={handleNewChat} className="w-full rounded-xl gap-2 font-semibold"><Plus className="h-4 w-4" /> Nowa rozmowa</Button>
      </div>
    </div>
  );

  const chatView = (
    <div className="flex flex-col h-full bg-background" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {/* Chat header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b bg-background" style={{ minHeight: 52 }}>
        {/* Back button on mobile */}
        {!isDesktop && (
          <button onClick={() => setActiveView('list')} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </button>
        )}
        
        <div className="relative flex-shrink-0">
          <img src={ridoMascot} alt="RidoAI" className="w-8 h-8 object-contain" />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background" />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <h3 className="font-extrabold text-sm tracking-tight truncate">RidoAI</h3>
          <p className="text-[10px] text-muted-foreground font-medium truncate">● online</p>
        </div>

        {/* Mode tabs — only on wide desktop panels */}
        {isDesktop && (
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-xl p-0.5 flex-shrink-0">
            {([{ key: 'chat' as const, label: 'Chat', icon: MessageCircle }, { key: 'cowork' as const, label: 'Cowork', icon: Briefcase, locked: true }]).map(({ key, label, icon: Icon, locked }) => (
              <button key={key} onClick={() => !locked && switchMode(key)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all', mainMode === key && !locked ? 'bg-background shadow-sm text-foreground' : locked ? 'text-muted-foreground/40 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground hover:bg-background/50')}>
                {locked ? <Lock className="h-3 w-3" /> : <Icon className="h-3 w-3" />}{label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={handleNewChat} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Nowa rozmowa"><Plus className="h-4 w-4 text-muted-foreground" /></button>
          {isDesktop && <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Zamknij"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
      </div>

      {mainMode === 'cowork' ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"><Briefcase className="h-8 w-8 text-primary/50" /></div>
            <div><h3 className="font-extrabold text-lg">Cowork — wkrótce!</h3><p className="text-sm text-muted-foreground mt-1 max-w-sm font-medium">Tryb Cowork pozwoli Ci sterować portalem głosem i tekstem.</p></div>
            <Button variant="outline" size="sm" onClick={() => switchMode('chat')} className="rounded-lg font-semibold">Wróć do chatu</Button>
          </div>
        </div>
      ) : (
        <>
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-20 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
              <div className="text-center"><Paperclip className="h-10 w-10 text-primary mx-auto mb-2" /><p className="text-sm font-bold text-primary">Upuść pliki tutaj</p></div>
            </div>
          )}

          {/* Messages — THE ONLY SCROLLABLE ELEMENT */}
          <div className="flex-1 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="space-y-4 max-w-xl mx-auto">
              {/* Welcome message if no messages */}
              {messages.length === 0 && (
                <div className="flex gap-3 items-start">
                  <img src={ridoMascot} alt="AI" className="w-9 h-9 object-contain flex-shrink-0 mt-0.5" />
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%]">
                    <div className="prose prose-sm max-w-none text-primary-foreground [&_strong]:text-primary-foreground [&_li]:text-primary-foreground [&>p]:text-[14px] [&>p]:leading-relaxed [&>p]:font-medium [&>li]:text-[14px] [&>li]:font-medium">
                      <ReactMarkdown>{WELCOME[mainMode] || WELCOME.chat}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => {
                if (msg.role === 'assistant' && msg.content === '' && isLoading && i === messages.length - 1) return null;
                return (
                  <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row items-start')}>
                    {msg.role === 'assistant' && <img src={ridoMascot} alt="AI" className="w-9 h-9 object-contain flex-shrink-0 mt-0.5 self-start" />}
                    <div className="max-w-[85%] flex flex-col gap-2">
                      {msg.role === 'assistant' ? (
                        <>
                          {(() => {
                            const clean = (msg.content || '').replace(/ACTION:\{.*?\}/s, '').replace(/IMAGE_REQUEST:true/g, '').trim();
                            return clean ? (
                              <div className="bg-primary text-primary-foreground rounded-2xl rounded-bl-sm px-4 py-3">
                                <div className="prose prose-sm max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>p]:text-[14px] [&>p]:leading-relaxed [&>p]:font-medium [&>li]:text-[14px] [&>li]:font-medium text-primary-foreground [&_strong]:text-primary-foreground [&_li]:text-primary-foreground">
                                  <ReactMarkdown>{clean}</ReactMarkdown>
                                </div>
                              </div>
                            ) : null;
                          })()}
                          {msg.images?.map((img, idx) => (
                            <div key={idx} className="relative group overflow-hidden rounded-2xl">
                              <img src={img} alt="Grafika" className="w-full cursor-pointer hover:opacity-95 transition-opacity rounded-2xl" onClick={() => openEditor(img)} />
                              <div className="absolute top-2 left-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); downloadImage(img); }} className="bg-background/90 backdrop-blur-sm p-2 rounded-lg shadow-md border border-border/50 hover:bg-background"><Download className="h-4 w-4" /></button>
                                <button onClick={(e) => { e.stopPropagation(); openEditor(img); }} className="bg-background/90 backdrop-blur-sm p-2 rounded-lg shadow-md border border-border/50 hover:bg-background"><Paintbrush className="h-4 w-4" /></button>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          <div className="bg-muted rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm text-foreground">
                            <p className="whitespace-pre-wrap text-[14px] font-semibold">{msg.content}</p>
                          </div>
                          {msg.images?.map((img, idx) => (
                            <div key={idx} className="relative group overflow-hidden rounded-2xl">
                              <img src={img} alt="Załączony obraz" className="w-full cursor-pointer hover:opacity-95 transition-opacity rounded-2xl" onClick={() => openEditor(img)} />
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    {msg.role === 'user' && <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5"><span className="text-[10px] font-bold text-primary">Ty</span></div>}
                  </div>
                );
              })}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <img src={ridoMascot} alt="AI" className="w-9 h-9 object-contain flex-shrink-0 mt-0.5" />
                  <div className="bg-primary rounded-2xl rounded-bl-sm px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {[0, 200, 400].map(d => <span key={d} className="w-2.5 h-2.5 rounded-full bg-primary-foreground/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Quick replies */}
          {messages.length === 0 && (
            <div className="flex-shrink-0 px-4 py-2 border-t bg-muted/10">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                {QUICK_REPLIES.map(reply => (
                  <button key={reply} onClick={() => handleSend(reply)} className="flex-shrink-0 whitespace-nowrap bg-background border border-border rounded-2xl px-3.5 py-1.5 text-[13px] font-medium text-primary hover:bg-primary/5 transition-colors">{reply}</button>
                ))}
              </div>
            </div>
          )}

          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="flex-shrink-0 px-4 py-2 border-t bg-muted/20">
              <div className="flex flex-wrap gap-2 max-w-xl mx-auto">
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    {file.type.startsWith('image/') && <button onClick={() => openAttachedImageEditor(file)} className="p-0.5 hover:bg-primary/10 rounded"><Paintbrush className="h-3 w-3 text-primary" /></button>}
                    <button onClick={() => removeFile(idx)} className="p-0.5 hover:bg-destructive/10 rounded"><X className="h-3 w-3 text-destructive" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input bar */}
          <div className="flex-shrink-0 px-4 py-3 border-t bg-background" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <div className="flex items-end gap-2 max-w-xl mx-auto">
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.xlsx" className="hidden" onChange={e => handleFileSelect(e.target.files)} />
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl hover:bg-muted transition-colors border border-border/50 flex-shrink-0" title="Dodaj plik"><Paperclip className="h-4 w-4 text-muted-foreground" /></button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Zadaj pytanie RidoAI..."
                disabled={isLoading}
                className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl text-[16px] sm:text-sm font-medium border border-border/50 bg-muted/30 px-4 py-3 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50 transition-all"
                rows={1}
              />
              <Button onClick={() => handleSend()} disabled={!input.trim() || isLoading} size="icon" className="h-[44px] w-[44px] rounded-xl flex-shrink-0 shadow-sm">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-2 font-semibold">RidoAI • Sprawdzaj ważne informacje</p>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Overlay backdrop */}
      <div className="fixed inset-0 z-50 flex">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm md:block" onClick={onClose} />

        {/* Panel container */}
        <div className={cn(
          'relative ml-auto h-full flex bg-background shadow-2xl animate-slide-in-right',
          'w-full md:max-w-[480px]' // full screen on mobile, 480px drawer on desktop
        )}>
          {isDesktop ? (
            /* Desktop: split layout */
            <div className="flex w-full h-full">
              <div className="w-[280px] flex-shrink-0 border-r h-full">{listView}</div>
              <div className="flex-1 h-full min-w-0">{chatView}</div>
            </div>
          ) : (
            /* Mobile: one view at a time */
            activeView === 'list' ? listView : chatView
          )}
        </div>
      </div>

      {/* Rename dialog */}
      {renamingConvId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setRenamingConvId(null)}>
          <div className="bg-background rounded-xl border shadow-xl p-5 w-80 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold">Zmień nazwę rozmowy</p>
            <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameConversation(renamingConvId, renameValue); if (e.key === 'Escape') setRenamingConvId(null); }} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setRenamingConvId(null)}>Anuluj</Button><Button size="sm" onClick={() => renameConversation(renamingConvId, renameValue)}>Zapisz</Button></div>
          </div>
        </div>
      )}

      {/* Project picker dialog */}
      {projectPickerConvId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setProjectPickerConvId(null)}>
          <div className="bg-background rounded-xl border shadow-xl p-5 w-80 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold">Dodaj do projektu</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {projectsList.map(p => (
                <button key={p.id} onClick={() => assignToProject(projectPickerConvId, p.id)} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted text-sm text-left">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || 'hsl(var(--primary))' }} />{p.name}
                </button>
              ))}
            </div>
            {!newProjectInline ? (
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => setNewProjectInline(true)}><Plus className="h-3.5 w-3.5" /> Stwórz nowy projekt</Button>
            ) : (
              <div className="space-y-2 border-t pt-2">
                <input autoFocus placeholder="Nazwa projektu..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" onKeyDown={e => { if (e.key === 'Enter' && newProjectName.trim()) createProjectInPicker(); if (e.key === 'Escape') { setNewProjectInline(false); setNewProjectName(''); } }} />
                <div className="flex gap-1.5"><Button size="sm" className="flex-1 text-xs h-7" disabled={!newProjectName.trim()} onClick={createProjectInPicker}>Utwórz</Button><Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setNewProjectInline(false); setNewProjectName(''); }}>Anuluj</Button></div>
              </div>
            )}
            {conversations.find(c => c.id === projectPickerConvId)?.project_id && (
              <Button variant="ghost" size="sm" className="w-full text-xs text-destructive" onClick={() => assignToProject(projectPickerConvId, null)}>Usuń z projektu</Button>
            )}
            <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setProjectPickerConvId(null)}>Zamknij</Button></div>
          </div>
        </div>
      )}
    </>
  );
}

function ConvItemInline({ title, active, starred, onClick, onDelete, onToggleStar, onRename, onAddToProject }: {
  title: string | null; active: boolean; starred?: boolean; onClick: () => void;
  onDelete: (e: React.MouseEvent) => void; onToggleStar: () => void; onRename: () => void; onAddToProject: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const displayTitle = formatConversationTitle(title);
  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className={cn('flex min-w-0 max-w-full items-center gap-1.5 px-2.5 py-2.5 pr-1.5 cursor-pointer transition-all w-full overflow-hidden', active ? 'bg-primary text-primary-foreground rounded-l-2xl rounded-r-none' : 'text-foreground hover:bg-accent hover:text-accent-foreground rounded-l-2xl rounded-r-none')}>
      <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
      <span className="text-xs font-medium min-w-0 block" style={{ flex: '1 1 auto', maxWidth: 'calc(100% - 1.75rem)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayTitle}</span>
      <div className="flex w-6 flex-shrink-0 justify-center" style={{ opacity: hovered || active || menuOpen ? 1 : 0, transition: 'opacity 0.15s' }} onClick={e => e.stopPropagation()}>
        <DropdownMenu onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className={cn('p-1 rounded-md transition-colors', active ? 'hover:bg-primary-foreground/20' : 'hover:bg-muted')} title="Więcej"><MoreHorizontal className="h-3.5 w-3.5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onToggleStar}>{starred ? '⭐' : '☆'}<span className="ml-2">{starred ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}</span></DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}><span className="mr-2">✏️</span>Zmień nazwę</DropdownMenuItem>
            <DropdownMenuItem onClick={onAddToProject}><span className="mr-2">📁</span>Dodaj do projektu</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => onDelete(e as unknown as React.MouseEvent)} className="text-destructive focus:text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" />Usuń</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
