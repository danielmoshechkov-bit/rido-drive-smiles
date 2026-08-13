import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Send, MessageSquare, Search, CheckCircle2, RotateCcw, Bell, BellOff, Sparkles, BookOpen, Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  useSupportInbox,
  useSupportPreviews,
  useSupportMessages,
  useAdminReply,
  useMarkSupportRead,
  useCloseSupportConversation,
  useSupportRealtime,
  useSupportSettings,
  useSaveSupportSettings,
  useSupportKnowledge,
  useSaveSupportKnowledge,
  useDeleteSupportKnowledge,
  type SupportConversation,
} from '@/hooks/useSupportChat';

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return `${min} min temu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} godz. temu`;
  return new Date(iso).toLocaleDateString('pl-PL');
};

const personName = (c: SupportConversation) =>
  c.contact_name || c.contact_email || 'Nieznany rozmówca';

/** Skrzynka wsparcia w panelu admina: lista rozmów + odpowiadanie na bieżąco. */
export function SupportInboxPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading } = useSupportInbox();
  // Podglad ostatniej wiadomosci kazdej rozmowy — lista ma mowic, o co chodzi,
  // zanim admin w cokolwiek kliknie.
  const { data: podglady = {} } = useSupportPreviews(conversations.map(c => c.id));
  const { data: messages = [], isLoading: loadingMessages } = useSupportMessages(selectedId);
  const reply = useAdminReply();
  const markRead = useMarkSupportRead();
  const setStatus = useCloseSupportConversation();
  const { data: settings } = useSupportSettings();
  const saveSettings = useSaveSupportSettings();
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [newEntry, setNewEntry] = useState({ category: 'ogolne', question: '', answer: '', keywords: '' });
  const { data: knowledge = [] } = useSupportKnowledge();
  const saveKnowledge = useSaveSupportKnowledge();
  const deleteKnowledge = useDeleteSupportKnowledge();
  useSupportRealtime(selectedId, 'support-inbox');

  const selected = conversations.find(c => c.id === selectedId) || null;
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_for_admin || 0), 0);

  // Kolejnosc: najpierw to, co czeka na Ciebie, potem najswiezsze.
  const waga = (c: SupportConversation) =>
    (c.unread_for_admin > 0 ? 2 : 0) + (c.escalated_at && c.status !== 'closed' ? 1 : 0);

  const filtered = conversations.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [c.contact_name, c.contact_email, c.contact_phone, c.subject]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
  }).sort((a, b) => (waga(b) - waga(a))
    || (new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()));

  // Podsumowanie — ile spraw czeka i jak szybko odpowiadamy.
  const summary = (() => {
    const dayAgo = Date.now() - 24 * 3600_000;
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    return {
      total: conversations.length,
      aiHandled: conversations.filter(c => !c.escalated_at && (c.ai_replies_count || 0) > 0).length,
      open: conversations.filter(c => c.status === 'open').length,
      unread: conversations.filter(c => (c.unread_for_admin || 0) > 0).length,
      today: conversations.filter(c => new Date(c.last_message_at).getTime() >= dayAgo).length,
      week: conversations.filter(c => new Date(c.last_message_at).getTime() >= weekAgo).length,
    };
  })();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, selectedId]);

  // Wejście w wątek = przeczytane.
  useEffect(() => {
    if (selected?.id && selected.unread_for_admin > 0) {
      markRead.mutate({ conversationId: selected.id, side: 'admin' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.unread_for_admin]);

  const handleReply = async () => {
    const body = draft.trim();
    if (!body || !selectedId || reply.isPending) return;
    try {
      await reply.mutateAsync({ conversationId: selectedId, body });
      setDraft('');
    } catch (e: any) {
      toast.error(e?.message || 'Nie udało się wysłać odpowiedzi.');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Wiadomości od klientów
          {totalUnread > 0 && <Badge variant="destructive">{totalUnread} nowych</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Podsumowanie — co wymaga reakcji, zanim wejdziesz w szczegóły */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {[
            { label: 'Czeka na odpowiedź', value: summary.unread, accent: summary.unread > 0 },
            { label: 'Załatwione przez AI', value: summary.aiHandled },
            { label: 'Aktywne dziś', value: summary.today },
            { label: 'Ostatnie 7 dni', value: summary.week },
            { label: 'Wszystkich rozmów', value: summary.total },
          ].map(k => (
            <div key={k.label} className={`rounded-lg border p-2.5 ${k.accent ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/30'}`}>
              <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.accent ? 'text-destructive' : 'text-foreground'}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Powiadomienia: numer SMS i cisza nocna — numer widzi wyłącznie admin */}
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
          <button type="button" onClick={() => setShowSettings(v => !v)} className="flex items-center gap-2 text-sm font-medium">
            {settings?.sms_enabled && settings?.notify_phone ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
            Powiadomienia SMS
            <span className="text-xs text-muted-foreground font-normal">
              {settings?.notify_phone
                ? `na ${settings.notify_phone}${settings.sms_enabled ? '' : ' (wyłączone)'}`
                : '— podaj numer, żeby dostawać SMS o nowych wiadomościach'}
            </span>
          </button>
          {showSettings && settings && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Input
                  value={phoneDraft ?? settings.notify_phone ?? ''}
                  onChange={e => setPhoneDraft(e.target.value)}
                  placeholder="Numer telefonu (np. 600100200)"
                  className="h-9"
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    await saveSettings.mutateAsync({ notify_phone: (phoneDraft ?? '').trim() || null });
                    setPhoneDraft(null);
                    toast.success('Zapisano numer powiadomień.');
                  }}
                  disabled={phoneDraft === null || saveSettings.isPending}
                >
                  Zapisz
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Switch checked={settings.sms_enabled} onCheckedChange={v => saveSettings.mutate({ sms_enabled: v })} />
                  SMS włączone
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={settings.quiet_hours_enabled} onCheckedChange={v => saveSettings.mutate({ quiet_hours_enabled: v })} />
                  Cisza {settings.quiet_hours_from}:00–{settings.quiet_hours_to}:00
                </label>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Najwyżej jeden SMS na rozmowę co {settings.sms_throttle_minutes} min — seria wiadomości od jednego klienta nie zasypie Cię SMS-ami.
                W ciszy nocnej SMS nie idzie; wiadomość i tak czeka tutaj z licznikiem.
              </p>
            </div>
          )}
        </div>

        {/* Asystent AI — pierwsza linia wsparcia i jego wiedza */}
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Asystent AI odpowiada jako pierwszy
              <span className="text-xs text-muted-foreground font-normal">
                {settings?.ai_enabled
                  ? `czego nie wie, przekazuje Tobie (po ${settings.ai_escalate_after} próbach też)`
                  : '— wyłączony, każde pytanie idzie prosto do Ciebie'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {settings && (
                <Switch checked={settings.ai_enabled} onCheckedChange={v => saveSettings.mutate({ ai_enabled: v })} />
              )}
              <button type="button" onClick={() => setShowKnowledge(v => !v)} className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" /> Wiedza ({knowledge.length})
              </button>
            </div>
          </div>

          {showKnowledge && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Asystent odpowiada wyłącznie z tej listy. Czego tu nie ma — nie zgadnie, tylko przekaże sprawę Tobie.
              </p>
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {knowledge.map(k => (
                  <div key={k.id} className="rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{k.question}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{k.answer}</p>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.category}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch checked={k.is_active} onCheckedChange={v => saveKnowledge.mutate({ ...k, is_active: v })} />
                        <button
                          type="button"
                          onClick={() => { if (confirm('Usunąć ten wpis z wiedzy asystenta?')) deleteKnowledge.mutate(k.id); }}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          aria-label="Usuń wpis"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-dashed border-border p-2.5 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={newEntry.question} onChange={e => setNewEntry(v => ({ ...v, question: e.target.value }))} placeholder="Pytanie klienta" className="h-9" />
                  <Input value={newEntry.category} onChange={e => setNewEntry(v => ({ ...v, category: e.target.value }))} placeholder="Kategoria (np. cennik)" className="h-9" />
                </div>
                <Textarea value={newEntry.answer} onChange={e => setNewEntry(v => ({ ...v, answer: e.target.value }))} placeholder="Odpowiedź, której ma udzielać asystent" rows={2} className="text-sm" />
                <div className="flex gap-2">
                  <Input value={newEntry.keywords} onChange={e => setNewEntry(v => ({ ...v, keywords: e.target.value }))} placeholder="Inne sformułowania (po przecinku)" className="h-9 flex-1" />
                  <Button
                    size="sm"
                    disabled={!newEntry.question.trim() || !newEntry.answer.trim() || saveKnowledge.isPending}
                    onClick={async () => {
                      await saveKnowledge.mutateAsync(newEntry);
                      setNewEntry({ category: 'ogolne', question: '', answer: '', keywords: '' });
                      toast.success('Dodano do wiedzy asystenta.');
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Dodaj
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-[320px,1fr] gap-4">
          {/* Lista rozmów — na telefonie chowa się po wejściu w wątek */}
          <div className={`${selectedId ? 'hidden md:block' : 'block'} space-y-2`}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj po nazwisku lub mailu…" className="pl-8 h-9" />
            </div>
            <div className="flex gap-1">
              {([['all','Wszystkie'],['open','Otwarte'],['closed','Historia']] as const).map(([value, label]) => {
                const ile = value === 'all'
                  ? conversations.length
                  : conversations.filter(c => c.status === value).length;
                return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`px-2.5 h-7 rounded-md text-xs transition-colors ${
                    statusFilter === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {label} {ile > 0 && <span className="opacity-70">{ile}</span>}
                </button>
                );
              })}
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Brak rozmów.</p>
              ) : (
                filtered.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left rounded-lg border p-2.5 transition-colors hover:bg-accent/50 ${
                      c.id === selectedId ? 'border-primary bg-accent/40' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{personName(c)}</span>
                      {c.unread_for_admin > 0 && <Badge variant="destructive" className="shrink-0">{c.unread_for_admin}</Badge>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">{c.contact_email || '—'}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{timeAgo(c.last_message_at)}</span>
                    </div>
                    {podglady[c.id] && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 text-left">
                        {podglady[c.id].sender_role === 'user' ? '' : '↩ '}{podglady[c.id].body}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {c.status === 'closed' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">zamknięta</span>
                      ) : c.escalated_at ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">czeka na Ciebie</span>
                      ) : (c.ai_replies_count || 0) > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">obsłużone przez AI</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">nowa</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Wątek */}
          <div className={`${selectedId ? 'block' : 'hidden md:block'} rounded-lg border border-border flex flex-col min-h-[420px]`}>
            {!selected ? (
              <p className="text-sm text-muted-foreground m-auto py-10">Wybierz rozmowę z listy.</p>
            ) : (
              <>
                <div className="px-3 py-2.5 border-b border-border flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    {/* Wstecz na KAZDYM ekranie — przy wielu zgloszeniach powrot do
                        listy to najczestszy ruch, nie tylko na telefonie. */}
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="mt-0.5 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Wróć do listy zgłoszeń"
                      title="Wróć do listy zgłoszeń"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{personName(selected)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {selected.contact_email || 'brak adresu e-mail'}
                        {selected.contact_phone ? ` · ${selected.contact_phone}` : ''}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 truncate">
                        {selected.origin_path ? `pisał z ${selected.origin_path} · ` : ''}
                        zgłoszenie z {new Date(selected.created_at).toLocaleDateString('pl-PL')}
                        {selected.escalated_at ? ' · przekazane do Ciebie' : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setStatus.mutate({ conversationId: selected.id, status: selected.status === 'closed' ? 'open' : 'closed' })}
                  >
                    {selected.status === 'closed'
                      ? <><RotateCcw className="h-3.5 w-3.5 mr-1" />Otwórz</>
                      : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Załatwione</>}
                  </Button>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[50vh]">
                  {loadingMessages ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    messages.map(m => (
                      <div key={m.id} className={`flex ${m.sender_role === 'user' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          m.sender_role === 'admin'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : m.sender_role === 'ai'
                              ? 'bg-accent text-foreground border border-primary/30 rounded-br-sm'
                              : 'bg-muted text-foreground rounded-bl-sm'
                        }`}>
                          {m.sender_role === 'ai' && (
                            <p className="text-[11px] font-semibold text-primary mb-0.5 flex items-center gap-1">
                              <Sparkles className="h-3 w-3" /> Asystent AI
                            </p>
                          )}
                          {m.body}
                          <span className={`block text-[10px] mt-1 ${m.sender_role === 'admin' ? 'opacity-70' : 'text-muted-foreground'}`}>
                            {new Date(m.created_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 border-t border-border">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleReply(); } }}
                      placeholder="Odpowiedz klientowi…"
                      rows={2}
                      className="min-h-[44px] max-h-32 resize-none text-sm"
                    />
                    <Button onClick={handleReply} disabled={!draft.trim() || reply.isPending}>
                      {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
