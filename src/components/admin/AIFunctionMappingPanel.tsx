import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Route, Search, FileText, Image, Mic, Bot } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Mapowanie funkcji portalu → Dostawca AI
          </CardTitle>
          <CardDescription>
            Przypisz który dostawca AI obsługuje którą funkcję portalu. Zmiana tutaj automatycznie przestawia cały portal.
          </CardDescription>
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
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {catMappings.map(mapping => (
                <div key={mapping.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{mapping.function_name}</span>
                      <Badge variant={mapping.is_enabled ? "default" : "secondary"} className="text-xs">
                        {mapping.is_enabled ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    {mapping.function_description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{mapping.function_description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
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
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
