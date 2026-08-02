import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Trening self-play: AI gra klienta i rozmawia z agentem, a z każdej rozmowy
 * wyciąga reguły do voice_agent_knowledge. Usługodawca tylko uruchamia serię.
 */
export function AgentTraining({ providerId, personaKey }: { providerId: string; personaKey: string }) {
  const [training, setTraining] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [lessons, setLessons] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(null);

  const loadKnowledgeCount = async () => {
    if (!providerId || !personaKey) return;
    const { count } = await (supabase as any).from("voice_agent_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("persona_key", personaKey).eq("is_active", true)
      .or(`provider_id.eq.${providerId},provider_id.is.null`);
    setKnowledgeCount(count ?? 0);
  };

  useEffect(() => { loadKnowledgeCount(); /* eslint-disable-next-line */ }, [providerId, personaKey]);

  const run = async (n: number) => {
    setTraining(true); setTotal(n); setDone(0); setLessons(0); setLog([]);
    let learned = 0;
    for (let i = 0; i < n; i++) {
      try {
        const { data, error } = await supabase.functions.invoke("voice-agent-simulate", {
          body: { provider_id: providerId, persona_key: personaKey, seed: i },
        });
        if (!error && data?.ok) {
          learned += data.lessons_learned || 0;
          setLog((l) => [`✓ ${data.outcome || "rozmowa"} · +${data.lessons_learned || 0} reguł · ${data.scenario?.slice(0, 40) || ""}`, ...l].slice(0, 12));
        } else {
          setLog((l) => [`✗ ${data?.error || error?.message || "błąd"}`, ...l].slice(0, 12));
        }
      } catch (e: any) {
        setLog((l) => [`✗ ${e?.message || "błąd"}`, ...l].slice(0, 12));
      }
      setDone(i + 1); setLessons(learned);
    }
    setTraining(false);
    await loadKnowledgeCount();
    toast.success(`Trening zakończony: ${n} rozmów, +${learned} reguł`);
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-semibold text-sm">Trening — AI sam testuje agenta</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          AI wciela się w klienta (też trudnego), rozmawia z Twoim agentem, wyłapuje błędy i dopisuje reguły.
          Rozmowy testowe nie tworzą prawdziwych rezerwacji ani zleceń.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm">Wyuczone reguły: <strong>{knowledgeCount ?? "…"}</strong></span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={training} onClick={() => run(10)}>
            {training ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} 10 rozmów
          </Button>
          <Button size="sm" disabled={training} onClick={() => run(25)} className="gap-1.5">
            <Sparkles className="h-4 w-4" /> 25 rozmów
          </Button>
        </div>
      </div>
      {training && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Postęp: {done}/{total}</span><span>+{lessons} reguł</span></div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {log.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-2 max-h-[160px] overflow-y-auto text-xs space-y-0.5">
          {log.map((l, i) => <div key={i} className="truncate">{l}</div>)}
        </div>
      )}
    </div>
  );
}
