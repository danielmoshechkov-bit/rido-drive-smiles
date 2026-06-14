import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Play, Pause, Plus, Check, Globe } from "lucide-react";

interface AccountVoice {
  voice_id: string; name: string; gender: string | null; accent: string | null;
  preview_url: string | null; multilingual?: boolean; native_langs?: string[];
}
interface LibVoice {
  voice_id: string; public_owner_id: string; name: string; gender: string | null;
  accent: string | null; language: string; use_case: string | null; preview_url: string | null;
}
type Item = { id: string; name: string; gender: string | null; accent: string | null; preview_url: string | null; lib?: LibVoice };

const LANG_LABEL: Record<string, string> = { pl: "Polski", en: "English", ua: "Українська", ru: "Русский" };

export function NativeVoiceBrowser({
  open, onOpenChange, language, initialMode, title, accountVoices, onPicked,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  language: string; initialMode: "native" | "multi"; title: string;
  accountVoices: AccountVoice[]; onPicked: (voiceId: string) => void;
}) {
  const [native, setNative] = useState(initialMode !== "multi");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [lib, setLib] = useState<LibVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { if (open) { setNative(initialMode !== "multi"); setGender("all"); } }, [open, initialMode]);

  // natywne głosy z biblioteki dla danego języka
  useEffect(() => {
    if (!open || !native) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("voice-library", { body: { language, category: "professional" } });
      if (error || !data?.success) { toast.error("Biblioteka: " + (data?.error || error?.message || "błąd")); setLib([]); }
      else setLib(data.voices as LibVoice[]);
      setLoading(false);
    })();
  }, [open, native, language]);

  const items: Item[] = native
    ? lib.map((v) => ({ id: v.voice_id, name: v.name, gender: v.gender, accent: v.accent, preview_url: v.preview_url, lib: v }))
    : accountVoices.filter((v) => v.multilingual).map((v) => ({ id: v.voice_id, name: v.name, gender: v.gender, accent: v.accent, preview_url: v.preview_url }));
  const filtered = items.filter((v) => gender === "all" || v.gender === gender);

  const play = (it: Item) => {
    if (!it.preview_url) { toast.info("Brak gotowej próbki dla tego głosu."); return; }
    if (!audioRef.current) audioRef.current = new Audio();
    if (playing === it.id) { audioRef.current.pause(); setPlaying(null); return; }
    audioRef.current.src = it.preview_url;
    audioRef.current.onended = () => setPlaying(null);
    audioRef.current.play().then(() => setPlaying(it.id)).catch(() => setPlaying(null));
  };

  const choose = async (it: Item) => {
    if (it.lib) {
      // natywny z biblioteki — dodaj na konto, potem zwróć id konta
      setAdding(it.id);
      try {
        const { data, error } = await supabase.functions.invoke("voice-add", {
          body: { public_owner_id: it.lib.public_owner_id, voice_id: it.lib.voice_id, name: it.lib.name },
        });
        if (error || !data?.success) { toast.error("Dodanie głosu: " + (data?.error || error?.message || "błąd")); return; }
        toast.success(`Wybrano głos „${it.name}"`);
        onPicked(data.voice_id);
        onOpenChange(false);
      } finally { setAdding(null); }
    } else {
      onPicked(it.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-primary" /> {title}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 flex-wrap">
          <div className="inline-flex rounded-lg border p-0.5">
            <button onClick={() => setNative(true)} className={`px-3 py-1 text-sm rounded-md transition ${native ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              Natywne {LANG_LABEL[language] || language.toUpperCase()}
            </button>
            <button onClick={() => setNative(false)} className={`px-3 py-1 text-sm rounded-md transition ${!native ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              Wielojęzyczne
            </button>
          </div>
          <div className="inline-flex rounded-lg border p-0.5 ml-auto">
            {(["all", "male", "female"] as const).map((g) => (
              <button key={g} onClick={() => setGender(g)} className={`px-2.5 py-1 text-xs rounded-md transition ${gender === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {g === "all" ? "Wszyscy" : g === "male" ? "Męski" : "Żeński"}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[360px] overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {native ? `Brak natywnych głosów ${LANG_LABEL[language] || ""} dla tych filtrów.` : "Brak głosów wielojęzycznych na koncie."}
            </p>
          ) : filtered.map((v) => (
            <div key={v.id} className="flex items-center gap-2 rounded-lg border p-2.5">
              <button onClick={() => play(v)} className="text-primary hover:opacity-70 shrink-0" aria-label="Odsłuchaj">
                {playing === v.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{v.name}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {v.gender && <Badge variant="outline" className="text-[10px] font-normal">{v.gender === "male" ? "męski" : "żeński"}</Badge>}
                  {v.accent && <Badge variant="outline" className="text-[10px] font-normal">{v.accent}</Badge>}
                </div>
              </div>
              <Button size="sm" className="gap-1 shrink-0" onClick={() => choose(v)} disabled={adding === v.id}>
                {adding === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : v.lib ? <Plus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                Wybierz
              </Button>
            </div>
          ))}
        </div>
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          {native ? "Natywny lektor wytrenowany na tym języku — najlepsze brzmienie. Przyciskiem Wybierz dodajesz go na swoje konto." : "Jeden głos wielojęzyczny obsłuży wszystkie języki rozmowy."}
        </div>
      </DialogContent>
    </Dialog>
  );
}
