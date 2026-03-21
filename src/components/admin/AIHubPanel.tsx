import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Save, Key, Eye, EyeOff, Zap, Route, Shield, Activity, ToggleLeft, Settings2, Brain, ListTodo } from "lucide-react";
import { UniversalSubTabBar } from "../UniversalSubTabBar";

interface Provider {
  id: string;
  provider_key: string;
  display_name: string;
  is_enabled: boolean;
  api_key_encrypted: string | null;
  default_model: string | null;
  timeout_seconds: number;
  daily_limit: number | null;
  admin_note: string | null;
}

interface RoutingRule {
  id: string;
  task_type: string;
  primary_provider_key: string | null;
  secondary_provider_key: string | null;
  tertiary_provider_key: string | null;
  allow_fallback: boolean;
}

interface FeatureFlag {
  id: string;
  flag_key: string;
  flag_name: string;
  description: string | null;
  is_enabled: boolean;
}

interface LimitConfig {
  id: string;
  scope: string;
  scope_id: string | null;
  max_requests_per_day: number | null;
  max_tokens_per_day: number | null;
  budget_pln_per_month: number | null;
  enforcement_mode: string;
}

interface RequestLog {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  feature: string;
  provider: string | null;
  model: string | null;
  status: string;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_estimate: number | null;
  response_time_ms: number | null;
  cache_hit: boolean;
  error_message: string | null;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  text: "Tekst",
  image: "Obraz",
  ocr: "OCR",
  search: "Wyszukiwanie",
  embeddings: "Embeddings",
  tts: "TTS",
  stt: "STT",
};

const TASK_TYPE_DESCRIPTIONS: Record<string, string> = {
  text: "Główny model do chatu RidoAI — odpowiedzi tekstowe, porady, Cowork",
  image: "Generowanie i edycja grafik (Nano Banana) — plakaty, loga, zdjęcia",
  ocr: "Rozpoznawanie tekstu z dokumentów i faktur — skanowanie i analiza",
  search: "Wyszukiwanie informacji w internecie i portalu — Kimi, Gemini itp.",
  embeddings: "Wektory tekstu do semantycznego wyszukiwania — baza wiedzy AI",
  tts: "Text-to-Speech — zamiana tekstu na mowę (czytanie wiadomości głosem)",
  stt: "Speech-to-Text — zamiana mowy na tekst (dyktowanie, transkrypcja)",
};

const CLAUDE_PROVIDER_KEYS = ["claude_haiku", "claude_sonnet", "claude_opus"];
const GEMINI_PROVIDER_KEYS = ["gemini", "google_gemini", "gemini_flash", "gemini_pro", "imagen3"];

// Ukryj duplikaty w UI — pokaż tylko jednego reprezentanta z rodziny
const HIDDEN_PROVIDER_KEYS = ["claude_sonnet", "claude_opus", "gemini_flash", "imagen3"];

export function AIHubPanel() {
  const [activeTab, setActiveTab] = useState("providers");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [routing, setRouting] = useState<RoutingRule[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [limits, setLimits] = useState<LimitConfig[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const tabs = [
    { value: "providers", label: "Dostawcy AI", visible: true },
    { value: "routing", label: "Routing", visible: true },
    { value: "flags", label: "Feature Flags", visible: true },
    { value: "limits", label: "Limity", visible: true },
    { value: "logs", label: "Logi AI", visible: true },
  ];

  useEffect(() => { loadAll(); }, []);

  const sharedClaudeOwner = providers.find((p) => CLAUDE_PROVIDER_KEYS.includes(p.provider_key))?.provider_key || "claude_haiku";
  const sharedGeminiOwner = providers.find((p) => GEMINI_PROVIDER_KEYS.includes(p.provider_key))?.provider_key || "gemini";

  const getSharedKeyOwner = (providerKey: string) => {
    if (CLAUDE_PROVIDER_KEYS.includes(providerKey)) return sharedClaudeOwner;
    if (GEMINI_PROVIDER_KEYS.includes(providerKey)) return sharedGeminiOwner;
    return null;
  };

  const getSharedFamilyKeys = (providerKey: string) => {
    if (CLAUDE_PROVIDER_KEYS.includes(providerKey)) return CLAUDE_PROVIDER_KEYS;
    if (GEMINI_PROVIDER_KEYS.includes(providerKey)) return GEMINI_PROVIDER_KEYS;
    return null;
  };

  const loadAll = async () => {
    setLoading(true);
    const [p, r, f, l, lg] = await Promise.all([
      supabase.from("ai_providers").select("*").order("provider_key"),
      supabase.from("ai_routing_rules").select("*").order("task_type"),
      supabase.from("ai_feature_flags").select("*").order("flag_key"),
      supabase.from("ai_limits_config").select("*").order("scope"),
      supabase.from("ai_requests_log").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (p.data) setProviders(p.data);
    if (r.data) setRouting(r.data);
    if (f.data) setFlags(f.data);
    if (l.data) setLimits(l.data);
    if (lg.data) setLogs(lg.data as any[]);
    setLoading(false);
  };

  const saveProvider = async (prov: Provider) => {
    setSaving(true);
    const update: Record<string, unknown> = {
      display_name: prov.display_name,
      is_enabled: prov.is_enabled,
      default_model: prov.default_model,
      timeout_seconds: prov.timeout_seconds,
      daily_limit: prov.daily_limit,
      admin_note: prov.admin_note,
    };
    const keyVal = keyInputs[prov.provider_key];
    const familyKeys = getSharedFamilyKeys(prov.provider_key);

    const { error } = await supabase.from("ai_providers").update(update).eq("id", prov.id);

    if (!error && keyVal && !keyVal.includes("•")) {
      if (familyKeys) {
        const { error: sharedKeyError } = await supabase
          .from("ai_providers")
          .update({ api_key_encrypted: keyVal })
          .in("provider_key", familyKeys);
        if (sharedKeyError) {
          toast.error("Błąd zapisu wspólnego klucza API");
          setSaving(false);
          return;
        }
      } else {
        const { error: keyError } = await supabase
          .from("ai_providers")
          .update({ api_key_encrypted: keyVal })
          .eq("id", prov.id);
        if (keyError) {
          toast.error("Błąd zapisu klucza API");
          setSaving(false);
          return;
        }
      }
    }

    if (error) toast.error("Błąd zapisu"); else toast.success("Zapisano");
    await loadAll();
    setSaving(false);
  };

  const testProvider = async (prov: Provider) => {
    setTestingProvider(prov.provider_key);
    try {
      const { data, error } = await supabase.functions.invoke("getrido-ai-execute", {
        body: { feature: "ai_help", taskType: "text", query: "Powiedz krótko: GetRido AI działa!", mode: "fast" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`✅ ${prov.display_name}: ${(data?.result || "").slice(0, 100)}`);
    } catch (e: any) {
      toast.error(`❌ ${prov.display_name}: ${e.message}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const updateFlag = async (flag: FeatureFlag) => {
    const { error } = await supabase.from("ai_feature_flags").update({ is_enabled: !flag.is_enabled }).eq("id", flag.id);
    if (error) { toast.error("Błąd"); return; }
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, is_enabled: !f.is_enabled } : f));
    toast.success(`${flag.flag_name} ${!flag.is_enabled ? "włączona" : "wyłączona"}`);
  };

  const saveRouting = async (rule: RoutingRule) => {
    const { error } = await supabase.from("ai_routing_rules").update({
      primary_provider_key: rule.primary_provider_key,
      secondary_provider_key: rule.secondary_provider_key,
      allow_fallback: rule.allow_fallback,
    }).eq("id", rule.id);
    if (error) toast.error("Błąd"); else toast.success("Routing zapisany");
  };

  const saveLimits = async (limit: LimitConfig) => {
    const { error } = await supabase.from("ai_limits_config").update({
      max_requests_per_day: limit.max_requests_per_day,
      max_tokens_per_day: limit.max_tokens_per_day,
      budget_pln_per_month: limit.budget_pln_per_month,
      enforcement_mode: limit.enforcement_mode,
    }).eq("id", limit.id);
    if (error) toast.error("Błąd"); else toast.success("Limity zapisane");
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold">GetRido AI Hub</h2>
        <Badge variant="secondary">Engine v1.0</Badge>
      </div>

      <UniversalSubTabBar activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      {activeTab === "providers" && (
        <div className="space-y-4">
          {providers.filter(prov => !HIDDEN_PROVIDER_KEYS.includes(prov.provider_key)).map(prov => (
            (() => {
              const sharedOwner = getSharedKeyOwner(prov.provider_key);
              const usesSharedKey = !!sharedOwner && sharedOwner !== prov.provider_key;
              const sharedOwnerLabel = providers.find((p) => p.provider_key === sharedOwner)?.display_name || sharedOwner;

              return (
            <Card key={prov.id} className={prov.is_enabled ? "border-primary/30" : "opacity-70"}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <CardTitle className="text-base">{prov.display_name}</CardTitle>
                    <Badge variant={prov.is_enabled ? "default" : "secondary"}>
                      {prov.is_enabled ? "Aktywny" : "Wyłączony"}
                    </Badge>
                  </div>
                  <Switch checked={prov.is_enabled} onCheckedChange={(v) => setProviders(p => p.map(x => x.id === prov.id ? { ...x, is_enabled: v } : x))} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                 {CLAUDE_PROVIDER_KEYS.includes(prov.provider_key) && (
                   <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                     <span>🔑</span>
                     <span>Klucz API z <strong>console.anthropic.com → API Keys</strong>. Jeden klucz obsługuje wszystkie modele Claude (Haiku, Sonnet, Opus) — wpisujesz go tylko raz.</span>
                   </div>
                 )}
                 {GEMINI_PROVIDER_KEYS.includes(prov.provider_key) && (
                   <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                     <span>🎨</span>
                     <span>Klucz API z <strong>aistudio.google.com</strong>. Jeden klucz obsługuje chat Gemini + generowanie obrazów (Nano Banana) — wpisujesz go raz.</span>
                   </div>
                 )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {prov.provider_key !== "lovable" && !usesSharedKey && (
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Key className="h-3 w-3" /> Klucz API</Label>
                      <div className="flex gap-1">
                        <Input
                          type={showKeys[prov.provider_key] ? "text" : "password"}
                          value={keyInputs[prov.provider_key] ?? (prov.api_key_encrypted ? "••••••••••••" : "")}
                          onChange={e => setKeyInputs(p => ({ ...p, [prov.provider_key]: e.target.value }))}
                          placeholder="sk-..."
                          className="text-sm"
                        />
                        <Button size="icon" variant="ghost" onClick={() => {
                          setShowKeys(p => ({ ...p, [prov.provider_key]: !p[prov.provider_key] }));
                          if (!showKeys[prov.provider_key]) setTimeout(() => setShowKeys(p => ({ ...p, [prov.provider_key]: false })), 10000);
                        }}>
                          {showKeys[prov.provider_key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                  {prov.provider_key !== "lovable" && usesSharedKey && (
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs flex items-center gap-1"><Key className="h-3 w-3" /> Klucz API</Label>
                      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        Ten model używa wspólnego klucza z: <span className="font-medium text-foreground">{sharedOwnerLabel}</span>.
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Model domyślny</Label>
                    <Input value={prov.default_model || ""} onChange={e => setProviders(p => p.map(x => x.id === prov.id ? { ...x, default_model: e.target.value } : x))} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Timeout (sek)</Label>
                    <Input type="number" value={prov.timeout_seconds} onChange={e => setProviders(p => p.map(x => x.id === prov.id ? { ...x, timeout_seconds: +e.target.value } : x))} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Limit dzienny</Label>
                    <Input type="number" value={prov.daily_limit || ""} onChange={e => setProviders(p => p.map(x => x.id === prov.id ? { ...x, daily_limit: e.target.value ? +e.target.value : null } : x))} className="text-sm" placeholder="Bez limitu" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notatka admina</Label>
                  <Textarea value={prov.admin_note || ""} onChange={e => setProviders(p => p.map(x => x.id === prov.id ? { ...x, admin_note: e.target.value } : x))} rows={2} className="text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveProvider(prov)} disabled={saving}><Save className="h-3 w-3 mr-1" />Zapisz</Button>
                  <Button size="sm" variant="outline" onClick={() => testProvider(prov)} disabled={testingProvider === prov.provider_key}>
                    {testingProvider === prov.provider_key ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                    Testuj połączenie
                  </Button>
                </div>
              </CardContent>
            </Card>
              );
            })()
          ))}
        </div>
      )}

      {activeTab === "routing" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Route className="h-5 w-5" />Routing AI</CardTitle>
            <CardDescription>Wybierz który dostawca obsługuje dany typ zadania</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {routing.map(rule => (
                <div key={rule.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 border rounded-lg">
                  <Badge variant="outline" className="min-w-[100px] justify-center">{TASK_TYPE_LABELS[rule.task_type] || rule.task_type}</Badge>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Główny</Label>
                      <Select value={rule.primary_provider_key || ""} onValueChange={v => setRouting(r => r.map(x => x.id === rule.id ? { ...x, primary_provider_key: v } : x))}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {providers.filter(p => p.is_enabled).map(p => <SelectItem key={p.provider_key} value={p.provider_key}>{p.display_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Zapasowy</Label>
                      <Select value={rule.secondary_provider_key || "none"} onValueChange={v => setRouting(r => r.map(x => x.id === rule.id ? { ...x, secondary_provider_key: v === "none" ? null : v } : x))}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Brak</SelectItem>
                          {providers.filter(p => p.is_enabled).map(p => <SelectItem key={p.provider_key} value={p.provider_key}>{p.display_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex items-center gap-1">
                        <Switch checked={rule.allow_fallback} onCheckedChange={v => setRouting(r => r.map(x => x.id === rule.id ? { ...x, allow_fallback: v } : x))} />
                        <Label className="text-xs">Fallback</Label>
                      </div>
                      <Button size="sm" onClick={() => saveRouting(rule)}><Save className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "flags" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ToggleLeft className="h-5 w-5" />Feature Flags AI</CardTitle>
            <CardDescription>Włącz/wyłącz funkcje AI globalnie. OFF = ukryte w UI i zablokowane na backendzie.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {flags.map(flag => (
                <div key={flag.id} className="flex items-center justify-between p-3 border rounded-lg gap-2">
                  <div className="min-w-0 flex-1">
                    <Label className="text-sm font-medium cursor-pointer">{flag.flag_name}</Label>
                    {flag.description && <p className="text-xs text-muted-foreground truncate" title={flag.description}>{flag.description}</p>}
                  </div>
                  <Switch checked={flag.is_enabled} onCheckedChange={() => updateFlag(flag)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "limits" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Limity AI</CardTitle>
            <CardDescription>Ogranicz zużycie AI globalnie, per firma lub per użytkownik</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {limits.map(limit => (
              <div key={limit.id} className="p-4 border rounded-lg space-y-3">
                <Badge>{limit.scope === "global" ? "Globalny" : limit.scope}</Badge>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Max zapytań/dzień</Label>
                    <Input type="number" value={limit.max_requests_per_day || ""} onChange={e => setLimits(l => l.map(x => x.id === limit.id ? { ...x, max_requests_per_day: e.target.value ? +e.target.value : null } : x))} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max tokenów/dzień</Label>
                    <Input type="number" value={limit.max_tokens_per_day || ""} onChange={e => setLimits(l => l.map(x => x.id === limit.id ? { ...x, max_tokens_per_day: e.target.value ? +e.target.value : null } : x))} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Budżet PLN/mies.</Label>
                    <Input type="number" value={limit.budget_pln_per_month || ""} onChange={e => setLimits(l => l.map(x => x.id === limit.id ? { ...x, budget_pln_per_month: e.target.value ? +e.target.value : null } : x))} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tryb</Label>
                    <Select value={limit.enforcement_mode} onValueChange={v => setLimits(l => l.map(x => x.id === limit.id ? { ...x, enforcement_mode: v } : x))}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="block">Blokuj</SelectItem>
                        <SelectItem value="warn">Ostrzegaj</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="sm" onClick={() => saveLimits(limit)}><Save className="h-3 w-3 mr-1" />Zapisz limity</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === "logs" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Logi GetRido AI</CardTitle>
              <Button size="sm" variant="outline" onClick={loadAll}><Loader2 className="h-3 w-3 mr-1" />Odśwież</Button>
            </div>
            <CardDescription>Ostatnie 100 wywołań AI</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Funkcja</TableHead>
                    <TableHead className="text-xs">Provider</TableHead>
                    <TableHead className="text-xs">Model</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Czas</TableHead>
                    <TableHead className="text-xs">Tokeny</TableHead>
                    <TableHead className="text-xs">Koszt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Brak logów</TableCell></TableRow>
                  ) : logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{new Date(log.created_at).toLocaleString("pl")}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-xs">{log.feature}</Badge></TableCell>
                      <TableCell className="text-xs">{log.provider || "-"}</TableCell>
                      <TableCell className="text-xs font-mono">{(log.model || "-").split("/").pop()}</TableCell>
                      <TableCell>
                        <Badge variant={log.status === "success" ? "default" : "destructive"} className="text-xs">
                          {log.cache_hit ? "cache" : log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{log.response_time_ms ? `${log.response_time_ms}ms` : "-"}</TableCell>
                      <TableCell className="text-xs">{(log.tokens_in || 0) + (log.tokens_out || 0) || "-"}</TableCell>
                      <TableCell className="text-xs">{log.cost_estimate ? `${log.cost_estimate} PLN` : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
