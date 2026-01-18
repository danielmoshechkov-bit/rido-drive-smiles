// GetRido Maps - Floating Action Buttons for Mobile (Premium RIDO styling)
import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { RidoMapTheme, saveTheme, getDefaultTheme } from './ridoMapTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import LayersMenu from './LayersMenu';

interface MapsFABsProps {
  gps: GpsState;
  navigation: NavigationState;
  onThemeChange?: (theme: RidoMapTheme) => void;
  showIncidents?: boolean;
  onToggleIncidents?: (show: boolean) => void;
}

const MapsFABs = ({ 
  gps, 
  navigation, 
  onThemeChange,
  showIncidents = true,
  onToggleIncidents,
}: MapsFABsProps) => {
  const [mapTheme, setMapTheme] = useState<RidoMapTheme>(() => getDefaultTheme());
  
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

  const handleThemeChange = (newTheme: RidoMapTheme) => {
    setMapTheme(newTheme);
    onThemeChange?.(newTheme);
  };

  // Don't show FABs during active navigation (use nav bar instead)
  if (navigation.isNavigating) {
    return null;
  }

  return (
    <TooltipProvider>
      <div 
        className="absolute right-4 z-30 flex flex-col gap-3"
        style={{ 
          bottom: 'calc(18rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Theme Toggle - Light/Dark */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleToggleTheme}
              className="rido-fab h-12 w-12 rounded-full flex items-center justify-center"
              aria-label={mapTheme === 'light' ? 'Tryb ciemny' : 'Tryb jasny'}
            >
              {mapTheme === 'light' ? (
                <Moon className="h-5 w-5 text-primary" />
              ) : (
                <Sun className="h-5 w-5 text-amber-400" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>{mapTheme === 'light' ? 'Tryb ciemny' : 'Tryb jasny'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Layers Menu - Popover with real functionality */}
        <LayersMenu 
          currentTheme={mapTheme}
          onThemeChange={handleThemeChange}
          showIncidents={showIncidents}
          onToggleIncidents={onToggleIncidents || (() => {})}
        />
      </div>
    </TooltipProvider>
  );
};

export default MapsFABs;
