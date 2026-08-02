import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VoiceAgentTestChat } from "./VoiceAgentTestChat";
import { AgentAdvancedSettings, AgentAdvanced, EMPTY_ADVANCED } from "./AgentAdvancedSettings";
import { AgentTraining } from "./AgentTraining";
import { useProviderOffer } from "@/hooks/useProviderOffer";
import { toast } from "sonner";
import {
  Loader2, Check, ChevronRight, ChevronLeft, PhoneCall, Settings2, ChevronDown,
  CalendarCheck, ClipboardList, PhoneIncoming, Shield, Sparkles,
} from "lucide-react";

interface AgentSetup {
  // Krok 1 — kto dzwoni
  display_name: string;
  agent_intro: string;
  disclose_recording: boolean;
  ai_disclosure: string;
  // Krok 2 — co ma robić
  answer_calls: boolean;
  calendar_access: boolean;
  orders_access: boolean;
  call_back_leads: boolean;
  // Krok 3 — granice
  price_floor: string;
  forbidden_phrases: string;
  hours_from: string;
  hours_to: string;
  extra_info: string;
}

// Domyślnie agent robi wszystko — usługodawca ma tylko wyłączyć to, czego nie chce.
const DEFAULT_SETUP: AgentSetup = {
  display_name: "", agent_intro: "", disclose_recording: true, ai_disclosure: "on_request",
  answer_calls: true, calendar_access: true, orders_access: true, call_back_leads: true,
  price_floor: "", forbidden_phrases: "", hours_from: "", hours_to: "", extra_info: "",
};

const STEPS = [
  { n: 1, title: "Kto odbiera", hint: "imię i pierwsze zdanie" },
  { n: 2, title: "Co ma robić", hint: "telefon, kalendarz, zlecenia" },
  { n: 3, title: "Granice", hint: "ceny i zasady" },
];

export function AgentWizardPanel({
  providerId,
  onGoToVoice,
  onGoToServices,
}: {
  providerId: string | null;
  onGoToVoice?: () => void;
  onGoToServices?: () => void;
}) {
  const [personaKey, setPersonaKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [setup, setSetup] = useState<AgentSetup>(DEFAULT_SETUP);
  const [advanced, setAdvanced] = useState<AgentAdvanced>(EMPTY_ADVANCED);
  const [voiceCfg, setVoiceCfg] = useState<{ voice_id: string; languages: string[]; learning_mode: string }>({
    voice_id: "", languages: ["pl"], learning_mode: "per_call",
  });

  const { data: offer } = useProviderOffer(providerId);
  const set = (patch: Partial<AgentSetup>) => setSetup((s) => ({ ...s, ...patch }));

  // Rola agenta nie jest wybierana przez usługodawcę — warsztat zawsze odbiera telefony.
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("voice_agent_personas")
        .select("persona_key")
        .eq("enabled", true).order("priority", { ascending: false });
      const list = (data as { persona_key: string }[]) || [];
      setPersonaKey(list.find((p) => p.persona_key === "workshop_secretary")?.persona_key || list[0]?.persona_key || "workshop_secretary");
    })();
  }, []);

  useEffect(() => {
    if (!providerId || !personaKey) return;
    (async () => {
      setLoading(true);
      const [{ data: vc }, { data: { user } }] = await Promise.all([
        (supabase as any).from("voice_agent_configs").select("*")
          .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle(),
        supabase.auth.getUser(),
      ]);

      const next = { ...DEFAULT_SETUP };
      if (vc) {
        const bc = vc.business_context || {};
        next.display_name = vc.display_name ?? "";
        next.agent_intro = bc.agent_intro ?? "";
        next.extra_info = bc.extra_info ?? "";
        next.disclose_recording = bc.disclose_recording !== false;
        next.ai_disclosure = bc.ai_disclosure || "on_request";
        next.answer_calls = (vc.inbound_mode ?? "off") !== "off";
        next.calendar_access = !!vc.calendar_access;
        next.orders_access = !!vc.orders_access;
        next.hours_from = vc.calling_hours?.from ?? "";
        next.hours_to = vc.calling_hours?.to ?? "";
        setVoiceCfg({
          voice_id: vc.voice_id ?? "",
          languages: vc.languages?.length ? vc.languages : ["pl"],
          learning_mode: vc.learning_mode || "per_call",
        });
        setDone(!!vc.is_active);
      }

      if (user) {
        const { data: cfg } = await supabase
          .from("ai_agent_configs").select("is_active, conversation_style, ai_call_business_profiles(*)")
          .eq("user_id", user.id).maybeSingle();
        if (cfg) {
          next.call_back_leads = !!cfg.is_active;
          const bp: any = cfg.ai_call_business_profiles;
          const stored = (bp?.faq_json as any) || {};
          next.price_floor = stored.price_floor ?? "";
          next.forbidden_phrases = stored.forbidden_phrases ?? "";
          setAdvanced({ ...EMPTY_ADVANCED, ...stored, tone: stored.tone || cfg.conversation_style || "semiformal" });
        }
      }

      setSetup(next);
      setLoading(false);
    })();
  }, [providerId, personaKey]);

  const save = async (activate: boolean) => {
    if (!providerId) return;
    setSaving(true);
    try {
      const businessContext = {
        agent_intro: setup.agent_intro,
        extra_info: setup.extra_info,
        disclose_recording: setup.disclose_recording,
        ai_disclosure: setup.ai_disclosure,
      };
      const { error: vErr } = await (supabase as any).from("voice_agent_configs").upsert(
        {
          provider_id: providerId, persona_key: personaKey,
          display_name: setup.display_name || null,
          business_context: businessContext,
          calendar_access: setup.calendar_access,
          orders_access: setup.orders_access,
          inbound_mode: setup.answer_calls ? "immediate" : "off",
          calling_hours: { from: setup.hours_from || undefined, to: setup.hours_to || undefined },
          learning_mode: voiceCfg.learning_mode,
          is_active: activate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id,persona_key" },
      );
      if (vErr) throw vErr;

      // Druga strona agenta: kontakt z leadami (ai_agent_configs + profil sprzedażowy)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const salesProfile = { ...advanced, price_floor: setup.price_floor, forbidden_phrases: setup.forbidden_phrases };
        const servicesJson = (offer?.services || []).map((s) => ({
          name: s.name, category: s.category, price_from: s.price_from,
          price_to: s.price_to, duration_minutes: s.duration_minutes, currency: "PLN",
        }));
        const configRow = {
          company_name: offer?.company?.company_name || "Moja firma",
          company_description: offer?.company?.description || "",
          service_area: offer?.company?.location || null,
          services: servicesJson as any,
          conversation_style: advanced.tone,
          is_active: setup.call_back_leads,
        };

        const { data: existing } = await supabase
          .from("ai_agent_configs").select("id").eq("user_id", user.id).maybeSingle();
        let configId = existing?.id;
        if (configId) {
          const { error } = await supabase.from("ai_agent_configs").update(configRow).eq("id", configId);
          if (error) throw error;
        } else {
          const { data: created, error } = await supabase
            .from("ai_agent_configs").insert({ user_id: user.id, ...configRow }).select("id").single();
          if (error) throw error;
          configId = created.id;
        }

        const payload = {
          business_description: configRow.company_description,
          faq_json: salesProfile as any,
          services_json: servicesJson as any,
          pricing_notes: setup.price_floor
            ? `Minimalna akceptowalna cena (nie ujawniać klientowi): ${setup.price_floor} zł`
            : null,
        };
        const { data: existingProfile } = await supabase
          .from("ai_call_business_profiles").select("id").eq("config_id", configId).maybeSingle();
        const { error: pErr } = existingProfile
          ? await supabase.from("ai_call_business_profiles").update(payload).eq("config_id", configId)
          : await supabase.from("ai_call_business_profiles").insert({ config_id: configId, ...payload });
        if (pErr) throw pErr;
      }

      if (activate) setDone(true);
      toast.success(activate ? "Agent uruchomiony ✓" : "Zapisano");
    } catch (e: any) {
      toast.error("Błąd zapisu: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!providerId) return <div className="py-12 text-center text-muted-foreground">Ładowanie konta usługodawcy…</div>;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const companyName = offer?.company?.company_name || "Twoja firma";
  const introPreview = setup.agent_intro?.trim() || (
    `Dzień dobry, ${setup.display_name ? `tu ${setup.display_name}${setup.ai_disclosure === "ai" ? ", asystent AI" : setup.ai_disclosure === "virtual" ? ", wirtualny asystent" : ""} z ${companyName}` : companyName}` +
    `${setup.disclose_recording ? ", rozmowa jest nagrywana" : ""} — w czym mogę pomóc?`
  );

  const missing: { text: string; action?: () => void; actionLabel?: string }[] = [];
  if (!offer?.services.length) missing.push({ text: "Brak usług z cenami — agent nie poda klientowi kwot.", action: onGoToServices, actionLabel: "Dodaj usługi" });
  if (!voiceCfg.voice_id) missing.push({ text: "Nie wybrano głosu agenta.", action: onGoToVoice, actionLabel: "Wybierz głos" });

  return (
    <div className="space-y-4">
      {/* Pasek stanu */}
      <div className="rounded-xl border bg-muted/40 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${done ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          <div className="text-sm">
            <p className="font-medium">{done ? "Agent włączony" : "Agent jeszcze nie działa"}</p>
            <p className="text-muted-foreground">
              {done ? "Odbiera telefony i rozmawia zgodnie z ustawieniami poniżej." : "Przejdź trzy kroki — zajmie minutę."}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTestOpen(true)}>
          <PhoneCall className="h-4 w-4" /> Przetestuj agenta
        </Button>
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-2">
          {missing.map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-sm text-amber-900 dark:text-amber-200">
              <span>{m.text}</span>
              {m.action && (
                <Button size="sm" variant="outline" className="shrink-0 bg-background" onClick={m.action}>{m.actionLabel}</Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Kroki */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  onClick={() => setStep(s.n)}
                  className={`flex items-center gap-2 min-w-0 text-left ${step === s.n ? "" : "opacity-60 hover:opacity-100"}`}
                >
                  <span className={`h-7 w-7 shrink-0 rounded-full grid place-items-center text-xs font-semibold ${step > s.n ? "bg-green-600 text-white" : step === s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                  </span>
                  <span className="min-w-0 hidden sm:block">
                    <span className="block text-sm font-medium truncate">{s.title}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{s.hint}</span>
                  </span>
                </button>
                {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Jak ma mieć na imię?</Label>
                <Input className="max-w-xs" placeholder="np. Kasia" value={setup.display_name} onChange={(e) => set({ display_name: e.target.value })} />
                <p className="text-xs text-muted-foreground">Nazwę firmy agent zna z karty usług — nie trzeba jej wpisywać.</p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <Label>Mówi, że rozmowa jest nagrywana</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Wymagane, jeśli nagrywasz rozmowy (RODO).</p>
                </div>
                <Switch checked={setup.disclose_recording} onCheckedChange={(v) => set({ disclose_recording: v })} />
              </div>

              <div className="space-y-2">
                <Label>Jak nazywa sam siebie</Label>
                <Select value={setup.ai_disclosure} onValueChange={(v) => set({ ai_disclosure: v })}>
                  <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_request">Samym imieniem — najbardziej naturalnie</SelectItem>
                    <SelectItem value="virtual">„Wirtualny asystent"</SelectItem>
                    <SelectItem value="ai">„Asystent AI"</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Zapytany wprost „czy to człowiek?" zawsze przyzna, że jest asystentem — kłamać nie będzie.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">Tak przywita klienta:</p>
                <p className="text-sm italic">„{introPreview}"</p>
              </div>

              <Collapsible>
                <CollapsibleTrigger className="text-xs text-primary hover:underline">
                  Chcę wpisać własne powitanie
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Textarea rows={2} value={setup.agent_intro} onChange={(e) => set({ agent_intro: e.target.value })}
                    placeholder="np. Dzień dobry, tu Kasia z Cart78Garage, rozmowa jest nagrywana — w czym mogę pomóc?" />
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {step === 2 && (
            <>
              {[
                { key: "answer_calls" as const, icon: PhoneIncoming, title: "Odbiera telefony", desc: "Gdy dzwoni klient, agent podnosi słuchawkę i prowadzi rozmowę." },
                { key: "calendar_access" as const, icon: CalendarCheck, title: "Umawia wizyty", desc: "Sprawdza wolne terminy i wpisuje wizytę do Twojego kalendarza." },
                { key: "orders_access" as const, icon: ClipboardList, title: "Zakłada zlecenia", desc: "Z rozmowy tworzy zlecenie z usterką i danymi pojazdu." },
                { key: "call_back_leads" as const, icon: PhoneCall, title: "Oddzwania na zapytania", desc: "Sam kontaktuje się z nowymi leadami z portalu." },
              ].map((row) => (
                <div key={row.key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div className="flex gap-3">
                    <row.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <Label>{row.title}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{row.desc}</p>
                    </div>
                  </div>
                  <Switch checked={setup[row.key]} onCheckedChange={(v) => set({ [row.key]: v } as any)} />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Wszystko jest włączone domyślnie — wyłącz tylko to, czego nie chcesz.</p>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-destructive" /> Najniższa cena, jaką może podać (zł)</Label>
                <Input type="number" className="max-w-[200px]" value={setup.price_floor} onChange={(e) => set({ price_floor: e.target.value })} />
                <p className="text-xs text-muted-foreground">Tylko dla agenta — klient tego nie usłyszy. Ceny usług bierze z karty usług.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-destructive">Czego nigdy nie mówić</Label>
                <Textarea rows={2} value={setup.forbidden_phrases} onChange={(e) => set({ forbidden_phrases: e.target.value })}
                  placeholder="np. Bez rabatów powyżej 10%. Nie obiecuj terminu naprawy przed diagnozą." />
              </div>
              <div className="space-y-2">
                <Label>Godziny, w których odbiera</Label>
                <div className="flex items-center gap-2 max-w-sm">
                  <Input type="time" value={setup.hours_from} onChange={(e) => set({ hours_from: e.target.value })} />
                  <span>–</span>
                  <Input type="time" value={setup.hours_to} onChange={(e) => set({ hours_to: e.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground">Puste = całą dobę. Godziny pracy firmy, które agent podaje klientom, ustawiasz w „Moje usługi".</p>
              </div>
              <div className="space-y-2">
                <Label>Zasady i wyjątki (opcjonalnie)</Label>
                <Textarea rows={2} value={setup.extra_info} onChange={(e) => set({ extra_info: e.target.value })}
                  placeholder={"np. Nie umawiamy na niedziele.\nPrzy holowaniu zawsze pytaj o markę i model."} />
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Wstecz
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} className="gap-1">
                Dalej <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => save(true)} disabled={saving} size="lg" className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {done ? "Zapisz zmiany" : "Gotowe — uruchom agenta"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Zaawansowane — domyślnie zwinięte, działa bez dotykania */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Zaawansowane</CardTitle>
                    <CardDescription>Argumenty, trudne pytania, ton i nauka z rozmów. Działa bez zaglądania tutaj.</CardDescription>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              <AgentAdvancedSettings value={advanced} onChange={setAdvanced} />

              <div className="flex items-start justify-between gap-4 pt-4 border-t">
                <div className="flex gap-3">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <Label>Uczenie z rozmów</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Po rozmowie system wyciąga wnioski i poprawia kolejne.</p>
                  </div>
                </div>
                <Select value={voiceCfg.learning_mode} onValueChange={(v) => setVoiceCfg((c) => ({ ...c, learning_mode: v }))}>
                  <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_call">Po każdej rozmowie</SelectItem>
                    <SelectItem value="batched">Wsadowo (przy skali)</SelectItem>
                    <SelectItem value="off">Wyłączone</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t">
                <AgentTraining providerId={providerId} personaKey={personaKey} />
              </div>

              <Button variant="outline" onClick={() => save(done)} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Zapisz zaawansowane
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <VoiceAgentTestChat
        open={testOpen}
        onOpenChange={setTestOpen}
        providerId={providerId}
        personaKey={personaKey}
        displayName={setup.display_name}
        businessContext={{
          agent_intro: setup.agent_intro, extra_info: setup.extra_info,
          disclose_recording: setup.disclose_recording, ai_disclosure: setup.ai_disclosure,
        } as unknown as Record<string, string>}
        languages={voiceCfg.languages}
        calendarAccess={setup.calendar_access}
        ordersAccess={setup.orders_access}
        voiceId={voiceCfg.voice_id}
        voiceGender=""
        learningMode={voiceCfg.learning_mode}
        voiceSettings={{ speed: 1, stability: 0.45, similarity: 0.75, style: 0 }}
      />
    </div>
  );
}
