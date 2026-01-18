// GetRido Maps - Route Options Sheet (Yandex-style route selection)
import { useState } from 'react';
import { 
  X, 
  Navigation, 
  Car, 
  Bus, 
  PersonStanding, 
  Bike,
  Clock,
  AlertTriangle,
  ChevronDown,
  Bell,
  Settings,
  Zap,
  GitBranch
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteResult } from './routingService';
import { RiskAssessment } from './routeRiskService';

type TransportMode = 'car' | 'transit' | 'walk' | 'bike';

interface RouteOption {
  id: string;
  duration: number;
  distance: number;
  warnings?: string[];
  isFastest?: boolean;
  isSimplest?: boolean;
}

interface RouteOptionsSheetProps {
  startLabel: string;
  endLabel: string;
  routes: RouteOption[];
  selectedRouteId: string;
  onRouteSelect: (routeId: string) => void;
  onStartNavigation: () => void;
  onClose: () => void;
  onSwapLocations?: () => void;
  riskAssessment?: RiskAssessment | null;
  isLoading?: boolean;
}

const RouteOptionsSheet = ({ 
  startLabel,
  endLabel,
  routes,
  selectedRouteId,
  onRouteSelect,
  onStartNavigation,
  onClose,
  onSwapLocations,
  riskAssessment,
  isLoading = false,
}: RouteOptionsSheetProps) => {
  const [transportMode, setTransportMode] = useState<TransportMode>('car');
  const [showAllRoutes, setShowAllRoutes] = useState(false);

  const selectedRoute = routes.find(r => r.id === selectedRouteId) || routes[0];
  const displayedRoutes = showAllRoutes ? routes : routes.slice(0, 3);

  const transportModes: { mode: TransportMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'car', icon: <Car className="h-5 w-5" />, label: 'Auto' },
    { mode: 'transit', icon: <Bus className="h-5 w-5" />, label: 'Komunikacja' },
    { mode: 'walk', icon: <PersonStanding className="h-5 w-5" />, label: 'Pieszo' },
    { mode: 'bike', icon: <Bike className="h-5 w-5" />, label: 'Rower' },
  ];

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-50 animate-slide-up"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-2 mb-2 rounded-2xl bg-card/98 backdrop-blur-xl border shadow-2xl overflow-hidden">
        {/* Header with locations */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-sm font-medium truncate">
                  {startLabel || 'Moja lokalizacja'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-sm font-medium truncate">
                  {endLabel}
                </span>
              </div>
            </div>

            <button 
              onClick={onSwapLocations}
              className="h-9 px-3 rounded-full bg-muted text-sm font-medium flex items-center gap-1 shrink-0"
            >
              ↕️
            </button>
          </div>
        </div>

        {/* Transport mode tabs */}
        <div className="px-3 py-2 border-b flex items-center gap-1 overflow-x-auto no-scrollbar">
          {transportModes.map(({ mode, icon, label }) => {
            const isActive = mode === transportMode;
            const isDisabled = mode !== 'car'; // Only car mode implemented
            
            return (
              <button
                key={mode}
                onClick={() => !isDisabled && setTransportMode(mode)}
                disabled={isDisabled}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shrink-0 transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-md' 
                    : isDisabled
                      ? 'bg-muted/50 text-muted-foreground/50'
                      : 'bg-muted hover:bg-muted/80 text-foreground'
                }`}
              >
                {icon}
                {selectedRoute && isActive && (
                  <span className="font-semibold">{formatDuration(selectedRoute.duration)}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Route cards */}
        <div className="px-3 py-3 overflow-x-auto no-scrollbar">
          <div className="flex gap-2">
            {displayedRoutes.map((route) => {
              const isSelected = route.id === selectedRouteId;
              const hasWarning = route.warnings && route.warnings.length > 0;
              
              return (
                <button
                  key={route.id}
                  onClick={() => onRouteSelect(route.id)}
                  className={`flex flex-col items-center p-3 rounded-xl min-w-[90px] shrink-0 transition-all ${
                    isSelected 
                      ? 'bg-primary/10 border-2 border-primary shadow-sm' 
                      : 'bg-muted/50 border-2 border-transparent hover:border-muted-foreground/20'
                  }`}
                >
                  {/* Duration */}
                  <span className={`text-lg font-bold ${isSelected ? 'text-primary' : ''}`}>
                    {formatDuration(route.duration)}
                  </span>
                  
                  {/* Distance + warnings */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {route.distance.toFixed(1)} km
                    </span>
                    {hasWarning && (
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    )}
                  </div>

                  {/* Badge */}
                  {route.isFastest && (
                    <div className="mt-1.5 px-2 py-0.5 rounded-full bg-primary/20 flex items-center gap-1">
                      <Zap className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-medium text-primary">Najszybsza</span>
                    </div>
                  )}
                  {route.isSimplest && (
                    <div className="mt-1.5 px-2 py-0.5 rounded-full bg-green-500/20 flex items-center gap-1">
                      <GitBranch className="h-3 w-3 text-green-600" />
                      <span className="text-[10px] font-medium text-green-600">Najprostsza</span>
                    </div>
                  )}
                </button>
              );
            })}

            {routes.length > 3 && !showAllRoutes && (
              <button
                onClick={() => setShowAllRoutes(true)}
                className="flex flex-col items-center justify-center p-3 rounded-xl min-w-[70px] bg-muted/30 border-2 border-dashed border-muted-foreground/30"
              >
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground mt-1">+{routes.length - 3}</span>
              </button>
            )}
          </div>
        </div>

        {/* Risk warning */}
        {riskAssessment && riskAssessment.riskLevel !== 'low' && (
          <div className={`mx-3 mb-3 p-3 rounded-xl flex items-start gap-2 ${
            riskAssessment.riskLevel === 'high' 
              ? 'bg-red-500/10 border border-red-500/30' 
              : 'bg-amber-500/10 border border-amber-500/30'
          }`}>
            <AlertTriangle className={`h-5 w-5 shrink-0 ${
              riskAssessment.riskLevel === 'high' ? 'text-red-500' : 'text-amber-500'
            }`} />
            <p className="text-sm">
              {riskAssessment.messages[0]}
            </p>
          </div>
        )}

        {/* Bottom action bar */}
        <div className="p-3 border-t flex items-center gap-2">
          {/* Notifications */}
          <button className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Start navigation button - MAIN CTA */}
          <Button
            onClick={onStartNavigation}
            disabled={isLoading || !selectedRoute}
            className="flex-1 h-12 gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base shadow-lg"
          >
            <Navigation className="h-5 w-5" />
            Jedźmy!
          </Button>

          {/* Settings */}
          <button className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default RouteOptionsSheet;
