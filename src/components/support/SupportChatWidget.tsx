import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import {
  useMySupportConversation,
  useSupportMessages,
  useSendSupportMessage,
  useMarkSupportRead,
  useSupportRealtime,
} from '@/hooks/useSupportChat';

/**
 * Dymek „Pomoc" w prawym dolnym rogu — rozmowa z obsługą GetRido.
 *
 * Rozmowa wyłącznie dla zalogowanych — dzięki temu w skrzynce zawsze wiadomo,
 * KTO pisze (konto, e-mail, z której strony). Niezalogowany dostaje zaproszenie
 * do logowania zamiast anonimowego wątku bez tożsamości.
 */
export function SupportChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLogged, setIsLogged] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');
  const [czekaNaOdpowiedz, setCzekaNaOdpowiedz] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversation } = useMySupportConversation(!!isLogged);
  // Admin tez widzi dymek (moze chciec cos sprawdzic), ale wpisana tu wiadomosc
  // jest ZGLOSZENIEM KLIENTA, nie odpowiedzia — trafia do skrzynki i budzi
  // asystenta. Bez tego ostrzezenia latwo pomylic okna i odpisac w zle miejsce.
  const { isAdmin } = useUserRole();
  const { data: messages = [], isLoading } = useSupportMessages(conversation?.id);
  const sendMessage = useSendSupportMessage();
  const markRead = useMarkSupportRead();
  useSupportRealtime(conversation?.id, 'support-widget');

  const shownMessages = messages;
  const busy = sendMessage.isPending;

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => { if (active) setIsLogged(!!data.user); });
    // Tylko wylogowanie zamyka czat. Wczesniej KAZDE zdarzenie sesji (np. ciche
    // odswiezenie tokenu) przestawialo widget na „niezalogowany" i okno gaslo
    // w trakcie pisania — stad wrazenie, ze czat „wyrzuca" i laduje sie od nowa.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setIsLogged(false); return; }
      if (session?.user) setIsLogged(true);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const ostatnia = shownMessages[shownMessages.length - 1];
    if (ostatnia && ostatnia.sender_role !== 'user') setCzekaNaOdpowiedz(false);
  }, [shownMessages]);

  // Nowa wiadomość / otwarcie okna → zjazd na dół wątku.
  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [shownMessages.length, isOpen]);

  // Otwarcie okna kasuje licznik nieprzeczytanych po stronie klienta.
  useEffect(() => {
    if (isOpen && conversation?.id && conversation.unread_for_user > 0) {
      markRead.mutate({ conversationId: conversation.id, side: 'user' });
    }
    // markRead celowo poza zależnościami — mutacja jest stabilna w praktyce,
    // a dopisanie jej wywoływałoby pętlę odświeżeń.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conversation?.id, conversation?.unread_for_user]);

  if (isLogged === null) return null; // jeszcze nie wiemy, czy jest sesja

  const unread = conversation?.unread_for_user || 0;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    try {
      setCzekaNaOdpowiedz(true);
      await sendMessage.mutateAsync({ conversationId: conversation?.id, body });
      setDraft('');
    } catch (e: any) {
      toast.error(e?.message || 'Nie udało się wysłać wiadomości.');
    }
  };

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed right-6 bottom-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          aria-label="Napisz do nas"
        >
          <MessageCircle className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="fixed z-50 right-4 bottom-4 left-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[380px] flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden max-h-[min(560px,80vh)]">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-primary text-primary-foreground shrink-0">
            <div className="min-w-0">
              <p className="font-semibold leading-tight">Pomoc GetRido</p>
              <p className="text-xs opacity-90 leading-tight">Napisz, a odpiszemy tak szybko, jak się da</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="h-8 w-8 rounded-md inline-flex items-center justify-center hover:bg-white/15" aria-label="Zamknij">
              <X className="h-4 w-4" />
            </button>
          </div>

          {isLogged && isAdmin && (
            <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 text-[11px] text-amber-900 dark:text-amber-200">
              Piszesz tu <strong>jako klient</strong> — ta wiadomość trafi do skrzynki zgłoszeń.
              Żeby odpowiadać klientom, wejdź w{' '}
              <a href="/admin/portal" className="underline font-medium">Panel administratora → Czat</a>.
            </div>
          )}
          {!isLogged ? (
            <div className="p-5 text-center space-y-3 bg-background">
              <p className="text-sm text-foreground font-medium">Zaloguj się, żeby napisać do nas</p>
              <p className="text-sm text-muted-foreground">
                Rozmowa jest przypisana do Twojego konta — dzięki temu wiemy, komu pomagamy i widzimy historię sprawy.
              </p>
              <Button className="w-full" onClick={() => { window.location.href = '/auth'; }}>
                Zaloguj się lub załóż konto
              </Button>
            </div>
          ) : (
          <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 bg-background">
            {isLoading && conversation?.id ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : shownMessages.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                <p className="font-medium text-foreground mb-1">👋 Cześć!</p>
                <p>Opisz, w czym możemy pomóc — odpowiedź zobaczysz tutaj.</p>
                <p className="mt-1 text-xs">Najpierw odpowie asystent. Jeśli nie będzie znał odpowiedzi, przekaże sprawę naszemu zespołowi.</p>
              </div>
            ) : (
              shownMessages.map(m => (
                <div key={m.id} className={`flex ${m.sender_role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    m.sender_role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    {m.sender_role !== 'user' && (
                      <p className="text-[11px] font-semibold opacity-70 mb-0.5 flex items-center gap-1">
                        {m.sender_role === 'ai' ? <Sparkles className="h-3 w-3" /> : null}
                        {m.sender_role === 'ai' ? 'Asystent GetRido (AI)' : (m.sender_name || 'Wsparcie GetRido')}
                      </p>
                    )}
                    {m.body}
                    <span className={`block text-[10px] mt-1 ${m.sender_role === 'user' ? 'opacity-70' : 'text-muted-foreground'}`}>
                      {new Date(m.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
            {czekaNaOdpowiedz && (
              <div className="flex justify-start">
                <div className="bg-muted text-muted-foreground rounded-2xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  Asystent sprawdza…
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border bg-card shrink-0">
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
                }}
                placeholder="Napisz wiadomość…"
                rows={1}
                className="min-h-[40px] max-h-28 resize-none text-sm"
              />
              <Button size="icon" onClick={handleSend} disabled={!draft.trim() || busy} aria-label="Wyślij">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <p className="text-[11px] text-muted-foreground">Enter wysyła, Shift+Enter to nowa linia.</p>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  // Świadomie wysyłamy to jako zwykłą wiadomość klienta: wątek
                  // pozostaje czytelny, a reszta (przekazanie + SMS) dzieje się
                  // tą samą, sprawdzoną drogą co przy prośbie o człowieka.
                  try {
                    setCzekaNaOdpowiedz(true);
                    await sendMessage.mutateAsync({
                      conversationId: conversation?.id,
                      body: 'Proszę o kontakt z człowiekiem.',
                    });
                  } catch (e: any) {
                    setCzekaNaOdpowiedz(false);
                    toast.error(e?.message || 'Nie udało się przekazać sprawy.');
                  }
                }}
                className="text-[11px] text-primary hover:underline underline-offset-2 shrink-0"
              >
                Rozmawiaj z człowiekiem
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      )}
    </>
  );
}
