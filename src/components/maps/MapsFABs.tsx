// GetRido Maps - Premium Floating Action Buttons (Yandex-style right panel)
import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { FollowMode } from './useMapCameraController';
import { RidoMapTheme, saveTheme, getDefaultTheme } from './ridoMapTheme';

// ═══════════════════════════════════════════════════════════════
// Premium SVG Icons for FABs
// ═══════════════════════════════════════════════════════════════

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} className="text-amber-400">
    <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z" fill="currentColor"/>
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} className="text-primary">
    <path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z" fill="currentColor"/>
  </svg>
);

const LayersIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z" fill="currentColor"/>
  </svg>
);

const IncidentIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/>
  </svg>
);

const ParkingIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor"/>
    <text x="12" y="17" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="system-ui">P</text>
  </svg>
);

const ZoomInIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
  </svg>
);

const ZoomOutIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M19 13H5v-2h14v2z" fill="currentColor"/>
  </svg>
);

const LocationIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" fill="currentColor"/>
  </svg>
);

const NavigationArrowIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22}>
    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="currentColor"/>
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// Premium FAB Button Component
// ═══════════════════════════════════════════════════════════════

interface FABButtonProps {
  onClick?: () => void;
  active?: boolean;
  color?: 'default' | 'warning' | 'blue';
  size?: 'normal' | 'large';
  children: React.ReactNode;
  ariaLabel?: string;
}

const FABButton = ({ onClick, active, color = 'default', size = 'normal', children, ariaLabel }: FABButtonProps) => {
  const sizeClass = size === 'large' ? 'h-14 w-14' : 'h-12 w-12';
  
  const colorClasses = {
    default: active 
      ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-violet-500/30' 
      : 'bg-white/95 dark:bg-slate-800/95 text-muted-foreground hover:text-foreground',
    warning: 'text-amber-500',
    blue: 'text-blue-500',
  };

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`
        ${sizeClass} rounded-2xl 
        ${color === 'default' ? colorClasses.default : 'bg-white/95 dark:bg-slate-800/95'}
        ${color === 'warning' ? colorClasses.warning : ''}
        ${color === 'blue' ? colorClasses.blue : ''}
        backdrop-blur-lg 
        border border-white/20 dark:border-white/10
        shadow-xl shadow-black/10
        flex items-center justify-center 
        hover:scale-105 hover:shadow-2xl
        active:scale-95
        transition-all duration-200
      `}
    >
      {children}
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════
// Maps FABs Component
// ═══════════════════════════════════════════════════════════════

interface MapsFABsProps {
  gps: GpsState;
  navigation: NavigationState;
  onThemeChange?: (theme: RidoMapTheme) => void;
  showIncidents?: boolean;
  onToggleIncidents?: (show: boolean) => void;
  followMode?: FollowMode;
  onCycleFollowMode?: () => void;
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
  onZoomIn,
  onZoomOut,
}: MapsFABsProps) => {
  const [mapTheme, setMapTheme] = useState<RidoMapTheme>(() => getDefaultTheme());
  const [showParking, setShowParking] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

  useEffect(() => {
    setMapTheme(getDefaultTheme());
  }, []);

  // Hide FABs during active navigation
  if (navigation.isNavigating) {
    return null;
  }

  const handleThemeToggle = () => {
    const newTheme: RidoMapTheme = mapTheme === 'light' ? 'dark' : 'light';
    saveTheme(newTheme);
    setMapTheme(newTheme);
    onThemeChange?.(newTheme);
  };

  return (
    <div 
      className="absolute right-3 z-30 flex flex-col items-end gap-2"
      style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
    >
      {/* Vertical FAB stack */}
      <div className="flex flex-col gap-2">
        {/* Theme Toggle */}
        <FABButton onClick={handleThemeToggle} ariaLabel={mapTheme === 'light' ? 'Tryb ciemny' : 'Tryb jasny'}>
          {mapTheme === 'light' ? <MoonIcon /> : <SunIcon />}
        </FABButton>

        {/* Layers Menu */}
        <Popover open={layersOpen} onOpenChange={setLayersOpen}>
          <PopoverTrigger asChild>
            <div>
              <FABButton ariaLabel="Warstwy mapy">
                <LayersIcon />
              </FABButton>
            </div>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-56 p-4 rounded-2xl shadow-2xl border-white/20">
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
              <div className="flex items-center justify-between">
                <span className="text-sm">Parkingi</span>
                <Switch
                  checked={showParking}
                  onCheckedChange={setShowParking}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Incidents */}
        <FABButton color="warning" ariaLabel="Zdarzenia">
          <IncidentIcon />
        </FABButton>

        {/* Parking */}
        <FABButton color="blue" ariaLabel="Parkingi">
          <ParkingIcon />
        </FABButton>

        {/* Separator */}
        <div className="h-2" />

        {/* Zoom In */}
        <FABButton onClick={onZoomIn} ariaLabel="Przybliż">
          <ZoomInIcon />
        </FABButton>

        {/* Zoom Out */}
        <FABButton onClick={onZoomOut} ariaLabel="Oddal">
          <ZoomOutIcon />
        </FABButton>
      </div>

      {/* Separator */}
      <div className="h-2" />

      {/* Location FAB - Larger and prominent */}
      <FABButton 
        onClick={onCycleFollowMode}
        active={followMode !== 'off'}
        size="large"
        ariaLabel="Tryb śledzenia"
      >
        {followMode === 'heading' ? <NavigationArrowIcon /> : <LocationIcon />}
      </FABButton>
    </div>
  );
};

export default MapsFABs;
