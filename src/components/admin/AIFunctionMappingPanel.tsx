import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Route, Search, FileText, Image, Mic, Bot, ExternalLink } from "lucide-react";

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
}

interface Provider {
  provider_key: string;
  display_name: string;
  is_enabled: boolean;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  search: Search,
  text: FileText,
  image: Image,
  voice: Mic,
  general: Bot,
};

const CATEGORY_LABELS: Record<string, string> = {
  search: "Wyszukiwanie",
  text: "Tekst & Opisy",
  image: "Obraz & Zdjęcia",
  voice: "Głos & Agenci",
  general: "Ogólne",
};

// Links to where each function is used in the portal
const FUNCTION_LINKS: Record<string, { path: string; label: string }> = {
  rido_price: { path: "/provider", label: "Warsztat → Wycena" },
  workspace_ai_planner: { path: "/provider?tab=workspace", label: "Workspace → AI Planner" },
  document_ai: { path: "/provider?tab=workspace", label: "Workspace → Dokumenty" },
  ocr_invoice: { path: "/provider?tab=inventory", label: "Warsztat → Magazyn OCR" },
  chat_translation: { path: "/provider?tab=workspace", label: "Workspace → Komunikacja" },
  image_generation: { path: "/rido-ai", label: "RidoAI → Generuj grafikę" },
  inpainting: { path: "/rido-ai", label: "RidoAI → Edytor zdjęć" },
  vehicle_description_gen: { path: "/add-listing", label: "Dodaj ogłoszenie → Opis AI" },
  meeting_transcription: { path: "/meetings", label: "Spotkania → Transkrypcja" },
  map_risk_assessment: { path: "/maps", label: "Mapy → Ocena trasy" },
  ai_chat_main: { path: "/rido-ai", label: "RidoAI Chat" },
  dual_ai_mode: { path: "/admin/ai?tab=hub", label: "Centrum AI → Routing" },
  parts_search_ai: { path: "/provider", label: "Warsztat → Znajdź części" },
  email_ai_assistant: { path: "/mail", label: "Rido Mail" },
  photo_editing: { path: "/rido-ai", label: "RidoAI → Edycja zdjęć" },
  logo_generation: { path: "/provider?tab=website", label: "Strona WWW → Logo" },
  ocr_documents: { path: "/provider?tab=inventory", label: "Magazyn → OCR" },
  portal_search: { path: "/", label: "Strona główna → Szukaj" },
  listing_description: { path: "/add-listing", label: "Dodaj ogłoszenie → Opis" },
  listing_seo: { path: "/add-listing", label: "Dodaj ogłoszenie → SEO" },
  website_generation: { path: "/provider?tab=website", label: "Strona WWW" },
  website_prompt_builder: { path: "/provider?tab=website", label: "Strona WWW → Prompt" },
  ai_assistant: { path: "/rido-ai", label: "RidoAI Asystent" },
  real_estate_analysis: { path: "/nieruchomosci", label: "Nieruchomości → Analiza" },
  vehicle_analysis: { path: "/samochody", label: "Motoryzacja → Analiza" },
  voice_navigation: { path: "/admin/ai?tab=voice-agent", label: "AI Voice → Nawigacja" },
  voice_agent: { path: "/admin/ai?tab=voice-agent", label: "AI Voice Agent" },
  ai_sales_agent: { path: "/admin/ai?tab=call-admin", label: "AI Call Admin" },
};

export function AIFunctionMappingPanel() {
  const [mappings, setMappings] = useState<FunctionMapping[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [m, p] = await Promise.all([
      supabase.from("ai_function_mapping" as any).select("*").order("sort_order"),
      supabase.from("ai_providers").select("provider_key, display_name, is_enabled").order("provider_key"),
    ]);
    if (m.data) setMappings(m.data as unknown as FunctionMapping[]);
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
      } as any)
      .eq("id", mapping.id);
    if (error) toast.error("Błąd zapisu");
    else toast.success(`${mapping.function_name} – zapisano`);
    setSaving(null);
  };

  const updateMapping = (id: string, updates: Partial<FunctionMapping>) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const categories = [...new Set(mappings.map(m => m.category))];
  const enabledCount = mappings.filter(m => m.is_enabled).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Mapowanie funkcji portalu → Dostawca AI
          </CardTitle>
          <CardDescription>
            Każda funkcja AI w portalu jest tutaj wymieniona. Wybierz który dostawca (główny) obsługuje daną funkcję.
            Kliknij link „→" aby przejść do miejsca w portalu gdzie ta funkcja działa.
          </CardDescription>
          <div className="flex gap-2 mt-2">
            <Badge variant="default">{enabledCount} aktywnych</Badge>
            <Badge variant="secondary">{mappings.length - enabledCount} wyłączonych</Badge>
            <Badge variant="outline">{mappings.length} łącznie</Badge>
          </div>
        </CardHeader>
      </Card>

      {categories.map(cat => {
        const Icon = CATEGORY_ICONS[cat] || Bot;
        const catMappings = mappings.filter(m => m.category === cat);

        return (
          <Card key={cat}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {CATEGORY_LABELS[cat] || cat}
                <Badge variant="outline" className="text-xs ml-auto">{catMappings.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {catMappings.map(mapping => {
                const link = FUNCTION_LINKS[mapping.function_key];
                return (
                  <div key={mapping.id} className="flex flex-col gap-2 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    {/* Row 1: Name, badge, link */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{mapping.function_name}</span>
                      <Badge variant={mapping.is_enabled ? "default" : "secondary"} className="text-xs">
                        {mapping.is_enabled ? "ON" : "OFF"}
                      </Badge>
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

                      <Select
                        value={mapping.provider_key || "none"}
                        onValueChange={(v) => updateMapping(mapping.id, { provider_key: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="w-[160px] text-sm">
                          <SelectValue placeholder="Wybierz AI" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Brak</SelectItem>
                          {providers.filter(p => p.is_enabled).map(p => (
                            <SelectItem key={p.provider_key} value={p.provider_key}>
                              {p.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        value={mapping.model_override || ""}
                        onChange={(e) => updateMapping(mapping.id, { model_override: e.target.value || null })}
                        placeholder="Model (opcj.)"
                        className="w-[140px] text-sm"
                      />

                      <Button
                        size="sm"
                        onClick={() => saveMapping(mapping)}
                        disabled={saving === mapping.id}
                      >
                        {saving === mapping.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
