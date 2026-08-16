// ============================================================================
// WorkshopCallsList — LISTA WSZYSTKICH ROZMÓW, także tych bez zlecenia.
//
// Powód powstania: panel rozmowy (OrderCallPanel) istnieje, ale jest kluczowany
// po `orderId` i osadzony wyłącznie w karcie zlecenia. Rozmowa, która NIE
// utworzyła zlecenia, była w panelu niewidoczna — a to 2 z 9 rozmów dziennie.
// Warsztat pytał „co, jak agent nie da rady?" i odpowiedź brzmiała „nikt się
// o tym nie dowie".
//
// Ta lista pokazuje wszystko, z filtrem na rozmowy wymagające uwagi.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Phone, AlertTriangle, ChevronDown, MessageSquare, FileText, FilePlus } from "lucide-react";
import { toast } from "sonner";

type Tura = { role?: string; message?: string | null };
type Rozmowa = {
  id: string;
  created_at: string;
  duration_seconds: number | null;
  status: string | null;
  outcome: string | null;
  summary: string | null;
  contact_name: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  elevenlabs_conversation_id: string | null;
  turns: Tura[];
};

const czas = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const dlugosc = (s: number | null) => (s == null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`);

export function WorkshopCallsList({ providerId, onOpenOrder }: {
  providerId: string;
  onOpenOrder?: (orderId: string) => void;
}) {
  const [rozmowy, setRozmowy] = useState<Rozmowa[]>([]);
  const [ladowanie, setLadowanie] = useState(true);
  const [blad, setBlad] = useState<string | null>(null);
  const [tylkoUwaga, setTylkoUwaga] = useState(false);
  const [alertAwarii, setAlertAwarii] = useState<{ title: string; description: string } | null>(null);
  const [domykana, setDomykana] = useState<string | null>(null);

  useEffect(() => {
    let anulowane = false;
    const wczytaj = async () => {
      setLadowanie(true);
      setBlad(null);
      const { data, error } = await (supabase as any)
        .from("voice_calls")
        .select("id, created_at, duration_seconds, status, outcome, summary, contact_name, linked_entity_type, linked_entity_id, elevenlabs_conversation_id")
        .eq("provider_id", providerId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(50);
      if (anulowane) return;
      if (error) { setBlad(error.message); setLadowanie(false); return; }
      const lista: Rozmowa[] = (data || []).map((r: Rozmowa) => ({ ...r, turns: [] }));
      // Transkrypty dociągamy JEDNYM zapytaniem, nie po jednym na rozmowę —
      // pięćdziesiąt rozmów to byłoby pięćdziesiąt zapytań na wejściu w zakładkę.
      if (lista.length) {
        const { data: tr } = await (supabase as any)
          .from("voice_transcripts")
          .select("call_id, turns, summary")
          .in("call_id", lista.map((r) => r.id));
        const wgId = new Map((tr || []).map((t: { call_id: string }) => [t.call_id, t]));
        for (const r of lista) {
          const t = wgId.get(r.id) as { turns?: Tura[]; summary?: string } | undefined;
          r.turns = t?.turns || [];
          r.summary = r.summary || t?.summary || null;
        }
      }
      if (anulowane) return;
      setRozmowy(lista);
      setLadowanie(false);
    };
    // AWARIA ROZLICZENIOWA MA KRZYCZEC.
    // 16.08 skonczyly sie kredyty dostawcy modelu i o awarii dowiedzielismy sie
    // przypadkiem. voice-agent-chat zapisuje teraz alert do system_alerts —
    // ta lista jest miejscem, w ktore warsztat i tak patrzy.
    const wczytajAlert = async () => {
      const { data } = await (supabase as any)
        .from("system_alerts")
        .select("title, description")
        .eq("category", "system")
        .eq("status", "pending")
        .eq("metadata->>zrodlo", "voice_agent_billing")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!anulowane && data?.[0]) setAlertAwarii(data[0]);
    };
    void wczytaj();
    void wczytajAlert();
    return () => { anulowane = true; };
  }, [providerId]);

  // DOKONCZENIE ROZMOWY, KTORA NIE DOMKNELA SIE SAMA.
  //
  // Rozmowa ze statusem „Wymaga uwagi" ma komplet danych w transkrypcie —
  // brakowalo tylko sposobu, zeby je stamtad wyjac. Bez tego przycisku
  // 2 z 9 rozmow dziennie konczy sie tym, ze nikt nic z nimi nie robi.
  const utworzZlecenie = async (r: Rozmowa) => {
    setDomykana(r.id);
    try {
      const { data: sesja } = await supabase.auth.getSession();
      const token = sesja?.session?.access_token;
      if (!token) { toast.error("Sesja wygasła — zaloguj się ponownie."); return; }
      const odp = await fetch(
        "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/voice-call-commit",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: r.elevenlabs_conversation_id, provider_id: providerId }),
        },
      );
      const wynik = await odp.json().catch(() => ({}));
      if (!odp.ok || wynik?.error) {
        // Tresc bledu, nie sam status — inaczej warsztat widzi „nie udalo sie"
        // i nie wie, czego brakuje.
        toast.error(wynik?.error || `Nie udało się utworzyć zlecenia (${odp.status}).`);
        return;
      }
      if (wynik?.braki?.length) {
        toast.warning(`Brakuje danych: ${wynik.braki.join(", ")}. Uzupełnij w karcie zlecenia.`);
      } else {
        toast.success("Zlecenie utworzone z tej rozmowy.");
      }
      setRozmowy((poprz) => poprz.map((x) => x.id === r.id
        ? { ...x, status: "completed", linked_entity_type: "workshop_order", linked_entity_id: wynik?.order_id || x.linked_entity_id }
        : x));
    } finally {
      setDomykana(null);
    }
  };

  const widoczne = useMemo(
    () => (tylkoUwaga ? rozmowy.filter((r) => r.status === "needs_review") : rozmowy),
    [rozmowy, tylkoUwaga],
  );
  const doUwagi = rozmowy.filter((r) => r.status === "needs_review").length;

  if (ladowanie) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (blad) {
    return <Card><CardContent className="py-6 text-sm text-destructive">Nie udało się wczytać połączeń: {blad}</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4 text-primary" />
          Połączenia
          <span className="text-sm font-normal text-muted-foreground">({rozmowy.length})</span>
        </CardTitle>
        {doUwagi > 0 && (
          <Button
            size="sm"
            variant={tylkoUwaga ? "default" : "outline"}
            onClick={() => setTylkoUwaga((v) => !v)}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Wymaga uwagi ({doUwagi})
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {alertAwarii && (
          <div className="mb-3 rounded-lg border border-destructive bg-destructive/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />{alertAwarii.title}
            </p>
            <p className="mt-1 text-xs text-destructive/90">{alertAwarii.description}</p>
          </div>
        )}
        {widoczne.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tylkoUwaga ? "Żadna rozmowa nie wymaga uwagi." : "Brak połączeń."}
          </p>
        )}

        {widoczne.map((r) => {
          const uwaga = r.status === "needs_review";
          const maZlecenie = r.linked_entity_type === "workshop_order" && !!r.linked_entity_id;
          return (
            <Collapsible key={r.id} className="rounded-lg border border-border">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{czas(r.created_at)}</span>
                    <span className="text-xs text-muted-foreground">{dlugosc(r.duration_seconds)}</span>
                    {r.contact_name && <span className="text-xs text-muted-foreground">· {r.contact_name}</span>}
                    {uwaga
                      ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Wymaga uwagi</Badge>
                      : maZlecenie
                        ? <Badge variant="secondary">Zlecenie utworzone</Badge>
                        : <Badge variant="outline">Bez zlecenia</Badge>}
                  </div>
                  {/* Przy rozmowie do przeglądu `outcome` niesie POWÓD, dla ktorego
                      nie dało się jej domknąć — to najważniejsza informacja w wierszu. */}
                  {uwaga && r.outcome && (
                    <p className="mt-1 text-xs text-destructive">{r.outcome}</p>
                  )}
                  {!uwaga && r.summary && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{r.summary}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {uwaga && r.elevenlabs_conversation_id && (
                    <Button size="sm" variant="outline" disabled={domykana === r.id}
                      onClick={() => void utworzZlecenie(r)}>
                      {domykana === r.id
                        ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        : <FilePlus className="mr-1 h-4 w-4" />}
                      Utwórz zlecenie
                    </Button>
                  )}
                  {maZlecenie && onOpenOrder && (
                    <Button size="sm" variant="ghost" onClick={() => onOpenOrder(r.linked_entity_id!)}>
                      <FileText className="mr-1 h-4 w-4" />Zlecenie
                    </Button>
                  )}
                  <CollapsibleTrigger asChild>
                    <Button size="sm" variant="ghost"><ChevronDown className="h-4 w-4" /></Button>
                  </CollapsibleTrigger>
                </div>
              </div>
              <CollapsibleContent className="border-t border-border px-3 py-3">
                {r.summary && <p className="mb-3 text-sm">{r.summary}</p>}
                {r.turns.length > 0 ? (
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />Transkrypcja ({r.turns.length})
                    </p>
                    {r.turns.map((t, i) => (
                      <p key={i} className="text-sm">
                        <span className={t.role === "agent" ? "text-primary" : "text-foreground"}>
                          {t.role === "agent" ? "Agent: " : "Klient: "}
                        </span>
                        <span className="text-muted-foreground">{t.message}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Transkrypcja pojawia się około pół minuty po rozłączeniu.
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
