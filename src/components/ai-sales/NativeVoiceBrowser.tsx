import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Play, Pause, Plus, Globe } from "lucide-react";

interface LibVoice {
  voice_id: string; public_owner_id: string; name: string; gender: string | null;
  accent: string | null; language: string; age: string | null; category: string | null; use_case: string | null; preview_url: string | null;
}
const LANGS = [
  { code: "pl", label: "Polski" }, { code: "en", label: "English" },
  { code: "ua", label: "Українська" }, { code: "ru", label: "Русский" },
];

export function NativeVoiceBrowser({
  open, onOpenChange, defaultLang, onPicked,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; defaultLang: string;
  onPicked: (lang: string, accountVoiceId: string) => void;
}) {
  const [lang, setLang] = useState(defaultLang || "pl");
  const [voices, setVoices] = useState<LibVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [pro, setPro] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { if (open) setLang(defaultLang || "pl"); }, [open, defaultLang]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("voice-library", { body: { language: lang, category: pro ? "professional" : "all" } });
      if (error || !data?.success) { toast.error("Biblioteka: " + (data?.error || error?.message || "błąd")); setVoices([]); }
      else setVoices(data.voices as LibVoice[]);
      setLoading(false);
    })();
  }, [open, lang, pro]);

  const play = (v: LibVoice) => {
    if (!v.preview_url) return;
    if (!audioRef.current) audioRef.current = new Audio();
    if (playing === v.voice_id) { audioRef.current.pause(); setPlaying(null); return; }
    audioRef.current.src = v.preview_url;
    audioRef.current.onended = () => setPlaying(null);
    audioRef.current.play().then(() => setPlaying(v.voice_id)).catch(() => setPlaying(null));
  };

  const use = async (v: LibVoice) => {
    setAdding(v.voice_id);
    try {
      const { data, error } = await supabase.functions.invoke("voice-add", {
        body: { public_owner_id: v.public_owner_id, voice_id: v.voice_id, name: v.name },
      });
      if (error || !data?.success) { toast.error("Dodanie głosu: " + (data?.error || error?.message || "błąd")); return; }
      toast.success(`Dodano głos „${v.name}" do ${LANGS.find((l) => l.code === lang)?.label}`);
      onPicked(lang, data.voice_id);
      onOpenChange(false);
    } finally { setAdding(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-primary" /> Natywne głosy z biblioteki ElevenLabs</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 flex-wrap">
          <span className="text-sm text-muted-foreground">Język:</span>
          <div className="inline-flex rounded-lg border p-0.5">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => setLang(l.code)}
                className={`px-3 py-1 text-sm rounded-md transition ${lang === l.code ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {l.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs ml-auto cursor-pointer">
            <Switch checked={pro} onCheckedChange={setPro} /> tylko profesjonalne
          </label>
        </div>
        {!loading && (
          <div className="px-4 py-1.5 text-xs text-muted-foreground border-b">
            Natywne głosy wytrenowane na języku „{LANGS.find((l) => l.code === lang)?.label}" — znaleziono: {voices.length}
          </div>
        )}

        <div className="h-[360px] overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : voices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Brak głosów dla tego języka.</p>
          ) : voices.map((v) => (
            <div key={v.voice_id} className="flex items-center gap-2 rounded-lg border p-2.5">
              <button onClick={() => play(v)} className="text-primary hover:opacity-70 shrink-0" aria-label="Odsłuchaj">
                {playing === v.voice_id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{v.name}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {v.gender && <Badge variant="outline" className="text-[10px] font-normal">{v.gender === "male" ? "męski" : "żeński"}</Badge>}
                  {v.accent && <Badge variant="outline" className="text-[10px] font-normal">{v.accent}</Badge>}
                  {v.use_case && <Badge variant="outline" className="text-[10px] font-normal">{v.use_case}</Badge>}
                </div>
              </div>
              <Button size="sm" className="gap-1 shrink-0" onClick={() => use(v)} disabled={adding === v.voice_id}>
                {adding === v.voice_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Użyj
              </Button>
            </div>
          ))}
        </div>
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          „Użyj" dodaje głos na Twoje konto ElevenLabs i przypisuje do wybranego języka (tryb: osobny głos na język).
        </div>
      </DialogContent>
    </Dialog>
  );
}
