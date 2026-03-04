import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ListTodo, MessageSquare, ChevronRight, Trash2, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

const RIDO_AVATAR = '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png';

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
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  const [decisions, setDecisions] = useState<MeetingDecision[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryAnswer, setMemoryAnswer] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'live' | 'detail'>('list');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMeetings();
  }, []);

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

  // === LIVE RECORDING ===
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setLiveTranscript('');

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setActiveView('live');
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Browser Speech Recognition for live transcript
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'pl-PL';
        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript + ' ';
          }
          setLiveTranscript(transcript.trim());
        };
        recognition.start();
        recognitionRef.current = recognition;
      }

      toast.success('Nagrywanie rozpoczęte');
    } catch (err) {
      toast.error('Nie udało się uruchomić mikrofonu');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    clearInterval(timerRef.current);
    recognitionRef.current?.stop();

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setIsRecording(false);
        setIsProcessing(true);

        try {
          // If we have a browser transcript, use it for analysis
          if (liveTranscript.length > 50) {
            const { data, error } = await supabase.functions.invoke('meeting-ai', {
              body: {
                action: 'analyze_transcript',
                transcript: liveTranscript,
                title: meetingTitle || `Spotkanie ${new Date().toLocaleDateString('pl-PL')}`,
              },
            });
            if (error) throw error;
            toast.success('Spotkanie przeanalizowane!');
            if (data?.meeting_id) {
              await loadMeetings();
              const { data: m } = await supabase.from('meetings').select('*').eq('id', data.meeting_id).single();
              if (m) loadMeetingDetails(m as any);
            }
          } else {
            // Upload audio file for processing
            const formData = new FormData();
            formData.append('audio', blob, 'recording.webm');
            formData.append('title', meetingTitle || `Spotkanie ${new Date().toLocaleDateString('pl-PL')}`);

            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meeting-ai`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${session?.access_token}` },
              body: formData,
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);
            toast.success('Spotkanie przeanalizowane!');
            if (data?.meeting_id) {
              await loadMeetings();
              const { data: m } = await supabase.from('meetings').select('*').eq('id', data.meeting_id).single();
              if (m) loadMeetingDetails(m as any);
            }
          }
        } catch (err: any) {
          toast.error(err.message || 'Błąd analizy spotkania');
          setActiveView('list');
        } finally {
          setIsProcessing(false);
        }
        resolve();
      };
      mediaRecorderRef.current!.stop();
      mediaRecorderRef.current!.stream.getTracks().forEach(t => t.stop());
    });
  }, [liveTranscript, meetingTitle]);

  // === FILE UPLOAD ===
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('title', meetingTitle || file.name.replace(/\.[^.]+$/, ''));

      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meeting-ai`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      
      toast.success('Nagranie przeanalizowane!');
      await loadMeetings();
      if (data?.meeting_id) {
        const { data: m } = await supabase.from('meetings').select('*').eq('id', data.meeting_id).single();
        if (m) loadMeetingDetails(m as any);
      }
    } catch (err: any) {
      toast.error(err.message || 'Błąd analizy pliku');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [meetingTitle]);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => activeView === 'list' ? navigate(-1) : setActiveView('list')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={RIDO_AVATAR} alt="RidoAI" className="w-8 h-8 rounded-full" />
          <div>
            <h1 className="font-bold text-sm flex items-center gap-1.5">
              Rido Meeting AI <Sparkles className="h-3.5 w-3.5 text-primary" />
            </h1>
            <p className="text-[11px] text-muted-foreground">Asystent spotkań</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* === LIST VIEW === */}
        {activeView === 'list' && (
          <div className="space-y-6">
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
                    <h3 className="font-semibold">Uruchom Live</h3>
                    <p className="text-xs text-muted-foreground">Słuchaj i analizuj spotkanie na żywo</p>
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </Card>
            </div>

            {/* Title input */}
            <Input
              placeholder="Tytuł spotkania (opcjonalnie)"
              value={meetingTitle}
              onChange={e => setMeetingTitle(e.target.value)}
              className="max-w-md"
            />

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
              <h3 className="font-semibold mb-3">Moje spotkania</h3>
              {meetings.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <FileAudio className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Brak spotkań. Nagraj lub wrzuć plik audio.</p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {meetings.map(m => (
                    <Card 
                      key={m.id}
                      className="p-4 cursor-pointer hover:shadow-md transition group"
                      onClick={() => loadMeetingDetails(m)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                          m.status === 'completed' ? 'bg-green-500/10' : 
                          m.status === 'processing' ? 'bg-amber-500/10' : 
                          m.status === 'recording' ? 'bg-red-500/10' : 'bg-muted'
                        )}>
                          {m.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                           m.status === 'processing' ? <Loader2 className="h-5 w-5 text-amber-500 animate-spin" /> :
                           m.status === 'recording' ? <Mic className="h-5 w-5 text-red-500" /> :
                           <FileAudio className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{m.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(m.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {m.participants?.length ? ` • ${m.participants.length} uczestników` : ''}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                      </div>
                    </Card>
                  ))}
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
              
              <div className="bg-background rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground mb-2">📝 TRANSKRYPCJA NA ŻYWO:</p>
                {liveTranscript ? (
                  <p className="text-sm leading-relaxed">{liveTranscript}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Mów... transkrypcja pojawi się tutaj</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* === DETAIL VIEW === */}
        {activeView === 'detail' && selectedMeeting && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{selectedMeeting.title}</h2>
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
            </div>

            <Tabs defaultValue="summary" className="space-y-4">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="summary">📋 Podsumowanie</TabsTrigger>
                <TabsTrigger value="tasks">🎯 Zadania ({tasks.length})</TabsTrigger>
                <TabsTrigger value="decisions">📌 Decyzje ({decisions.length})</TabsTrigger>
                <TabsTrigger value="transcript">📝 Transkrypcja</TabsTrigger>
              </TabsList>

              <TabsContent value="summary">
                <Card className="p-5">
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
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
                      {selectedMeeting.transcript}
                    </div>
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
