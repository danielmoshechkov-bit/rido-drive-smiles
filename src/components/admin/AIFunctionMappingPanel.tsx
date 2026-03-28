import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Save, Route, ExternalLink, Zap } from "lucide-react";

interface FunctionMapping {
  id: string;
  function_key: string;
  function_name: string;
  function_description: string | null;
  category: string;
  provider_key: string | null;
  model_override: string | null;
  is_enabled: boolean;
  custom_prompt: string | null;
  sort_order: number;
  backup_provider_key?: string | null;
  allow_fallback?: boolean;
}

interface Provider {
  provider_key: string;
  display_name: string;
  is_enabled: boolean;
}

const FUNCTION_MODULES: Record<string, string> = {
  rido_price: "warsztat",
  parts_pricing: "warsztat",
  parts_search_ai: "warsztat",
  ocr_invoice: "warsztat",
  ocr_documents: "warsztat",
  workshop_order_ai: "warsztat",
  client_communication_ai: "warsztat",
  inventory_analysis: "warsztat",
  booking_ai: "warsztat",
  invoice_recognition: "warsztat",
  invoice_booking: "warsztat",
  supplier_mapping: "warsztat",
  ksef_integration: "warsztat",
  inventory_ocr: "warsztat",
  price_suggestion: "warsztat",
  workspace_ai_planner: "workspace",
  task_breakdown: "workspace",
  project_planning: "workspace",
  project_summary: "workspace",
  document_ai: "workspace",
  chat_translation: "workspace",
  vehicle_description_gen: "ogloszenia",
  listing_description: "ogloszenia",
  listing_seo: "ogloszenia",
  portal_search: "portal",
  ai_chat_main: "portal",
  ai_assistant: "portal",
  admin_ai_chat: "portal",
  ai_connection_test: "portal",
  dual_ai_mode: "portal",
  image_generation: "media",
  inpainting: "media",
  photo_editing: "media",
  logo_generation: "media",
  website_generation: "www",
  website_prompt_builder: "www",
  real_estate_analysis: "nieruchomosci",
  vehicle_analysis: "motoryzacja",
  voice_navigation: "voice",
  voice_agent: "voice",
  ai_sales_agent: "voice",
  meeting_transcription: "inne",
  map_risk_assessment: "inne",
  email_ai_assistant: "inne",
};

const MODULE_CONFIG = [
  { value: "all", label: "Wszystkie" },
  { value: "warsztat", label: "Warsztat & Faktury" },
  { value: "workspace", label: "Workspace" },
  { value: "ogloszenia", label: "Ogłoszenia" },
  { value: "portal", label: "Portal & Chat" },
  { value: "media", label: "Grafika" },
  { value: "www", label: "Strona WWW" },
  { value: "nieruchomosci", label: "Nieruchomości" },
  { value: "motoryzacja", label: "Motoryzacja" },
  { value: "voice", label: "Głos" },
  { value: "inne", label: "Inne" },
];

const FUNCTION_LINKS: Record<string, { path: string; label: string }> = {
  rido_price: { path: "/provider", label: "Wycena naprawy" },
  parts_pricing: { path: "/provider", label: "Wycena części" },
  workspace_ai_planner: { path: "/provider?tab=workspace", label: "AI Planner" },
  task_breakdown: { path: "/provider?tab=workspace", label: "Rozbijanie zadań" },
  project_planning: { path: "/provider?tab=workspace", label: "Plan projektu" },
  project_summary: { path: "/provider?tab=workspace", label: "Podsumowanie" },
  document_ai: { path: "/provider?tab=workspace", label: "Dokumenty AI" },
  ocr_invoice: { path: "/provider?tab=inventory", label: "OCR faktur" },
  chat_translation: { path: "/provider?tab=workspace", label: "Tłumaczenie czatu" },
  image_generation: { path: "/rido-ai", label: "Generuj grafikę" },
  inpainting: { path: "/rido-ai", label: "Retusz zdjęć" },
  vehicle_description_gen: { path: "/add-listing", label: "Opis AI" },
  meeting_transcription: { path: "/meetings", label: "Transkrypcja" },
  map_risk_assessment: { path: "/maps", label: "Ocena trasy" },
  ai_chat_main: { path: "/rido-ai", label: "RidoAI Chat" },
  dual_ai_mode: { path: "/admin/ai?tab=hub", label: "Routing" },
  parts_search_ai: { path: "/provider", label: "Wyszukiwanie części" },
  email_ai_assistant: { path: "/mail", label: "Asystent poczty" },
  photo_editing: { path: "/rido-ai", label: "Edycja zdjęć" },
  logo_generation: { path: "/provider?tab=website", label: "Logo AI" },
  ocr_documents: { path: "/provider?tab=inventory", label: "OCR dokumentów" },
  portal_search: { path: "/", label: "Wyszukiwarka AI" },
  listing_description: { path: "/add-listing", label: "Opis AI" },
  listing_seo: { path: "/add-listing", label: "SEO AI" },
  website_generation: { path: "/provider?tab=website", label: "Generator" },
  website_prompt_builder: { path: "/provider?tab=website", label: "Prompt AI" },
  ai_assistant: { path: "/rido-ai", label: "Asystent" },
  real_estate_analysis: { path: "/nieruchomosci", label: "Analiza AI" },
  vehicle_analysis: { path: "/samochody", label: "Analiza AI" },
  voice_navigation: { path: "/admin/ai?tab=voice-agent", label: "Nawigacja" },
  voice_agent: { path: "/admin/ai?tab=voice-agent", label: "Voice Agent" },
  ai_sales_agent: { path: "/admin/ai?tab=call-admin", label: "Call Admin" },
  admin_ai_chat: { path: "/admin/ai", label: "Chat AI" },
  ai_connection_test: { path: "/admin/ai?tab=hub", label: "Test połączenia" },
  workshop_order_ai: { path: "/provider", label: "Zlecenia AI" },
  client_communication_ai: { path: "/provider", label: "Komunikacja AI" },
  inventory_analysis: { path: "/provider?tab=inventory", label: "Analiza magazynu" },
  booking_ai: { path: "/provider", label: "Rezerwacje AI" },
  invoice_recognition: { path: "/provider?tab=inventory", label: "Rozpoznawanie faktur" },
  invoice_booking: { path: "/provider?tab=inventory", label: "Księgowanie faktur" },
  supplier_mapping: { path: "/provider?tab=inventory", label: "Mapowanie dostawców" },
  ksef_integration: { path: "/provider?tab=inventory", label: "KSeF" },
  inventory_ocr: { path: "/provider?tab=inventory", label: "OCR magazynowe" },
  price_suggestion: { path: "/provider", label: "Sugestia cen" },
};

export function AIFunctionMappingPanel() {
  const [mappings, setMappings] = useState<FunctionMapping[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState("all");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [m, p] = await Promise.all([
      supabase.from("ai_function_mapping" as any).select("*").order("sort_order"),
      supabase.from("ai_providers").select("provider_key, display_name, is_enabled").order("provider_key"),
    ]);
    if (m.data) {
      setMappings((m.data as unknown as FunctionMapping[]).map(d => ({
        ...d,
        backup_provider_key: (d as any).backup_provider_key ?? null,
        allow_fallback: (d as any).allow_fallback ?? true,
      })));
    }
    if (p.data) setProviders(p.data);
    setLoading(false);
  };

  const saveMapping = async (mapping: FunctionMapping) => {
    setSaving(mapping.id);
    const { error } = await supabase
      .from("ai_function_mapping" as any)
      .update({
        provider_key: mapping.provider_key,
        model_override: mapping.model_override,
        is_enabled: mapping.is_enabled,
        backup_provider_key: mapping.backup_provider_key,
        allow_fallback: mapping.allow_fallback,
      } as any)
      .eq("id", mapping.id);
    if (error) toast.error("Błąd zapisu");
    else toast.success(`${mapping.function_name} – zapisano`);
    setSaving(null);
  };

  const testMapping = async (mapping: FunctionMapping) => {
    if (!mapping.provider_key) { toast.error("Brak dostawcy AI"); return; }
    setTesting(mapping.id);
    try {
      const { data, error } = await supabase.functions.invoke("getrido-ai-execute", {
        body: { feature: mapping.function_key, taskType: "text", query: `Test: ${mapping.function_name}. Odpowiedz: "OK"`, mode: "fast" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`✅ ${mapping.function_name} → ${data?._brand || mapping.provider_key}: OK`);
    } catch (e: any) {
      toast.error(`❌ ${mapping.function_name}: ${e.message}`);
    } finally { setTesting(null); }
  };

  const updateMapping = (id: string, updates: Partial<FunctionMapping>) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const filteredMappings = activeModule === "all"
    ? mappings
    : mappings.filter(m => (FUNCTION_MODULES[m.function_key] || "inne") === activeModule);

  const enabledCount = mappings.filter(m => m.is_enabled).length;
  const enabledProviders = providers.filter(p => p.is_enabled);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Route className="h-5 w-5" />
            Centrum sterowania AI
          </CardTitle>
          <CardDescription>
            Przypisz dostawcę AI do każdej funkcji. <strong>Główny</strong> + <strong>Zapasowy</strong> (auto-zamiana gdy główny nie odpowie).
          </CardDescription>
          <div className="flex gap-2 mt-1">
            <Badge variant="default">{enabledCount} aktywnych</Badge>
            <Badge variant="secondary">{mappings.length - enabledCount} wyłączonych</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Module filter tabs - simple text buttons, matching portal style */}
      <ScrollArea className="w-full">
        <div className="flex gap-1 pb-2">
          {MODULE_CONFIG.map(mod => {
            const count = mod.value === "all"
              ? mappings.length
              : mappings.filter(m => (FUNCTION_MODULES[m.function_key] || "inne") === mod.value).length;
            if (count === 0 && mod.value !== "all") return null;
            const isActive = activeModule === mod.value;
            return (
              <button
                key={mod.value}
                onClick={() => setActiveModule(mod.value)}
                className={`
                  px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors
                  ${isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                `}
              >
                {mod.label}
                <span className={`ml-1 text-xs ${isActive ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Function list */}
      <div className="space-y-2">
        {filteredMappings.map(mapping => {
          const link = FUNCTION_LINKS[mapping.function_key];
          const module = FUNCTION_MODULES[mapping.function_key] || "inne";

          return (
            <div key={mapping.id} className="flex flex-col gap-2 p-3 border rounded-lg hover:bg-muted/30 transition-colors bg-card">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{mapping.function_name}</span>
                <Badge variant={mapping.is_enabled ? "default" : "secondary"} className="text-[10px]">
                  {mapping.is_enabled ? "ON" : "OFF"}
                </Badge>
                {activeModule === "all" && (
                  <Badge variant="outline" className="text-[10px]">
                    {MODULE_CONFIG.find(t => t.value === module)?.label || module}
                  </Badge>
                )}
                {link && (
                  <a href={link.path} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-auto">
                    <ExternalLink className="h-3 w-3" />{link.label}
                  </a>
                )}
              </div>

              {mapping.function_description && (
                <p className="text-xs text-muted-foreground">{mapping.function_description}</p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <Switch checked={mapping.is_enabled}
                  onCheckedChange={(v) => updateMapping(mapping.id, { is_enabled: v })} />

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Główny</span>
                  <Select value={mapping.provider_key || "none"}
                    onValueChange={(v) => updateMapping(mapping.id, { provider_key: v === "none" ? null : v })}>
                    <SelectTrigger className="w-[130px] text-xs h-8"><SelectValue placeholder="Wybierz" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Brak</SelectItem>
                      {enabledProviders.map(p => (
                        <SelectItem key={p.provider_key} value={p.provider_key}>{p.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Zapasowy</span>
                  <Select value={mapping.backup_provider_key || "none"}
                    onValueChange={(v) => updateMapping(mapping.id, { backup_provider_key: v === "none" ? null : v })}>
                    <SelectTrigger className="w-[130px] text-xs h-8"><SelectValue placeholder="Brak" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Brak</SelectItem>
                      {enabledProviders.map(p => (
                        <SelectItem key={p.provider_key} value={p.provider_key}>{p.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Model</span>
                  <Input value={mapping.model_override || ""}
                    onChange={(e) => updateMapping(mapping.id, { model_override: e.target.value || null })}
                    placeholder="Domyślny" className="w-[100px] text-xs h-8" />
                </div>

                <div className="flex flex-col gap-0.5 items-center">
                  <span className="text-[10px] text-muted-foreground font-medium">Auto-zamiana</span>
                  <Switch checked={mapping.allow_fallback ?? true}
                    onCheckedChange={(v) => updateMapping(mapping.id, { allow_fallback: v })} />
                </div>

                <div className="flex gap-1 ml-auto">
                  <Button size="sm" variant="outline"
                    onClick={() => testMapping(mapping)}
                    disabled={testing === mapping.id || !mapping.provider_key}
                    className="h-8 text-xs">
                    {testing === mapping.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                    Testuj
                  </Button>
                  <Button size="sm" onClick={() => saveMapping(mapping)}
                    disabled={saving === mapping.id} className="h-8 text-xs">
                    {saving === mapping.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {filteredMappings.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">Brak funkcji AI w tym module</div>
        )}
      </div>
    </div>
  );
}
