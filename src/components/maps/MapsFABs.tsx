// GetRido Maps - Floating Action Buttons for Mobile (Premium RIDO styling)
import { useState, useEffect } from 'react';
import { Sun, Moon, Layers, LocateFixed, Navigation2 } from 'lucide-react';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { RidoMapTheme, saveTheme, getDefaultTheme } from './ridoMapTheme';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { FollowMode } from './useMapCameraController';

interface MapsFABsProps {
  gps: GpsState;
  navigation: NavigationState;
  onThemeChange?: (theme: RidoMapTheme) => void;
  showIncidents?: boolean;
  onToggleIncidents?: (show: boolean) => void;
  // Follow mode props
  followMode?: FollowMode;
  onCycleFollowMode?: () => void;
}

const MapsFABs = ({ 
  gps, 
  navigation, 
  onThemeChange,
  showIncidents = true,
  onToggleIncidents,
  followMode = 'off',
  onCycleFollowMode,
}: MapsFABsProps) => {
  const [mapTheme, setMapTheme] = useState<RidoMapTheme>(() => getDefaultTheme());
  const [layersOpen, setLayersOpen] = useState(false);
  
  // Sync theme on mount
  useEffect(() => {
    setMapTheme(getDefaultTheme());
  }, []);

  const handleToggleTheme = () => {
    const newTheme: RidoMapTheme = mapTheme === 'light' ? 'dark' : 'light';
    saveTheme(newTheme);
    setMapTheme(newTheme);
    onThemeChange?.(newTheme);
  };

  // Don't show FABs during active navigation (use nav bar instead)
  if (navigation.isNavigating) {
    return null;
  }

  // Follow mode icon based on state
  const getFollowIcon = () => {
    if (followMode === 'heading') {
      return <Navigation2 className="h-5 w-5 text-primary rotate-0" />;
    }
    return <LocateFixed className={`h-5 w-5 ${followMode === 'center' ? 'text-primary' : 'text-muted-foreground'}`} />;
  };

  return (
    <div 
      className="absolute right-4 z-30 flex flex-col items-end gap-3"
      style={{ 
        bottom: 'calc(18rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* Compact FAB group - Theme & Layers together */}
      <div className="rido-fab-group flex items-center gap-1 p-1.5 rounded-full">
        {/* Theme Toggle */}
        <button
          onClick={handleToggleTheme}
          className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-muted/80 transition-colors"
          aria-label={mapTheme === 'light' ? 'Tryb ciemny' : 'Tryb jasny'}
        >
          {mapTheme === 'light' ? (
            <Moon className="h-5 w-5 text-primary" />
          ) : (
            <Sun className="h-5 w-5 text-amber-400" />
          )}
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-border/50" />

        {/* Layers Menu */}
        <Popover open={layersOpen} onOpenChange={setLayersOpen}>
          <PopoverTrigger asChild>
            <button
              className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-muted/80 transition-colors"
              aria-label="Warstwy mapy"
            >
              <Layers className="h-5 w-5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="left" 
            align="end"
            className="w-56 p-3 rounded-xl shadow-xl"
          >
            <h4 className="font-semibold text-sm mb-3">Warstwy mapy</h4>
            
            <div className="space-y-3">
              {/* Theme selection */}
              <div className="flex items-center justify-between">
                <span className="text-sm">Tryb ciemny</span>
                <Switch
                  checked={mapTheme === 'dark'}
                  onCheckedChange={(checked) => {
                    const newTheme = checked ? 'dark' : 'light';
                    saveTheme(newTheme);
                    setMapTheme(newTheme);
                    onThemeChange?.(newTheme);
                  }}
                />
              </div>

              {/* Incidents toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm">Utrudnienia</span>
                <Switch
                  checked={showIncidents}
                  onCheckedChange={(checked) => onToggleIncidents?.(checked)}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Location FAB - separate for emphasis */}
      <button
        onClick={onCycleFollowMode}
        className={`rido-fab h-14 w-14 rounded-full flex items-center justify-center transition-all ${
          followMode !== 'off' 
            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' 
            : ''
        }`}
        aria-label="Tryb śledzenia"
      >
        {getFollowIcon()}
      </button>
    </div>
  );
};

export default MapsFABs;
