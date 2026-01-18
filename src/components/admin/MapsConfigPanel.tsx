// GetRido Maps - Admin Configuration Panel
import { useState, useEffect } from 'react';
import { useMapsConfig } from '@/hooks/useMapsConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Map, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

const STYLE_PRESETS = [
  { 
    name: 'CartoDB Voyager', 
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    description: 'Domyślny styl z kolorową mapą'
  },
  { 
    name: 'CartoDB Dark', 
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    description: 'Ciemny styl nocny'
  },
  { 
    name: 'CartoDB Light', 
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    description: 'Jasny minimalistyczny styl'
  },
];

export function MapsConfigPanel() {
  const { config, isLoading, updateConfig } = useMapsConfig();
  
  const [styleUrl, setStyleUrl] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [zoom, setZoom] = useState('');

  // Initialize form with current config
  useEffect(() => {
    if (!isLoading && config) {
      setStyleUrl(config.styleUrl);
      setCenterLat(String(config.defaultCenterLat));
      setCenterLng(String(config.defaultCenterLng));
      setZoom(String(config.defaultZoom));
    }
  }, [config, isLoading]);

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({
        styleUrl,
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
        {/* Map Style URL */}
        <div className="space-y-3">
          <Label htmlFor="styleUrl">Map Style URL</Label>
          <Input
            id="styleUrl"
            value={styleUrl}
            onChange={(e) => setStyleUrl(e.target.value)}
            placeholder="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
          />
          <p className="text-xs text-muted-foreground">
            URL do pliku stylu MapLibre/Mapbox GL (np. CartoDB, Stadia, własny styl)
          </p>
        </div>

        {/* Style Presets */}
        <div className="space-y-3">
          <Label>Gotowe style</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.url}
                onClick={() => handlePresetClick(preset.url)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  styleUrl === preset.url
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{preset.name}</span>
                  {styleUrl === preset.url && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>

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
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Centrum:</span>
              <span className="ml-2">{centerLat}, {centerLng}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Zoom:</span>
              <span className="ml-2">{zoom}</span>
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
