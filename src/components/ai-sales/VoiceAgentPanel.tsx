import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ELEVENLABS_VOICES } from "@/hooks/useAIAgentConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, Play, Phone, Volume2, Bot, Sparkles } from "lucide-react";

interface Persona {
  persona_key: string;
  name: string;
  description: string | null;
  direction: string;
  default_voice_id: string | null;
  supported_langs: string[];
}

interface VoiceConfig {
  persona_key: string;
  is_active: boolean;
  display_name: string;
  voice_id: string;
  voice_speed: number;
  sample_text: string;
  languages: string[];
  inbound_mode: string;
  inbound_rings: number;
}

const LANGS = [
  { code: "pl", label: "Polski" },
  { code: "en", label: "English" },
  { code: "ua", label: "Українська" },
  { code: "ru", label: "Русский" },
];

const DEFAULT_SAMPLE = "Dzień dobry, tu asystent głosowy. W czym mogę pomóc?";

function defaultsFor(persona: Persona | undefined): VoiceConfig {
  return {
    persona_key: persona?.persona_key ?? "",
    is_active: false,
    display_name: "",
    voice_id: persona?.default_voice_id ?? ELEVENLABS_VOICES[0].id,
    voice_speed: 1.0,
    sample_text: DEFAULT_SAMPLE,
    languages: persona?.supported_langs?.length ? persona.supported_langs : ["pl"],
    inbound_mode: "off",
    inbound_rings: 4,
  };
}

export function VoiceAgentPanel({ providerId }: { providerId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [cfg, setCfg] = useState<VoiceConfig | null>(null);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 1) wczytaj persony (rejestr core)
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("voice_agent_personas")
        .select("persona_key, name, description, direction, default_voice_id, supported_langs")
        .eq("enabled", true)
        .order("priority", { ascending: false });
      const list = (data as Persona[]) || [];
      setPersonas(list);
      if (list.length && !selectedPersona) setSelectedPersona(list[0].persona_key);
      if (!list.length) setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) wczytaj konfig tenanta dla wybranej persony
  useEffect(() => {
    if (!selectedPersona || !providerId) return;
    (async () => {
      setLoading(true);
      const persona = personas.find((p) => p.persona_key === selectedPersona);
      const { data } = await (supabase as any)
        .from("voice_agent_configs")
        .select("persona_key, is_active, display_name, voice_id, voice_speed, sample_text, languages, inbound_mode, inbound_rings")
        .eq("provider_id", providerId)
        .eq("persona_key", selectedPersona)
        .maybeSingle();
      const loaded: VoiceConfig = data
        ? {
            persona_key: selectedPersona,
            is_active: !!data.is_active,
            display_name: data.display_name ?? "",
            voice_id: data.voice_id ?? defaultsFor(persona).voice_id,
            voice_speed: data.voice_speed != null ? Number(data.voice_speed) : 1.0,
            sample_text: data.sample_text ?? DEFAULT_SAMPLE,
            languages: data.languages?.length ? data.languages : ["pl"],
            inbound_mode: data.inbound_mode ?? "off",
            inbound_rings: data.inbound_rings ?? 4,
          }
        : defaultsFor(persona);
      setCfg(loaded);
      setGender((ELEVENLABS_VOICES.find((v) => v.id === loaded.voice_id)?.gender as "male" | "female") || "male");
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersona, providerId, personas]);

  const update = (patch: Partial<VoiceConfig>) => setCfg((c) => (c ? { ...c, ...patch } : c));

  const filteredVoices = ELEVENLABS_VOICES.filter((v) => v.gender === gender);

  const save = async () => {
    if (!providerId || !cfg) return;
    setSaving(true);
    const { error } = await (supabase as any).from("voice_agent_configs").upsert(
      {
        provider_id: providerId,
        persona_key: cfg.persona_key,
        is_active: cfg.is_active,
        display_name: cfg.display_name || null,
        voice_id: cfg.voice_id,
        voice_speed: cfg.voice_speed,
        sample_text: cfg.sample_text || null,
        languages: cfg.languages,
        inbound_mode: cfg.inbound_mode,
        inbound_rings: cfg.inbound_rings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id,persona_key" },
    );
    if (error) toast.error("Błąd zapisu: " + error.message);
    else toast.success("Zapisano ustawienia agenta głosowego");
    setSaving(false);
  };

  const preview = async () => {
    if (!cfg) return;
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-preview", {
        body: { voice_id: cfg.voice_id, text: cfg.sample_text || DEFAULT_SAMPLE, speed: cfg.voice_speed },
      });
      if (error || !data?.success) {
        toast.error("Odsłuch nieudany: " + (data?.error || error?.message || "błąd"));
      } else {
        const src = `data:${data.mime || "audio/mpeg"};base64,${data.audio}`;
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = src;
        await audioRef.current.play();
      }
    } finally {
      setPreviewing(false);
    }
  };

  if (!providerId) {
    return <div className="py-12 text-center text-muted-foreground">Ładowanie konta usługodawcy…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/40 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Asystent głosowy AI</p>
          <p className="text-muted-foreground mt-1">
            Skonfiguruj swojego agenta telefonicznego: rola, głos, język, sposób odbierania. Ustawienia są
            podpięte do wspólnego silnika — działają dla Twojego konta.
          </p>
        </div>
      </div>

      {/* Wybór persony (roli) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Rola agenta</CardTitle>
          <CardDescription>Wybierz, w jakiej roli ma działać agent.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedPersona} onValueChange={setSelectedPersona}>
            <SelectTrigger><SelectValue placeholder="Wybierz rolę" /></SelectTrigger>
            <SelectContent>
              {personas.map((p) => (
                <SelectItem key={p.persona_key} value={p.persona_key}>
                  {p.name} {p.direction === "inbound" ? "(odbiera)" : p.direction === "outbound" ? "(dzwoni)" : "(odbiera + dzwoni)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {personas.find((p) => p.persona_key === selectedPersona)?.description && (
            <p className="text-xs text-muted-foreground mt-2">
              {personas.find((p) => p.persona_key === selectedPersona)?.description}
            </p>
          )}
        </CardContent>
      </Card>

      {loading || !cfg ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Aktywacja + nazwa */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Agent aktywny</Label>
                  <p className="text-xs text-muted-foreground">Włącz, gdy konfiguracja jest gotowa.</p>
                </div>
                <Switch checked={cfg.is_active} onCheckedChange={(v) => update({ is_active: v })} />
              </div>
              <div className="space-y-2">
                <Label>Nazwa agenta (jak się przedstawia)</Label>
                <Input
                  placeholder="np. Asystentka Kasia"
                  value={cfg.display_name}
                  onChange={(e) => update({ display_name: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Głos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5" /> Głos</CardTitle>
              <CardDescription>Wybierz płeć i barwę głosu, ustaw szybkość i odsłuchaj próbkę.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Płeć głosu</Label>
                <RadioGroup
                  value={gender}
                  onValueChange={(g: "male" | "female") => {
                    setGender(g);
                    const first = ELEVENLABS_VOICES.find((v) => v.gender === g);
                    if (first) update({ voice_id: first.id });
                  }}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="male" id="g-male" /><Label htmlFor="g-male">Męski</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="female" id="g-female" /><Label htmlFor="g-female">Damski</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {filteredVoices.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => update({ voice_id: v.id })}
                    className={`text-left rounded-lg border p-3 transition ${
                      cfg.voice_id === v.id ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-medium text-sm">{v.name}</div>
                    <Badge variant="outline" className="text-xs mt-1 font-normal">{v.style}</Badge>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Szybkość mowy</Label>
                  <span className="text-sm text-muted-foreground tabular-nums">{cfg.voice_speed.toFixed(2)}×</span>
                </div>
                <Slider
                  min={0.7} max={1.2} step={0.05}
                  value={[cfg.voice_speed]}
                  onValueChange={([v]) => update({ voice_speed: v })}
                />
              </div>

              <div className="space-y-2">
                <Label>Tekst przykładowy (do odsłuchu / powitanie)</Label>
                <Textarea
                  rows={2}
                  value={cfg.sample_text}
                  onChange={(e) => update({ sample_text: e.target.value })}
                  placeholder={DEFAULT_SAMPLE}
                />
              </div>

              <Button variant="outline" onClick={preview} disabled={previewing} className="gap-2">
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Odsłuchaj głos
              </Button>
            </CardContent>
          </Card>

          {/* Języki */}
          <Card>
            <CardHeader>
              <CardTitle>Języki rozmowy</CardTitle>
              <CardDescription>Agent wykryje język rozmówcy i odpowie w jednym z zaznaczonych.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {LANGS.map((l) => (
                <label key={l.code} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={cfg.languages.includes(l.code)}
                    onCheckedChange={(v) =>
                      update({
                        languages: v
                          ? [...cfg.languages, l.code]
                          : cfg.languages.filter((c) => c !== l.code),
                      })
                    }
                  />
                  <span className="text-sm">{l.label}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Odbieranie połączeń */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Odbieranie połączeń</CardTitle>
              <CardDescription>Kiedy agent ma odbierać połączenia przychodzące.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tryb odbioru</Label>
                <Select value={cfg.inbound_mode} onValueChange={(v) => update({ inbound_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Wyłączone</SelectItem>
                    <SelectItem value="immediate">Od razu</SelectItem>
                    <SelectItem value="after_rings">Po kilku sygnałach</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cfg.inbound_mode === "after_rings" && (
                <div className="space-y-2 max-w-[200px]">
                  <Label>Liczba sygnałów</Label>
                  <Input
                    type="number" min={1} max={10}
                    value={cfg.inbound_rings}
                    onChange={(e) => update({ inbound_rings: parseInt(e.target.value) || 4 })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz ustawienia
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
