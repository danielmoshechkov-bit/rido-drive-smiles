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
  Loader2,
  Info,
  Settings,
  AlertTriangle,
  Server
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
  providers: { value: string; label: string; usesGoogleApi?: boolean }[];
  requiresGoogleApi?: boolean;
}

const INTEGRATION_CONFIGS: IntegrationConfig[] = [
  {
    type: "maps",
    label: "Mapy",
    description: "Wyświetlanie lokalizacji na mapie",
    icon: Map,
    providers: [
      { value: "openstreetmap", label: "OpenStreetMap" },
      { value: "google_maps", label: "Google Maps", usesGoogleApi: true },
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
    description: "Przystanki i ocena komunikacji (Google Places API)",
    icon: Bus,
    requiresGoogleApi: true,
    providers: [
      { value: "google_places", label: "Google Places API", usesGoogleApi: true },
      { value: "gtfs", label: "GTFS (lokalne)" },
    ],
  },
  {
    type: "traffic",
    label: "Natężenie ruchu",
    description: "Czas dojazdu i natężenie (Google Distance Matrix)",
    icon: Car,
    requiresGoogleApi: true,
    providers: [
      { value: "google_traffic", label: "Google Distance Matrix", usesGoogleApi: true },
      { value: "here", label: "HERE" },
      { value: "tomtom", label: "TomTom" },
    ],
  },
  {
    type: "poi",
    label: "Punkty POI",
    description: "Sklepy, szkoły, restauracje (Google Places API)",
    icon: MapPin,
    requiresGoogleApi: true,
    providers: [
      { value: "google_places", label: "Google Places API", usesGoogleApi: true },
      { value: "openstreetmap", label: "OpenStreetMap" },
      { value: "foursquare", label: "Foursquare" },
    ],
  },
];

export function LocationIntegrationsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);
  const [editingGoogleKey, setEditingGoogleKey] = useState(false);
  const [hasGoogleApiKey, setHasGoogleApiKey] = useState(false);
  const [savingGoogleKey, setSavingGoogleKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"success" | "error" | null>(null);
  
  // Backend/POI API key state
  const [googlePlacesApiKey, setGooglePlacesApiKey] = useState("");
  const [showGooglePlacesApiKey, setShowGooglePlacesApiKey] = useState(false);
  const [editingPlacesKey, setEditingPlacesKey] = useState(false);
  const [hasGooglePlacesApiKey, setHasGooglePlacesApiKey] = useState(false);
  const [savingPlacesKey, setSavingPlacesKey] = useState(false);
  const [testingPoiConnection, setTestingPoiConnection] = useState(false);
  const [poiConnectionStatus, setPoiConnectionStatus] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    fetchIntegrations();
    checkGoogleApiKey();
  }, []);

  const checkGoogleApiKey = async () => {
    try {
      // Check if any integration has Google API configured
      const { data } = await supabase
        .from("location_integrations")
        .select("api_key_secret_name, config")
        .or("provider.eq.google_places,provider.eq.google_maps,provider.eq.google_traffic")
        .limit(1);

      if (data && data.length > 0) {
        const config = data[0]?.config as Record<string, unknown> | null;
        // Check for frontend key
        if (data[0]?.api_key_secret_name || config?.google_api_key) {
          setHasGoogleApiKey(true);
        }
        // Check for backend/POI key
        if (config?.google_places_api_key) {
          setHasGooglePlacesApiKey(true);
        }
      }
    } catch (error) {
      console.error("Error checking Google API key:", error);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from("location_integrations")
        .select("*")
        .order("integration_type");

      if (error) throw error;

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

  const handleSaveGoogleApiKey = async () => {
    if (!googleApiKey.trim()) {
      toast.error("Wprowadź klucz Google API");
      return;
    }

    setSavingGoogleKey(true);
    try {
      // Save to all Google-based integrations
      const googleIntegrationTypes = ["public_transport", "traffic", "poi"];
      
      for (const intType of googleIntegrationTypes) {
        const integration = integrations.find(i => i.integration_type === intType);
        if (integration) {
          // Update the config to store the API key reference
          const { error } = await supabase
            .from("location_integrations")
            .update({ 
              api_key_secret_name: "GOOGLE_API_KEY",
              config: { 
                ...integration.config,
                google_api_key: googleApiKey 
              },
              updated_at: new Date().toISOString()
            })
            .eq("id", integration.id);

          if (error) throw error;
        }
      }

      setHasGoogleApiKey(true);
      setGoogleApiKey("");
      setEditingGoogleKey(false);
      await fetchIntegrations();
      toast.success("Klucz Google API zapisany pomyślnie");
    } catch (error) {
      console.error("Error saving Google API key:", error);
      toast.error("Błąd zapisywania klucza API");
    } finally {
      setSavingGoogleKey(false);
    }
  };

  const handleTestGoogleConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      // Test the connection by making a simple request
      const { data, error } = await supabase.functions.invoke("google-location-data", {
        body: {
          action: "transit",
          latitude: 50.0647,
          longitude: 19.9450,
          radius: 300
        }
      });

      if (error) throw error;

      if (data && !data.mock) {
        setConnectionStatus("success");
        toast.success("Połączenie z Google API działa poprawnie!");
      } else if (data?.mock) {
        setConnectionStatus("error");
        toast.error("Klucz API nie jest skonfigurowany lub jest nieprawidłowy");
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      setConnectionStatus("error");
      toast.error("Test połączenia nie powiódł się");
    } finally {
      setTestingConnection(false);
    }
  };

  // Save backend/POI API key
  const handleSaveGooglePlacesApiKey = async () => {
    if (!googlePlacesApiKey.trim()) {
      toast.error("Wprowadź klucz Google Places API");
      return;
    }

    setSavingPlacesKey(true);
    try {
      // Save to the google_places integration config
      const integration = integrations.find(i => i.integration_type === "poi" || i.provider === "google_places");
      if (integration) {
        const { error } = await supabase
          .from("location_integrations")
          .update({ 
            config: { 
              ...integration.config,
              google_places_api_key: googlePlacesApiKey 
            },
            updated_at: new Date().toISOString()
          })
          .eq("id", integration.id);

        if (error) throw error;
      } else {
        // Create new entry if doesn't exist
        const { error } = await supabase
          .from("location_integrations")
          .upsert({
            integration_type: "poi",
            provider: "google_places",
            is_enabled: true,
            config: { google_places_api_key: googlePlacesApiKey }
          }, { onConflict: "integration_type" });

        if (error) throw error;
      }

      setHasGooglePlacesApiKey(true);
      setGooglePlacesApiKey("");
      setEditingPlacesKey(false);
      await fetchIntegrations();
      toast.success("Klucz Google Places API (backend) zapisany pomyślnie");
    } catch (error) {
      console.error("Error saving Google Places API key:", error);
      toast.error("Błąd zapisywania klucza API");
    } finally {
      setSavingPlacesKey(false);
    }
  };

  // Test POI connection
  const handleTestPoiConnection = async () => {
    setTestingPoiConnection(true);
    setPoiConnectionStatus(null);

    try {
      const { data, error } = await supabase.functions.invoke("google-location-data", {
        body: {
          action: "poi",
          latitude: 52.2297,
          longitude: 21.0122,
          radius: 500,
          categories: ["grocery"]
        }
      });

      if (error) throw error;

      console.log("POI test result:", data);

      if (data && !data.mock && data.categories?.grocery?.count > 0) {
        setPoiConnectionStatus("success");
        toast.success(`POI działa! Znaleziono ${data.categories.grocery.count} sklepów w promieniu 500m od centrum Warszawy`);
      } else if (data?.mock) {
        setPoiConnectionStatus("error");
        toast.error("Klucz API backend nie jest skonfigurowany");
      } else if (data?.categories?.grocery?.count === 0) {
        setPoiConnectionStatus("error");
        toast.error("Klucz API ma nieprawidłowe ograniczenia. Zmień na 'None' lub 'IP addresses' w Google Cloud Console.");
      }
    } catch (error) {
      console.error("POI connection test failed:", error);
      setPoiConnectionStatus("error");
      toast.error("Test połączenia POI nie powiódł się");
    } finally {
      setTestingPoiConnection(false);
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

  const getIntegrationData = (type: string): Integration | undefined => {
    return integrations.find((i) => i.integration_type === type);
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

      {/* Google API Key Card - Main configuration */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Klucz Google API</CardTitle>
                <CardDescription>
                  Jeden klucz dla: Places API, Distance Matrix API, Geocoding API
                </CardDescription>
              </div>
            </div>
            {hasGoogleApiKey ? (
              <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/30">
                <CheckCircle2 className="h-3 w-3" />
                Skonfigurowany
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/30">
                <XCircle className="h-3 w-3" />
                Brak klucza
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Wymagane API w Google Cloud Console:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>Places API (New) - przystanki i POI</li>
                  <li>Distance Matrix API - natężenie ruchu i czas dojazdu</li>
                  <li>Geocoding API - określanie centrum miasta</li>
                </ul>
              </div>
            </div>
          </div>

          {editingGoogleKey ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showGoogleApiKey ? "text" : "password"}
                  placeholder="Wprowadź klucz Google API"
                  value={googleApiKey}
                  onChange={(e) => setGoogleApiKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-10 px-3"
                  onClick={() => setShowGoogleApiKey(!showGoogleApiKey)}
                >
                  {showGoogleApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={handleSaveGoogleApiKey} disabled={savingGoogleKey}>
                {savingGoogleKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
              <Button variant="outline" onClick={() => setEditingGoogleKey(false)}>
                Anuluj
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditingGoogleKey(true)}
              >
                <Key className="h-4 w-4 mr-2" />
                {hasGoogleApiKey ? "Zmień klucz Google API" : "Dodaj klucz Google API"}
              </Button>
              {hasGoogleApiKey && (
                <Button
                  variant="secondary"
                  onClick={handleTestGoogleConnection}
                  disabled={testingConnection}
                >
                  {testingConnection ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : connectionStatus === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                  ) : connectionStatus === "error" ? (
                    <XCircle className="h-4 w-4 text-destructive mr-2" />
                  ) : null}
                  Testuj połączenie
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Places API Key for Backend/POI - Separate key for Edge Functions */}
      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Server className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Klucz Google Places API (Backend/POI)</CardTitle>
                <CardDescription>
                  Dedykowany klucz dla punktów POI: sklepy, szkoły, apteki, restauracje
                </CardDescription>
              </div>
            </div>
            {hasGooglePlacesApiKey ? (
              <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/30">
                <CheckCircle2 className="h-3 w-3" />
                Skonfigurowany
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
                <AlertTriangle className="h-3 w-3" />
                Brak klucza backend
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Warning about key restrictions */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">⚠️ Ważne: Ograniczenia klucza API</p>
                <p className="text-xs mb-2">
                  Ten klucz jest używany przez Edge Functions (serwer). Klucz z ograniczeniem "HTTP referrers" 
                  <strong> NIE zadziała</strong> i zawsze zwróci 0 wyników.
                </p>
                <p className="text-xs font-medium">
                  W Google Cloud Console ustaw: Application restrictions → <strong>"None"</strong> lub <strong>"IP addresses"</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Wymagane API dla tego klucza:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>Places API (New) - punkty POI</li>
                  <li>Distance Matrix API - czas dojazdu</li>
                  <li>Geocoding API - geokodowanie</li>
                </ul>
                <p className="mt-2 text-xs opacity-80">
                  Możesz użyć tego samego klucza co powyżej, jeśli ma odpowiednie ograniczenia (nie "HTTP referrers").
                </p>
              </div>
            </div>
          </div>

          {editingPlacesKey ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showGooglePlacesApiKey ? "text" : "password"}
                  placeholder="Wprowadź klucz Google Places API (backend)"
                  value={googlePlacesApiKey}
                  onChange={(e) => setGooglePlacesApiKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-10 px-3"
                  onClick={() => setShowGooglePlacesApiKey(!showGooglePlacesApiKey)}
                >
                  {showGooglePlacesApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={handleSaveGooglePlacesApiKey} disabled={savingPlacesKey}>
                {savingPlacesKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
              <Button variant="outline" onClick={() => setEditingPlacesKey(false)}>
                Anuluj
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditingPlacesKey(true)}
              >
                <Key className="h-4 w-4 mr-2" />
                {hasGooglePlacesApiKey ? "Zmień klucz backend/POI" : "Dodaj klucz backend/POI"}
              </Button>
              {hasGooglePlacesApiKey && (
                <Button
                  variant="secondary"
                  onClick={handleTestPoiConnection}
                  disabled={testingPoiConnection}
                >
                  {testingPoiConnection ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : poiConnectionStatus === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                  ) : poiConnectionStatus === "error" ? (
                    <XCircle className="h-4 w-4 text-destructive mr-2" />
                  ) : (
                    <MapPin className="h-4 w-4 mr-2" />
                  )}
                  Testuj POI
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Integration Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {INTEGRATION_CONFIGS.map((config) => {
          const integration = getIntegrationData(config.type);
          if (!integration) return null;

          const Icon = config.icon;
          const selectedProvider = config.providers.find(p => p.value === integration.provider);
          const usesGoogleApi = selectedProvider?.usesGoogleApi || config.requiresGoogleApi;

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
                          <div className="flex items-center gap-2">
                            {provider.label}
                            {provider.usesGoogleApi && (
                              <Badge variant="secondary" className="text-xs py-0 px-1">Google</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Google API Status for Google-based providers */}
                {usesGoogleApi && (
                  <div className="flex items-center gap-2 text-xs">
                    {hasGoogleApiKey ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="text-muted-foreground">Używa wspólnego klucza Google API</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 text-destructive" />
                        <span className="text-destructive">Wymaga klucza Google API</span>
                      </>
                    )}
                  </div>
                )}

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
