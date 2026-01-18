// GetRido Maps - Configuration Hook
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MapsConfig {
  styleUrl: string;
  defaultCenterLat: number;
  defaultCenterLng: number;
  defaultZoom: number;
}

const DEFAULT_CONFIG: MapsConfig = {
  styleUrl: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  defaultCenterLat: 52.2297,
  defaultCenterLng: 21.0122,
  defaultZoom: 11.5,
};

export function useMapsConfig() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['maps-config'],
    queryFn: async (): Promise<MapsConfig> => {
      const { data, error } = await supabase
        .from('maps_config')
        .select('config_key, config_value');

      if (error) {
        console.error('[useMapsConfig] Error fetching config:', error);
        return DEFAULT_CONFIG;
      }

      if (!data || data.length === 0) {
        return DEFAULT_CONFIG;
      }

      const configMap = Object.fromEntries(
        data.map(row => [row.config_key, row.config_value])
      );

      return {
        styleUrl: configMap.style_url || DEFAULT_CONFIG.styleUrl,
        defaultCenterLat: parseFloat(configMap.default_center_lat) || DEFAULT_CONFIG.defaultCenterLat,
        defaultCenterLng: parseFloat(configMap.default_center_lng) || DEFAULT_CONFIG.defaultCenterLng,
        defaultZoom: parseFloat(configMap.default_zoom) || DEFAULT_CONFIG.defaultZoom,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Partial<MapsConfig>) => {
      const entries: { config_key: string; config_value: string }[] = [];
      
      if (updates.styleUrl !== undefined) {
        entries.push({ config_key: 'style_url', config_value: updates.styleUrl });
      }
      if (updates.defaultCenterLat !== undefined) {
        entries.push({ config_key: 'default_center_lat', config_value: String(updates.defaultCenterLat) });
      }
      if (updates.defaultCenterLng !== undefined) {
        entries.push({ config_key: 'default_center_lng', config_value: String(updates.defaultCenterLng) });
      }
      if (updates.defaultZoom !== undefined) {
        entries.push({ config_key: 'default_zoom', config_value: String(updates.defaultZoom) });
      }

      for (const entry of entries) {
        const { error } = await supabase
          .from('maps_config')
          .upsert(entry, { onConflict: 'config_key' });
        
        if (error) {
          console.error('[useMapsConfig] Error updating config:', error);
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps-config'] });
    },
  });

  return {
    config: config || DEFAULT_CONFIG,
    isLoading,
    updateConfig,
  };
}
