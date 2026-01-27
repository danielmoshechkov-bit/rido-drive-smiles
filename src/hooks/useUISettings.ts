import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface NavBarColorSettings {
  type: 'preset' | 'custom';
  preset: 'purple' | 'blue';
  custom: string;
}

const PRESET_COLORS = {
  purple: '#6C3CF0',
  blue: '#3B82F6',
};

export function useUISettings() {
  const [navBarColor, setNavBarColor] = useState<string>(PRESET_COLORS.purple);
  const [settings, setSettings] = useState<NavBarColorSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('ui_settings')
          .select('value')
          .eq('key', 'nav_bar_color')
          .single();

        if (error) {
          console.error('Error fetching UI settings:', error);
          return;
        }

        if (data?.value) {
          const colorSettings = data.value as unknown as NavBarColorSettings;
          setSettings(colorSettings);
          
          const color = colorSettings.type === 'preset' 
            ? PRESET_COLORS[colorSettings.preset] || PRESET_COLORS.purple
            : colorSettings.custom || PRESET_COLORS.purple;
          
          setNavBarColor(color);
        }
      } catch (err) {
        console.error('Error in useUISettings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('ui_settings_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ui_settings',
          filter: 'key=eq.nav_bar_color',
        },
        (payload) => {
          if (payload.new && 'value' in payload.new) {
            const colorSettings = (payload.new as { value: unknown }).value as NavBarColorSettings;
            setSettings(colorSettings);
            
            const color = colorSettings.type === 'preset' 
              ? PRESET_COLORS[colorSettings.preset] || PRESET_COLORS.purple
              : colorSettings.custom || PRESET_COLORS.purple;
            
            setNavBarColor(color);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Apply color to CSS variable whenever it changes
  useEffect(() => {
    document.documentElement.style.setProperty('--nav-bar-color', navBarColor);
  }, [navBarColor]);

  return { navBarColor, settings, isLoading, PRESET_COLORS };
}

export async function updateNavBarColor(newSettings: NavBarColorSettings): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from('ui_settings')
      .update({ value: newSettings as any })
      .eq('key', 'nav_bar_color');

    if (error) {
      console.error('Error updating nav bar color:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in updateNavBarColor:', err);
    return false;
  }
}
