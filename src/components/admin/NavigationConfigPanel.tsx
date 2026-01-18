// GetRido Maps - Admin Navigation Configuration Panel
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Volume2, Mic, Gauge, Loader2, Check, Trash2, Plus, RotateCw } from 'lucide-react';
import { toast } from 'sonner';

interface NavigationDefaults {
  voice_enabled: boolean;
  voice_language: string;
  speed_warning_yellow_over: number;
  speed_warning_red_over: number;
  show_speed_limit: boolean;
  show_lane_guidance: boolean;
  show_roundabout_exit: boolean;
}

interface VoiceCatalogEntry {
  id: string;
  code: string;
  language: string;
  name: string;
  provider: string;
  is_active: boolean;
  is_premium: boolean;
}

const DEFAULT_NAV_SETTINGS: NavigationDefaults = {
  voice_enabled: true,
  voice_language: 'pl',
  speed_warning_yellow_over: 9,
  speed_warning_red_over: 15,
  show_speed_limit: true,
  show_lane_guidance: true,
  show_roundabout_exit: true,
};

export function NavigationConfigPanel() {
  const queryClient = useQueryClient();
  
  // State for defaults
  const [defaults, setDefaults] = useState<NavigationDefaults>(DEFAULT_NAV_SETTINGS);
  
  // Fetch current defaults
  const { data: configData, isLoading: loadingConfig } = useQuery({
    queryKey: ['nav-config-defaults'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maps_config')
        .select('config_value')
        .eq('config_key', 'navigation_defaults')
        .maybeSingle();

      if (error) throw error;
      
      if (data?.config_value) {
        try {
          return { ...DEFAULT_NAV_SETTINGS, ...JSON.parse(data.config_value) };
        } catch {
          return DEFAULT_NAV_SETTINGS;
        }
      }
      return DEFAULT_NAV_SETTINGS;
    },
  });

  // Fetch voice catalog
  const { data: voices, isLoading: loadingVoices } = useQuery({
    queryKey: ['voice-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('map_voice_catalog')
        .select('*')
        .order('language', { ascending: true });

      if (error) throw error;
      return (data || []) as VoiceCatalogEntry[];
    },
  });

  // Update form when data loads
  useEffect(() => {
    if (configData) {
      setDefaults(configData);
    }
  }, [configData]);

  // Save defaults mutation
  const saveDefaultsMutation = useMutation({
    mutationFn: async (newDefaults: NavigationDefaults) => {
      const { error } = await supabase
        .from('maps_config')
        .upsert({
          config_key: 'navigation_defaults',
          config_value: JSON.stringify(newDefaults),
        }, {
          onConflict: 'config_key',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nav-config-defaults'] });
      toast.success('Ustawienia domyślne zapisane');
    },
    onError: () => {
      toast.error('Błąd podczas zapisywania');
    },
  });

  // Toggle voice active mutation
  const toggleVoiceMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('map_voice_catalog')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-catalog'] });
    },
  });

  const handleSaveDefaults = () => {
    saveDefaultsMutation.mutate(defaults);
  };

  if (loadingConfig || loadingVoices) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Defaults Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Globalne ustawienia domyślne
          </CardTitle>
          <CardDescription>
            Te ustawienia będą stosowane dla nowych użytkowników lub gdy użytkownik nie ma własnych preferencji
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Voice Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="voice-enabled">Głos włączony domyślnie</Label>
                <Switch
                  id="voice-enabled"
                  checked={defaults.voice_enabled}
                  onCheckedChange={(checked) => setDefaults(d => ({ ...d, voice_enabled: checked }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Domyślny język głosu</Label>
                <Select
                  value={defaults.voice_language}
                  onValueChange={(value) => setDefaults(d => ({ ...d, voice_language: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pl">Polski</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ru">Русский</SelectItem>
                    <SelectItem value="uk">Українська</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-speed">Pokaż limit prędkości</Label>
                <Switch
                  id="show-speed"
                  checked={defaults.show_speed_limit}
                  onCheckedChange={(checked) => setDefaults(d => ({ ...d, show_speed_limit: checked }))}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="show-lanes">Pokaż podpowiedzi pasów</Label>
                <Switch
                  id="show-lanes"
                  checked={defaults.show_lane_guidance}
                  onCheckedChange={(checked) => setDefaults(d => ({ ...d, show_lane_guidance: checked }))}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="show-roundabout">Pokaż zjazdy z ronda</Label>
                <Switch
                  id="show-roundabout"
                  checked={defaults.show_roundabout_exit}
                  onCheckedChange={(checked) => setDefaults(d => ({ ...d, show_roundabout_exit: checked }))}
                />
              </div>
            </div>
          </div>

          {/* Speed Warning Thresholds */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="h-4 w-4" />
              <Label className="text-base font-medium">Progi ostrzeżeń prędkości</Label>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="yellow-threshold">
                  Próg żółty: <span className="font-bold text-amber-500">+{defaults.speed_warning_yellow_over} km/h</span>
                </Label>
                <Slider
                  id="yellow-threshold"
                  value={[defaults.speed_warning_yellow_over]}
                  onValueChange={([v]) => setDefaults(d => ({ ...d, speed_warning_yellow_over: v }))}
                  min={1}
                  max={20}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Ostrzeżenie żółte gdy prędkość przekroczy limit o tę wartość
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="red-threshold">
                  Próg czerwony: <span className="font-bold text-red-500">+{defaults.speed_warning_red_over} km/h</span>
                </Label>
                <Slider
                  id="red-threshold"
                  value={[defaults.speed_warning_red_over]}
                  onValueChange={([v]) => setDefaults(d => ({ ...d, speed_warning_red_over: v }))}
                  min={5}
                  max={30}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Ostrzeżenie czerwone + toast gdy prędkość przekroczy limit o tę wartość
                </p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-4 pt-4">
            <Button
              onClick={handleSaveDefaults}
              disabled={saveDefaultsMutation.isPending}
              className="gap-2"
            >
              {saveDefaultsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Zapisywanie...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Zapisz domyślne
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Voice Catalog Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Katalog głosów
          </CardTitle>
          <CardDescription>
            Zarządzaj dostępnymi głosami nawigacji. Głosy systemowe wykorzystują Web Speech API przeglądarki.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {voices?.map((voice) => (
              <div
                key={voice.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">{voice.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {voice.code} · {voice.provider}
                    </p>
                  </div>
                  {voice.is_premium && (
                    <Badge variant="secondary" className="text-xs">
                      Premium
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={voice.is_active ? 'default' : 'outline'}>
                    {voice.is_active ? 'Aktywny' : 'Wyłączony'}
                  </Badge>
                  <Switch
                    checked={voice.is_active}
                    onCheckedChange={(checked) => 
                      toggleVoiceMutation.mutate({ id: voice.id, is_active: checked })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
            <RotateCw className="h-3 w-3" />
            Głosy premium (ElevenLabs, Google TTS) będą dostępne w przyszłych wersjach
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
