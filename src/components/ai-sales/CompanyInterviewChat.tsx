import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, Link2, CheckCircle2 } from "lucide-react";

type Msg = { role: "assistant" | "user"; content: string };

const GREETING =
  "Cześć! Pomogę szybko ustawić Twojego agenta. Wklej link do strony firmy albo po prostu opisz własnymi słowami: czym się zajmujecie, gdzie, w jakich godzinach. Wyciągnę resztę i dopytam tylko o braki.";

export function CompanyInterviewChat({ onApply }: { onApply: (fields: Record<string, string>) => void }) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollDown = () => requestAnimationFrame(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  });

  const send = async () => {
    const text = input.trim();
    if (!text && !websiteUrl.trim()) { toast.info("Wpisz coś o firmie albo wklej link do strony."); return; }
    const userMsg: Msg = { role: "user", content: text || `Moja strona: ${websiteUrl.trim()}` };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      // wysyłamy realne tury (bez statycznego powitania = pierwszy element)
      const turns = next.slice(1).map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("voice-company-interview", {
        body: { messages: turns, website_url: websiteUrl.trim() || undefined },
      });
      if (error || !data?.success) {
        toast.error("AI: " + (data?.error || error?.message || "błąd"));
        setMessages((m) => [...m, { role: "assistant", content: "Przepraszam, coś poszło nie tak. Spróbuj jeszcze raz." }]);
      } else {
        if (data.fields && Object.keys(data.fields).length) onApply(data.fields);
        setMessages((m) => [...m, { role: "assistant", content: data.reply || "Zaktualizowałem pola poniżej." }]);
        if (data.done) setDone(true);
        setWebsiteUrl(""); // link zużyty
      }
    } finally {
      setSending(false);
      scrollDown();
    }
  };

  return (
    <div className="rounded-xl border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background/60">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Wypełnij rozmawiając z AI</span>
        {done && <span className="ml-auto flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Gotowe — sprawdź pola poniżej</span>}
      </div>

      <div ref={scrollRef} className="max-h-[280px] overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-background border rounded-bl-sm"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-background border rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI analizuje…
            </div>
          </div>
        )}
      </div>

      <div className="border-t bg-background/60 p-3 space-y-2">
        <div className="relative">
          <Link2 className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="(opcjonalnie) link do strony firmy — np. cart78garage.pl"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          />
        </div>
        <div className="flex gap-2 items-end">
          <Textarea
            rows={2}
            className="flex-1 resize-none"
            placeholder="Opisz firmę własnymi słowami…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
          />
          <Button onClick={send} disabled={sending} className="gap-1.5 shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Wyślij
          </Button>
        </div>
      </div>
    </div>
  );
}
