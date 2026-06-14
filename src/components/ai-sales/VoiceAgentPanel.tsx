import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, Play, Phone, Volume2, Bot, Sparkles, Wand2, Building2, Search, Pause } from "lucide-react";

interface Persona {
  persona_key: string;
  name: string;
  description: string | null;
  direction: string;
  default_voice_id: string | null;
  supported_langs: string[];
}

interface VoiceItem {
  voice_id: string;
  name: string;
  gender: string | null;
  accent: string | null;
  age: string | null;
  language: string | null;
  use_case: string | null;
  description: string | null;
  preview_url: string | null;
  category: string | null;
}

interface BusinessContext {
  company_name: string;
  description: string;
  hours: string;
  location: string;
  services: string;
  agent_intro: string;
  purpose: string;
  extra_info: string;
}

interface VoiceConfig {
  persona_key: string;
  is_active: boolean;
  display_name: string;
  voice_id: string;
  voice_speed: number;
  voice_stability: number;
  voice_similarity: number;
  voice_style: number;
  sample_text: string;
  languages: string[];
  inbound_mode: string;
  inbound_rings: number;
  calling_hours: { from?: string; to?: string };
  business_context: BusinessContext;
}

const LANGS = [
  { code: "pl", label: "Polski" },
  { code: "en", label: "English" },
  { code: "ua", label: "Українська" },
  { code: "ru", label: "Русский" },
];

const DEFAULT_SAMPLE = "Dzień dobry, tu asystent głosowy. W czym mogę pomóc?";

// NASZE sprawdzone wartości na naturalne, żywe brzmienie (nie-robot).
const OPTIMAL = { voice_stability: 0.45, voice_similarity: 0.75, voice_style: 0.0, voice_speed: 1.0 };

const emptyBC = (): BusinessContext => ({
  company_name: "", description: "", hours: "", location: "",
  services: "", agent_intro: "", purpose: "", extra_info: "",
});

function defaultsFor(persona: Persona | undefined): VoiceConfig {
  return {
    persona_key: persona?.persona_key ?? "",
    is_active: false,
    display_name: "",
    voice_id: persona?.default_voice_id ?? "",
    voice_speed: OPTIMAL.voice_speed,
    voice_stability: OPTIMAL.voice_stability,
    voice_similarity: OPTIMAL.voice_similarity,
    voice_style: OPTIMAL.voice_style,
    sample_text: DEFAULT_SAMPLE,
    languages: persona?.supported_langs?.length ? persona.supported_langs : ["pl"],
    inbound_mode: "off",
    inbound_rings: 4,
    calling_hours: {},
    business_context: emptyBC(),
  };
}

export function VoiceAgentPanel({ providerId }: { providerId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [cfg, setCfg] = useState<VoiceConfig | null>(null);

  // biblioteka głosów (na żywo z API)
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [fGender, setFGender] = useState<string>("all");
  const [fAccent, setFAccent] = useState<string>("all");
  const [fSearch, setFSearch] = useState("");

  const [previewing, setPreviewing] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 1) persony
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("voice_agent_personas")
        .select("persona_key, name, description, direction, default_voice_id, supported_langs")
        .eq("enabled", true)
        .order("priority", { ascending: false });
      const list = (data as Persona[]) || [];
      setPersonas(list);
      if (list.length) setSelectedPersona((cur) => cur || list[0].persona_key);
      else setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) biblioteka głosów (raz)
  useEffect(() => {
    (async () => {
      setVoicesLoading(true);
      const { data, error } = await supabase.functions.invoke("voice-list", { body: {} });
      if (error || !data?.success) {
        setVoicesError(data?.error || error?.message || "Nie udało się pobrać głosów");
        setVoices([]);
      } else {
        setVoices(data.voices as VoiceItem[]);
        setVoicesError(null);
      }
      setVoicesLoading(false);
    })();
  }, []);

  // 3) konfig tenanta dla persony (+ prefill danych firmy z profilu)
  useEffect(() => {
    if (!selectedPersona || !providerId) return;
    (async () => {
      setLoading(true);
      const persona = personas.find((p) => p.persona_key === selectedPersona);
      const { data } = await (supabase as any)
        .from("voice_agent_configs")
        .select("*")
        .eq("provider_id", providerId)
        .eq("persona_key", selectedPersona)
        .maybeSingle();

      let loaded: VoiceConfig;
      if (data) {
        loaded = {
          persona_key: selectedPersona,
          is_active: !!data.is_active,
          display_name: data.display_name ?? "",
          voice_id: data.voice_id ?? defaultsFor(persona).voice_id,
          voice_speed: data.voice_speed != null ? Number(data.voice_speed) : OPTIMAL.voice_speed,
          voice_stability: data.voice_stability != null ? Number(data.voice_stability) : OPTIMAL.voice_stability,
          voice_similarity: data.voice_similarity != null ? Number(data.voice_similarity) : OPTIMAL.voice_similarity,
          voice_style: data.voice_style != null ? Number(data.voice_style) : OPTIMAL.voice_style,
          sample_text: data.sample_text ?? DEFAULT_SAMPLE,
          languages: data.languages?.length ? data.languages : ["pl"],
          inbound_mode: data.inbound_mode ?? "off",
          inbound_rings: data.inbound_rings ?? 4,
          calling_hours: data.calling_hours ?? {},
          business_context: { ...emptyBC(), ...(data.business_context ?? {}) },
        };
      } else {
        loaded = defaultsFor(persona);
        // prefill danych firmy z profilu usługodawcy
        const { data: sp } = await (supabase as any)
          .from("service_providers")
          .select("company_name, description, address, city")
          .eq("id", providerId)
          .maybeSingle();
        if (sp) {
          loaded.business_context.company_name = sp.company_name || "";
          loaded.business_context.description = sp.description || "";
          loaded.business_context.location = [sp.address, sp.city].filter(Boolean).join(", ");
        }
      }
      setCfg(loaded);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersona, providerId, personas]);

  const update = (patch: Partial<VoiceConfig>) => setCfg((c) => (c ? { ...c, ...patch } : c));
  const updateBC = (patch: Partial<BusinessContext>) =>
    setCfg((c) => (c ? { ...c, business_context: { ...c.business_context, ...patch } } : c));

  const selectedVoice = voices.find((v) => v.voice_id === cfg?.voice_id);
  const accents = Array.from(new Set(voices.map((v) => v.accent).filter(Boolean))) as string[];
  const filteredVoices = voices.filter((v) => {
    if (fGender !== "all" && v.gender !== fGender) return false;
    if (fAccent !== "all" && v.accent !== fAccent) return false;
    if (fSearch && !`${v.name} ${v.accent ?? ""} ${v.use_case ?? ""}`.toLowerCase().includes(fSearch.toLowerCase()))
      return false;
    return true;
  });

  const playUrl = (id: string, url: string | null) => {
    if (!url) { toast.info("Ten głos nie ma gotowej próbki — użyj odsłuchu z własnym tekstem."); return; }
    if (!audioRef.current) audioRef.current = new Audio();
    if (playingVoice === id) { audioRef.current.pause(); setPlayingVoice(null); return; }
    audioRef.current.src = url;
    audioRef.current.onended = () => setPlayingVoice(null);
    audioRef.current.play().then(() => setPlayingVoice(id)).catch(() => setPlayingVoice(null));
  };

  const previewWithText = async () => {
    if (!cfg?.voice_id) { toast.error("Najpierw wybierz głos"); return; }
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-preview", {
        body: {
          voice_id: cfg.voice_id,
          text: cfg.sample_text || DEFAULT_SAMPLE,
          speed: cfg.voice_speed,
          stability: cfg.voice_stability,
          similarity_boost: cfg.voice_similarity,
          style: cfg.voice_style,
        },
      });
      if (error || !data?.success) {
        toast.error("Odsłuch nieudany: " + (data?.error || error?.message || "błąd"));
      } else {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = `data:${data.mime || "audio/mpeg"};base64,${data.audio}`;
        await audioRef.current.play();
      }
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    if (!providerId || !cfg) return;
    setSaving(true);
    const { error } = await (supabase as any).from("voice_agent_configs").upsert(
      {
        provider_id: providerId,
        persona_key: cfg.persona_key,
        is_active: cfg.is_active,
        display_name: cfg.display_name || null,
        voice_id: cfg.voice_id || null,
        voice_speed: cfg.voice_speed,
        voice_stability: cfg.voice_stability,
        voice_similarity: cfg.voice_similarity,
        voice_style: cfg.voice_style,
        sample_text: cfg.sample_text || null,
        languages: cfg.languages,
        inbound_mode: cfg.inbound_mode,
        inbound_rings: cfg.inbound_rings,
        calling_hours: cfg.calling_hours,
        business_context: cfg.business_context,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id,persona_key" },
    );
    if (error) toast.error("Błąd zapisu: " + error.message);
    else toast.success("Zapisano ustawienia agenta głosowego");
    setSaving(false);
  };

  if (!providerId) return <div className="py-12 text-center text-muted-foreground">Ładowanie konta usługodawcy…</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/40 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Asystent głosowy AI — konfiguracja</p>
          <p className="text-muted-foreground mt-1">
            Ustaw wszystko sam: rolę, głos, dane firmy i sposób odbierania. Agent użyje tych informacji,
            żeby wiedzieć o czym rozmawia. Domyślne ustawienia głosu są już dobrane na naturalne brzmienie.
          </p>
        </div>
      </div>

      {/* ROLA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Rola agenta</CardTitle>
          <CardDescription>W jakiej roli ma działać agent.</CardDescription>
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
          {/* AKTYWACJA + NAZWA */}
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
                <Input placeholder="np. Asystentka Kasia" value={cfg.display_name} onChange={(e) => update({ display_name: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          {/* A) BIBLIOTEKA GŁOSÓW */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5" /> Wybór głosu</CardTitle>
              <CardDescription>Biblioteka głosów ElevenLabs (na żywo). Filtruj i odsłuchaj próbkę.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedVoice && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm flex items-center justify-between">
                  <span>Wybrany głos: <strong>{selectedVoice.name}</strong>{selectedVoice.accent ? ` · ${selectedVoice.accent}` : ""}</span>
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => playUrl(selectedVoice.voice_id, selectedVoice.preview_url)}>
                    {playingVoice === selectedVoice.voice_id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    Próbka
                  </Button>
                </div>
              )}

              {/* filtry */}
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Płeć</Label>
                  <Select value={fGender} onValueChange={setFGender}>
                    <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie</SelectItem>
                      <SelectItem value="male">Męski</SelectItem>
                      <SelectItem value="female">Żeński</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Akcent</Label>
                  <Select value={fAccent} onValueChange={setFAccent}>
                    <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie</SelectItem>
                      {accents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1 min-w-[160px]">
                  <Label className="text-xs">Szukaj</Label>
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                    <Input className="h-9 pl-8" placeholder="nazwa, akcent…" value={fSearch} onChange={(e) => setFSearch(e.target.value)} />
                  </div>
                </div>
              </div>

              {voicesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : voicesError ? (
                <p className="text-sm text-red-600 py-2">{voicesError} — sprawdź klucz ElevenLabs w Centrum AI.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[360px] overflow-y-auto pr-1">
                  {filteredVoices.map((v) => (
                    <div
                      key={v.voice_id}
                      className={`rounded-lg border p-3 transition cursor-pointer ${
                        cfg.voice_id === v.voice_id ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                      onClick={() => update({ voice_id: v.voice_id })}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{v.name}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); playUrl(v.voice_id, v.preview_url); }}
                          className="text-primary hover:opacity-70"
                          aria-label="Odsłuchaj"
                        >
                          {playingVoice === v.voice_id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {v.gender && <Badge variant="outline" className="text-[10px] font-normal">{v.gender === "male" ? "męski" : "żeński"}</Badge>}
                        {v.accent && <Badge variant="outline" className="text-[10px] font-normal">{v.accent}</Badge>}
                        {v.use_case && <Badge variant="outline" className="text-[10px] font-normal">{v.use_case}</Badge>}
                      </div>
                    </div>
                  ))}
                  {filteredVoices.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-4 text-center">Brak głosów dla tych filtrów.</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* B) USTAWIENIA GŁOSU */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5" /> Brzmienie głosu</CardTitle>
                  <CardDescription>Domyślnie dobrane na naturalne brzmienie. Możesz regulować lub przywrócić optymalne.</CardDescription>
                </div>
                <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => update(OPTIMAL)}>
                  <Sparkles className="h-4 w-4" /> Optymalne ustawienia
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { key: "voice_stability" as const, label: "Stabilność", hint: "niżej = bardziej żywo i ekspresyjnie", min: 0, max: 1, step: 0.05 },
                { key: "voice_similarity" as const, label: "Podobieństwo", hint: "wierność barwie głosu", min: 0, max: 1, step: 0.05 },
                { key: "voice_style" as const, label: "Styl / ekspresja", hint: "wyżej = mocniejszy styl (czasem mniej naturalnie)", min: 0, max: 1, step: 0.05 },
                { key: "voice_speed" as const, label: "Tempo", hint: "szybkość mówienia", min: 0.7, max: 1.2, step: 0.05 },
              ].map((s) => (
                <div key={s.key} className="space-y-2">
                  <div className="flex justify-between">
                    <Label>{s.label} <span className="text-xs text-muted-foreground font-normal">— {s.hint}</span></Label>
                    <span className="text-sm text-muted-foreground tabular-nums">{cfg[s.key].toFixed(2)}</span>
                  </div>
                  <Slider min={s.min} max={s.max} step={s.step} value={[cfg[s.key]]} onValueChange={([v]) => update({ [s.key]: v } as any)} />
                </div>
              ))}

              <div className="space-y-2">
                <Label>Tekst do odsłuchu / powitanie</Label>
                <Textarea rows={2} value={cfg.sample_text} onChange={(e) => update({ sample_text: e.target.value })} placeholder={DEFAULT_SAMPLE} />
              </div>
              <Button variant="outline" onClick={previewWithText} disabled={previewing} className="gap-2">
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Odsłuchaj z moim tekstem i ustawieniami
              </Button>
            </CardContent>
          </Card>

          {/* C) WYWIAD O FIRMIE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> O Twojej firmie</CardTitle>
              <CardDescription>Te informacje agent wykorzysta w rozmowie — wypełnij, a AC „nauczy się” o firmie.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nazwa firmy</Label>
                <Input value={cfg.business_context.company_name} onChange={(e) => updateBC({ company_name: e.target.value })} placeholder="np. Auto-Serwis Kowalski" />
              </div>
              <div className="space-y-2">
                <Label>Czym się zajmujecie? (opis działalności)</Label>
                <Textarea rows={2} value={cfg.business_context.description} onChange={(e) => updateBC({ description: e.target.value })} placeholder="np. Warsztat samochodowy — mechanika, diagnostyka, wymiana opon…" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Godziny pracy</Label>
                  <Input value={cfg.business_context.hours} onChange={(e) => updateBC({ hours: e.target.value })} placeholder="np. pon–pt 8:00–18:00, sob 9:00–14:00" />
                </div>
                <div className="space-y-2">
                  <Label>Lokalizacja / adres</Label>
                  <Input value={cfg.business_context.location} onChange={(e) => updateBC({ location: e.target.value })} placeholder="np. ul. Główna 5, Warszawa" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Oferowane usługi (po jednej w linii)</Label>
                <Textarea rows={3} value={cfg.business_context.services} onChange={(e) => updateBC({ services: e.target.value })} placeholder={"Wymiana oleju\nGeometria kół\nDiagnostyka komputerowa"} />
              </div>
              <div className="space-y-2">
                <Label>Jak agent ma się przedstawiać i w jakim celu dzwoni/odbiera</Label>
                <Textarea rows={2} value={cfg.business_context.agent_intro} onChange={(e) => updateBC({ agent_intro: e.target.value })} placeholder="np. „Dzień dobry, tu Kasia z Auto-Serwis Kowalski — pomogę umówić wizytę.”" />
              </div>
              <div className="space-y-2">
                <Label>Cel rozmowy</Label>
                <Input value={cfg.business_context.purpose} onChange={(e) => updateBC({ purpose: e.target.value })} placeholder="np. umawianie klientów na serwis i odpowiadanie na pytania" />
              </div>
              <div className="space-y-2">
                <Label>Dodatkowe informacje dla AI (ceny orientacyjne, promocje, zasady)</Label>
                <Textarea rows={3} value={cfg.business_context.extra_info} onChange={(e) => updateBC({ extra_info: e.target.value })} placeholder="np. Wymiana oleju od 150 zł. Promocja: przegląd -20% w listopadzie. Nie umawiamy na niedziele." />
              </div>
            </CardContent>
          </Card>

          {/* D) ODBIERANIE / DZIAŁANIE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Odbieranie i działanie</CardTitle>
              <CardDescription>Kiedy i jak agent ma odbierać oraz w jakich językach rozmawia.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2 max-w-sm">
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
                <div className="space-y-2 max-w-sm">
                  <div className="flex justify-between">
                    <Label>Liczba sygnałów przed odebraniem</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">{cfg.inbound_rings}</span>
                  </div>
                  <Slider min={1} max={10} step={1} value={[cfg.inbound_rings]} onValueChange={([v]) => update({ inbound_rings: v })} />
                </div>
              )}

              <div className="space-y-2">
                <Label>Godziny aktywności agenta (kiedy odbiera)</Label>
                <div className="flex items-center gap-2 max-w-sm">
                  <Input type="time" value={cfg.calling_hours.from ?? ""} onChange={(e) => update({ calling_hours: { ...cfg.calling_hours, from: e.target.value } })} />
                  <span>–</span>
                  <Input type="time" value={cfg.calling_hours.to ?? ""} onChange={(e) => update({ calling_hours: { ...cfg.calling_hours, to: e.target.value } })} />
                </div>
                <p className="text-xs text-muted-foreground">Puste = bez ograniczeń godzinowych.</p>
              </div>

              <div className="space-y-2">
                <Label>Języki rozmowy</Label>
                <div className="flex flex-wrap gap-4">
                  {LANGS.map((l) => (
                    <label key={l.code} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={cfg.languages.includes(l.code)}
                        onCheckedChange={(v) =>
                          update({ languages: v ? [...cfg.languages, l.code] : cfg.languages.filter((c) => c !== l.code) })
                        }
                      />
                      <span className="text-sm">{l.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end sticky bottom-4">
            <Button onClick={save} disabled={saving} size="lg" className="gap-2 shadow-lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz ustawienia
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
