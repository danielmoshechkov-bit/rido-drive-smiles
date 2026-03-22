import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import {
  Loader2, Send, Plus, MessageCircle, Briefcase,
  Sparkles, X, Search, PanelLeftOpen, PanelLeftClose, Lock,
  Download, Paintbrush, RotateCcw, Paperclip, FileText, Trash2, Circle, Square
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ridoMascot from '@/assets/rido-mascot.png';
import { AIProjectsSection } from './AIProjectsSection';

type MainMode = 'chat' | 'grafika' | 'cowork';
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; images?: string[]; files?: { name: string; type: string }[]; }
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

const IMAGE_PATTERNS = /(?:stw[oó]rz|wygeneruj|narysuj|zr[oó]b|stworzysz|namaluj|zaprojektuj|poka[zż]|daj|make|create|draw|generate|zrob|stworz|pokaz|wygenerować|narysowaĆ).{0,40}(?:obraz|grafik|logo|zdj[eę]|zdjecie|baner|ilustracj|ikona|ikonk|obrazek|plakat|rysunek|foto|image|picture|graphic|goryl|banana|kot|pies|samoch[oó]d|krajobraz)/i;
const WEATHER_PATTERNS = /(?:pogod|weather|forecast|temperatur|meteo|klimat|температур|погод|прогноз)/i;

const parseAction = (text: string) => {
  const match = text.match(/ACTION:(\{.*?\})/s);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
};

interface RidoAIChatPanelProps {
  open: boolean;
  onClose: () => void;
}

type AnnotationTool = 'brush' | 'ellipse' | 'rectangle';

const IMAGE_REPLY_VARIANTS = {
  create: [
    'Gotowe — przygotowałem grafikę.',
    'Jasne, oto przygotowany obraz.',
    'Stworzyłem nową wersję grafiki.',
    'Mam to — poniżej masz obraz.',
    'Grafika jest gotowa.',
    'Przygotowałem to tak, jak prosiłeś.',
    'Oto efekt tej prośby.',
    'Wrzucam gotową grafikę poniżej.',
  ],
  edit: [
    'Gotowe — wprowadziłem zmiany na obrazie.',
    'Mam poprawioną wersję grafiki.',
    'Zmiany zostały naniesione.',
    'Przygotowałem zaktualizowany obraz.',
    'To jest poprawiona wersja.',
    'Dodałem wskazane poprawki.',
    'Poniżej masz nową wersję po edycji.',
    'Obraz został zaktualizowany.',
  ],
} as const;

const pickImageReply = (type: keyof typeof IMAGE_REPLY_VARIANTS) => {
  const variants = IMAGE_REPLY_VARIANTS[type];
  return variants[Math.floor(Math.random() * variants.length)];
};

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
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image editor state
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [brushActive, setBrushActive] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('brush');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const currentPath = useRef<{ x: number; y: number }[]>([]);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const baseMaskData = useRef<ImageData | null>(null);

  // Multi-annotation system
  interface Annotation {
    id: number;
    maskData: ImageData;
    center: { x: number; y: number };
    description: string;
    tool: AnnotationTool;
  }
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<number | null>(null);

  const { streamExecute, execute, isLoading } = useGetRidoAI();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        console.log('[RidoAI] User loaded:', data.user.id);
        setUserId(data.user.id);
      } else {
        console.warn('[RidoAI] No user found');
      }
    });
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
    scrollToBottom();
  }, [messages, currentConvId, open, scrollToBottom]);

  const createConv = async (text: string, mode: string): Promise<string> => {
    // Ensure userId is available
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data?.user?.id || null;
      if (uid) setUserId(uid);
    }
    if (!uid) {
      console.error('[RidoAI] Cannot create conversation - no userId');
      return '';
    }
    const { data, error } = await (supabase as any).from('ai_conversations')
      .insert({ user_id: uid, title: text.substring(0, 60), mode }).select().single();
    if (error) {
      console.error('[RidoAI] Failed to create conversation:', error);
      return '';
    }
    console.log('[RidoAI] Created conversation:', data?.id);
    return data?.id || '';
  };

  const saveMsg = async (convId: string, msg: Msg) => {
    if (!convId) {
      console.error('[RidoAI] Cannot save message - no convId');
      return;
    }
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data?.user?.id || null;
    }
    if (!uid) {
      console.error('[RidoAI] Cannot save message - no userId');
      return;
    }
    const { error: msgErr } = await (supabase as any).from('ai_messages').insert({
      conversation_id: convId,
      user_id: uid,
      role: msg.role,
      content: msg.content,
      images: msg.role === 'assistant' ? (msg.images || null) : null
    });
    if (msgErr) console.error('[RidoAI] Failed to save message:', msgErr);
    
    const { error: updErr } = await (supabase as any).from('ai_conversations')
      .update({ updated_at: new Date().toISOString() }).eq('id', convId);
    if (updErr) console.error('[RidoAI] Failed to update conversation:', updErr);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm('Czy na pewno chcesz usunąć tę rozmowę? Tej operacji nie można cofnąć.');
    if (!confirmed) return;
    await (supabase as any).from('ai_messages').delete().eq('conversation_id', convId);
    await (supabase as any).from('ai_conversations').delete().eq('id', convId);
    if (currentConvId === convId) handleNewChat();
    loadConversations();
  };

  const loadConversation = async (convId: string) => {
    const { data } = await (supabase as any).from('ai_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (data) setMessages(data.map((m: any) => ({ id: m.id, role: m.role, content: m.content, images: m.images })));
    setCurrentConvId(convId);
    setTimeout(scrollToBottom, 50);
  };

  const handleNewChat = () => { setMessages([]); setCurrentConvId(null); setInput(''); setAttachedFiles([]); };

  const switchMode = (mode: MainMode) => {
    setMainMode(mode);
    if (mode !== 'cowork') handleNewChat();
  };

  // File handling
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5);
    setAttachedFiles(prev => [...prev, ...newFiles].slice(0, 5));
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const openAttachedImageEditor = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      openEditor(dataUrl);
    } catch (err) {
      console.error('[RidoAI] Failed to open attached image:', err);
    }
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const fileNames = attachedFiles.map(f => f.name);
    const contentWithFiles = fileNames.length > 0
      ? `${text}\n\n📎 Załączniki: ${fileNames.join(', ')}`
      : text;

    // Read file contents for AI
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
          // PDF, DOCX etc - send as base64
          const b64 = await readFileAsBase64(file);
          fileContents.push({ name: file.name, type: file.type, data: b64 });
        }
      } catch (err) {
        console.error('[RidoAI] Error reading file:', file.name, err);
      }
    }

    const userMsg: Msg = {
      role: 'user',
      content: contentWithFiles,
      files: attachedFiles.map(f => ({ name: f.name, type: f.type })),
      images: attachmentPreviewImages.length > 0 ? attachmentPreviewImages : undefined,
    };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setAttachedFiles([]);

    let convId = currentConvId;
    if (!convId) {
      convId = await createConv(text, mainMode);
      if (convId) {
        setCurrentConvId(convId);
      } else {
        console.warn('[RidoAI] Could not save conversation, continuing without persistence');
      }
    }
    if (convId) await saveMsg(convId, userMsg);

    const isImg = IMAGE_PATTERNS.test(text);
    const shouldUseNonStreaming = fileContents.length > 0 || WEATHER_PATTERNS.test(text);

    if (isImg && fileContents.length === 0) {
      setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
      const result = await execute({ taskType: 'image', query: text, mode: 'rido_create', stream: false });
      const aMsg: Msg = {
        role: 'assistant',
        content: result?.images?.length ? pickImageReply('create') : (result?.result || '❌ Nie udało się wygenerować.'),
        images: result?.images
      };
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = aMsg; return u; });
      if (convId) await saveMsg(convId, aMsg);
      loadConversations();
      return;
    }

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    const activeMode = mainMode === 'cowork' ? 'cowork' : 'rido_chat';

    if (shouldUseNonStreaming) {
      const result = await execute({
        taskType: 'text',
        query: text,
        mode: activeMode,
        messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        files: fileContents.length > 0 ? fileContents : undefined,
      });

      const assistantContent = result?.result || '⚠️ Nie udało się uzyskać odpowiedzi.';
      const assistantMsg: Msg = { role: 'assistant', content: assistantContent };
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = assistantMsg;
        return updated;
      });
      if (convId) await saveMsg(convId, assistantMsg);

      if (/IMAGE_REQUEST:true/.test(assistantContent)) {
        setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
        const imageResult = await execute({ taskType: 'image', query: text, mode: 'rido_create', stream: false });
        const imageMsg: Msg = {
          role: 'assistant',
          content: imageResult?.images?.length ? pickImageReply('create') : (imageResult?.result || '❌ Nie udało się wygenerować.'),
          images: imageResult?.images,
        };
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = imageMsg;
          return updated;
        });
        if (convId) await saveMsg(convId, imageMsg);
      }

      const action = parseAction(assistantContent);
      if (action) {
        const routes: Record<string, string> = {
          CREATE_INVOICE: '/invoices/new', CREATE_TASK: '/tasks',
          FIND_SERVICE: '/services', SEARCH_PROPERTY: '/real-estate',
        };
        const path = action.params?.path || routes[action.type];
        if (path) navigate(path);
      }

      loadConversations();
      return;
    }

    let acc = '';

    await streamExecute(
      { taskType: 'text', query: text, mode: activeMode, messages: newMsgs.map(m => ({ role: m.role, content: m.content })), stream: true, files: fileContents.length > 0 ? fileContents : undefined },
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
        if (convId) await saveMsg(convId, aMsg);

        if (/IMAGE_REQUEST:true/.test(acc)) {
          setMessages(prev => [...prev, { role: 'assistant', content: '🎨 Generuję grafikę...' }]);
          const imageResult = await execute({ taskType: 'image', query: text, mode: 'rido_create', stream: false });
          const imageMsg: Msg = {
            role: 'assistant',
            content: imageResult?.images?.length ? pickImageReply('create') : (imageResult?.result || '❌ Nie udało się wygenerować.'),
            images: imageResult?.images,
          };
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = imageMsg;
            return updated;
          });
          if (convId) await saveMsg(convId, imageMsg);
        }

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
  }, [input, isLoading, messages, mainMode, currentConvId, userId, streamExecute, execute, navigate, loadConversations, attachedFiles]);

  // ── Image Editor ──────────────────────────────────────────
  const openEditor = (imgSrc: string) => {
    setEditorImage(imgSrc);
    setBrushActive(false);
    setAnnotationTool('brush');
    setIsDrawing(false);
    setAnnotations([]);
    setActiveAnnotation(null);
    lastPoint.current = null;
    currentPath.current = [];
    shapeStart.current = null;
    baseMaskData.current = null;
  };

  const downloadImage = (imgSrc: string) => {
    const a = document.createElement('a');
    a.href = imgSrc;
    a.download = 'rido-grafika.png';
    a.click();
  };

  useEffect(() => {
    if (!editorImage || !canvasRef.current || !maskCanvasRef.current) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxW = Math.min(img.width, 900);
      const ratio = img.height / img.width;
      const w = maxW;
      const h = Math.round(maxW * ratio);
      [canvasRef.current!, maskCanvasRef.current!].forEach(c => { c.width = w; c.height = h; });
      canvasRef.current!.getContext('2d')!.drawImage(img, 0, 0, w, h);
      maskCanvasRef.current!.getContext('2d')!.clearRect(0, 0, w, h);
      shapeStart.current = null;
      baseMaskData.current = null;
    };
    img.src = editorImage;
  }, [editorImage]);

  // Redraw all annotation masks on the mask canvas
  const redrawAnnotations = useCallback((anns: typeof annotations) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    anns.forEach(ann => {
      ctx.putImageData(ann.maskData, 0, 0);
    });
  }, []);

  // Smooth brush drawing
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = maskCanvasRef.current!.getBoundingClientRect();
    const sx = maskCanvasRef.current!.width / rect.width;
    const sy = maskCanvasRef.current!.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    ctx.strokeStyle = 'rgba(108, 60, 240, 0.45)';
    ctx.lineWidth = 36;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const drawShape = (start: { x: number; y: number }, end: { x: number; y: number }, tool: Exclude<AnnotationTool, 'brush'>) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    ctx.fillStyle = 'rgba(108, 60, 240, 0.45)';

    if (tool === 'rectangle') {
      ctx.fillRect(x, y, w, h);
      return;
    }

    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const addAnnotationFromMask = (maskData: ImageData, center: { x: number; y: number }, tool: AnnotationTool) => {
    setAnnotations(prev => {
      const next = [...prev, {
        id: prev.length + 1,
        maskData,
        center,
        description: '',
        tool,
      }];
      setActiveAnnotation(next.length);
      return next;
    });
  };

  const setActiveTool = (tool: AnnotationTool) => {
    setAnnotationTool(tool);
    setBrushActive(current => (annotationTool === tool ? !current : true));
  };

  const onBrushDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!brushActive) return;
    setIsDrawing(true);
    const pt = getCanvasCoords(e);
    shapeStart.current = pt;
    lastPoint.current = pt;

    if (annotationTool === 'brush') {
      currentPath.current = [pt];
      drawStroke(pt, pt);
      return;
    }

    currentPath.current = [];
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx && maskCanvasRef.current) {
      baseMaskData.current = ctx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
  };

  const onBrushMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !brushActive || !lastPoint.current) return;
    const pt = getCanvasCoords(e);

    if (annotationTool === 'brush') {
      drawStroke(lastPoint.current, pt);
      lastPoint.current = pt;
      currentPath.current.push(pt);
      return;
    }

    if (!shapeStart.current || !maskCanvasRef.current || !baseMaskData.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    ctx.putImageData(baseMaskData.current, 0, 0);
    drawShape(shapeStart.current, pt, annotationTool);
    lastPoint.current = pt;
  };

  const onBrushUp = () => {
    if (!isDrawing || !maskCanvasRef.current) return;
    setIsDrawing(false);
    const ctx = maskCanvasRef.current.getContext('2d')!;
    const maskData = ctx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);

    let center: { x: number; y: number } | null = null;
    if (annotationTool === 'brush') {
      const path = currentPath.current;
      if (path.length > 0) {
        center = {
          x: path.reduce((s, p) => s + p.x, 0) / path.length,
          y: path.reduce((s, p) => s + p.y, 0) / path.length,
        };
      }
    } else if (shapeStart.current && lastPoint.current) {
      center = {
        x: (shapeStart.current.x + lastPoint.current.x) / 2,
        y: (shapeStart.current.y + lastPoint.current.y) / 2,
      };
    }

    if (center) addAnnotationFromMask(maskData, center, annotationTool);

    lastPoint.current = null;
    currentPath.current = [];
    shapeStart.current = null;
    baseMaskData.current = null;
  };

  const updateAnnotationDesc = (id: number, desc: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, description: desc } : a));
  };

  const removeAnnotation = (id: number) => {
    let nextActive: number | null = activeAnnotation;
    setAnnotations(prev => {
      const updated = prev
        .filter(a => a.id !== id)
        .map((ann, index) => ({ ...ann, id: index + 1 }));

      redrawAnnotations(updated);

      if (activeAnnotation === id) nextActive = updated[0]?.id ?? null;
      else if (activeAnnotation && activeAnnotation > id) nextActive = activeAnnotation - 1;

      return updated;
    });
    setActiveAnnotation(nextActive);
  };

  const clearAllAnnotations = () => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    setAnnotations([]);
    setActiveAnnotation(null);
    lastPoint.current = null;
    currentPath.current = [];
    shapeStart.current = null;
    baseMaskData.current = null;
  };

  const applyAllEdits = async () => {
    const validAnnotations = annotations.filter(a => a.description.trim());
    if (validAnnotations.length === 0 || !canvasRef.current || !maskCanvasRef.current || isEditing) return;
    setIsEditing(true);
    try {
      const combinedPrompt = validAnnotations.map((a, i) => `${i + 1}. ${a.description}`).join('\n');
      const imageBase64 = canvasRef.current.toDataURL('image/png').split(',')[1];
      const maskBase64 = maskCanvasRef.current.toDataURL('image/png').split(',')[1];
      
      console.log('[RidoAI] Sending inpaint request with', validAnnotations.length, 'annotations');
      
      const result = await execute({
        taskType: 'inpaint',
        query: combinedPrompt,
        imageBase64,
        maskBase64,
      });
      
      console.log('[RidoAI] Inpaint result:', result?.result, 'images:', result?.images?.length);
      
      if (result?.images?.[0]) {
        const editedSrc = result.images[0];
        // Load edited image onto canvas
        const newImg = new window.Image();
        newImg.crossOrigin = 'anonymous';
        newImg.onload = () => {
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')!;
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.drawImage(newImg, 0, 0, canvasRef.current.width, canvasRef.current.height);
          }
          clearAllAnnotations();
          setBrushActive(false);
          setAnnotationTool('brush');
          setEditorImage(editedSrc);
        };
        newImg.onerror = () => {
          console.error('[RidoAI] Failed to load edited image');
        };
        newImg.src = editedSrc;

        const imageMsg: Msg = {
          role: 'assistant',
          content: pickImageReply('edit'),
          images: [editedSrc],
        };
        setMessages(prev => [...prev, imageMsg]);
        if (currentConvId) {
          await saveMsg(currentConvId, imageMsg);
          loadConversations();
        }
      } else {
        console.error('[RidoAI] No edited image returned:', result?.result);
      }
    } catch (err) {
      console.error('[RidoAI] Inpaint error:', err);
    } finally {
      setIsEditing(false);
    }
  };

  // ── Display ───────────────────────────────────────────────
  const displayMsgs = messages.length === 0
    ? [{ role: 'assistant' as const, content: WELCOME[mainMode] || '' }]
    : messages;

  const filteredConvs = searchQuery
    ? conversations.filter(c => c.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

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

  // ── Fullscreen Image Editor ───────────────────────────────
  if (editorImage) {
    const validAnnotationCount = annotations.filter(a => a.description.trim()).length;
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-background shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={ridoMascot} alt="RidoAI" className="w-9 h-9 object-contain flex-shrink-0" />
            <span className="font-bold text-sm">Edytor grafiki</span>
            {annotations.length > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                {annotations.length} {annotations.length === 1 ? 'zaznaczenie' : 'zaznaczeń'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
                onClick={() => setActiveTool('brush')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-all',
                  brushActive && annotationTool === 'brush'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-muted border-border'
                )}
              >
                <Paintbrush className="h-4 w-4" />
                {brushActive && annotationTool === 'brush' ? 'Pędzel ON' : 'Pędzel'}
              </button>
              <button
                onClick={() => setActiveTool('ellipse')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-all',
                  brushActive && annotationTool === 'ellipse'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-muted border-border'
                )}
              >
                <Circle className="h-4 w-4" />
                Owal
              </button>
              <button
                onClick={() => setActiveTool('rectangle')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-all',
                  brushActive && annotationTool === 'rectangle'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-muted border-border'
                )}
              >
                <Square className="h-4 w-4" />
                Prostokąt
              </button>
            {annotations.length > 0 && (
              <button onClick={clearAllAnnotations} className="p-2 rounded-lg hover:bg-muted border border-border" title="Wyczyść wszystko">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            {validAnnotationCount > 0 && (
              <Button
                size="sm"
                onClick={applyAllEdits}
                disabled={isEditing}
                className="rounded-lg text-xs font-semibold gap-1.5"
              >
                {isEditing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Popraw obrazek ({validAnnotationCount})
              </Button>
            )}
            <button onClick={() => downloadImage(editorImage)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-muted border border-border">
              <Download className="h-4 w-4" /> Pobierz
            </button>
            <button onClick={() => setEditorImage(null)} className="p-2 rounded-lg hover:bg-muted border border-border">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas area */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-muted/20">
            <div className="relative inline-block shadow-2xl rounded-2xl overflow-visible">
              <div className="rounded-2xl overflow-hidden border border-border">
                <canvas ref={canvasRef} className="block max-w-full max-h-[70vh]" style={{ touchAction: 'none' }} />
                <canvas
                  ref={maskCanvasRef}
                  className={cn('absolute inset-0 w-full h-full', brushActive ? 'cursor-crosshair' : 'pointer-events-none')}
                  style={{ touchAction: 'none' }}
                  onMouseDown={onBrushDown}
                  onMouseMove={onBrushMove}
                  onMouseUp={onBrushUp}
                  onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); lastPoint.current = null; } }}
                />
              </div>
              {brushActive && annotations.length === 0 && !isDrawing && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground text-xs px-3 py-1.5 rounded-full pointer-events-none font-semibold">
                  {annotationTool === 'brush' ? 'Zamaluj obszar który chcesz zmienić' : annotationTool === 'ellipse' ? 'Przeciągnij, aby zaznaczyć owal' : 'Przeciągnij, aby zaznaczyć prostokąt'}
                </div>
              )}
              {/* Numbered circles on image showing annotation positions */}
              {annotations.map(ann => {
                const canvas = maskCanvasRef.current;
                if (!canvas) return null;
                const rect = canvas.getBoundingClientRect();
                const scaleX = rect.width / canvas.width;
                const scaleY = rect.height / canvas.height;
                return (
                  <div
                    key={ann.id}
                    className={cn(
                      'absolute w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold pointer-events-none border-2 shadow-lg',
                      ann.description.trim()
                        ? 'bg-primary text-primary-foreground border-primary-foreground/30'
                        : 'bg-accent text-accent-foreground border-border'
                    )}
                    style={{
                      left: ann.center.x * scaleX - 14,
                      top: ann.center.y * scaleY - 14,
                    }}
                  >
                    {ann.id}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Annotations sidebar */}
          {annotations.length > 0 && (
            <div className="w-[320px] border-l bg-background flex flex-col flex-shrink-0">
              <div className="px-4 py-3 border-b">
                <h3 className="font-bold text-sm">Zaznaczenia</h3>
                <p className="text-[11px] text-muted-foreground">Opisz co zmienić w każdym obszarze</p>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                  {annotations.map(ann => (
                    <div
                      key={ann.id}
                      className={cn(
                        'rounded-xl border p-3 transition-all',
                        activeAnnotation === ann.id ? 'border-primary bg-primary/5' : 'border-border'
                      )}
                      onClick={() => setActiveAnnotation(ann.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                            {ann.id}
                          </span>
                          <span className="text-xs font-semibold text-foreground">Obszar {ann.id}</span>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); removeAnnotation(ann.id); }}
                          className="p-1 hover:bg-destructive/10 rounded-lg transition-colors"
                          title="Usuń zaznaczenie"
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={ann.description}
                        onChange={e => updateAnnotationDesc(ann.id, e.target.value)}
                        placeholder='np. "zmień kolor na niebieski"'
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
                        autoFocus={activeAnnotation === ann.id}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              {validAnnotationCount > 0 && (
                <div className="p-3 border-t">
                  <Button
                    onClick={applyAllEdits}
                    disabled={isEditing}
                    className="w-full rounded-xl font-semibold gap-2"
                  >
                    {isEditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Popraw obrazek ({validAnnotationCount} {validAnnotationCount === 1 ? 'zmiana' : 'zmian'})
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {isEditing && (
          <div className="px-5 py-3 border-t bg-background flex-shrink-0">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Edytuję obraz...
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative ml-auto w-full max-w-[780px] h-full flex bg-background shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-[260px] flex flex-col border-r bg-muted/20 flex-shrink-0">
            {/* Sidebar header */}
            <div className="p-3 border-b">
              <div className="flex items-center gap-2.5 mb-3">
                <img src={ridoMascot} alt="RidoAI" className="w-9 h-9 object-contain flex-shrink-0" />
                <div>
                  <h2 className="font-extrabold text-sm tracking-tight">RidoAI</h2>
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-widest">Asystent GetRido</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                className="w-full justify-start gap-2 h-9 text-xs font-semibold rounded-lg"
              >
                <Plus className="h-3.5 w-3.5" />
                Nowa rozmowa
              </Button>
            </div>

            <ScrollArea className="flex-1">
              {/* Projects section */}
              <AIProjectsSection
                userId={userId}
                activeProjectId={activeProjectId}
                onSelectProject={(id, name) => {
                  setActiveProjectId(id);
                  // Start new chat in project context
                  handleNewChat();
                  setInput(`Pracuję nad projektem "${name}". `);
                }}
              />

              {/* Divider */}
              <div className="border-t mx-3 my-2" />

              {/* Search */}
              <div className="px-3 py-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <input
                    type="text"
                    placeholder="Szukaj rozmów..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs font-medium rounded-lg bg-background border border-border/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50 text-foreground transition-all"
                  />
                </div>
              </div>

              {/* Conversations */}
              <div className="px-2 py-1 space-y-1">
                {groupedConvs.length === 0 && (
                  <div className="text-center py-8 px-4">
                    <MessageCircle className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
                    <p className="text-[10px] text-muted-foreground/50 font-medium">Brak rozmów</p>
                  </div>
                )}
                {groupedConvs.map(group => (
                  <div key={group.label}>
                    <p className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map(conv => {
                        const isActive = currentConvId === conv.id;
                        return (
                          <ConvItemInline
                            key={conv.id}
                            title={conv.title}
                            active={isActive}
                            onClick={() => loadConversation(conv.id)}
                            onDelete={(e) => deleteConversation(conv.id, e)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main chat */}
        <div className="flex-1 flex flex-col min-w-0" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title={sidebarOpen ? 'Ukryj historię' : 'Pokaż historię'}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" /> : <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />}
            </button>

            {!sidebarOpen && (
              <>
                <div className="relative">
                  <img src={ridoMascot} alt="RidoAI" className="w-9 h-9 object-contain flex-shrink-0" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-sm tracking-tight flex items-center gap-1.5">
                    RidoAI <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-semibold">Asystent AI portalu GetRido</p>
                </div>
              </>
            )}

            <div className="flex-1" />

            {/* Mode tabs inline */}
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-xl p-0.5">
              {([
                { key: 'chat' as const, label: 'Chat', icon: MessageCircle },
                { key: 'cowork' as const, label: 'Cowork', icon: Briefcase, locked: true },
              ]).map(({ key, label, icon: Icon, locked }) => (
                <button
                  key={key}
                  onClick={() => !locked && switchMode(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all',
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

            <div className="flex items-center gap-0.5">
              <button onClick={handleNewChat} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Nowa rozmowa">
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Zamknij">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
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
                  <h3 className="font-extrabold text-lg">Cowork — wkrótce!</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm font-medium">
                    Tryb Cowork pozwoli Ci sterować portalem głosem i tekstem.
                    Wystawiaj faktury, szukaj usług, zarządzaj zadaniami — wszystko przez AI.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => switchMode('chat')} className="rounded-lg font-semibold">
                  Wróć do chatu
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Drag overlay */}
              {isDragging && (
                <div className="absolute inset-0 z-20 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <Paperclip className="h-10 w-10 text-primary mx-auto mb-2" />
                    <p className="text-sm font-bold text-primary">Upuść pliki tutaj</p>
                  </div>
                </div>
              )}

              {/* Messages */}
              <ScrollArea ref={scrollRef} className="flex-1 px-5 py-5">
                <div className="space-y-5 max-w-xl mx-auto">
                  {displayMsgs.map((msg, i) => {
                    if (msg.role === 'assistant' && msg.content === '' && isLoading && i === displayMsgs.length - 1) return null;
                    return (
                      <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                        {msg.role === 'assistant' && (
                          <img src={ridoMascot} alt="AI" className="w-9 h-9 object-contain flex-shrink-0 mt-0.5" />
                        )}
                        <div className={cn(
                          'max-w-[85%] leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-muted rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm text-foreground'
                            : 'bg-primary text-primary-foreground rounded-2xl rounded-bl-sm px-4 py-3'
                        )}>
                          {msg.role === 'assistant' ? (
                            <>
                              {(() => {
                                const cleanContent = (msg.content || '')
                                  .replace(/ACTION:\{.*?\}/s, '')
                                  .replace(/IMAGE_REQUEST:true/g, '')
                                  .trim();
                                return cleanContent ? (
                                  <div className="prose prose-sm max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&>li]:mb-0.5 [&_strong]:font-bold [&>p]:text-[14px] [&>p]:leading-relaxed [&>p]:font-medium [&>li]:text-[14px] [&>li]:font-medium text-primary-foreground [&_strong]:text-primary-foreground [&_li]:text-primary-foreground [&_a]:text-primary-foreground/80">
                                    <ReactMarkdown>{cleanContent}</ReactMarkdown>
                                  </div>
                                ) : null;
                              })()}
                              {msg.images?.map((img, idx) => (
                                <div key={idx} className="relative group mt-4 overflow-hidden rounded-2xl border border-border/50 bg-background shadow-sm">
                                  <img
                                    src={img}
                                    alt="Wygenerowana grafika"
                                    className="w-full cursor-pointer hover:opacity-95 transition-opacity"
                                    onClick={() => openEditor(img)}
                                  />
                                  <div className="absolute top-2 left-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); downloadImage(img); }} className="bg-background/90 backdrop-blur-sm text-foreground p-2 rounded-lg shadow-md border border-border/50 hover:bg-background transition-colors" title="Pobierz">
                                      <Download className="h-4 w-4" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); openEditor(img); }} className="bg-background/90 backdrop-blur-sm text-foreground p-2 rounded-lg shadow-md border border-border/50 hover:bg-background transition-colors" title="Edytuj pędzlem">
                                      <Paintbrush className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap text-[14px] font-semibold text-foreground">{msg.content}</p>
                              {msg.images?.map((img, idx) => (
                                <div key={idx} className="relative group mt-3 overflow-hidden rounded-2xl border border-border/50 bg-background shadow-sm">
                                  <img
                                    src={img}
                                    alt="Załączony obraz"
                                    className="w-full cursor-pointer hover:opacity-95 transition-opacity"
                                    onClick={() => openEditor(img)}
                                  />
                                  <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openEditor(img); }}
                                      className="bg-background/90 backdrop-blur-sm text-foreground p-2 rounded-lg shadow-md border border-border/50 hover:bg-background transition-colors"
                                      title="Edytuj pędzlem"
                                    >
                                      <Paintbrush className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </>
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
                      <img src={ridoMascot} alt="AI" className="w-9 h-9 object-contain flex-shrink-0 mt-0.5" />
                      <div className="bg-primary rounded-2xl rounded-bl-sm px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {[0, 200, 400].map(d => (
                            <span key={d} className="w-2.5 h-2.5 rounded-full bg-primary-foreground/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Attached files preview */}
              {attachedFiles.length > 0 && (
                <div className="px-4 py-2 border-t bg-muted/20">
                  <div className="flex flex-wrap gap-2 max-w-xl mx-auto">
                    {attachedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        {file.type.startsWith('image/') && (
                          <button onClick={() => openAttachedImageEditor(file)} className="p-0.5 hover:bg-primary/10 rounded" title="Otwórz w edytorze">
                            <Paintbrush className="h-3 w-3 text-primary" />
                          </button>
                        )}
                        <button onClick={() => removeFile(idx)} className="p-0.5 hover:bg-destructive/10 rounded">
                          <X className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-4 py-3 border-t bg-background">
                <div className="flex items-end gap-2 max-w-xl mx-auto">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.xlsx"
                    className="hidden"
                    onChange={e => handleFileSelect(e.target.files)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl hover:bg-muted transition-colors border border-border/50 flex-shrink-0"
                    title="Dodaj plik"
                  >
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Zadaj pytanie RidoAI..."
                    disabled={isLoading}
                    className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl text-sm font-medium border border-border/50 bg-background px-4 py-3 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50 transition-all"
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
                <p className="text-[10px] text-muted-foreground/50 text-center mt-2 font-semibold">
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

function ConvItemInline({ title, active, onClick, onDelete }: {
  title: string | null;
  active: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <MessageCircle className="h-4 w-4 flex-shrink-0 opacity-60" />
      <span className="text-sm font-medium flex-1 truncate min-w-0">
        {title || 'Nowa rozmowa'}
      </span>
      {(hovered || active) && (
        <button
          onClick={onDelete}
          title="Usuń rozmowę"
          className="p-1 rounded-md hover:bg-destructive/20 flex-shrink-0 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      )}
    </div>
  );
}
