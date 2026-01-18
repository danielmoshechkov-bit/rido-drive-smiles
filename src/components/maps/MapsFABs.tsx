// GetRido Maps - Floating Action Buttons for Mobile (Premium RIDO styling)
import { Locate, Layers, Sun, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { RidoMapTheme, saveTheme, getDefaultTheme } from './ridoMapTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MapsFABsProps {
  gps: GpsState;
  navigation: NavigationState;
  onThemeChange?: (theme: RidoMapTheme) => void;
}

const MapsFABs = ({ gps, navigation, onThemeChange }: MapsFABsProps) => {
  const [mapTheme, setMapTheme] = useState<RidoMapTheme>(() => getDefaultTheme());
  
  // Sync theme on mount
  useEffect(() => {
    setMapTheme(getDefaultTheme());
  }, []);

  const handleCenterOnMe = () => {
    if (gps.hasConsent && gps.location) {
      gps.centerOnUser();
    }
  };

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

  return (
    <TooltipProvider>
      <div 
        className="absolute right-4 z-30 flex flex-col gap-3"
        style={{ 
          bottom: 'calc(7rem + env(safe-area-inset-bottom))',
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

        {/* Center on me */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCenterOnMe}
              disabled={!gps.hasConsent || !gps.location}
              className="rido-fab h-12 w-12 rounded-full flex items-center justify-center disabled:opacity-50"
              aria-label="Centruj na mnie"
            >
              <Locate className="h-5 w-5 text-primary" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Centruj na mnie</p>
          </TooltipContent>
        </Tooltip>
        
        {/* Layers - now toggles theme (combined functionality) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleToggleTheme}
              className="rido-fab h-12 w-12 rounded-full flex items-center justify-center"
              aria-label="Warstwy mapy"
            >
              <Layers className="h-5 w-5 text-primary" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Warstwy ({mapTheme === 'light' ? 'Light' : 'Dark'})</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default MapsFABs;
