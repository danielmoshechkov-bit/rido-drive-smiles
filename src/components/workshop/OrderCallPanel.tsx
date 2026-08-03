import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, ListChecks, ArrowRight, MessageSquare, ChevronDown } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCall(null);
    setError(null);
    setShowTranscript(false);
    const load = async (showLoader = false) => {
      if (showLoader) setLoading(true);
      const { data: calls, error: callsError } = await (supabase as any)
        .from("voice_calls")
        .select("id, summary, outcome, created_at, contact_name")
        .eq("linked_entity_type", "workshop_order").eq("linked_entity_id", orderId)
        .order("created_at", { ascending: false }).limit(1);
      if (cancelled) return;
      if (callsError) {
        setError("Nie udało się pobrać rozmowy telefonicznej.");
        setLoading(false);
        return;
      }
      const c = calls?.[0];
      if (!c) {
        setCall(null);
        setError(null);
        setLoading(false);
        return;
      }
      const [{ data: tr, error: transcriptError }, { data: oc, error: outcomeError }] = await Promise.all([
        (supabase as any).from("voice_transcripts").select("full_text, turns, summary").eq("call_id", c.id).maybeSingle(),
        (supabase as any).from("voice_call_outcomes").select("outcome, objections, next_step, customer_data, losing_signals").eq("call_id", c.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (transcriptError || outcomeError) {
        setError("Rozmowa jest powiązana, ale nie udało się pobrać jej pełnego zapisu.");
      } else {
        setError(null);
      }
      setCall({
        id: c.id, summary: c.summary || tr?.summary || null, outcome: c.outcome,
        created_at: c.created_at, contact_name: c.contact_name,
        full_text: tr?.full_text || null, turns: tr?.turns || [],
        outcomeRow: oc || null,
      });
      setLoading(false);
    };
    void load(true);
    // Końcowy webhook może dotrzeć po utworzeniu zlecenia. Krótkie, ograniczone
    // ponowienia sprawiają, że otwarta zakładka sama pokaże zapis po powiązaniu.
    const retryDelays = [3_000, 10_000, 30_000, 60_000, 120_000];
    const timers = retryDelays.map((delay) => window.setTimeout(() => void load(), delay));
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [orderId]);

  if (loading) return compact ? null : <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (error && !call) {
    if (compact) return null;
    return <div className="text-center py-10 text-destructive text-sm">{error}</div>;
  }
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
      {error && <div className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">{error}</div>}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Badge className="gap-1 bg-primary"><Phone className="h-3 w-3" /> Rozmowa AI</Badge>
        {call.outcome && <Badge variant="outline">{OUTCOME_LABEL[call.outcome] || call.outcome}</Badge>}
        <span className="text-muted-foreground text-xs">{new Date(call.created_at).toLocaleString("pl-PL")}</span>
      </div>

      {/* Podsumowanie w punktach */}
      {summaryLines.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium mb-2"><ListChecks className="h-4 w-4 text-primary" /> Podsumowanie rozmowy</div>
          <ul className="space-y-1 text-sm">
            {summaryLines.map((l, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{l}</span></li>)}
          </ul>
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
