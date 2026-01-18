// GetRido Maps - Admin Map Style Editor Panel
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Palette, Sun, Moon, RotateCcw, Eye } from 'lucide-react';

interface StyleOverrides {
  background: string;
  roadsMinor: string;
  roadsMajor: string;
  buildings: string;
  parks: string;
  water: string;
  boundaries: string;
  labels: string;
  routeMain: string;
  routeAlt: string;
}

const DEFAULT_LIGHT: StyleOverrides = {
  background: '#F9F7FF',
  roadsMinor: '#E5E0F5',
  roadsMajor: '#D0C8E8',
  buildings: '#EDE8F5',
  parks: '#D4E8D4',
  water: '#C5D8F0',
  boundaries: '#BFBFBF',
  labels: '#1A103D',
  routeMain: '#7c3aed',
  routeAlt: '#a78bfa',
};

const DEFAULT_DARK: StyleOverrides = {
  background: '#0f0a1a',
  roadsMinor: '#2D2640',
  roadsMajor: '#3D3560',
  buildings: '#1F1A30',
  parks: '#1A2E1A',
  water: '#0A1525',
  boundaries: '#4A4A4A',
  labels: '#f8fafc',
  routeMain: '#8b5cf6',
  routeAlt: '#a78bfa',
};

const STYLE_LABELS: Record<keyof StyleOverrides, string> = {
  background: 'Tło mapy',
  roadsMinor: 'Małe drogi',
  roadsMajor: 'Główne drogi',
  buildings: 'Budynki',
  parks: 'Parki / Zieleń',
  water: 'Woda',
  boundaries: 'Granice',
  labels: 'Etykiety / Tekst',
  routeMain: 'Trasa główna',
  routeAlt: 'Trasa alternatywna',
};

export function MapStyleEditorPanel() {
  const queryClient = useQueryClient();
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>('light');
  const [lightStyles, setLightStyles] = useState<StyleOverrides>(DEFAULT_LIGHT);
  const [darkStyles, setDarkStyles] = useState<StyleOverrides>(DEFAULT_DARK);

  // Fetch current config
  const { data: config, isLoading } = useQuery({
    queryKey: ['maps-config-styles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maps_config')
        .select('style_overrides_light, style_overrides_dark')
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  useEffect(() => {
    if (config) {
      if (config.style_overrides_light) {
        setLightStyles({ ...DEFAULT_LIGHT, ...(config.style_overrides_light as unknown as StyleOverrides) });
      }
      if (config.style_overrides_dark) {
        setDarkStyles({ ...DEFAULT_DARK, ...(config.style_overrides_dark as unknown as StyleOverrides) });
      }
    }
  }, [config]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase
        .from('maps_config')
        .select('id')
        .limit(1)
        .single();

      const payload = {
        style_overrides_light: lightStyles as any,
        style_overrides_dark: darkStyles as any,
      };

      if (existing) {
        const { error } = await supabase
          .from('maps_config')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('maps_config')
          .insert([{ config_key: 'global', config_value: 'default', ...payload }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps-config-styles'] });
      queryClient.invalidateQueries({ queryKey: ['maps-config'] });
      toast.success('Style mapy zapisane! Odśwież mapę aby zobaczyć zmiany.');
    },
    onError: () => toast.error('Błąd zapisu'),
  });

  const handleColorChange = (key: keyof StyleOverrides, value: string) => {
    if (activeTheme === 'light') {
      setLightStyles(prev => ({ ...prev, [key]: value }));
    } else {
      setDarkStyles(prev => ({ ...prev, [key]: value }));
    }
  };

  const handleReset = () => {
    if (activeTheme === 'light') {
      setLightStyles(DEFAULT_LIGHT);
    } else {
      setDarkStyles(DEFAULT_DARK);
    }
    toast.info('Przywrócono domyślne kolory');
  };

  const currentStyles = activeTheme === 'light' ? lightStyles : darkStyles;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Edytor stylów mapy
          </CardTitle>
          <CardDescription>
            Dostosuj kolory elementów mapy GetRido bez konieczności wdrażania zmian w kodzie
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTheme} onValueChange={(v) => setActiveTheme(v as 'light' | 'dark')}>
            <div className="flex items-center justify-between mb-6">
              <TabsList>
                <TabsTrigger value="light" className="gap-2">
                  <Sun className="h-4 w-4" />
                  Tryb jasny
                </TabsTrigger>
                <TabsTrigger value="dark" className="gap-2">
                  <Moon className="h-4 w-4" />
                  Tryb ciemny
                </TabsTrigger>
              </TabsList>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>
            </div>

            <TabsContent value="light" className="mt-0">
              <StyleEditor styles={lightStyles} onChange={(k, v) => handleColorChange(k, v)} theme="light" />
            </TabsContent>
            <TabsContent value="dark" className="mt-0">
              <StyleEditor styles={darkStyles} onChange={(k, v) => handleColorChange(k, v)} theme="dark" />
            </TabsContent>
          </Tabs>

          <div className="flex justify-end pt-6 border-t mt-6">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Zapisz style
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Podgląd kolorów
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className="rounded-lg p-6 border relative overflow-hidden"
            style={{ backgroundColor: currentStyles.background }}
          >
            {/* Simulated map preview */}
            <div className="space-y-3">
              {/* Roads */}
              <div className="flex gap-2 items-center">
                <div className="h-2 flex-1 rounded" style={{ backgroundColor: currentStyles.roadsMajor }} />
                <span className="text-xs" style={{ color: currentStyles.labels }}>Główna droga</span>
              </div>
              <div className="flex gap-2 items-center">
                <div className="h-1.5 flex-1 rounded" style={{ backgroundColor: currentStyles.roadsMinor }} />
                <span className="text-xs" style={{ color: currentStyles.labels }}>Mała droga</span>
              </div>
              
              {/* Buildings and parks */}
              <div className="flex gap-3 mt-4">
                <div 
                  className="w-16 h-12 rounded" 
                  style={{ backgroundColor: currentStyles.buildings }}
                />
                <div 
                  className="w-20 h-12 rounded" 
                  style={{ backgroundColor: currentStyles.parks }}
                />
                <div 
                  className="w-14 h-12 rounded" 
                  style={{ backgroundColor: currentStyles.water }}
                />
              </div>
              
              {/* Routes */}
              <div className="flex gap-2 items-center mt-4">
                <div className="h-3 w-32 rounded-full" style={{ backgroundColor: currentStyles.routeMain }} />
                <span className="text-xs" style={{ color: currentStyles.labels }}>Trasa</span>
              </div>
              <div className="flex gap-2 items-center">
                <div 
                  className="h-2 w-24 rounded-full opacity-60" 
                  style={{ backgroundColor: currentStyles.routeAlt, borderStyle: 'dashed' }} 
                />
                <span className="text-xs opacity-60" style={{ color: currentStyles.labels }}>Alternatywa</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Style Editor Grid Component
function StyleEditor({ 
  styles, 
  onChange, 
  theme 
}: { 
  styles: StyleOverrides; 
  onChange: (key: keyof StyleOverrides, value: string) => void;
  theme: 'light' | 'dark';
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {(Object.keys(styles) as Array<keyof StyleOverrides>).map((key) => (
        <div key={key} className="space-y-2">
          <Label htmlFor={`${theme}-${key}`} className="text-xs">
            {STYLE_LABELS[key]}
          </Label>
          <div className="flex items-center gap-2">
            <div 
              className="h-8 w-8 rounded border flex-shrink-0 cursor-pointer relative overflow-hidden"
              style={{ backgroundColor: styles[key] }}
            >
              <Input
                id={`${theme}-${key}`}
                type="color"
                value={styles[key]}
                onChange={(e) => onChange(key, e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
              />
            </div>
            <Input
              value={styles[key]}
              onChange={(e) => onChange(key, e.target.value)}
              className="h-8 text-xs font-mono"
              placeholder="#FFFFFF"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default MapStyleEditorPanel;
