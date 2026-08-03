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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CompanyInterviewChat } from "./CompanyInterviewChat";
import { VoiceAgentTestChat } from "./VoiceAgentTestChat";
import { NativeVoiceBrowser } from "./NativeVoiceBrowser";
import { toast } from "sonner";
import { Loader2, Save, Play, Phone, Volume2, Bot, Sparkles, Wand2, Building2, Search, Pause, Star, Globe, ChevronDown, CalendarCheck, ClipboardList, ShieldCheck, PhoneCall, Copy } from "lucide-react";

const FUNCTIONS_BASE = "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1";

interface Persona {
  persona_key: string; name: string; description: string | null; direction: string;
  default_voice_id: string | null; supported_langs: string[];
}
interface VerifiedPreview { lang: string; accent: string | null; preview_url: string | null; }
interface VoiceItem {
  voice_id: string; name: string; gender: string | null; accent: string | null; age: string | null;
  use_case: string | null; description: string | null; preview_url: string | null; category: string | null;
  multilingual: boolean; native_langs?: string[]; verified_langs: string[]; verified_previews: VerifiedPreview[]; recommended: boolean; score: number;
}
interface BusinessContext {
  company_name: string; description: string; hours: string; location: string;
  services: string; agent_intro: string; purpose: string; roadside: string; extra_info: string;
}
interface VoiceConfig {
  persona_key: string; is_active: boolean; display_name: string;
  voice_id: string; voice_mode: string; voice_per_language: Record<string, string>;
  voice_speed: number; voice_stability: number; voice_similarity: number; voice_style: number;
  sample_text: string; languages: string[]; inbound_mode: string; inbound_rings: number;
  calling_hours: { from?: string; to?: string }; business_context: BusinessContext;
  calendar_access: boolean; orders_access: boolean; learning_mode: string;
  elevenlabs_agent_id: string;
  turn_timeout_seconds: number; silence_end_call_timeout_seconds: number; soft_timeout_seconds: number;
}

const LANGS = [
  { code: "pl", label: "Polski", short: "PL" },
  { code: "en", label: "English", short: "EN" },
  { code: "ua", label: "Українська", short: "UA" },
  { code: "ru", label: "Русский", short: "RU" },
];
const SAMPLE_TEXTS: Record<string, string> = {
  pl: "Dzień dobry, tu asystent głosowy. W czym mogę pomóc?",
  en: "Hello, this is your AI voice assistant. How can I help you today?",
  ua: "Доброго дня, це голосовий помічник. Чим можу допомогти?",
  ru: "Здравствуйте, это голосовой помощник. Чем могу помочь?",
};
const DEFAULT_SAMPLE = SAMPLE_TEXTS.pl;
const OPTIMAL = { voice_stability: 0.45, voice_similarity: 0.75, voice_style: 0.0, voice_speed: 1.0 };

const emptyBC = (): BusinessContext => ({
  company_name: "", description: "", hours: "", location: "", services: "", agent_intro: "", purpose: "", roadside: "", extra_info: "",
});
function defaultsFor(persona: Persona | undefined): VoiceConfig {
  return {
    persona_key: persona?.persona_key ?? "", is_active: false, display_name: "",
    voice_id: persona?.default_voice_id ?? "", voice_mode: "single", voice_per_language: {},
    voice_speed: OPTIMAL.voice_speed, voice_stability: OPTIMAL.voice_stability,
    voice_similarity: OPTIMAL.voice_similarity, voice_style: OPTIMAL.voice_style,
    sample_text: DEFAULT_SAMPLE, languages: persona?.supported_langs?.length ? persona.supported_langs : ["pl"],
    inbound_mode: "off", inbound_rings: 4, calling_hours: {}, business_context: emptyBC(),
    calendar_access: false, orders_access: false, learning_mode: "per_call",
    elevenlabs_agent_id: "", turn_timeout_seconds: 7,
    silence_end_call_timeout_seconds: 60, soft_timeout_seconds: 3,
  };
}

export function VoiceAgentPanel({ providerId }: { providerId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingElevenLabs, setSyncingElevenLabs] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [cfg, setCfg] = useState<VoiceConfig | null>(null);

  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [fGender, setFGender] = useState("all");
  const [fAccent, setFAccent] = useState("all");
  const [fSearch, setFSearch] = useState("");
  const [onlyMulti, setOnlyMulti] = useState(true);
  const [previewLang, setPreviewLang] = useState("pl");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [testOpen, setTestOpen] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainDone, setTrainDone] = useState(0);
  const [trainTotal, setTrainTotal] = useState(0);
  const [trainLessons, setTrainLessons] = useState(0);
  const [trainLog, setTrainLog] = useState<string[]>([]);
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(null);

  const loadKnowledgeCount = async (persona: string) => {
    if (!providerId || !persona) return;
    const { count } = await (supabase as any).from("voice_agent_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("persona_key", persona).eq("is_active", true)
      .or(`provider_id.eq.${providerId},provider_id.is.null`);
    setKnowledgeCount(count ?? 0);
  };

  const runTraining = async (n: number) => {
    if (!providerId || !cfg) return;
    setTraining(true); setTrainTotal(n); setTrainDone(0); setTrainLessons(0); setTrainLog([]);
    let lessons = 0;
    for (let i = 0; i < n; i++) {
      try {
        const { data, error } = await supabase.functions.invoke("voice-agent-simulate", {
          body: { provider_id: providerId, persona_key: cfg.persona_key, seed: i },
        });
        if (!error && data?.ok) {
          lessons += data.lessons_learned || 0;
          setTrainLog((l) => [`✓ ${data.outcome || "rozmowa"} · +${data.lessons_learned || 0} reguł · ${data.scenario?.slice(0, 40) || ""}`, ...l].slice(0, 12));
        } else {
          setTrainLog((l) => [`✗ ${data?.error || error?.message || "błąd"}`, ...l].slice(0, 12));
        }
      } catch (e: any) {
        setTrainLog((l) => [`✗ ${e?.message || "błąd"}`, ...l].slice(0, 12));
      }
      setTrainDone(i + 1); setTrainLessons(lessons);
    }
    setTraining(false);
    await loadKnowledgeCount(cfg.persona_key);
    toast.success(`Trening zakończony: ${n} rozmów, +${lessons} reguł wiedzy`);
  };
  const [previewing, setPreviewing] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCache = useRef<Map<string, string>>(new Map());

  // 1) persony
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("voice_agent_personas")
        .select("persona_key, name, description, direction, default_voice_id, supported_langs")
        .eq("enabled", true).order("priority", { ascending: false });
      const list = (data as Persona[]) || [];
      setPersonas(list);
      if (list.length) setSelectedPersona((c) => c || list[0].persona_key);
      else setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) biblioteka głosów konta (na żywo)
  const reloadVoices = async () => {
    setVoicesLoading(true);
    const { data, error } = await supabase.functions.invoke("voice-list", { body: {} });
    if (error || !data?.success) { setVoicesError(data?.error || error?.message || "Nie udało się pobrać głosów"); setVoices([]); }
    else { setVoices(data.voices as VoiceItem[]); setVoicesError(null); }
    setVoicesLoading(false);
  };
  useEffect(() => { reloadVoices(); /* eslint-disable-next-line */ }, []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLang, setPickerLang] = useState("pl");
  const [pickerMode, setPickerMode] = useState<"native" | "multi">("native");
  const [pickerForSingle, setPickerForSingle] = useState(false);
  const openPicker = (forSingle: boolean, lang: string, mode: "native" | "multi") => {
    setPickerForSingle(forSingle); setPickerLang(lang); setPickerMode(mode); setPickerOpen(true);
  };

  // 3) konfig tenanta + prefill firmy
  useEffect(() => {
    if (!selectedPersona || !providerId) return;
    (async () => {
      setLoading(true);
      const persona = personas.find((p) => p.persona_key === selectedPersona);
      const { data } = await (supabase as any)
        .from("voice_agent_configs").select("*")
        .eq("provider_id", providerId).eq("persona_key", selectedPersona).maybeSingle();
      let loaded: VoiceConfig;
      if (data) {
        loaded = {
          persona_key: selectedPersona, is_active: !!data.is_active, display_name: data.display_name ?? "",
          voice_id: data.voice_id ?? "", voice_mode: data.voice_mode ?? "single",
          voice_per_language: data.voice_per_language ?? {},
          voice_speed: data.voice_speed != null ? Number(data.voice_speed) : OPTIMAL.voice_speed,
          voice_stability: data.voice_stability != null ? Number(data.voice_stability) : OPTIMAL.voice_stability,
          voice_similarity: data.voice_similarity != null ? Number(data.voice_similarity) : OPTIMAL.voice_similarity,
          voice_style: data.voice_style != null ? Number(data.voice_style) : OPTIMAL.voice_style,
          sample_text: data.sample_text ?? DEFAULT_SAMPLE, languages: data.languages?.length ? data.languages : ["pl"],
          inbound_mode: data.inbound_mode ?? "off", inbound_rings: data.inbound_rings ?? 4,
          calling_hours: data.calling_hours ?? {}, business_context: { ...emptyBC(), ...(data.business_context ?? {}) },
          calendar_access: !!data.calendar_access, orders_access: !!data.orders_access,
          learning_mode: data.learning_mode || "per_call",
          elevenlabs_agent_id: data.elevenlabs_agent_id || "",
          turn_timeout_seconds: data.turn_timeout_seconds ?? 7,
          silence_end_call_timeout_seconds: data.silence_end_call_timeout_seconds ?? 60,
          soft_timeout_seconds: data.soft_timeout_seconds != null ? Number(data.soft_timeout_seconds) : 3,
        };
      } else {
        loaded = defaultsFor(persona);
        const { data: sp } = await (supabase as any)
          .from("service_providers").select("company_name, description, address, city").eq("id", providerId).maybeSingle();
        if (sp) {
          loaded.business_context.company_name = sp.company_name || "";
          loaded.business_context.description = sp.description || "";
          loaded.business_context.location = [sp.address, sp.city].filter(Boolean).join(", ");
        }
      }
      setAdvancedOpen(loaded.voice_mode === "per_language");
      setCfg(loaded);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersona, providerId, personas]);

  // 4) auto-wybór zalecanego głosu gdy brak wyboru
  useEffect(() => {
    if (cfg && !cfg.voice_id && voices.length) setCfg((c) => (c ? { ...c, voice_id: voices[0].voice_id } : c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices, cfg?.persona_key]);

  // 5) licznik wiedzy persony
  useEffect(() => { if (selectedPersona && providerId) loadKnowledgeCount(selectedPersona); /* eslint-disable-next-line */ }, [selectedPersona, providerId]);

  const update = (patch: Partial<VoiceConfig>) => setCfg((c) => (c ? { ...c, ...patch } : c));
  const updateBC = (patch: Partial<BusinessContext>) =>
    setCfg((c) => (c ? { ...c, business_context: { ...c.business_context, ...patch } } : c));
  const setLangVoice = (lang: string, id: string) =>
    setCfg((c) => (c ? { ...c, voice_per_language: { ...c.voice_per_language, [lang]: id } } : c));

  const byId = (id: string) => voices.find((v) => v.voice_id === id);
  const selectedVoice = byId(cfg?.voice_id || "");
  const accents = Array.from(new Set(voices.map((v) => v.accent).filter(Boolean))) as string[];
  const filteredVoices = voices.filter((v) => {
    if (onlyMulti && !v.recommended) return false;
    if (fGender !== "all" && v.gender !== fGender) return false;
    if (fAccent !== "all" && v.accent !== fAccent) return false;
    if (fSearch && !`${v.name} ${v.accent ?? ""} ${v.use_case ?? ""}`.toLowerCase().includes(fSearch.toLowerCase())) return false;
    return true;
  });

  const stopAudio = () => { audioRef.current?.pause(); setPlayingVoice(null); };
  const playSrc = (id: string, src: string) => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (playingVoice === id) { stopAudio(); return; }
    audioRef.current.src = src;
    audioRef.current.onended = () => setPlayingVoice(null);
    audioRef.current.play().then(() => setPlayingVoice(id)).catch(() => setPlayingVoice(null));
  };

  // Odsłuch głosu w WYBRANYM języku: najpierw zweryfikowana próbka, potem TTS (cache)
  const previewVoice = async (voice: VoiceItem | undefined, lang: string) => {
    if (!voice || !cfg) return;
    const vp = voice.verified_previews?.find((p) => p.lang === lang && p.preview_url);
    if (vp?.preview_url) { playSrc(voice.voice_id, vp.preview_url); return; }
    const key = `${voice.voice_id}:${lang}`;
    if (ttsCache.current.has(key)) { playSrc(voice.voice_id, ttsCache.current.get(key)!); return; }
    setLoadingVoice(voice.voice_id);
    try {
      const { data, error } = await supabase.functions.invoke("voice-preview", {
        body: {
          voice_id: voice.voice_id, text: SAMPLE_TEXTS[lang] || DEFAULT_SAMPLE,
          speed: cfg.voice_speed, stability: cfg.voice_stability, similarity_boost: cfg.voice_similarity, style: cfg.voice_style,
        },
      });
      if (error || !data?.success) { toast.error("Odsłuch nieudany: " + (data?.error || error?.message || "błąd")); return; }
      const src = `data:${data.mime || "audio/mpeg"};base64,${data.audio}`;
      ttsCache.current.set(key, src);
      playSrc(voice.voice_id, src);
    } finally { setLoadingVoice(null); }
  };

  const effectiveVoiceId = () =>
    cfg?.voice_mode === "per_language" ? (cfg.voice_per_language[previewLang] || cfg.voice_id) : (cfg?.voice_id || "");

  const previewWithText = async () => {
    const vid = effectiveVoiceId();
    if (!vid || !cfg) { toast.error("Najpierw wybierz głos"); return; }
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-preview", {
        body: {
          voice_id: vid, text: cfg.sample_text || DEFAULT_SAMPLE,
          speed: cfg.voice_speed, stability: cfg.voice_stability, similarity_boost: cfg.voice_similarity, style: cfg.voice_style,
        },
      });
      if (error || !data?.success) toast.error("Odsłuch nieudany: " + (data?.error || error?.message || "błąd"));
      else { if (!audioRef.current) audioRef.current = new Audio(); audioRef.current.src = `data:${data.mime || "audio/mpeg"};base64,${data.audio}`; await audioRef.current.play(); }
    } finally { setPreviewing(false); }
  };

  const save = async (): Promise<boolean> => {
    if (!providerId || !cfg) return false;
    setSaving(true);
    const { error } = await (supabase as any).from("voice_agent_configs").upsert(
      {
        provider_id: providerId, persona_key: cfg.persona_key, is_active: cfg.is_active,
        display_name: cfg.display_name || null, voice_id: cfg.voice_id || null,
        voice_mode: cfg.voice_mode, voice_per_language: cfg.voice_per_language,
        voice_speed: cfg.voice_speed, voice_stability: cfg.voice_stability,
        voice_similarity: cfg.voice_similarity, voice_style: cfg.voice_style,
        sample_text: cfg.sample_text || null, languages: cfg.languages,
        inbound_mode: cfg.inbound_mode, inbound_rings: cfg.inbound_rings,
        calling_hours: cfg.calling_hours, business_context: cfg.business_context,
        calendar_access: cfg.calendar_access, orders_access: cfg.orders_access,
        learning_mode: cfg.learning_mode,
        elevenlabs_agent_id: cfg.elevenlabs_agent_id || null,
        turn_timeout_seconds: cfg.turn_timeout_seconds,
        silence_end_call_timeout_seconds: cfg.silence_end_call_timeout_seconds,
        soft_timeout_seconds: cfg.soft_timeout_seconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id,persona_key" },
    );
    if (error) toast.error("Błąd zapisu: " + error.message);
    else toast.success("Zapisano ustawienia agenta głosowego");
    setSaving(false);
    return !error;
  };

  const syncElevenLabs = async () => {
    if (!providerId || !cfg) return;
    setSyncingElevenLabs(true);
    try {
      if (!(await save())) return;
      const { data, error } = await supabase.functions.invoke("voice-agent-sync", {
        body: { provider_id: providerId, persona_key: cfg.persona_key },
      });
      if (error || !data?.ok) toast.error(data?.error || error?.message || "Synchronizacja nie powiodła się");
      else toast.success("Ustawienia czasu reakcji i ciszy zastosowano w ElevenLabs");
    } finally {
      setSyncingElevenLabs(false);
    }
  };

  if (!providerId) return <div className="py-12 text-center text-muted-foreground">Ładowanie konta usługodawcy…</div>;

  const voiceCard = (v: VoiceItem) => (
    <div
      key={v.voice_id}
      className={`rounded-lg border p-3 transition cursor-pointer ${cfg?.voice_id === v.voice_id ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/50"}`}
      onClick={() => update({ voice_id: v.voice_id })}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm flex items-center gap-1">
          {v.recommended && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
          {v.name}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); previewVoice(v, previewLang); }}
          className="text-primary hover:opacity-70"
          aria-label="Odsłuchaj"
        >
          {loadingVoice === v.voice_id ? <Loader2 className="h-4 w-4 animate-spin" /> : playingVoice === v.voice_id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {v.native_langs?.map((l) => <Badge key={`n-${l}`} className="text-[10px] font-normal uppercase bg-green-600 hover:bg-green-600">natywny {l}</Badge>)}
        {v.multilingual && <Badge variant="outline" className="text-[10px] font-normal gap-0.5"><Globe className="h-2.5 w-2.5" />wielojęzyczny</Badge>}
        {v.gender && <Badge variant="outline" className="text-[10px] font-normal">{v.gender === "male" ? "męski" : "żeński"}</Badge>}
        {v.accent && <Badge variant="outline" className="text-[10px] font-normal">{v.accent}</Badge>}
        {v.verified_langs?.filter((l) => !v.native_langs?.includes(l)).map((l) => <Badge key={l} variant="secondary" className="text-[10px] font-normal uppercase">{l}</Badge>)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/40 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Asystent głosowy AI — konfiguracja</p>
          <p className="text-muted-foreground mt-1">
            Domyślnie jeden wielojęzyczny głos obsługuje całą rozmowę — agent automatycznie odpowiada w języku
            klienta (PL/EN/UA/RU). Przełącznik języka poniżej pozwala sprawdzić, jak głos brzmi w każdym z nich.
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
            <p className="text-xs text-muted-foreground mt-2">{personas.find((p) => p.persona_key === selectedPersona)?.description}</p>
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
                <div><Label>Agent aktywny</Label><p className="text-xs text-muted-foreground">Włącz, gdy konfiguracja jest gotowa.</p></div>
                <Switch checked={cfg.is_active} onCheckedChange={(v) => update({ is_active: v })} />
              </div>
              <div className="space-y-2">
                <Label>Nazwa agenta (jak się przedstawia)</Label>
                <Input placeholder="np. Asystentka Kasia" value={cfg.display_name} onChange={(e) => update({ display_name: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <PhoneCall className="h-4 w-4 text-primary" />
                  <span>Sprawdź jak agent rozmawia — napisz jak klient, zobacz/usłysz odpowiedzi.</span>
                </div>
                <Button variant="default" size="sm" className="gap-1.5 shrink-0" onClick={() => setTestOpen(true)}>
                  <PhoneCall className="h-4 w-4" /> Przetestuj agenta
                </Button>
              </div>
            </CardContent>
          </Card>

          <VoiceAgentTestChat
            open={testOpen}
            onOpenChange={setTestOpen}
            providerId={providerId}
            personaKey={cfg.persona_key}
            displayName={cfg.display_name}
            businessContext={cfg.business_context as unknown as Record<string, string>}
            languages={cfg.languages}
            calendarAccess={cfg.calendar_access}
            ordersAccess={cfg.orders_access}
            voiceId={cfg.voice_mode === "per_language" ? (cfg.voice_per_language["pl"] || cfg.voice_id) : cfg.voice_id}
            voiceGender={byId(cfg.voice_mode === "per_language" ? (cfg.voice_per_language["pl"] || cfg.voice_id) : cfg.voice_id)?.gender || ""}
            learningMode={cfg.learning_mode}
            voiceSettings={{ speed: cfg.voice_speed, stability: cfg.voice_stability, similarity: cfg.voice_similarity, style: cfg.voice_style }}
          />

          <NativeVoiceBrowser
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            language={pickerLang}
            initialMode={pickerMode}
            title={pickerForSingle ? "Wybierz głos agenta" : `Wybierz głos — ${LANGS.find((l) => l.code === pickerLang)?.label ?? pickerLang}`}
            accountVoices={voices}
            onPicked={(id) => {
              if (pickerForSingle) update({ voice_id: id });
              else { setLangVoice(pickerLang, id); update({ voice_mode: "per_language" }); }
              reloadVoices();
            }}
          />

          {/* A) GŁOS */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5" /> Głos agenta</CardTitle>
              <CardDescription>Wybierz, jak agent ma brzmieć. Jeden głos na wszystko (prosto) albo natywny lektor na każdy język (lepsze brzmienie).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {voicesError && <p className="text-sm text-red-600">{voicesError} — sprawdź klucz ElevenLabs w Centrum AI.</p>}

              <RadioGroup value={cfg.voice_mode} onValueChange={(v) => update({ voice_mode: v })} className="grid sm:grid-cols-2 gap-2">
                <label className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${cfg.voice_mode === "single" ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                  <RadioGroupItem value="single" id="vm-single" className="mt-0.5" />
                  <div><div className="text-sm font-medium">Jeden głos na wszystko</div><p className="text-xs text-muted-foreground">Wielojęzyczny — najprościej.</p></div>
                </label>
                <label className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${cfg.voice_mode === "per_language" ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                  <RadioGroupItem value="per_language" id="vm-multi" className="mt-0.5" />
                  <div><div className="text-sm font-medium">Osobny lektor na język</div><p className="text-xs text-muted-foreground">Natywni lektorzy — najlepsze brzmienie.</p></div>
                </label>
              </RadioGroup>

              {cfg.voice_mode === "single" ? (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{selectedVoice?.name || "Nie wybrano głosu"}</div>
                      {selectedVoice && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedVoice.native_langs?.map((l) => <Badge key={l} className="text-[10px] bg-green-600 hover:bg-green-600">natywny {l}</Badge>)}
                          {selectedVoice.multilingual && <Badge variant="outline" className="text-[10px] gap-0.5"><Globe className="h-2.5 w-2.5" />wielojęzyczny</Badge>}
                        </div>
                      )}
                    </div>
                    <Button size="sm" className="shrink-0" onClick={() => openPicker(true, previewLang, "multi")}>Wybierz głos</Button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Odsłuch:</span>
                    <div className="inline-flex rounded-lg border p-0.5">
                      {LANGS.map((l) => (
                        <button key={l.code} type="button" onClick={() => setPreviewLang(l.code)}
                          className={`px-2.5 py-0.5 text-xs rounded-md transition ${previewLang === l.code ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l.short}</button>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="gap-1" disabled={!selectedVoice} onClick={() => previewVoice(selectedVoice, previewLang)}>
                      {loadingVoice === selectedVoice?.voice_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Odsłuchaj
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {cfg.languages.length === 0 && <p className="text-sm text-muted-foreground">Najpierw zaznacz języki rozmowy (sekcja „Odbieranie i działanie").</p>}
                  {cfg.languages.map((lang) => {
                    const lbl = LANGS.find((l) => l.code === lang)?.label ?? lang;
                    const cur = cfg.voice_per_language[lang] || cfg.voice_id;
                    const v = byId(cur);
                    const isNative = v?.native_langs?.includes(lang);
                    return (
                      <div key={lang} className="flex items-center gap-2 rounded-lg border p-2.5">
                        <span className="w-24 text-sm shrink-0 font-medium">{lbl}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{v?.name || <span className="text-muted-foreground">Nie wybrano</span>}</div>
                          {isNative && <Badge className="text-[10px] bg-green-600 hover:bg-green-600">natywny {lang}</Badge>}
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0" disabled={!v} onClick={() => previewVoice(v, lang)}>
                          {loadingVoice === cur ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" className="shrink-0" onClick={() => openPicker(false, lang, "native")}>Wybierz</Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* B) BRZMIENIE */}
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
                { key: "voice_stability" as const, label: "Stabilność", hint: "niżej = bardziej żywo", min: 0, max: 1, step: 0.05 },
                { key: "voice_similarity" as const, label: "Podobieństwo", hint: "wierność barwie", min: 0, max: 1, step: 0.05 },
                { key: "voice_style" as const, label: "Styl / ekspresja", hint: "wyżej = mocniejszy styl", min: 0, max: 1, step: 0.05 },
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
                Odsłuchaj z moim tekstem ({previewLang.toUpperCase()})
              </Button>
            </CardContent>
          </Card>

          {/* C) WYWIAD O FIRMIE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> O Twojej firmie</CardTitle>
              <CardDescription>Najprościej: opisz firmę lub wklej link strony AI poniżej — wyciągnie dane i dopyta o braki. Możesz też wypełnić ręcznie. Pola są zawsze edytowalne.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CompanyInterviewChat
                currentContext={cfg.business_context as unknown as Record<string, string>}
                onApply={(f) => {
                  const merged = { ...cfg.business_context, ...(f as Partial<BusinessContext>) };
                  updateBC(f as Partial<BusinessContext>);
                  // trwała pamięć: zapisz wiedzę od razu (bez czekania na "Zapisz ustawienia")
                  if (providerId) {
                    (supabase as any).from("voice_agent_configs").upsert(
                      { provider_id: providerId, persona_key: cfg.persona_key, business_context: merged, updated_at: new Date().toISOString() },
                      { onConflict: "provider_id,persona_key" },
                    ).then(({ error }: any) => { if (error) console.warn("autosave business_context:", error.message); });
                  }
                }}
              />
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <span className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">lub uzupełnij / popraw ręcznie</span></span>
              </div>
              <div className="space-y-2"><Label>Nazwa firmy</Label>
                <Input value={cfg.business_context.company_name} onChange={(e) => updateBC({ company_name: e.target.value })} placeholder="np. Auto-Serwis Kowalski" /></div>
              <div className="space-y-2"><Label>Czym się zajmujecie? (opis działalności)</Label>
                <Textarea rows={2} value={cfg.business_context.description} onChange={(e) => updateBC({ description: e.target.value })} placeholder="np. Warsztat samochodowy — mechanika, diagnostyka…" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Godziny pracy</Label>
                  <Input value={cfg.business_context.hours} onChange={(e) => updateBC({ hours: e.target.value })} placeholder="np. pon–pt 8–18, sob 9–14" /></div>
                <div className="space-y-2"><Label>Lokalizacja / adres</Label>
                  <Input value={cfg.business_context.location} onChange={(e) => updateBC({ location: e.target.value })} placeholder="np. ul. Główna 5, Warszawa" /></div>
              </div>
              <div className="space-y-2"><Label>Oferowane usługi (po jednej w linii)</Label>
                <Textarea rows={3} value={cfg.business_context.services} onChange={(e) => updateBC({ services: e.target.value })} placeholder={"Wymiana oleju\nGeometria kół\nDiagnostyka komputerowa"} /></div>
              <div className="space-y-2"><Label>Jak agent ma się przedstawiać i w jakim celu dzwoni/odbiera</Label>
                <Textarea rows={2} value={cfg.business_context.agent_intro} onChange={(e) => updateBC({ agent_intro: e.target.value })} placeholder="np. Dzień dobry, tu Kasia z Auto-Serwis Kowalski — pomogę umówić wizytę." /></div>
              <div className="space-y-2"><Label>Cel rozmowy</Label>
                <Input value={cfg.business_context.purpose} onChange={(e) => updateBC({ purpose: e.target.value })} placeholder="np. umawianie klientów na serwis" /></div>
              <div className="space-y-2"><Label>Pomoc drogowa / laweta / dojazd</Label>
                <Input value={cfg.business_context.roadside} onChange={(e) => updateBC({ roadside: e.target.value })} placeholder="np. Tak — laweta na terenie miasta, 150 zł / Nie oferujemy" />
                <p className="text-xs text-muted-foreground">Agent zaproponuje to tylko jeśli tu wpiszesz, że oferujecie.</p></div>
              <div className="space-y-2"><Label>Dodatkowe informacje dla AI (ceny, promocje, zasady)</Label>
                <Textarea rows={3} value={cfg.business_context.extra_info} onChange={(e) => updateBC({ extra_info: e.target.value })} placeholder="np. Wymiana oleju od 150 zł. Nie umawiamy na niedziele." /></div>
            </CardContent>
          </Card>

          {/* TRENING — symulacje self-play */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Trening agenta — AI sam testuje</CardTitle>
              <CardDescription>
                AI gra OBIE role: wciela się w klienta (samo wymyśla różne, też podchwytliwe scenariusze) i rozmawia z Twoim agentem. Po każdej rozmowie wyłapuje błędy i dopisuje reguły. Ty tylko uruchamiasz serię — resztę robi AI.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm">Wyuczone reguły dla tej roli: <strong>{knowledgeCount ?? "…"}</strong></span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" disabled={training} onClick={() => runTraining(10)}>{training ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 10 symulacji</Button>
                  <Button size="sm" disabled={training} onClick={() => runTraining(25)} className="gap-1.5"><Sparkles className="h-4 w-4" /> 25 symulacji</Button>
                </div>
              </div>
              {training && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Postęp: {trainDone}/{trainTotal}</span><span>+{trainLessons} reguł</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${trainTotal ? (trainDone / trainTotal) * 100 : 0}%` }} /></div>
                </div>
              )}
              {trainLog.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-2 max-h-[160px] overflow-y-auto text-xs space-y-0.5">
                  {trainLog.map((l, i) => <div key={i} className="truncate">{l}</div>)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Symulacje NIE tworzą realnych rezerwacji/zleceń (tryb suchy). Każda seria zużywa AI (koszt) — przy 100 rozmowach rób kilka serii.</p>
            </CardContent>
          </Card>

          {/* UPRAWNIENIA / INTEGRACJE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Uprawnienia agenta</CardTitle>
              <CardDescription>Co agent może robić w systemie podczas rozmowy. Domyślnie wyłączone — włącz, gdy chcesz.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <CalendarCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <Label>Dostęp do kalendarza firmowego</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Agent sprawdza wolne terminy, umawia, przekłada i odwołuje wizyty w Twoim kalendarzu.</p>
                  </div>
                </div>
                <Switch checked={cfg.calendar_access} onCheckedChange={(v) => update({ calendar_access: v })} />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <ClipboardList className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <Label>Tworzenie zleceń</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Agent zakłada nowe zlecenie z danymi z rozmowy (klient, pojazd, usterka) — trafia do systemu zleceń do przydzielenia.</p>
                  </div>
                </div>
                <Switch checked={cfg.orders_access} onCheckedChange={(v) => update({ orders_access: v })} />
              </div>
              <div className="flex items-start justify-between gap-4 pt-2 border-t">
                <div className="flex gap-3">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <Label>Uczenie z rozmów</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Po rozmowie system analizuje przebieg, wyciąga wnioski i błędy, i poprawia kolejne rozmowy.</p>
                  </div>
                </div>
                <Select value={cfg.learning_mode} onValueChange={(v) => update({ learning_mode: v })}>
                  <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_call">Po każdej rozmowie</SelectItem>
                    <SelectItem value="batched">Wsadowo (przy skali)</SelectItem>
                    <SelectItem value="off">Wyłączone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* D) ODBIERANIE */}
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
                  <div className="flex justify-between"><Label>Liczba sygnałów przed odebraniem</Label><span className="text-sm text-muted-foreground tabular-nums">{cfg.inbound_rings}</span></div>
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
                        onCheckedChange={(v) => update({ languages: v ? [...cfg.languages, l.code] : cfg.languages.filter((c) => c !== l.code) })}
                      />
                      <span className="text-sm">{l.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TELEFONIA — URL-e do ElevenLabs (Custom LLM + post-call webhook) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PhoneCall className="h-5 w-5" /> Telefonia na żywo (ElevenLabs)</CardTitle>
              <CardDescription>Wklej te adresy w ustawieniach agenta ElevenLabs. Numer Twilio importujesz w ElevenLabs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 max-w-xl">
                <Label className="text-xs">ElevenLabs Agent ID</Label>
                <Input value={cfg.elevenlabs_agent_id} onChange={(e) => update({ elevenlabs_agent_id: e.target.value.trim() })} placeholder="agent_…" className="font-mono text-xs" />
              </div>
              <div className="grid gap-4 md:grid-cols-3 rounded-lg border p-3">
                <div className="space-y-2">
                  <div className="flex justify-between"><Label className="text-xs">Reakcja po ciszy</Label><span className="text-xs tabular-nums">{cfg.turn_timeout_seconds} s</span></div>
                  <Slider min={1} max={15} step={1} value={[cfg.turn_timeout_seconds]} onValueChange={([v]) => update({ turn_timeout_seconds: v })} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between"><Label className="text-xs">Zakończenie braku odpowiedzi</Label><span className="text-xs tabular-nums">{cfg.silence_end_call_timeout_seconds} s</span></div>
                  <Slider min={30} max={180} step={15} value={[cfg.silence_end_call_timeout_seconds]} onValueChange={([v]) => update({ silence_end_call_timeout_seconds: v })} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between"><Label className="text-xs">Komunikat oczekiwania</Label><span className="text-xs tabular-nums">{cfg.soft_timeout_seconds.toFixed(1)} s</span></div>
                  <Slider min={1} max={8} step={0.5} value={[cfg.soft_timeout_seconds]} onValueChange={([v]) => update({ soft_timeout_seconds: v })} />
                </div>
              </div>
              {[
                { label: "Custom LLM URL (Agent → Custom LLM)", url: `${FUNCTIONS_BASE}/voice-agent-llm?provider_id=${providerId}&persona_key=${cfg.persona_key}` },
                { label: "Post-call webhook URL (Agent → Post-call webhook)", url: `${FUNCTIONS_BASE}/voice-call-postprocess?provider_id=${providerId}&persona_key=${cfg.persona_key}` },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <Label className="text-xs">{row.label}</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={row.url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => { navigator.clipboard.writeText(row.url); toast.success("Skopiowano"); }}>
                      <Copy className="h-4 w-4" /> Kopiuj
                    </Button>
                  </div>
                </div>
              ))}
              <div className="rounded-lg border p-3 text-xs space-y-1">
                <p className="font-medium">Identyfikator rozmowy dla idempotentnej finalizacji</p>
                <p className="text-muted-foreground">W system prompt agenta ElevenLabs dodaj dokładnie:</p>
                <code className="block rounded bg-muted px-2 py-1 select-all">GETRIDO_CONVERSATION_ID={"{{system__conversation_id}}"}</code>
              </div>
              <Button type="button" variant="outline" onClick={syncElevenLabs} disabled={syncingElevenLabs || !cfg.elevenlabs_agent_id} className="gap-2">
                {syncingElevenLabs ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                Zastosuj ustawienia czasu w ElevenLabs
              </Button>
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                <p className="font-medium">Przed pierwszym telefonem:</p>
                <p>• Wygeneruj ŚWIEŻY klucz ElevenLabs i wpisz w panelu admina (stary jest spalony).</p>
                <p>• W agencie ElevenLabs: ZRM (Zero Retention Mode) ON + „Improve the models for everyone" OFF.</p>
                <p>• Numer Twilio: zaimportuj w ElevenLabs i dodaj swój telefon do Verified Caller IDs (trial).</p>
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
