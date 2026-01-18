// GetRido Maps - Navigation Settings Hook
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { VoiceLanguage } from './voicePhrases';

export type NavigationStyle = 'banner' | 'bubble' | 'premium3d';
export type VoiceMode = 'off' | 'alerts' | 'all';
export type CursorStyle = 'arrow' | 'car';
export type ThemePreference = 'light' | 'dark' | 'auto';

export type EtaDisplayMode = 'remaining' | 'arrival';
export type GpsUpdateMode = 'normal' | 'aggressive';

export interface NavigationSettings {
  voice_enabled: boolean;
  voice_language: VoiceLanguage;
  voice_style: string;
  voice_volume: number;
  voice_rate: number;
  voice_mode: VoiceMode;
  speed_warning_yellow_over: number;
  speed_warning_red_over: number;
  show_speed_limit: boolean;
  show_lane_guidance: boolean;
  show_roundabout_exit: boolean;
  navigation_style: NavigationStyle;
  avoid_tolls: boolean;
  avoid_unpaved: boolean;
  cursor_style: CursorStyle;
  theme_preference: ThemePreference;
  // NEW GPS settings (like Yandex/Google/Apple)
  auto_zoom: boolean;
  north_up: boolean;
  eta_display: EtaDisplayMode;
  speed_camera_alerts: boolean;
  gps_mode: GpsUpdateMode;
}

const DEFAULT_SETTINGS: NavigationSettings = {
  voice_enabled: true,
  voice_language: 'pl',
  voice_style: 'system',
  voice_volume: 80,
  voice_rate: 1.0,
  voice_mode: 'all',
  speed_warning_yellow_over: 9,
  speed_warning_red_over: 15,
  show_speed_limit: true,
  show_lane_guidance: true,
  show_roundabout_exit: true,
  navigation_style: 'banner',
  avoid_tolls: false,
  avoid_unpaved: false,
  cursor_style: 'arrow',
  theme_preference: 'auto',
  // NEW GPS settings defaults
  auto_zoom: true,
  north_up: false,
  eta_display: 'remaining',
  speed_camera_alerts: true,
  gps_mode: 'aggressive',
};

// Local storage key for offline fallback
const STORAGE_KEY = 'rido_nav_settings';

function loadFromStorage(): NavigationSettings | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveToStorage(settings: NavigationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export function useNavigationSettings() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  // Fetch settings from Supabase
  const { data: dbSettings, isLoading } = useQuery({
    queryKey: ['nav-settings', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('map_navigation_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('[NavSettings] Fetch error:', error);
        return null;
      }
      
      return data;
    },
    enabled: !!userId,
  });

  // Merge DB settings with defaults
  const settings: NavigationSettings = {
    ...DEFAULT_SETTINGS,
    ...(dbSettings || loadFromStorage() || {}),
    voice_language: (dbSettings?.voice_language || loadFromStorage()?.voice_language || 'pl') as VoiceLanguage,
  };

  // Save to local storage whenever settings change
  useEffect(() => {
    if (dbSettings) {
      saveToStorage(settings);
    }
  }, [dbSettings]);

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<NavigationSettings>) => {
      if (!userId) {
        // Save to local storage only
        const newSettings = { ...settings, ...updates };
        saveToStorage(newSettings);
        return newSettings;
      }

      const { data, error } = await supabase
        .from('map_navigation_settings')
        .upsert({
          user_id: userId,
          ...updates,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['nav-settings', userId] });
      if (data) {
        saveToStorage(data as NavigationSettings);
      }
    },
  });

  const updateSettings = useCallback((updates: Partial<NavigationSettings>) => {
    return updateMutation.mutateAsync(updates);
  }, [updateMutation]);

  return {
    settings,
    isLoading,
    updateSettings,
    isUpdating: updateMutation.isPending,
  };
}

// Hook for admin to fetch global defaults
export function useNavigationDefaults() {
  const { data, isLoading } = useQuery({
    queryKey: ['nav-defaults'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maps_config')
        .select('config_value')
        .eq('config_key', 'navigation_defaults')
        .maybeSingle();

      if (error || !data) {
        return DEFAULT_SETTINGS;
      }

      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data.config_value) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    },
  });

  return {
    defaults: data || DEFAULT_SETTINGS,
    isLoading,
  };
}
