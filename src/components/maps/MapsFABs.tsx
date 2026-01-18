// GetRido Maps - Floating Action Buttons (Yandex-style vertical stack)
import { useState, useEffect } from 'react';
import { 
  Sun, 
  Moon, 
  Layers, 
  LocateFixed, 
  Navigation2, 
  Plus, 
  Minus,
  AlertTriangle,
  Sparkles,
  ParkingCircle
} from 'lucide-react';
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
  followMode?: FollowMode;
  onCycleFollowMode?: () => void;
  onOpenAI?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

const MapsFABs = ({ 
  gps, 
  navigation, 
  onThemeChange,
  showIncidents = true,
  onToggleIncidents,
  followMode = 'off',
  onCycleFollowMode,
  onOpenAI,
  onZoomIn,
  onZoomOut,
}: MapsFABsProps) => {
  const [mapTheme, setMapTheme] = useState<RidoMapTheme>(() => getDefaultTheme());
  const [layersOpen, setLayersOpen] = useState(false);
  
  useEffect(() => {
    setMapTheme(getDefaultTheme());
  }, []);

  const handleToggleTheme = () => {
    const newTheme: RidoMapTheme = mapTheme === 'light' ? 'dark' : 'light';
    saveTheme(newTheme);
    setMapTheme(newTheme);
    onThemeChange?.(newTheme);
  };

  // Don't show FABs during active navigation
  if (navigation.isNavigating) {
    return null;
  }

  const getFollowIcon = () => {
    if (followMode === 'heading') {
      return <Navigation2 className="h-5 w-5 text-primary-foreground" />;
    }
    return <LocateFixed className={`h-5 w-5 ${followMode === 'center' ? 'text-primary-foreground' : 'text-muted-foreground'}`} />;
  };

  return (
    <div 
      className="absolute right-3 z-30 flex flex-col items-end gap-2"
      style={{ 
        top: 'calc(env(safe-area-inset-top) + 1rem)',
      }}
    >
      {/* Vertical FAB stack - Yandex style */}
      <div className="flex flex-col gap-2">
        {/* Theme Toggle */}
        <button
          onClick={handleToggleTheme}
          className="h-11 w-11 rounded-xl bg-card/95 backdrop-blur-sm border shadow-lg flex items-center justify-center hover:bg-card transition-colors"
          aria-label={mapTheme === 'light' ? 'Tryb ciemny' : 'Tryb jasny'}
        >
          {mapTheme === 'light' ? (
            <Moon className="h-5 w-5 text-primary" />
          ) : (
            <Sun className="h-5 w-5 text-amber-400" />
          )}
        </button>

        {/* Layers Menu */}
        <Popover open={layersOpen} onOpenChange={setLayersOpen}>
          <PopoverTrigger asChild>
            <button
              className="h-11 w-11 rounded-xl bg-card/95 backdrop-blur-sm border shadow-lg flex items-center justify-center hover:bg-card transition-colors"
              aria-label="Warstwy mapy"
            >
              <Layers className="h-5 w-5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="left" 
            align="start"
            className="w-52 p-3 rounded-xl shadow-xl"
          >
            <h4 className="font-semibold text-sm mb-3">Warstwy</h4>
            
            <div className="space-y-3">
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

        {/* Incidents */}
        <button
          className="h-11 w-11 rounded-xl bg-card/95 backdrop-blur-sm border shadow-lg flex items-center justify-center hover:bg-card transition-colors"
          aria-label="Zdarzenia"
        >
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </button>

        {/* Parking */}
        <button
          className="h-11 w-11 rounded-xl bg-card/95 backdrop-blur-sm border shadow-lg flex items-center justify-center hover:bg-card transition-colors"
          aria-label="Parkingi"
        >
          <ParkingCircle className="h-5 w-5 text-blue-500" />
        </button>

        {/* Separator */}
        <div className="h-2" />

        {/* Zoom In */}
        <button
          onClick={onZoomIn}
          className="h-11 w-11 rounded-xl bg-card/95 backdrop-blur-sm border shadow-lg flex items-center justify-center hover:bg-card transition-colors"
          aria-label="Przybliż"
        >
          <Plus className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Zoom Out */}
        <button
          onClick={onZoomOut}
          className="h-11 w-11 rounded-xl bg-card/95 backdrop-blur-sm border shadow-lg flex items-center justify-center hover:bg-card transition-colors"
          aria-label="Oddal"
        >
          <Minus className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Location FAB - separate for emphasis */}
      <button
        onClick={onCycleFollowMode}
        className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-all shadow-lg ${
          followMode !== 'off' 
            ? 'bg-primary text-primary-foreground shadow-primary/30' 
            : 'bg-card/95 backdrop-blur-sm border hover:bg-card'
        }`}
        aria-label="Tryb śledzenia"
      >
        {getFollowIcon()}
      </button>
    </div>
  );
};

export default MapsFABs;
