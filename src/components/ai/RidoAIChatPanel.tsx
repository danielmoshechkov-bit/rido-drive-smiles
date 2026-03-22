import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import {
  Loader2, Send, Plus, MessageCircle, Briefcase,
  X, Search, Lock,
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
import { Button } from '@/components/ui/button';

type MainMode = 'chat' | 'grafika' | 'cowork';
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; images?: string[]; files?: { name: string; type: string }[]; }
interface Conv { id: string; title: string; mode: string; updated_at: string; is_starred?: boolean; project_id?: string | null; }

const WELCOME = `Cześć! 👋 Jestem **RidoAI** – Twój inteligentny asystent.\n\nMogę Ci pomóc z:\n• 💬 Pytania i rozmowy\n• 🎨 Generowanie grafik\n• 🏠 Wyszukiwanie nieruchomości i usług\n• 📄 Tworzenie treści i analiz\n\nPo prostu napisz czego potrzebujesz!`;

const IMAGE_PATTERNS = /(?:stw[oó]rz|wygeneruj|narysuj|zr[oó]b|stworzysz|namaluj|zaprojektuj|poka[zż]|daj|make|create|draw|generate|zrob|stworz|pokaz|wygenerować|narysowaĆ).{0,40}(?:obraz|grafik|logo|zdj[eę]|zdjecie|baner|ilustracj|ikona|ikonk|obrazek|plakat|rysunek|foto|image|picture|graphic|goryl|banana|kot|pies|samoch[oó]d|krajobraz)/i;
const WEATHER_PATTERNS = /(?:pogod|weather|forecast|temperatur|meteo|klimat|температур|погод|прогноз)/i;

const parseAction = (text: string) => {
  const match = text.match(/ACTION:\{.*?\}/s);
  if (!match) return null;
  try { return JSON.parse(match[0].replace('ACTION:', '')); } catch { return null; }
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

function formatRelativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'teraz';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function formatTime(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

interface RidoAIChatPanelProps {
  open: boolean;
  onClose: () => void;
}

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [activeView, setActiveView] = useState<'list' | 'chat'>('list');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);

  // Image editor
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Block body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const { streamExecute, execute, isLoading } = useGetRidoAI();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // ═══════════════════════════════════
  // RENDER
  // ═══════════════════════════════════

  return (
    <>
      {/* Typing animation keyframes */}
      <style>{`
        @keyframes ridoTyping {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes ridoSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          zIndex: 9999,
          width: isMobile ? '100vw' : 400,
          maxWidth: '100vw',
          background: '#FAFAF8',
          boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
          borderRadius: isMobile ? 0 : '16px 0 0 16px',
          display: 'flex', flexDirection: 'column',
          height: '100dvh',
          animation: 'ridoSlideIn 0.25s ease-out',
          overflow: 'hidden',
        }}
      >
        {/* Desktop: split layout */}
        {!isMobile ? (
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #F0EDE7', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <ChatListView
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                groupedConvs={groupedConvs}
                currentConvId={currentConvId}
                userId={userId}
                activeProjectId={activeProjectId}
                setActiveProjectId={setActiveProjectId}
                loadConversation={loadConversation}
                deleteConversation={deleteConversation}
                toggleStar={toggleStar}
                setRenamingConvId={setRenamingConvId}
                setRenameValue={setRenameValue}
                openProjectPicker={openProjectPicker}
                handleNewChat={handleNewChat}
                onClose={onClose}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <ChatView
                isMobile={false}
                messages={messages}
                isLoading={isLoading}
                input={input}
                setInput={setInput}
                handleSend={handleSend}
                handleNewChat={handleNewChat}
                onClose={onClose}
                onBack={() => {}}
                attachedFiles={attachedFiles}
                isDragging={isDragging}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                fileInputRef={fileInputRef}
                inputRef={inputRef}
                handleFileSelect={handleFileSelect}
                removeFile={removeFile}
                openAttachedImageEditor={openAttachedImageEditor}
                messagesEndRef={messagesEndRef}
                openEditor={openEditor}
                downloadImage={downloadImage}
              />
            </div>
          </div>
        ) : (
          /* Mobile: one view at a time */
          activeView === 'list' ? (
            <ChatListView
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              groupedConvs={groupedConvs}
              currentConvId={currentConvId}
              userId={userId}
              activeProjectId={activeProjectId}
              setActiveProjectId={setActiveProjectId}
              loadConversation={loadConversation}
              deleteConversation={deleteConversation}
              toggleStar={toggleStar}
              setRenamingConvId={setRenamingConvId}
              setRenameValue={setRenameValue}
              openProjectPicker={openProjectPicker}
              handleNewChat={handleNewChat}
              onClose={onClose}
            />
          ) : (
            <ChatView
              isMobile={true}
              messages={messages}
              isLoading={isLoading}
              input={input}
              setInput={setInput}
              handleSend={handleSend}
              handleNewChat={handleNewChat}
              onClose={onClose}
              onBack={() => setActiveView('list')}
              attachedFiles={attachedFiles}
              isDragging={isDragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              fileInputRef={fileInputRef}
              inputRef={inputRef}
              handleFileSelect={handleFileSelect}
              removeFile={removeFile}
              openAttachedImageEditor={openAttachedImageEditor}
              messagesEndRef={messagesEndRef}
              openEditor={openEditor}
              downloadImage={downloadImage}
            />
          )
        )}
      </div>

      {/* Rename dialog */}
      {renamingConvId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => setRenamingConvId(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 320, boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Zmień nazwę rozmowy</p>
            <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameConversation(renamingConvId, renameValue); if (e.key === 'Escape') setRenamingConvId(null); }}
              style={{ width: '100%', border: '1.5px solid #EDE9E3', borderRadius: 10, padding: '8px 12px', fontSize: 14, outline: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button variant="ghost" size="sm" onClick={() => setRenamingConvId(null)}>Anuluj</Button>
              <Button size="sm" onClick={() => renameConversation(renamingConvId, renameValue)}>Zapisz</Button>
            </div>
          </div>
        </div>
      )}

      {/* Project picker dialog */}
      {projectPickerConvId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => setProjectPickerConvId(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 320, boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Dodaj do projektu</p>
            <div style={{ maxHeight: 192, overflowY: 'auto' }} className="space-y-1">
              {projectsList.map(p => (
                <button key={p.id} onClick={() => assignToProject(projectPickerConvId, p.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FAFAF8')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color || '#534AB7' }} />{p.name}
                </button>
              ))}
            </div>
            {!newProjectInline ? (
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs mt-2" onClick={() => setNewProjectInline(true)}><Plus className="h-3.5 w-3.5" /> Stwórz nowy projekt</Button>
            ) : (
              <div className="space-y-2 border-t pt-2 mt-2">
                <input autoFocus placeholder="Nazwa projektu..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg" style={{ outline: 'none' }} onKeyDown={e => { if (e.key === 'Enter' && newProjectName.trim()) createProjectInPicker(); if (e.key === 'Escape') { setNewProjectInline(false); setNewProjectName(''); } }} />
                <div className="flex gap-1.5"><Button size="sm" className="flex-1 text-xs h-7" disabled={!newProjectName.trim()} onClick={createProjectInPicker}>Utwórz</Button><Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setNewProjectInline(false); setNewProjectName(''); }}>Anuluj</Button></div>
              </div>
            )}
            {conversations.find(c => c.id === projectPickerConvId)?.project_id && (
              <Button variant="ghost" size="sm" className="w-full text-xs text-destructive mt-1" onClick={() => assignToProject(projectPickerConvId, null)}>Usuń z projektu</Button>
            )}
            <div className="flex justify-end mt-2"><Button variant="ghost" size="sm" onClick={() => setProjectPickerConvId(null)}>Zamknij</Button></div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════
// ChatListView
// ═══════════════════════════════════

interface ChatListViewProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  groupedConvs: { label: string; items: Conv[] }[];
  currentConvId: string | null;
  userId: string | null;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string, e: React.MouseEvent) => void;
  toggleStar: (id: string) => void;
  setRenamingConvId: (id: string | null) => void;
  setRenameValue: (v: string) => void;
  openProjectPicker: (id: string) => void;
  handleNewChat: () => void;
  onClose: () => void;
}

function ChatListView({
  searchQuery, setSearchQuery, groupedConvs, currentConvId, userId,
  activeProjectId, setActiveProjectId,
  loadConversation, deleteConversation, toggleStar,
  setRenamingConvId, setRenameValue, openProjectPicker,
  handleNewChat, onClose,
}: ChatListViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FAFAF8' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: '1px solid #F0EDE7', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #7F77DD, #534AB7)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img src={ridoMascot} alt="RidoAI" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              </div>
              <div style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff' }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0F0F1A', letterSpacing: '-0.01em' }}>RidoAI</div>
              <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 500 }}>● online — odpowiada natychmiast</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F0')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Szukaj rozmów..."
            style={{
              width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
              fontSize: 13, borderRadius: 10, border: '1.5px solid #EDE9E3',
              background: '#F9F8F6', outline: 'none', color: '#0F0F1A', fontFamily: 'inherit',
            }}
            onFocus={e => (e.target.style.borderColor = '#7F77DD')}
            onBlur={e => (e.target.style.borderColor = '#EDE9E3')}
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        {/* Projects */}
        <AIProjectsSection userId={userId} onSelectProject={(id) => setActiveProjectId(id)} activeProjectId={activeProjectId} />

        {/* Conversations */}
        <div style={{ padding: '4px 8px' }}>
          {groupedConvs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>💬</div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF' }}>Brak rozmów</p>
              <p style={{ fontSize: 11, color: '#C4BDB0', marginTop: 4 }}>Zacznij nową rozmowę poniżej</p>
            </div>
          )}
          {groupedConvs.map(group => (
            <div key={group.label}>
              <p style={{ padding: '8px 8px 4px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.label}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {group.items.map(conv => (
                  <ConvRow
                    key={conv.id}
                    conv={conv}
                    active={currentConvId === conv.id}
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
      <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid #F0EDE7', background: '#fff' }}>
        <button onClick={handleNewChat}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '11px 0', borderRadius: 12, border: 'none',
            background: '#534AB7', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', transition: 'background 0.15s', fontFamily: 'inherit',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#4A42A8')}
          onMouseLeave={e => (e.currentTarget.style.background = '#534AB7')}
        >
          <Plus size={16} /> Nowa rozmowa
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════
// ConvRow
// ═══════════════════════════════════

function ConvRow({ conv, active, onClick, onDelete, onToggleStar, onRename, onAddToProject }: {
  conv: Conv; active: boolean; onClick: () => void;
  onDelete: (e: React.MouseEvent) => void; onToggleStar: () => void; onRename: () => void; onAddToProject: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const displayTitle = formatConversationTitle(conv.title);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 10px 10px 12px',
        borderRadius: '14px 0 0 14px',
        cursor: 'pointer',
        background: active ? '#534AB7' : hovered ? '#F5F4F0' : 'transparent',
        color: active ? '#fff' : '#0F0F1A',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: active ? 'rgba(255,255,255,0.2)' : '#EEEDFE',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, flexShrink: 0,
      }}>
        💬
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayTitle}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.6)' : '#C4BDB0' }}>
          {formatRelativeTime(conv.updated_at)}
        </span>
        <div style={{ opacity: hovered || active || menuOpen ? 1 : 0, transition: 'opacity 0.15s' }} onClick={e => e.stopPropagation()}>
          <DropdownMenu onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: active ? 'rgba(255,255,255,0.7)' : '#9CA3AF' }}>
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onToggleStar}>{conv.is_starred ? '⭐' : '☆'}<span className="ml-2">{conv.is_starred ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}</span></DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}><span className="mr-2">✏️</span>Zmień nazwę</DropdownMenuItem>
              <DropdownMenuItem onClick={onAddToProject}><span className="mr-2">📁</span>Dodaj do projektu</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => onDelete(e as unknown as React.MouseEvent)} className="text-destructive focus:text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" />Usuń</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════
// ChatView
// ═══════════════════════════════════

interface ChatViewProps {
  isMobile: boolean;
  messages: Msg[];
  isLoading: boolean;
  input: string;
  setInput: (v: string) => void;
  handleSend: (overrideText?: string) => void;
  handleNewChat: () => void;
  onClose: () => void;
  onBack: () => void;
  attachedFiles: File[];
  isDragging: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  handleFileSelect: (files: FileList | null) => void;
  removeFile: (idx: number) => void;
  openAttachedImageEditor: (file: File) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  openEditor: (src: string) => void;
  downloadImage: (src: string) => void;
}

function ChatView({
  isMobile, messages, isLoading, input, setInput, handleSend,
  handleNewChat, onClose, onBack, attachedFiles, isDragging,
  onDragOver, onDragLeave, onDrop, fileInputRef, inputRef,
  handleFileSelect, removeFile, openAttachedImageEditor,
  messagesEndRef, openEditor, downloadImage,
}: ChatViewProps) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FAFAF8' }}
      onDragOver={onDragOver as any}
      onDragLeave={onDragLeave as any}
      onDrop={onDrop as any}
    >
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderBottom: '1px solid #F0EDE7',
        background: '#fff', minHeight: 56,
      }}>
        {isMobile && (
          <button onClick={onBack} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6B7280', flexShrink: 0 }}>
            <ChevronLeft size={20} />
          </button>
        )}

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #7F77DD, #534AB7)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={ridoMascot} alt="RidoAI" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          </div>
          <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0F0F1A' }}>RidoAI</div>
          <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 500 }}>● odpowiada natychmiast</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button onClick={handleNewChat} style={{ padding: 7, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }} title="Nowa rozmowa"
            onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F0')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <Plus size={18} />
          </button>
          {!isMobile && (
            <button onClick={onClose} style={{ padding: 7, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }} title="Zamknij"
              onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F0')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Drag overlay */}
      {isDragging && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(83,74,183,0.08)', border: '2px dashed #534AB7', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <Paperclip size={40} style={{ color: '#534AB7', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#534AB7' }}>Upuść pliki tutaj</p>
          </div>
        </div>
      )}

      {/* Messages — THE ONLY SCROLLABLE ELEMENT */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', WebkitOverflowScrolling: 'touch' as any }}>
        {/* Welcome */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #7F77DD, #534AB7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              <img src={ridoMascot} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            </div>
            <div style={{ maxWidth: '80%' }}>
              <div style={{ padding: '12px 16px', borderRadius: '18px 18px 18px 4px', background: '#fff', border: '1px solid #F0EDE7', fontSize: 14, lineHeight: 1.55, color: '#0F0F1A' }}>
                <div className="prose prose-sm max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&_strong]:font-bold [&_li]:text-sm">
                  <ReactMarkdown>{WELCOME}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => {
          if (msg.role === 'assistant' && msg.content === '' && isLoading && i === messages.length - 1) return null;
          const isAI = msg.role === 'assistant';
          const prevIsAI = i > 0 && messages[i - 1]?.role === 'assistant';
          const showAvatar = isAI && !prevIsAI;
          const isGrouped = isAI === (i > 0 && messages[i - 1]?.role === msg.role);

          return (
            <div key={i} style={{
              display: 'flex',
              flexDirection: isAI ? 'row' : 'row-reverse',
              alignItems: 'flex-end',
              gap: 10,
              marginBottom: isGrouped ? 3 : 12,
            }}>
              {/* AI avatar */}
              {isAI && (
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: showAvatar ? 'linear-gradient(135deg, #7F77DD, #534AB7)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 14, overflow: 'hidden',
                }}>
                  {showAvatar && <img src={ridoMascot} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                </div>
              )}

              <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {isAI ? (
                  <>
                    {(() => {
                      const clean = (msg.content || '').replace(/ACTION:\{.*?\}/s, '').replace(/IMAGE_REQUEST:true/g, '').trim();
                      return clean ? (
                        <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: '#fff', border: '1px solid #F0EDE7', color: '#0F0F1A', fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word' }}>
                          <div className="prose prose-sm max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&_strong]:font-bold [&_li]:text-sm">
                            <ReactMarkdown>{clean}</ReactMarkdown>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    {msg.images?.map((img, idx) => (
                      <div key={idx} style={{ position: 'relative', borderRadius: 16, overflow: 'hidden' }} className="group">
                        <img src={img} alt="" style={{ width: '100%', cursor: 'pointer', borderRadius: 16 }} onClick={() => openEditor(img)} />
                        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6 }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); downloadImage(img); }} style={{ background: 'rgba(255,255,255,0.9)', padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)' }}><Download size={14} /></button>
                          <button onClick={(e) => { e.stopPropagation(); openEditor(img); }} style={{ background: 'rgba(255,255,255,0.9)', padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)' }}><Paintbrush size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div style={{ padding: '10px 14px', borderRadius: '18px 18px 4px 18px', background: '#534AB7', color: '#fff', fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word', fontWeight: 500 }}>
                      {msg.content}
                    </div>
                    {msg.images?.map((img, idx) => (
                      <div key={idx} style={{ borderRadius: 16, overflow: 'hidden' }}>
                        <img src={img} alt="" style={{ width: '100%', borderRadius: 16, cursor: 'pointer' }} onClick={() => openEditor(img)} />
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* User avatar */}
              {!isAI && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#534AB7' }}>Ty</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #7F77DD, #534AB7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, overflow: 'hidden' }}>
              <img src={ridoMascot} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            </div>
            <div style={{ padding: '12px 16px', background: '#fff', border: '1px solid #F0EDE7', borderRadius: '18px 18px 18px 4px', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 0.18, 0.36].map((delay, i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#C4BDB0', animation: `ridoTyping 1.3s ${delay}s ease-in-out infinite` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick replies */}
      {messages.length === 0 && (
        <div style={{ flexShrink: 0, padding: '8px 16px', borderTop: '1px solid #F0EDE7', background: '#fff' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' as any }}>
            {QUICK_REPLIES.map(reply => (
              <button key={reply} onClick={() => handleSend(reply)}
                style={{
                  whiteSpace: 'nowrap', flexShrink: 0,
                  background: '#fff', border: '1.5px solid #E8E4FF',
                  borderRadius: 20, padding: '7px 14px',
                  fontSize: 13, color: '#534AB7', fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#EEEDFE'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attached files */}
      {attachedFiles.length > 0 && (
        <div style={{ flexShrink: 0, padding: '8px 16px', borderTop: '1px solid #F0EDE7', background: '#fff' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {attachedFiles.map((file, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9F8F6', border: '1px solid #EDE9E3', borderRadius: 8, padding: '5px 8px', fontSize: 12, fontWeight: 500 }}>
                <FileText size={13} style={{ color: '#534AB7' }} />
                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                {file.type.startsWith('image/') && (
                  <button onClick={() => openAttachedImageEditor(file)} style={{ padding: 2, border: 'none', background: 'transparent', cursor: 'pointer' }}><Paintbrush size={12} style={{ color: '#534AB7' }} /></button>
                )}
                <button onClick={() => removeFile(idx)} style={{ padding: 2, border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={12} style={{ color: '#EF4444' }} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div style={{
        flexShrink: 0, padding: '10px 16px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        borderTop: '1px solid #F0EDE7', background: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <input ref={fileInputRef as any} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.xlsx" className="hidden" onChange={e => handleFileSelect(e.target.files)} />

          <button onClick={() => fileInputRef.current?.click()}
            style={{ width: 42, height: 42, borderRadius: '50%', border: '1.5px solid #EDE9E3', background: '#F9F8F6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.15s', color: '#9CA3AF' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#7F77DD')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#EDE9E3')}
          >
            <Paperclip size={16} />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Zadaj pytanie RidoAI..."
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1, resize: 'none', border: '1.5px solid #EDE9E3',
              borderRadius: 16, padding: '10px 16px',
              fontSize: 16, lineHeight: 1.5,
              fontFamily: 'inherit', color: '#0F0F1A',
              background: '#F9F8F6', outline: 'none',
              maxHeight: 120, overflowY: 'auto',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = '#7F77DD')}
            onBlur={e => (e.target.style.borderColor = '#EDE9E3')}
          />

          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: input.trim() ? '#534AB7' : '#E8E4FF',
              border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.2s, transform 0.1s',
            }}
            onMouseEnter={e => { if (input.trim()) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {isLoading ? (
              <Loader2 size={16} style={{ color: '#534AB7', animation: 'spin 1s linear infinite' }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
                  stroke={input.trim() ? '#fff' : '#A5A0E8'}
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
