import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Phone, ListChecks, ArrowRight, MessageSquare, ChevronDown, Play, Download, AlertCircle } from "lucide-react";

interface Outcome {
  outcome: string | null;
  objections: any[];
  next_step: string | null;
  customer_data: Record<string, any>;
  losing_signals: any[];
}
interface CallData {
  id: string;
  summary: string | null;
  outcome: string | null;
  created_at: string;
  contact_name: string | null;
  full_text: string | null;
  turns: { role: string; content: string }[];
  outcomeRow: Outcome | null;
}

const OUTCOME_LABEL: Record<string, string> = {
  booked: "Umówiono", sold: "Sprzedaż", refused: "Odmowa", callback: "Oddzwonić",
  no_interest: "Brak zainteresowania", info_only: "Info", other: "Inne",
};

export function OrderCallPanel({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [call, setCall] = useState<CallData | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  // Podsumowanie: gdy analiza po rozmowie go nie zapisała, odtwarzamy je
  // z zapisanego transkryptu — raz na rozmowę, przy pierwszym otwarciu.
  const [summaryPending, setSummaryPending] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const summaryTried = useRef<string | null>(null);
  // Nagranie ściągamy dopiero na żądanie — plik waży kilkaset kB, a większość
  // wejść w kartę kończy się na przeczytaniu podsumowania.
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [retencjaDni, setRetencjaDni] = useState<number | null>(null);

  // Transkrypt dopisuje webhook PO rozłączeniu — dla zlecenia utworzonego
  // w trakcie rozmowy wiersz voice_calls pojawia się ok. 30 s później.
  // Jednorazowy fetch przy montowaniu trafiał w tę dziurę i zakładka zostawała
  // pusta, mimo że dane doszły chwilę potem (zlecenie 00:06:07, rozmowa 00:06:38).
  // voice_calls nie jest w publikacji supabase_realtime, więc zamiast subskrypcji
  // odpytujemy co 8 s, ale TYLKO dopóki rozmowy nie ma i najwyżej przez ~4 minuty.
  // Po znalezieniu odpytywanie się kończy i panel zachowuje się jak dotąd.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const MAX_ATTEMPTS = 30;
    const INTERVAL_MS = 8000;

    const load = async () => {
      const { data: calls } = await (supabase as any)
        .from("voice_calls")
        .select("id, summary, outcome, created_at, contact_name")
        .eq("linked_entity_type", "workshop_order").eq("linked_entity_id", orderId)
        .order("created_at", { ascending: false }).limit(1);
      if (cancelled) return false;
      const c = calls?.[0];
      if (!c) { setCall(null); setLoading(false); return false; }
      const [{ data: tr }, { data: oc }] = await Promise.all([
        (supabase as any).from("voice_transcripts").select("full_text, turns, summary").eq("call_id", c.id).maybeSingle(),
        (supabase as any).from("voice_call_outcomes").select("outcome, objections, next_step, customer_data, losing_signals").eq("call_id", c.id).maybeSingle(),
      ]);
      if (cancelled) return false;
      setCall({
        id: c.id, summary: c.summary || tr?.summary || null, outcome: c.outcome,
        created_at: c.created_at, contact_name: c.contact_name,
        full_text: tr?.full_text || null, turns: tr?.turns || [],
        outcomeRow: oc || null,
      });
      setLoading(false);
      return true;
    };

    const poll = async () => {
      const found = await load();
      if (found || cancelled || attempts >= MAX_ATTEMPTS) return;
      attempts += 1;
      timer = setTimeout(poll, INTERVAL_MS);
    };

    // Powrót do karty to najczęstszy moment, w którym dane już są.
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);

    setLoading(true);
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [orderId]);

  // Przy zmianie zlecenia zaczynamy od zera — inaczej przy przejściu na sąsiednie
  // zlecenie zostałby w odtwarzaczu link do POPRZEDNIEJ rozmowy.
  useEffect(() => {
    setAudioUrl(null); setAudioError(null); setAudioLoading(false);
    setSummaryError(null); setSummaryPending(false);
  }, [orderId]);

  // Brakujące podsumowanie odtwarzamy z transkryptu, bez klikania. Pracownik
  // ma zobaczyć „co trzeba było zrobić", a nie dowiedzieć się, że akurat tej
  // rozmowy analiza nie dokończyła.
  useEffect(() => {
    if (compact || !call || call.summary || !call.turns.length) return;
    if (summaryTried.current === call.id) return;
    summaryTried.current = call.id;
    let anulowane = false;
    setSummaryPending(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("voice-call-summary", { body: { call_id: call.id } });
      if (anulowane) return;
      setSummaryPending(false);
      if (data?.summary) setCall((c) => (c && c.id === call.id ? { ...c, summary: data.summary } : c));
      else setSummaryError(data?.error || error?.message || "Nie udało się przygotować podsumowania.");
    })();
    return () => { anulowane = true; };
  }, [call, compact]);

  const pobierzNagranie = async () => {
    if (!call) return;
    setAudioLoading(true); setAudioError(null);
    const { data, error } = await supabase.functions.invoke("voice-call-audio", { body: { call_id: call.id } });
    setAudioLoading(false);
    if (data?.retencja?.po_zakonczeniu_dni) setRetencjaDni(data.retencja.po_zakonczeniu_dni);
    if (data?.available && data?.url) setAudioUrl(data.url);
    else setAudioError(data?.reason || data?.error || error?.message || "Nie udało się pobrać nagrania.");
  };

  if (loading) return compact ? null : <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (!call) {
    if (compact) return null;
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        <Phone className="h-8 w-8 mx-auto mb-2 opacity-40" />
        Brak powiązanej rozmowy telefonicznej dla tego zlecenia.
      </div>
    );
  }

  const summaryLines = (call.summary || "").split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
  const objections = call.outcomeRow?.objections || [];
  const cd = call.outcomeRow?.customer_data || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Badge className="gap-1 bg-primary"><Phone className="h-3 w-3" /> Rozmowa AI</Badge>
        {call.outcome && <Badge variant="outline">{OUTCOME_LABEL[call.outcome] || call.outcome}</Badge>}
        <span className="text-muted-foreground text-xs">{new Date(call.created_at).toLocaleString("pl-PL")}</span>
      </div>

      {/* Podsumowanie w punktach — to jest pierwsza rzecz do przeczytania */}
      {(summaryLines.length > 0 || summaryPending || summaryError) && (
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium mb-2"><ListChecks className="h-4 w-4 text-primary" /> Podsumowanie rozmowy</div>
          {summaryLines.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {summaryLines.map((l, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{l}</span></li>)}
            </ul>
          ) : summaryPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Przygotowuję podsumowanie z transkrypcji…
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{summaryError} Pełna transkrypcja jest poniżej.</span>
            </div>
          )}
        </div>
      )}

      {/* Nagranie rozmowy */}
      {!compact && (
        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium"><Phone className="h-4 w-4 text-primary" /> Nagranie rozmowy</div>
            {!audioUrl && (
              <Button size="sm" variant="outline" onClick={pobierzNagranie} disabled={audioLoading}>
                {audioLoading
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Pobieram…</>
                  : <><Play className="h-4 w-4 mr-1" /> Odsłuchaj</>}
              </Button>
            )}
            {audioUrl && (
              <a href={audioUrl} download={`rozmowa-${call.id.slice(0, 8)}.mp3`}
                 className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                <Download className="h-3.5 w-3.5" /> Pobierz plik
              </a>
            )}
          </div>
          {audioUrl && <audio controls preload="metadata" src={audioUrl} className="w-full mt-3" />}
          {audioUrl && retencjaDni && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Nagranie znika razem z usuniętym zleceniem, a po zakończonym — {retencjaDni} dni później.
              Transkrypcja i podsumowanie zostają na stałe.
            </p>
          )}
          {audioError && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground mt-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span>{audioError}</span>
            </div>
          )}
        </div>
      )}

      {/* Dane klienta/auta + następny krok */}
      {(cd.vehicle || cd.service || cd.name || call.outcomeRow?.next_step) && (
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          {cd.name && <div className="rounded-md border p-2"><span className="text-muted-foreground text-xs">Klient</span><div>{cd.name}</div></div>}
          {cd.vehicle && <div className="rounded-md border p-2"><span className="text-muted-foreground text-xs">Pojazd</span><div>{cd.vehicle}</div></div>}
          {cd.service && <div className="rounded-md border p-2"><span className="text-muted-foreground text-xs">Usługa</span><div>{cd.service}</div></div>}
          {call.outcomeRow?.next_step && <div className="rounded-md border p-2"><span className="text-muted-foreground text-xs flex items-center gap-1"><ArrowRight className="h-3 w-3" />Następny krok</span><div>{call.outcomeRow.next_step}</div></div>}
        </div>
      )}

      {/* Obiekcje (jeśli były) */}
      {!compact && objections.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="text-sm font-medium mb-2">Obiekcje / uwagi klienta</div>
          <ul className="space-y-1.5 text-sm">
            {objections.map((o: any, i: number) => (
              <li key={i} className="text-muted-foreground">• {o.type || o.customer_quote || JSON.stringify(o)}{o.resolved === false ? " (nierozwiązane)" : ""}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Pełna transkrypcja (rozwijana) */}
      {call.turns.length > 0 && (
        <div className="rounded-lg border">
          <button onClick={() => setShowTranscript((s) => !s)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50">
            <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Pełna transkrypcja ({call.turns.length})</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showTranscript ? "rotate-180" : ""}`} />
          </button>
          {showTranscript && (
            <div className="px-3 pb-3 space-y-2 max-h-[360px] overflow-y-auto">
              {call.turns.map((m, i) => (
                <div key={i} className={`flex ${m.role === "assistant" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap ${m.role === "assistant" ? "bg-muted rounded-bl-sm" : "bg-primary text-primary-foreground rounded-br-sm"}`}>
                    <span className="block text-[10px] opacity-60 mb-0.5">{m.role === "assistant" ? "Agent" : "Klient"}</span>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
