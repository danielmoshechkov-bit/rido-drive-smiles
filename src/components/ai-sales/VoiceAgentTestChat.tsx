import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Send, Volume2, PhoneCall, RotateCcw } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  providerId: string | null;
  personaKey: string;
  displayName: string;
  businessContext: Record<string, string>;
  languages: string[];
  calendarAccess: boolean;
  ordersAccess: boolean;
  voiceId: string;
  voiceSettings: { speed: number; stability: number; similarity: number; style: number };
}

const KICKOFF = "[Rozpocznij rozmowę — przywitaj się zgodnie ze swoją rolą]";

export function VoiceAgentTestChat(p: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [voiced, setVoiced] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollDown = () => requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });

  const callBrain = async (history: Msg[]): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke("voice-agent-chat", {
      body: {
        provider_id: p.providerId,
        persona_key: p.personaKey,
        display_name: p.displayName,
        business_context: p.businessContext,
        languages: p.languages,
        calendar_access: p.calendarAccess,
        orders_access: p.ordersAccess,
        test_mode: true,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      },
    });
    if (error || !data?.success) { toast.error("Agent: " + (data?.error || error?.message || "błąd")); return null; }
    return data.reply as string;
  };

  const speak = async (text: string) => {
    if (!p.voiceId || !text) return;
    // wyczyść tekst: usuń akcje w nawiasach, przytnij na granicy zdania (nie w połowie)
    let clean = text.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
    if (clean.length > 500) {
      const cut = clean.slice(0, 500);
      const lastEnd = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
      clean = lastEnd > 120 ? cut.slice(0, lastEnd + 1) : cut;
    }
    if (!clean) return;
    // zatrzymaj poprzednie audio, żeby się nie nakładało / nie "przerywało"
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setSpeaking(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-preview", {
        body: { voice_id: p.voiceId, text: clean, speed: p.voiceSettings.speed, stability: p.voiceSettings.stability, similarity_boost: p.voiceSettings.similarity, style: p.voiceSettings.style },
      });
      if (!error && data?.success) {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = `data:${data.mime || "audio/mpeg"};base64,${data.audio}`;
        await audioRef.current.play();
      }
    } finally { setSpeaking(false); }
  };

  const start = async () => {
    setMsgs([]);
    setSending(true);
    const seed: Msg[] = [{ role: "user", content: KICKOFF, hidden: true }];
    const reply = await callBrain(seed);
    if (reply != null) {
      setMsgs([...seed, { role: "assistant", content: reply }]);
      if (voiced) speak(reply);
    }
    setSending(false);
    scrollDown();
  };

  // start rozmowy przy otwarciu
  useEffect(() => { if (p.open) start(); else { audioRef.current?.pause(); } /* eslint-disable-next-line */ }, [p.open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next);
    setInput("");
    setSending(true);
    scrollDown();
    const reply = await callBrain(next);
    if (reply != null) {
      setMsgs([...next, { role: "assistant", content: reply }]);
      if (voiced) speak(reply);
    }
    setSending(false);
    scrollDown();
  };

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="h-4 w-4 text-primary" /> Rozmowa testowa z agentem
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={voiced} onCheckedChange={setVoiced} />
            <Volume2 className="h-4 w-4" /> Czytaj odpowiedzi głosem
            {speaking && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </label>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={start} disabled={sending}>
            <RotateCcw className="h-3.5 w-3.5" /> Od nowa
          </Button>
        </div>

        <div ref={scrollRef} className="h-[360px] overflow-y-auto px-4 py-3 space-y-3 bg-background">
          {msgs.filter((m) => !m.hidden).map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> agent pisze…
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2">
          <Input
            placeholder="Napisz jako klient…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            disabled={sending}
          />
          <Button onClick={send} disabled={sending || !input.trim()} className="gap-1.5 shrink-0">
            <Send className="h-4 w-4" /> Wyślij
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
