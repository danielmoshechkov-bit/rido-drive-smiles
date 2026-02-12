import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ToggleLeft } from "lucide-react";

interface FeatureToggle {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  is_enabled: boolean;
  category: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  marketplace: "Funkcje Marketplace",
  registration: "Rejestracja",
  general: "Ogólne",
  accounting: "Moduł Księgowy",
  inventory: "Moduł Magazynowy",
};

export function FeatureTogglesManagement() {
  const [toggles, setToggles] = useState<FeatureToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    loadToggles();
  }, []);

  const loadToggles = async () => {
    const { data, error } = await supabase
      .from("feature_toggles")
      .select("*")
      .order("feature_name");

    if (error) {
      console.error("Error loading toggles:", error);
      toast.error("Błąd ładowania ustawień funkcji");
      return;
    }

    setToggles(data || []);
    setLoading(false);
  };

  const handleToggle = async (toggle: FeatureToggle) => {
    setUpdating(toggle.id);
    
    const { error } = await supabase
      .from("feature_toggles")
      .update({ is_enabled: !toggle.is_enabled })
      .eq("id", toggle.id);

    if (error) {
      console.error("Error updating toggle:", error);
      toast.error("Błąd aktualizacji ustawienia");
      setUpdating(null);
      return;
    }

    setToggles(prev => prev.map(t => 
      t.id === toggle.id ? { ...t, is_enabled: !t.is_enabled } : t
    ));
    
    toast.success(`${toggle.feature_name} ${!toggle.is_enabled ? "włączona" : "wyłączona"}`);
    setUpdating(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ToggleLeft className="h-5 w-5" />
          Przełączniki funkcji
        </CardTitle>
        <CardDescription>
          Włącz lub wyłącz funkcje na wszystkich kontach użytkowników
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {toggles.length === 0 ? (
          <p className="text-muted-foreground text-sm">Brak dostępnych przełączników</p>
        ) : (
          Object.entries(
            toggles.reduce((acc, toggle) => {
              const cat = toggle.category || 'general';
              if (!acc[cat]) acc[cat] = [];
              acc[cat].push(toggle);
              return acc;
            }, {} as Record<string, FeatureToggle[]>)
          ).map(([category, categoryToggles]) => (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">
                {CATEGORY_LABELS[category] || category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {categoryToggles.map((toggle) => (
                  <div 
                    key={toggle.id} 
                    className="flex items-center justify-between p-3 border rounded-lg gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={toggle.id} className="text-sm font-medium cursor-pointer leading-tight">
                        {toggle.feature_name}
                      </Label>
                      {toggle.description && (
                        <p className="text-xs text-muted-foreground truncate" title={toggle.description}>
                          {toggle.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {updating === toggle.id && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      <Switch
                        id={toggle.id}
                        checked={toggle.is_enabled}
                        onCheckedChange={() => handleToggle(toggle)}
                        disabled={updating === toggle.id}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
