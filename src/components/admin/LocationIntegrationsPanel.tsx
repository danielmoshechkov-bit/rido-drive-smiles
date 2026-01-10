import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Map, 
  Wind, 
  Bus, 
  Car, 
  MapPin, 
  Save, 
  Key, 
  Eye, 
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react";

interface Integration {
  id: string;
  integration_type: string;
  provider: string | null;
  is_enabled: boolean;
  api_key_secret_name: string | null;
  visible_in_listings: boolean;
  visible_in_search: boolean;
  visible_in_map: boolean;
  config: Record<string, unknown>;
  hasApiKey?: boolean;
}

interface IntegrationConfig {
  type: string;
  label: string;
  description: string;
  icon: typeof Map;
  providers: { value: string; label: string }[];
}

const INTEGRATION_CONFIGS: IntegrationConfig[] = [
  {
    type: "maps",
    label: "Mapy",
    description: "Wyświetlanie lokalizacji na mapie",
    icon: Map,
    providers: [
      { value: "google_maps", label: "Google Maps" },
      { value: "openstreetmap", label: "OpenStreetMap" },
      { value: "mapbox", label: "Mapbox" },
    ],
  },
  {
    type: "air_quality",
    label: "Jakość powietrza",
    description: "Dane o jakości powietrza w okolicy",
    icon: Wind,
    providers: [
      { value: "airly", label: "Airly" },
      { value: "openaq", label: "OpenAQ" },
      { value: "waqi", label: "WAQI" },
    ],
  },
  {
    type: "public_transport",
    label: "Komunikacja miejska",
    description: "Informacje o transporcie publicznym",
    icon: Bus,
    providers: [
      { value: "gtfs", label: "GTFS" },
      { value: "ztm_warszawa", label: "ZTM Warszawa" },
      { value: "mpk_krakow", label: "MPK Kraków" },
      { value: "jakdojade", label: "Jakdojade" },
    ],
  },
  {
    type: "traffic",
    label: "Natężenie ruchu",
    description: "Aktualne dane o ruchu drogowym",
    icon: Car,
    providers: [
      { value: "here", label: "HERE" },
      { value: "tomtom", label: "TomTom" },
      { value: "google_traffic", label: "Google Traffic" },
    ],
  },
  {
    type: "poi",
    label: "Punkty POI",
    description: "Pobliskie sklepy, szkoły, restauracje",
    icon: MapPin,
    providers: [
      { value: "openstreetmap", label: "OpenStreetMap" },
      { value: "foursquare", label: "Foursquare" },
      { value: "google_places", label: "Google Places" },
    ],
  },
];

export function LocationIntegrationsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [editingApiKey, setEditingApiKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from("location_integrations")
        .select("*")
        .order("integration_type");

      if (error) throw error;

      // Type assertion since we know the structure
      const typedData = (data || []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        integration_type: item.integration_type as string,
        provider: item.provider as string | null,
        is_enabled: item.is_enabled as boolean,
        api_key_secret_name: item.api_key_secret_name as string | null,
        visible_in_listings: item.visible_in_listings as boolean,
        visible_in_search: item.visible_in_search as boolean,
        visible_in_map: item.visible_in_map as boolean,
        config: (item.config || {}) as Record<string, unknown>,
        hasApiKey: !!item.api_key_secret_name,
      }));

      setIntegrations(typedData);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      toast.error("Błąd pobierania integracji");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (integration: Integration) => {
    try {
      const { error } = await supabase
        .from("location_integrations")
        .update({ is_enabled: !integration.is_enabled })
        .eq("id", integration.id);

      if (error) throw error;

      setIntegrations((prev) =>
        prev.map((item) =>
          item.id === integration.id ? { ...item, is_enabled: !item.is_enabled } : item
        )
      );
    } catch (error) {
      console.error("Error toggling integration:", error);
      toast.error("Błąd aktualizacji integracji");
    }
  };

  const handleProviderChange = async (integration: Integration, provider: string) => {
    try {
      const { error } = await supabase
        .from("location_integrations")
        .update({ provider })
        .eq("id", integration.id);

      if (error) throw error;

      setIntegrations((prev) =>
        prev.map((item) =>
          item.id === integration.id ? { ...item, provider } : item
        )
      );
    } catch (error) {
      console.error("Error updating provider:", error);
      toast.error("Błąd aktualizacji dostawcy");
    }
  };

  const handleVisibilityChange = async (
    integration: Integration,
    field: "visible_in_listings" | "visible_in_search" | "visible_in_map",
    value: boolean
  ) => {
    try {
      const { error } = await supabase
        .from("location_integrations")
        .update({ [field]: value })
        .eq("id", integration.id);

      if (error) throw error;

      setIntegrations((prev) =>
        prev.map((item) => (item.id === integration.id ? { ...item, [field]: value } : item))
      );
    } catch (error) {
      console.error("Error updating visibility:", error);
      toast.error("Błąd aktualizacji widoczności");
    }
  };

  const handleSaveApiKey = async (integration: Integration) => {
    const apiKey = apiKeyInputs[integration.integration_type];
    if (!apiKey) {
      toast.error("Wprowadź klucz API");
      return;
    }

    setSaving(true);
    try {
      const secretName = `${integration.integration_type.toUpperCase()}_API_KEY`;
      
      // Call edge function to save API key securely
      const { error } = await supabase.functions.invoke("location-integrations", {
        body: {
          action: "save_api_key",
          integration_type: integration.integration_type,
          api_key: apiKey,
          secret_name: secretName,
        },
      });

      if (error) throw error;

      // Update the local state with secret name reference
      setIntegrations((prev) =>
        prev.map((item) =>
          item.id === integration.id ? { ...item, api_key_secret_name: secretName, hasApiKey: true } : item
        )
      );

      setApiKeyInputs((prev) => ({ ...prev, [integration.integration_type]: "" }));
      setEditingApiKey((prev) => ({ ...prev, [integration.integration_type]: false }));
      
      // Refresh integrations
      await fetchIntegrations();
      
      toast.success("Klucz API zapisany bezpiecznie");
    } catch (error) {
      console.error("Error saving API key:", error);
      toast.error("Błąd zapisywania klucza API");
    } finally {
      setSaving(false);
    }
  };

  const getIntegrationData = (type: string): Integration | undefined => {
    return integrations.find((i) => i.integration_type === type);
  };

  const getConfig = (type: string): IntegrationConfig | undefined => {
    return INTEGRATION_CONFIGS.find((c) => c.type === type);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Integracje lokalizacji i otoczenia</h2>
        <p className="text-muted-foreground">
          Zarządzaj integracjami zewnętrznych usług lokalizacyjnych dla nieruchomości
        </p>
      </div>

      {/* Integration Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {INTEGRATION_CONFIGS.map((config) => {
          const integration = getIntegrationData(config.type);
          if (!integration) return null;

          const Icon = config.icon;

          return (
            <Card key={config.type} className={integration.is_enabled ? "border-primary/50" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${integration.is_enabled ? "bg-primary/10" : "bg-muted"}`}>
                      <Icon className={`h-5 w-5 ${integration.is_enabled ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{config.label}</CardTitle>
                      <CardDescription className="text-xs">{config.description}</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={integration.is_enabled}
                    onCheckedChange={() => handleToggleEnabled(integration)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Provider Select */}
                <div className="space-y-2">
                  <Label className="text-xs">Dostawca</Label>
                  <Select
                    value={integration.provider || ""}
                    onValueChange={(value) => handleProviderChange(integration, value)}
                    disabled={!integration.is_enabled}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Wybierz dostawcę" />
                    </SelectTrigger>
                    <SelectContent>
                      {config.providers.map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* API Key Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Klucz API</Label>
                    {integration.hasApiKey ? (
                      <Badge variant="outline" className="text-xs gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Skonfigurowany
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs gap-1">
                        <XCircle className="h-3 w-3 text-destructive" />
                        Brak
                      </Badge>
                    )}
                  </div>
                  
                  {editingApiKey[config.type] ? (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey[config.type] ? "text" : "password"}
                          placeholder="Wprowadź klucz API"
                          value={apiKeyInputs[config.type] || ""}
                          onChange={(e) =>
                            setApiKeyInputs((prev) => ({
                              ...prev,
                              [config.type]: e.target.value,
                            }))
                          }
                          className="h-9 pr-10"
                          disabled={!integration.is_enabled}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-9 px-3"
                          onClick={() =>
                            setShowApiKey((prev) => ({
                              ...prev,
                              [config.type]: !prev[config.type],
                            }))
                          }
                        >
                          {showApiKey[config.type] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        className="h-9"
                        onClick={() => handleSaveApiKey(integration)}
                        disabled={saving || !integration.is_enabled}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-9"
                      onClick={() =>
                        setEditingApiKey((prev) => ({
                          ...prev,
                          [config.type]: true,
                        }))
                      }
                      disabled={!integration.is_enabled}
                    >
                      <Key className="h-4 w-4 mr-2" />
                      {integration.hasApiKey ? "Zmień klucz" : "Dodaj klucz"}
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Visibility Options */}
                <div className="space-y-2">
                  <Label className="text-xs">Widoczność danych</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${config.type}-listings`}
                        checked={integration.visible_in_listings}
                        onCheckedChange={(checked) =>
                          handleVisibilityChange(integration, "visible_in_listings", checked === true)
                        }
                        disabled={!integration.is_enabled}
                      />
                      <Label htmlFor={`${config.type}-listings`} className="text-xs font-normal">
                        W ogłoszeniach
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${config.type}-search`}
                        checked={integration.visible_in_search}
                        onCheckedChange={(checked) =>
                          handleVisibilityChange(integration, "visible_in_search", checked === true)
                        }
                        disabled={!integration.is_enabled}
                      />
                      <Label htmlFor={`${config.type}-search`} className="text-xs font-normal">
                        W wyszukiwarce
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${config.type}-map`}
                        checked={integration.visible_in_map}
                        onCheckedChange={(checked) =>
                          handleVisibilityChange(integration, "visible_in_map", checked === true)
                        }
                        disabled={!integration.is_enabled}
                      />
                      <Label htmlFor={`${config.type}-map`} className="text-xs font-normal">
                        Na mapie
                      </Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Section */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Bezpieczeństwo kluczy API</h4>
              <p className="text-sm text-muted-foreground">
                Wszystkie klucze API są przechowywane bezpiecznie po stronie serwera i nigdy nie są 
                przesyłane do przeglądarki. Klucze są używane wyłącznie przez funkcje serwerowe 
                do pobierania danych z zewnętrznych API.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
