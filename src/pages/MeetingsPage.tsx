import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Mic, MicOff, Upload, FileAudio, Clock, CheckCircle2,
  AlertCircle, ArrowLeft, Loader2, Play, Square, Sparkles,
  ListTodo, MessageSquare, ChevronRight, Trash2, Search, Copy,
  Pencil, X, Check, XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

const RIDO_AVATAR = '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png';

// Feature flag po emailu (NIE po roli) — dostęp tylko dla admina.
const ALLOWED_EMAIL = 'daniel.moshechkov@gmail.com';

// Kontener nagrania: pierwszy wspierany przez przeglądarkę I przez Deepgram.
const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];
function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return RECORDER_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}
function extForMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('m4a') || m.includes('mp4') || m.includes('aac') || m.includes('quicktime')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'webm';
}

// Upload audio: iOS Dyktafon (Voice Memos) zapisuje .m4a, a MIME bywa
// audio/x-m4a, audio/mp4 albo PUSTY — dlatego akceptujemy też po rozszerzeniu.
const UPLOAD_AUDIO_EXTS = ['m4a', 'mp3', 'wav', 'mp4', 'webm', 'ogg', 'aac', 'flac', 'aiff', 'aif', 'caf', 'm4b', '3gp'];
const UPLOAD_MAX_BYTES = 500 * 1024 * 1024; // 500 MB (kilkugodzinne nagrania M4A)

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}
function fmtMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? mb.toFixed(0) : mb.toFixed(1);
}
function isAcceptableAudio(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('audio/')) return true;
  if (t === 'video/mp4' || t === 'video/quicktime') return true; // audio z iOS w kontenerze mp4/mov
  return UPLOAD_AUDIO_EXTS.includes(fileExt(file.name)); // pusty MIME → ratujemy się rozszerzeniem
}
// Walidacja PRZED uploadem — odsiewa puste/uszkodzone nagrania (np. webm bez
// nagłówka EBML 1A45DFA3), żeby nie wysyłać do transkrypcji bajtów, które
// Deepgram i tak odrzuci jako "corrupt or unsupported data".
async function isLikelyValidAudio(blob: Blob, mime: string): Promise<boolean> {
  if (blob.size < 2000) return false; // praktycznie cisza / pusty kontener
  if (mime.includes('webm')) {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  }
  return true; // mp4/ogg — poleganie na rozmiarze + walidacji Deepgramu
}

// Transkrypt z etykietami "Mówca N:" → jeden ciągły tekst całej rozmowy.
function toPlainText(transcript: string | null | undefined): string {
  if (!transcript) return '';
  return transcript
    .split('\n')
    .map((l) => l.replace(/^Mówca\s+\d+:\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Meeting {
  id: string;
  title: string;
  status: string;
  source_type: string;
  duration_seconds: number | null;
  participants: string[] | null;
  transcript: string | null;
  summary: string | null;
  key_points: string[];
  sentiment: string | null;
  questions_unresolved: string[];
  created_at: string;
  // Reużyte (bez zmian schematu) na powód błędu: { error: 'no_speech' | 'recording' }
  next_meeting_suggestion: any | null;
}

interface MeetingTask {
  id: string;
  task: string;
  assignee: string | null;
  deadline: string | null;
  priority: string;
  source_quote: string | null;
  is_completed: boolean;
}

interface MeetingDecision {
  id: string;
  decision: string;
  rationale: string | null;
  impact: string | null;
}

export default function MeetingsPage() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  const [decisions, setDecisions] = useState<MeetingDecision[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryAnswer, setMemoryAnswer] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'live' | 'detail'>('list');
  const [transcriptMode, setTranscriptMode] = useState<'speakers' | 'plain'>('speakers');
  const [pickedInfo, setPickedInfo] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Rozmowy, których transkrypcja TRWA w tej chwili (w tej sesji) — tylko one
  // pokazują "Przetwarzanie". Zacięte rekordy z przeszłości nie są tu obecne.
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const chosenMimeRef = useRef<string>('audio/webm');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gating po emailu zalogowanego usera — reszta nie widzi wejścia.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email?.toLowerCase();
      setAccess(email === ALLOWED_EMAIL ? 'granted' : 'denied');
    });
  }, []);

  useEffect(() => {
    if (access === 'granted') loadMeetings();
  }, [access]);

  const loadMeetings = async () => {
    const { data } = await supabase
      .from('meetings')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setMeetings(data as any);
  };

  const loadMeetingDetails = async (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    const [{ data: t }, { data: d }] = await Promise.all([
      supabase.from('meeting_tasks').select('*').eq('meeting_id', meeting.id).order('created_at'),
      supabase.from('meeting_decisions').select('*').eq('meeting_id', meeting.id).order('created_at'),
    ]);
    setTasks((t || []) as any);
    setDecisions((d || []) as any);
    setActiveView('detail');
  };

  // Kopiowanie do schowka
  const copyText = useCallback(async (text: string | null | undefined, label: string) => {
    if (!text) { toast.error('Nic do skopiowania'); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} skopiowano`);
    } catch {
      toast.error('Nie udało się skopiować');
    }
  }, []);

  // Wspólny pipeline: zapis rekordu -> upload do prywatnego bucketu -> transkrypcja.
  // Silnik transkrypcji jest niewidoczny dla UI (komunikaty brandowane jako Asystent GetRido).
  const processAudio = useCallback(async (
    blob: Blob,
    sourceType: 'live' | 'upload',
    durationSeconds: number | null,
    mimeType: string,
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Sesja wygasła — zaloguj się ponownie'); return; }

    const title = meetingTitle.trim() || `Rozmowa ${new Date().toLocaleDateString('pl-PL')}`;
    const ct = mimeType || blob.type || 'audio/webm';

    // 1) rekord spotkania (status processing do czasu streszczenia)
    const { data: meeting, error: insErr } = await supabase
      .from('meetings')
      .insert({ user_id: user.id, title, status: 'processing', source_type: sourceType, duration_seconds: durationSeconds })
      .select('*')
      .single();
    if (insErr || !meeting) { toast.error('Nie udało się zapisać rozmowy'); return; }

    // Oznacz jako "trwa teraz" — tylko takie pokazują "Przetwarzanie".
    setActiveIds((prev) => new Set(prev).add(meeting.id));
    try {
      // 2) upload audio do prywatnego bucketu (RLS: pierwszy folder = uid usera)
      // Dla uploadu zachowaj oryginalne rozszerzenie (m4a/mp3/wav…); dla nagrania użyj MIME.
      const nameExt = (blob as File).name ? fileExt((blob as File).name) : '';
      const ext = UPLOAD_AUDIO_EXTS.includes(nameExt) ? nameExt : extForMime(ct);
      const path = `${user.id}/${meeting.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('meeting-audio')
        .upload(path, blob, { contentType: ct, upsert: true });
      if (upErr) {
        await markFailed(meeting.id, 'recording');
        toast.error('Nie udało się wgrać nagrania');
        await loadMeetings();
        return;
      }
      await supabase.from('meetings').update({ audio_url: path }).eq('id', meeting.id);

      // 3) transkrypcja (URL nagrania) z backstopem czasowym — rozmowa NIE może
      //    wisieć w nieskończoność. Po przekroczeniu limitu → status 'failed'.
      const TIMEOUT_MS = 300000; // 5 min — zapas dla długich (kilkugodzinnych) nagrań
      let tr: any = null, trErr: any = null;
      try {
        const res: any = await Promise.race([
          supabase.functions.invoke('deepgram-transcribe', { body: { meeting_id: meeting.id, audio_path: path } }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
        ]);
        tr = res?.data; trErr = res?.error;
      } catch {
        await markFailed(meeting.id, 'recording');
        toast.error('Transkrypcja trwała zbyt długo — oznaczono jako błąd.');
        await loadMeetings();
        return;
      }
      // Transport-level błąd — oznacz jako błąd nagrania.
      if (trErr) {
        await markFailed(meeting.id, 'recording');
        toast.error('Nie udało się utworzyć transkrypcji');
        await loadMeetings();
        return;
      }
      // Funkcja zwróciła błąd (status już ustawiła) — pokaż właściwy komunikat.
      if (tr?.error) {
        toast.error(tr.reason === 'no_speech'
          ? 'Nie wykryto mowy w nagraniu — mów wyraźniej i bliżej mikrofonu.'
          : 'Nie udało się utworzyć transkrypcji');
        await loadMeetings();
        return;
      }

      toast.success('Transkrypcja gotowa — kliknij „Streść"');
      setMeetingTitle('');
      await loadMeetings();
      const { data: full } = await supabase.from('meetings').select('*').eq('id', meeting.id).single();
      if (full) await loadMeetingDetails(full as any);
    } finally {
      setActiveIds((prev) => { const n = new Set(prev); n.delete(meeting.id); return n; });
    }
  }, [meetingTitle]);

  // Oznacza rozmowę jako błąd (z powodem) — wspólne dla wszystkich ścieżek błędu.
  const markFailed = async (id: string, reason: 'recording' | 'no_speech') => {
    await supabase.from('meetings')
      .update({ status: 'failed', next_meeting_suggestion: { error: reason } })
      .eq('id', id);
  };

  // Streszczenie transkryptu (silnik Claude pod spodem, niewidoczny dla UI).
  const summarizeMeeting = useCallback(async (meeting: Meeting) => {
    if (!meeting.transcript) { toast.error('Brak transkryptu do streszczenia'); return; }
    setIsSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('meeting-ai', {
        body: {
          action: 'analyze_transcript',
          meeting_id: meeting.id,
          transcript: meeting.transcript,
          title: meeting.title,
          provider: 'claude',
        },
      });
      if (error || data?.error) throw new Error(data?.error || 'Błąd');
      toast.success('Streszczenie gotowe');
      await loadMeetings();
      const { data: full } = await supabase.from('meetings').select('*').eq('id', meeting.id).single();
      if (full) await loadMeetingDetails(full as any);
    } catch {
      toast.error('Nie udało się streścić rozmowy');
    } finally {
      setIsSummarizing(false);
    }
  }, []);

  // Miernik poziomu mikrofonu — czyta TEN SAM strumień, który nagrywamy,
  // więc na żywo potwierdza, że dźwięk realnie trafia do nagrania (nie tylko podgląd).
  const startLevelMeter = (stream: MediaStream) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        setMicLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* miernik jest opcjonalny */ }
  };
  const stopLevelMeter = () => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicLevel(0);
  };

  // === LIVE RECORDING ===
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // Upewnij się, że jest żywa ścieżka audio (inaczej nagramy ciszę).
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== 'live') {
        stream.getTracks().forEach((t) => t.stop());
        toast.error('Mikrofon nie przesyła dźwięku — sprawdź uprawnienia/urządzenie');
        return;
      }

      const mime = pickRecorderMime();
      chosenMimeRef.current = mime || 'audio/webm';
      const mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(); // bez timeslice — jeden spójny plik z nagłówkiem
      setIsRecording(true);
      setActiveView('live');
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
      startLevelMeter(stream);

      toast.success('Nagrywanie rozpoczęte');
    } catch (err) {
      toast.error('Nie udało się uruchomić mikrofonu');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    clearInterval(timerRef.current);
    const duration = recordingTime;
    const mime = chosenMimeRef.current;
    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        stopLevelMeter();
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        setIsRecording(false);

        // Walidacja PRZED uploadem — nie wysyłamy pustych/uszkodzonych nagrań.
        const ok = await isLikelyValidAudio(blob, mime);
        if (!ok) {
          toast.error('Nagranie nie powiodło się (puste lub uszkodzone). Sprawdź mikrofon i spróbuj ponownie.');
          setActiveView('list');
          resolve();
          return;
        }

        setIsProcessing(true);
        try {
          await processAudio(blob, 'live', duration || null, mime);
        } finally {
          setIsProcessing(false);
        }
        resolve();
      };
      mediaRecorderRef.current!.stop();
      mediaRecorderRef.current!.stream.getTracks().forEach((t) => t.stop());
    });
  }, [recordingTime, processAudio]);

  // === FILE UPLOAD ===
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const resetInput = () => { if (fileInputRef.current) fileInputRef.current.value = ''; };

    // Walidacja typu — czytelny komunikat zamiast cichego nic.
    if (!isAcceptableAudio(file)) {
      setPickedInfo(null);
      toast.error('To nie wygląda na plik audio. Wybierz nagranie (.m4a, .mp3, .wav, .webm, .ogg…).');
      resetInput();
      return;
    }
    // Walidacja rozmiaru.
    if (file.size > UPLOAD_MAX_BYTES) {
      setPickedInfo(null);
      toast.error(`Plik za duży (${fmtMB(file.size)} MB). Maksimum 500 MB.`);
      resetInput();
      return;
    }
    if (file.size < 2000) {
      setPickedInfo(null);
      toast.error('Plik jest pusty lub uszkodzony.');
      resetInput();
      return;
    }

    // Pokaż co wybrano (nazwa + rozmiar) — user widzi, że plik się załadował.
    setPickedInfo(`${file.name} (${fmtMB(file.size)} MB)`);
    // MIME bywa pusty na iOS — uzupełnij z rozszerzenia.
    const mime = file.type || `audio/${fileExt(file.name) || 'm4a'}`;

    setIsProcessing(true);
    try {
      await processAudio(file, 'upload', null, mime);
    } finally {
      setIsProcessing(false);
      resetInput();
    }
  }, [processAudio]);

  // === C: USUWANIE / ZMIANA NAZWY / ZAZNACZANIE ===
  // Usuwa rekord (kaskadowo tasks/decisions) + plik audio z bucketu. Bez SQL.
  const deleteMeetings = useCallback(async (items: Meeting[], silent = false) => {
    if (!items.length) return;
    const paths = items.map((m) => m.audio_url).filter(Boolean) as string[];
    if (paths.length) {
      await supabase.storage.from('meeting-audio').remove(paths);
    }
    const { error } = await supabase.from('meetings').delete().in('id', items.map((m) => m.id));
    if (error) { toast.error('Nie udało się usunąć'); return; }
    if (!silent) toast.success(items.length > 1 ? `Usunięto ${items.length} rozmów` : 'Rozmowa usunięta');
    setSelectedIds(new Set());
    if (selectedMeeting && items.some((m) => m.id === selectedMeeting.id)) {
      setSelectedMeeting(null);
      setActiveView('list');
    }
    await loadMeetings();
  }, [selectedMeeting]);

  const renameMeeting = useCallback(async (id: string, title: string) => {
    const clean = title.trim();
    if (!clean) { setEditingId(null); return; }
    const { error } = await supabase.from('meetings').update({ title: clean }).eq('id', id);
    if (error) { toast.error('Nie udało się zmienić nazwy'); return; }
    setEditingId(null);
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, title: clean } : m)));
    if (selectedMeeting?.id === id) setSelectedMeeting({ ...selectedMeeting, title: clean });
  }, [selectedMeeting]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Etykieta + wygląd statusu na liście.
  // 'open' = czy wiersz da się otworzyć (kliknięciem).
  const statusInfo = (m: Meeting): { label: string; tone: 'ok' | 'ready' | 'busy' | 'error'; muted: boolean; open: boolean } => {
    if (m.status === 'completed') return { label: 'Gotowe', tone: 'ok', muted: false, open: true };
    if (m.status === 'failed') {
      const reason = m.next_meeting_suggestion?.error;
      return { label: reason === 'no_speech' ? 'Błąd — nie wykryto mowy' : 'Błąd nagrania', tone: 'error', muted: true, open: false };
    }
    if (m.status === 'processing') {
      // "Przetwarzanie" TYLKO gdy transkrypcja realnie trwa w tej chwili.
      if (activeIds.has(m.id)) return { label: 'Przetwarzanie', tone: 'busy', muted: true, open: false };
      // Przetranskrybowane, czeka na streszczenie — otwieralne (można kliknąć „Streść").
      if (m.transcript && m.transcript.trim()) return { label: 'Do streszczenia', tone: 'ready', muted: false, open: true };
      // Zacięte z przeszłości (brak transkryptu, nic nie trwa) — przerwane, do usunięcia.
      return { label: 'Przerwane', tone: 'error', muted: true, open: false };
    }
    return { label: m.status, tone: 'busy', muted: true, open: false };
  };

  // === MEMORY QUERY ===
  const handleMemoryQuery = useCallback(async () => {
    if (!memoryQuery.trim() || isQuerying) return;
    setIsQuerying(true);
    setMemoryAnswer('');
    try {
      const { data, error } = await supabase.functions.invoke('meeting-ai', {
        body: { action: 'query_meetings', query: memoryQuery },
      });
      if (error) throw error;
      setMemoryAnswer(data.answer);
    } catch (err: any) {
      toast.error('Błąd zapytania');
    } finally {
      setIsQuerying(false);
    }
  }, [memoryQuery, isQuerying]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const toggleTaskComplete = async (taskId: string, completed: boolean) => {
    await supabase.from('meeting_tasks').update({ is_completed: !completed }).eq('id', taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_completed: !completed } : t));
  };

  // Gating po emailu — reszta userów nie widzi wejścia.
  if (access === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (access === 'denied') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => activeView === 'list' ? navigate(-1) : setActiveView('list')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={RIDO_AVATAR} alt="Asystent GetRido" className="w-8 h-8 rounded-full" />
          <div>
            <h1 className="font-bold text-sm flex items-center gap-1.5">
              Asystent GetRido <Sparkles className="h-3.5 w-3.5 text-primary" />
            </h1>
            <p className="text-[11px] text-muted-foreground">Nagrywanie i streszczenia rozmów</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* === LIST VIEW === */}
        {activeView === 'list' && (
          <div className="space-y-6">
            {/* Powitanie RidoAI (tekstowe) */}
            <Card className="p-4 flex items-start gap-3 border-primary/20 bg-primary/5">
              <img src={RIDO_AVATAR} alt="Asystent GetRido" className="w-9 h-9 rounded-full flex-shrink-0" />
              <p className="text-sm leading-relaxed">
                Cześć Danielu. Słucham — wpisz, z kim rozmawiasz, kliknij <b>nagrywanie</b>,
                a po rozmowie wyciągnę w punktach, czego klient potrzebuje.
              </p>
            </Card>

            {/* Pole „Z kim / temat" — zapis do meetings.title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Z kim rozmawiasz / temat
              </label>
              <Input
                placeholder='np. „Firma X — moduły obsługi firmowej"'
                value={meetingTitle}
                onChange={e => setMeetingTitle(e.target.value)}
                className="max-w-md"
              />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card 
                className="p-6 cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary/50 group"
                onClick={startRecording}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition">
                    <Mic className="h-6 w-6 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Nagrywaj rozmowę</h3>
                    <p className="text-xs text-muted-foreground">Mów — po zakończeniu zrobię transkrypt i streszczenie</p>
                  </div>
                </div>
              </Card>

              <Card 
                className="p-6 cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary/50 group"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Wrzuć plik</h3>
                    <p className="text-xs text-muted-foreground">MP3, WAV, M4A, MP4, WEBM</p>
                  </div>
                </div>
                {/* iOS: jawne typy + rozszerzenia (samo audio/* bywa za mało, by pokazać .m4a z Dyktafonu).
                    BEZ atrybutu capture — capture wymusiłby nagrywanie zamiast wyboru pliku. */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.m4a,.mp3,.wav,.mp4,.webm,.ogg,audio/x-m4a,audio/mp4"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </Card>
            </div>

            {/* Potwierdzenie wybranego pliku (nazwa + rozmiar) */}
            {pickedInfo && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileAudio className="h-3.5 w-3.5 flex-shrink-0" />
                Wybrano: <span className="font-medium text-foreground break-all">{pickedInfo}</span>
              </p>
            )}

            {/* Processing indicator */}
            {isProcessing && (
              <Card className="p-6 border-primary/30 bg-primary/5">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">Analizuję spotkanie...</p>
                    <p className="text-xs text-muted-foreground">Transkrypcja i generowanie raportu</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Memory Query */}
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Zapytaj o spotkania
              </h3>
              <div className="flex gap-2">
                <Input
                  value={memoryQuery}
                  onChange={e => setMemoryQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleMemoryQuery()}
                  placeholder="Co mieliśmy zrobić do piątku?"
                  className="flex-1"
                />
                <Button onClick={handleMemoryQuery} disabled={isQuerying} size="icon">
                  {isQuerying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {memoryAnswer && (
                <div className="mt-3 p-3 bg-muted rounded-lg text-sm prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{memoryAnswer}</ReactMarkdown>
                </div>
              )}
            </Card>

            {/* Meetings History */}
            <div>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h3 className="font-semibold">Moje rozmowy</h3>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Zaznaczono {selectedIds.size}</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5"
                      onClick={() => {
                        if (window.confirm(`Usunąć ${selectedIds.size} zaznaczonych rozmów?`)) {
                          deleteMeetings(meetings.filter((m) => selectedIds.has(m.id)));
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Usuń zaznaczone
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Wyczyść</Button>
                  </div>
                )}
              </div>
              {meetings.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <FileAudio className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Brak rozmów. Nagraj lub wrzuć plik audio.</p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {meetings.map((m) => {
                    const st = statusInfo(m);
                    const isEditing = editingId === m.id;
                    return (
                      <Card
                        key={m.id}
                        className={cn(
                          'p-4 transition group',
                          st.muted && 'opacity-70',
                          st.tone === 'error' && 'border-red-500/30',
                          st.open && 'cursor-pointer hover:shadow-md',
                        )}
                        onClick={() => { if (st.open && !isEditing) loadMeetingDetails(m); }}
                      >
                        <div className="flex items-center gap-3">
                          {/* Zaznaczanie hurtem */}
                          <input
                            type="checkbox"
                            className="h-4 w-4 flex-shrink-0 accent-primary cursor-pointer"
                            checked={selectedIds.has(m.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelected(m.id)}
                          />
                          {/* Ikona statusu */}
                          <div className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                            st.tone === 'ok' ? 'bg-green-500/10' :
                            st.tone === 'ready' ? 'bg-primary/10' :
                            st.tone === 'busy' ? 'bg-amber-500/10' : 'bg-red-500/10',
                          )}>
                            {st.tone === 'ok' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                             st.tone === 'ready' ? <Sparkles className="h-5 w-5 text-primary" /> :
                             st.tone === 'busy' ? <Loader2 className="h-5 w-5 text-amber-500 animate-spin" /> :
                             <XCircle className="h-5 w-5 text-red-500" />}
                          </div>
                          {/* Tytuł (z edycją inline) + data + status */}
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  autoFocus
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') renameMeeting(m.id, editTitle);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  className="h-8 text-sm"
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => renameMeeting(m.id, editTitle)}>
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm truncate">{m.title}</p>
                                <button
                                  className="flex-shrink-0"
                                  onClick={(e) => { e.stopPropagation(); setEditingId(m.id); setEditTitle(m.title); }}
                                  title="Zmień nazwę"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground" />
                                </button>
                              </div>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                              <span>{new Date(m.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-full',
                                st.tone === 'ok' ? 'bg-green-500/10 text-green-600' :
                                st.tone === 'ready' ? 'bg-primary/10 text-primary' :
                                st.tone === 'busy' ? 'bg-amber-500/10 text-amber-600' :
                                'bg-red-500/10 text-red-600',
                              )}>{st.label}</span>
                            </p>
                          </div>
                          {/* Usuń pojedynczo — ZAWSZE widoczny (też na mobile i przy zaciętych) */}
                          <button
                            className="flex-shrink-0 p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Usunąć tę rozmowę?')) deleteMeetings([m]);
                            }}
                            title="Usuń"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground/60 hover:text-red-500" />
                          </button>
                          {st.open && <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition flex-shrink-0" />}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === LIVE VIEW === */}
        {activeView === 'live' && (
          <div className="space-y-4">
            <Card className="p-6 border-red-500/30 bg-red-500/5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-bold text-red-600">NA ŻYWO</span>
                  <span className="text-sm font-mono text-muted-foreground">{formatTime(recordingTime)}</span>
                </div>
                <Button variant="destructive" onClick={stopRecording} className="gap-2">
                  <Square className="h-4 w-4" />
                  Zakończ spotkanie
                </Button>
              </div>
              
              <div className="bg-background rounded-lg p-5 min-h-[160px] flex flex-col items-center justify-center gap-4">
                <Mic className={cn('h-10 w-10', micLevel > 0.06 ? 'text-red-500' : 'text-muted-foreground')} />
                {/* Pasek poziomu — potwierdza, że mikrofon realnie nagrywa */}
                <div className="w-full max-w-xs h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-75',
                      micLevel > 0.06 ? 'bg-red-500' : 'bg-muted-foreground/40')}
                    style={{ width: `${Math.round(micLevel * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {micLevel > 0.06
                    ? 'Słyszę Cię — mów spokojnie. Transkrypt pojawi się po zakończeniu.'
                    : 'Czekam na dźwięk… mów do mikrofonu.'}
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* === DETAIL VIEW === */}
        {activeView === 'detail' && selectedMeeting && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-bold">{selectedMeeting.title}</h2>
              <div className="flex items-center gap-2">
                {selectedMeeting.sentiment && (
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    selectedMeeting.sentiment === 'pozytywny' ? 'bg-green-500/10 text-green-600' :
                    selectedMeeting.sentiment === 'negatywny' ? 'bg-red-500/10 text-red-600' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {selectedMeeting.sentiment}
                  </span>
                )}
                {selectedMeeting.transcript && (
                  <Button size="sm" onClick={() => summarizeMeeting(selectedMeeting)} disabled={isSummarizing} className="gap-2">
                    {isSummarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {selectedMeeting.summary ? 'Streść ponownie' : 'Streść'}
                  </Button>
                )}
              </div>
            </div>

            <Tabs key={selectedMeeting.id} defaultValue={selectedMeeting.summary ? 'summary' : 'transcript'} className="space-y-4">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="summary">📋 Podsumowanie</TabsTrigger>
                <TabsTrigger value="tasks">🎯 Zadania ({tasks.length})</TabsTrigger>
                <TabsTrigger value="decisions">📌 Decyzje ({decisions.length})</TabsTrigger>
                <TabsTrigger value="transcript">📝 Transkrypcja</TabsTrigger>
              </TabsList>

              <TabsContent value="summary">
                <Card className="p-5">
                  {!selectedMeeting.summary && !selectedMeeting.key_points?.length ? (
                    <div className="text-center text-sm text-muted-foreground py-6">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      Brak streszczenia. Kliknij <b>„Streść"</b> u góry, aby wyciągnąć punkty, ustalenia i zadania.
                    </div>
                  ) : (
                  <div className="flex items-center justify-end mb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => copyText(
                        [
                          selectedMeeting.summary || '',
                          selectedMeeting.key_points?.length ? '\nKluczowe punkty:\n' + selectedMeeting.key_points.map(p => `• ${p}`).join('\n') : '',
                        ].filter(Boolean).join('\n'),
                        'Streszczenie',
                      )}
                    >
                      <Copy className="h-3.5 w-3.5" /> Kopiuj
                    </Button>
                  </div>
                  )}
                  {selectedMeeting.summary && (
                    <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
                      <ReactMarkdown>{selectedMeeting.summary}</ReactMarkdown>
                    </div>
                  )}
                  {selectedMeeting.key_points?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Kluczowe punkty:</h4>
                      <ul className="space-y-1.5">
                        {selectedMeeting.key_points.map((p, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-primary mt-0.5">•</span>
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedMeeting.questions_unresolved?.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        Pytania bez odpowiedzi:
                      </h4>
                      <ul className="space-y-1">
                        {selectedMeeting.questions_unresolved.map((q, i) => (
                          <li key={i} className="text-sm text-muted-foreground">❓ {q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="tasks">
                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <Card className="p-6 text-center text-muted-foreground text-sm">Brak zadań</Card>
                  ) : tasks.map(t => (
                    <Card key={t.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleTaskComplete(t.id, t.is_completed)} className="mt-0.5">
                          <CheckCircle2 className={cn(
                            "h-5 w-5 transition",
                            t.is_completed ? "text-green-500" : "text-muted-foreground/30 hover:text-green-500/50"
                          )} />
                        </button>
                        <div className="flex-1">
                          <p className={cn("text-sm font-medium", t.is_completed && "line-through text-muted-foreground")}>{t.task}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {t.assignee && <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">👤 {t.assignee}</span>}
                            {t.deadline && <span className="text-[11px] bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full">📅 {t.deadline}</span>}
                            <span className={cn(
                              "text-[11px] px-2 py-0.5 rounded-full",
                              t.priority === 'critical' ? 'bg-red-500/10 text-red-600' :
                              t.priority === 'high' ? 'bg-orange-500/10 text-orange-600' :
                              t.priority === 'medium' ? 'bg-blue-500/10 text-blue-600' :
                              'bg-muted text-muted-foreground'
                            )}>
                              {t.priority}
                            </span>
                          </div>
                          {t.source_quote && (
                            <p className="text-[11px] text-muted-foreground mt-1.5 italic border-l-2 border-primary/30 pl-2">
                              „{t.source_quote}"
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="decisions">
                <div className="space-y-2">
                  {decisions.length === 0 ? (
                    <Card className="p-6 text-center text-muted-foreground text-sm">Brak decyzji</Card>
                  ) : decisions.map(d => (
                    <Card key={d.id} className="p-4">
                      <p className="text-sm font-medium">📌 {d.decision}</p>
                      {d.rationale && <p className="text-xs text-muted-foreground mt-1">Powód: {d.rationale}</p>}
                      {d.impact && <p className="text-xs text-amber-600 mt-0.5">Wpływ: {d.impact}</p>}
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="transcript">
                <Card className="p-5">
                  {selectedMeeting.transcript ? (
                    <>
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        {/* Przełącznik widoku transkryptu */}
                        <div className="inline-flex rounded-lg border p-0.5 text-xs">
                          <button
                            className={cn('px-2.5 py-1 rounded-md transition',
                              transcriptMode === 'speakers' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                            onClick={() => setTranscriptMode('speakers')}
                          >Z mówcami</button>
                          <button
                            className={cn('px-2.5 py-1 rounded-md transition',
                              transcriptMode === 'plain' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                            onClick={() => setTranscriptMode('plain')}
                          >Pełny tekst</button>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => copyText(
                            transcriptMode === 'plain' ? toPlainText(selectedMeeting.transcript) : selectedMeeting.transcript,
                            transcriptMode === 'plain' ? 'Pełny tekst' : 'Transkrypt',
                          )}
                        >
                          <Copy className="h-3.5 w-3.5" /> Kopiuj
                        </Button>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                        {transcriptMode === 'plain' ? toPlainText(selectedMeeting.transcript) : selectedMeeting.transcript}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">Brak transkrypcji</p>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
