import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Route, Search, FileText, Image, Mic, Bot, ExternalLink, Zap } from "lucide-react";
import { UniversalSubTabBar } from "../UniversalSubTabBar";

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

// Module groupings - each function belongs to a module
const FUNCTION_MODULES: Record<string, string> = {
  // Warsztat
  rido_price: "warsztat",
  parts_pricing: "warsztat",
  parts_search_ai: "warsztat",
  ocr_invoice: "warsztat",
  ocr_documents: "warsztat",
  workshop_order_ai: "warsztat",
  client_communication_ai: "warsztat",
  inventory_analysis: "warsztat",
  booking_ai: "warsztat",
  // Workspace
  workspace_ai_planner: "workspace",
  task_breakdown: "workspace",
  project_planning: "workspace",
  project_summary: "workspace",
  document_ai: "workspace",
  chat_translation: "workspace",
  // Ogłoszenia
  vehicle_description_gen: "ogloszenia",
  listing_description: "ogloszenia",
  listing_seo: "ogloszenia",
  // Portal / Wyszukiwarka
  portal_search: "portal",
  ai_chat_main: "portal",
  ai_assistant: "portal",
  admin_ai_chat: "portal",
  ai_connection_test: "portal",
  dual_ai_mode: "portal",
  // Grafika & Media
  image_generation: "media",
  inpainting: "media",
  photo_editing: "media",
  logo_generation: "media",
  // Strona WWW
  website_generation: "www",
  website_prompt_builder: "www",
  // Nieruchomości
  real_estate_analysis: "nieruchomosci",
  // Motoryzacja
  vehicle_analysis: "motoryzacja",
  // Głos & Agenci
  voice_navigation: "voice",
  voice_agent: "voice",
  ai_sales_agent: "voice",
  // Pozostałe
  meeting_transcription: "inne",
  map_risk_assessment: "inne",
  email_ai_assistant: "inne",
};

const MODULE_TABS = [
  { value: "all", label: "Wszystkie", visible: true },
  { value: "warsztat", label: "Warsztat", visible: true },
  { value: "workspace", label: "Workspace", visible: true },
  { value: "ogloszenia", label: "Ogłoszenia", visible: true },
  { value: "portal", label: "Portal & Chat", visible: true },
  { value: "media", label: "Grafika", visible: true },
  { value: "www", label: "Strona WWW", visible: true },
  { value: "nieruchomosci", label: "Nieruchomości", visible: true },
  { value: "motoryzacja", label: "Motoryzacja", visible: true },
  { value: "voice", label: "Głos & Agenci", visible: true },
  { value: "inne", label: "Inne", visible: true },
];

const FUNCTION_LINKS: Record<string, { path: string; label: string }> = {
  rido_price: { path: "/provider", label: "Warsztat → Wycena naprawy" },
  parts_pricing: { path: "/provider", label: "Warsztat → Wycena części" },
  workspace_ai_planner: { path: "/provider?tab=workspace", label: "Workspace → AI Planner" },
  task_breakdown: { path: "/provider?tab=workspace", label: "Workspace → Rozbijanie zadań" },
  project_planning: { path: "/provider?tab=workspace", label: "Workspace → Plan projektu" },
  project_summary: { path: "/provider?tab=workspace", label: "Workspace → Podsumowanie" },
  document_ai: { path: "/provider?tab=workspace", label: "Workspace → Dokumenty AI" },
  ocr_invoice: { path: "/provider?tab=inventory", label: "Warsztat → OCR faktur" },
  chat_translation: { path: "/provider?tab=workspace", label: "Workspace → Tłumaczenie czatu" },
  image_generation: { path: "/rido-ai", label: "RidoAI → Generuj grafikę" },
  inpainting: { path: "/rido-ai", label: "RidoAI → Retusz zdjęć" },
  vehicle_description_gen: { path: "/add-listing", label: "Dodaj ogłoszenie → Opis AI" },
  meeting_transcription: { path: "/meetings", label: "Spotkania → Transkrypcja" },
  map_risk_assessment: { path: "/maps", label: "Mapy → Ocena trasy" },
  ai_chat_main: { path: "/rido-ai", label: "RidoAI Chat" },
  dual_ai_mode: { path: "/admin/ai?tab=hub", label: "Centrum AI → Routing" },
  parts_search_ai: { path: "/provider", label: "Warsztat → Wyszukiwanie części" },
  email_ai_assistant: { path: "/mail", label: "Rido Mail → Asystent" },
  photo_editing: { path: "/rido-ai", label: "RidoAI → Edycja zdjęć" },
  logo_generation: { path: "/provider?tab=website", label: "Strona WWW → Logo AI" },
  ocr_documents: { path: "/provider?tab=inventory", label: "Magazyn → OCR dokumentów" },
  portal_search: { path: "/", label: "Strona główna → Wyszukiwarka AI" },
  listing_description: { path: "/add-listing", label: "Ogłoszenie → Opis AI" },
  listing_seo: { path: "/add-listing", label: "Ogłoszenie → SEO AI" },
  website_generation: { path: "/provider?tab=website", label: "Strona WWW → Generator" },
  website_prompt_builder: { path: "/provider?tab=website", label: "Strona WWW → Prompt AI" },
  ai_assistant: { path: "/rido-ai", label: "RidoAI Asystent" },
  real_estate_analysis: { path: "/nieruchomosci", label: "Nieruchomości → Analiza AI" },
  vehicle_analysis: { path: "/samochody", label: "Motoryzacja → Analiza AI" },
  voice_navigation: { path: "/admin/ai?tab=voice-agent", label: "AI Voice → Nawigacja" },
  voice_agent: { path: "/admin/ai?tab=voice-agent", label: "AI Voice Agent" },
  ai_sales_agent: { path: "/admin/ai?tab=call-admin", label: "AI Call Admin" },
  admin_ai_chat: { path: "/admin/ai", label: "Admin → Chat AI" },
  ai_connection_test: { path: "/admin/ai?tab=hub", label: "Admin → Test połączenia" },
  workshop_order_ai: { path: "/provider", label: "Warsztat → Zlecenia AI" },
  client_communication_ai: { path: "/provider", label: "Warsztat → Komunikacja AI" },
  inventory_analysis: { path: "/provider?tab=inventory", label: "Magazyn → Analiza AI" },
  booking_ai: { path: "/provider", label: "Rezerwacje → AI" },
};

export function AIFunctionMappingPanel() {
  const [mappings, setMappings] = useState<FunctionMapping[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

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
    if (!mapping.provider_key) {
      toast.error("Brak przypisanego dostawcy AI");
      return;
    }
    setTesting(mapping.id);
    try {
      const { data, error } = await supabase.functions.invoke("getrido-ai-execute", {
        body: {
          feature: mapping.function_key,
          taskType: "text",
          query: `Test: ${mapping.function_name}. Odpowiedz: "OK"`,
          mode: "fast",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const brand = data?._brand || mapping.provider_key;
      toast.success(`✅ ${mapping.function_name} → ${brand}: OK`);
    } catch (e: any) {
      toast.error(`❌ ${mapping.function_name}: ${e.message}`);
    } finally {
      setTesting(null);
    }
  };

  const updateMapping = (id: string, updates: Partial<FunctionMapping>) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  // Filter by module
  const filteredMappings = activeModule === "all"
    ? mappings
    : mappings.filter(m => (FUNCTION_MODULES[m.function_key] || "inne") === activeModule);

  const enabledCount = mappings.filter(m => m.is_enabled).length;
  const enabledProviders = providers.filter(p => p.is_enabled);

  // Count per module for badges
  const moduleCounts = MODULE_TABS.map(tab => ({
    ...tab,
    label: tab.value === "all"
      ? `Wszystkie (${mappings.length})`
      : `${tab.label} (${mappings.filter(m => (FUNCTION_MODULES[m.function_key] || "inne") === tab.value).length})`,
    visible: tab.value === "all" || mappings.some(m => (FUNCTION_MODULES[m.function_key] || "inne") === tab.value),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Centrum sterowania AI — Funkcje portalu
          </CardTitle>
          <CardDescription>
            Każda funkcja AI jest przypisana do dostawcy. Wybierz <strong>głównego</strong> i <strong>zapasowego</strong> dostawcę.
            Jeśli główny nie odpowie — system przełączy się na zapasowy (auto-zamiana).
          </CardDescription>
          <div className="flex gap-2 mt-2">
            <Badge variant="default">{enabledCount} aktywnych</Badge>
            <Badge variant="secondary">{mappings.length - enabledCount} wyłączonych</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Module tabs */}
      <UniversalSubTabBar activeTab={activeModule} onTabChange={setActiveModule} tabs={moduleCounts} />

      {/* Function list */}
      <div className="space-y-2">
        {filteredMappings.map(mapping => {
          const link = FUNCTION_LINKS[mapping.function_key];
          const module = FUNCTION_MODULES[mapping.function_key] || "inne";

          return (
            <div key={mapping.id} className="flex flex-col gap-2 p-3 border rounded-lg hover:bg-muted/30 transition-colors bg-card">
              {/* Row 1: Name + module badge + link */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{mapping.function_name}</span>
                <Badge variant={mapping.is_enabled ? "default" : "secondary"} className="text-[10px]">
                  {mapping.is_enabled ? "ON" : "OFF"}
                </Badge>
                {activeModule === "all" && (
                  <Badge variant="outline" className="text-[10px]">
                    {MODULE_TABS.find(t => t.value === module)?.label.split(" (")[0] || module}
                  </Badge>
                )}
                {link && (
                  <a
                    href={link.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-auto"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {link.label}
                  </a>
                )}
              </div>

              {/* Row 2: Description */}
              {mapping.function_description && (
                <p className="text-xs text-muted-foreground">{mapping.function_description}</p>
              )}

              {/* Row 3: Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <Switch
                  checked={mapping.is_enabled}
                  onCheckedChange={(v) => updateMapping(mapping.id, { is_enabled: v })}
                />

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Główny</span>
                  <Select
                    value={mapping.provider_key || "none"}
                    onValueChange={(v) => updateMapping(mapping.id, { provider_key: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="w-[130px] text-xs h-8">
                      <SelectValue placeholder="Wybierz" />
                    </SelectTrigger>
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
                  <Select
                    value={mapping.backup_provider_key || "none"}
                    onValueChange={(v) => updateMapping(mapping.id, { backup_provider_key: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="w-[130px] text-xs h-8">
                      <SelectValue placeholder="Brak" />
                    </SelectTrigger>
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
                  <Input
                    value={mapping.model_override || ""}
                    onChange={(e) => updateMapping(mapping.id, { model_override: e.target.value || null })}
                    placeholder="Domyślny"
                    className="w-[110px] text-xs h-8"
                  />
                </div>

                <div className="flex flex-col gap-0.5 items-center">
                  <span className="text-[10px] text-muted-foreground font-medium">Auto-zamiana</span>
                  <Switch
                    checked={mapping.allow_fallback ?? true}
                    onCheckedChange={(v) => updateMapping(mapping.id, { allow_fallback: v })}
                  />
                </div>

                <div className="flex gap-1 ml-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testMapping(mapping)}
                    disabled={testing === mapping.id || !mapping.provider_key}
                    className="h-8 text-xs"
                  >
                    {testing === mapping.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                    Testuj
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveMapping(mapping)}
                    disabled={saving === mapping.id}
                    className="h-8 text-xs"
                  >
                    {saving === mapping.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredMappings.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Brak funkcji AI w tym module
          </div>
        )}
      </div>
    </div>
  );
}
