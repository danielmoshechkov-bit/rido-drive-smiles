// GetRido Maps - Admin Configuration Panel (Extended)
import { useState, useEffect } from 'react';
import { useMapsConfig } from '@/hooks/useMapsConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Map, Loader2, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const STYLE_PRESETS = [
  // RIDO Premium Styles (first)
  { 
    name: 'RIDO Light ✨', 
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    description: 'Premium jasny styl GetRido',
    isRido: true,
  },
  { 
    name: 'RIDO Dark ✨', 
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    description: 'Premium ciemny styl GetRido',
    isRido: true,
  },
  // Standard styles
  { 
    name: 'CartoDB Voyager', 
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    description: 'Kolorowa mapa z detalami'
  },
  { 
    name: 'Stadia OSM Bright', 
    url: 'https://tiles.stadiamaps.com/styles/osm_bright.json',
    description: 'Jasny styl OSM (wymaga API key)'
  },
  { 
    name: 'Stadia Alidade Smooth', 
    url: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
    description: 'Gładki pastelowy styl'
  },
  { 
    name: 'Stadia Alidade Dark', 
    url: 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json',
    description: 'Ciemny gładki styl'
  },
];

export function MapsConfigPanel() {
  const { config, isLoading, updateConfig } = useMapsConfig();
  
  const [styleUrl, setStyleUrl] = useState('');
  const [customStyleUrl, setCustomStyleUrl] = useState('');
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [zoom, setZoom] = useState('');

  // Initialize form with current config
  useEffect(() => {
    if (!isLoading && config) {
      const currentUrl = config.styleUrl;
      setStyleUrl(currentUrl);
      
      // Check if current URL is a preset
      const isPreset = STYLE_PRESETS.some(p => p.url === currentUrl);
      if (!isPreset && currentUrl) {
        setUseCustomUrl(true);
        setCustomStyleUrl(currentUrl);
      }
      
      setCenterLat(String(config.defaultCenterLat));
      setCenterLng(String(config.defaultCenterLng));
      setZoom(String(config.defaultZoom));
    }
  }, [config, isLoading]);

  const handleSave = async () => {
    const finalStyleUrl = useCustomUrl ? customStyleUrl : styleUrl;
    
    // Validate custom URL
    if (useCustomUrl && customStyleUrl) {
      try {
        new URL(customStyleUrl);
      } catch {
        toast.error('Nieprawidłowy URL stylu mapy');
        return;
      }
    }
    
    try {
      await updateConfig.mutateAsync({
        styleUrl: finalStyleUrl,
        defaultCenterLat: parseFloat(centerLat),
        defaultCenterLng: parseFloat(centerLng),
        defaultZoom: parseFloat(zoom),
      });
      toast.success('Konfiguracja mapy zapisana');
    } catch (error) {
      toast.error('Błąd podczas zapisywania konfiguracji');
    }
  };

  const handlePresetClick = (url: string) => {
    setStyleUrl(url);
    setUseCustomUrl(false);
  };

  const handleCustomUrlToggle = () => {
    setUseCustomUrl(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const activeStyleUrl = useCustomUrl ? customStyleUrl : styleUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Konfiguracja modułu GetRido Maps
        </CardTitle>
        <CardDescription>
          Zmień wygląd i domyślne ustawienia mapy bez potrzeby ponownego wdrożenia
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Style Presets */}
        <div className="space-y-3">
          <Label>Wybierz styl mapy</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.url}
                onClick={() => handlePresetClick(preset.url)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  !useCustomUrl && styleUrl === preset.url
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{preset.name}</span>
                  {!useCustomUrl && styleUrl === preset.url && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
              </button>
            ))}
            
            {/* Custom URL option */}
            <button
              onClick={handleCustomUrlToggle}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                useCustomUrl
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-dashed border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">Własny URL</span>
                {useCustomUrl && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground">Użyj własnego stylu MapLibre</p>
            </button>
          </div>
        </div>

        {/* Custom URL Input */}
        {useCustomUrl && (
          <div className="space-y-2 p-4 bg-muted/30 rounded-lg border">
            <Label htmlFor="customStyleUrl">Własny URL stylu mapy</Label>
            <Input
              id="customStyleUrl"
              value={customStyleUrl}
              onChange={(e) => setCustomStyleUrl(e.target.value)}
              placeholder="https://example.com/style.json"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              URL do pliku stylu MapLibre/Mapbox GL (format .json)
              <a 
                href="https://maplibre.org/maplibre-style-spec/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Dokumentacja <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        )}

        {/* Default Center */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="centerLat">Domyślna szerokość geog. (lat)</Label>
            <Input
              id="centerLat"
              type="number"
              step="0.0001"
              value={centerLat}
              onChange={(e) => setCenterLat(e.target.value)}
              placeholder="52.2297"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="centerLng">Domyślna długość geog. (lng)</Label>
            <Input
              id="centerLng"
              type="number"
              step="0.0001"
              value={centerLng}
              onChange={(e) => setCenterLng(e.target.value)}
              placeholder="21.0122"
            />
          </div>
        </div>

        {/* Default Zoom */}
        <div className="space-y-2">
          <Label htmlFor="zoom">Domyślny zoom (1-20)</Label>
          <Input
            id="zoom"
            type="number"
            min="1"
            max="20"
            step="0.5"
            value={zoom}
            onChange={(e) => setZoom(e.target.value)}
            placeholder="11.5"
          />
          <p className="text-xs text-muted-foreground">
            Poziom przybliżenia mapy przy pierwszym załadowaniu (1 = cały świat, 20 = detale ulicy)
          </p>
        </div>

        {/* Current Config Preview */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <div className="flex items-center gap-2 mb-3">
            <Map className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Podgląd aktualnych ustawień</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Centrum:</span>
              <span className="ml-2 font-mono">{centerLat}, {centerLng}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Zoom:</span>
              <span className="ml-2 font-mono">{zoom}</span>
            </div>
            <div className="md:col-span-2">
              <span className="text-muted-foreground">Styl:</span>
              <span className="ml-2 font-mono text-xs break-all">{activeStyleUrl || 'Domyślny'}</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={handleSave} 
            disabled={updateConfig.isPending}
            className="gap-2"
          >
            {updateConfig.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Zapisywanie...
              </>
            ) : (
              'Zapisz zmiany'
            )}
          </Button>
          <Badge variant="outline" className="text-xs">
            Zmiany będą widoczne po odświeżeniu mapy
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
