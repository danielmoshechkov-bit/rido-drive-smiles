// GetRido Maps - Mobile Navigation Bar (Yandex-style bottom stats bar)
import { X, Locate, AlertTriangle, Clock, Signal, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { NavigationState } from './useNavigation';
import { GpsState } from './useUserLocation';
import LaneGuidanceBar, { RoundaboutExitBadge } from './LaneGuidanceBar';
import NavigationTabBar from './NavigationTabBar';
import type { RouteStep, LaneInfo } from './routingService';

interface MobileNavigationBarProps {
  navigation: NavigationState & {
    stopNavigation: () => void;
    toggleFollowMode: () => void;
  };
  gps: GpsState;
  currentStep?: RouteStep | null;
  speedLimit?: number | null;
  isEstimatedLimit?: boolean;
  yellowThreshold?: number;
  redThreshold?: number;
  showSpeedLimit?: boolean;
  showLaneGuidance?: boolean;
}

const MobileNavigationBar = ({ 
  navigation, 
  gps,
  currentStep,
  speedLimit,
  isEstimatedLimit = false,
  yellowThreshold = 9,
  redThreshold = 15,
  showSpeedLimit = true,
  showLaneGuidance = true,
}: MobileNavigationBarProps) => {
  const { 
    remainingDistance, 
    remainingDuration, 
    eta, 
    followMode,
    stopNavigation, 
    toggleFollowMode 
  } = navigation;

  const speedKmh = gps.location?.speed 
    ? Math.round(gps.location.speed * 3.6) 
    : null;

  const accuracyM = gps.location?.accuracy 
    ? Math.round(gps.location.accuracy) 
    : null;

  const isWeakSignal = accuracyM !== null && accuracyM > 50;

  // Extract lane info from current step
  const lanes: LaneInfo[] | undefined = currentStep?.intersections?.[0]?.lanes;
  
  // Check for roundabout
  const isRoundabout = currentStep?.maneuver?.type === 'roundabout' || 
                       currentStep?.maneuver?.type === 'rotary';
  const roundaboutExit = currentStep?.maneuver?.exit;

  // Get maneuver icon
  const getManeuverIcon = () => {
    if (!currentStep) return <ArrowUp className="h-5 w-5" />;
    
    switch (currentStep.maneuver?.modifier) {
      case 'left':
      case 'slight left':
      case 'sharp left':
        return <ArrowLeft className="h-5 w-5" />;
      case 'right':
      case 'slight right':
      case 'sharp right':
        return <ArrowRight className="h-5 w-5" />;
      default:
        return <ArrowUp className="h-5 w-5" />;
    }
  };

  // Calculate progress (0-100)
  const progress = Math.max(0, Math.min(100, (1 - remainingDistance / (remainingDistance + 1)) * 100));

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Lane Guidance Bar (above main bar) */}
      {showLaneGuidance && lanes && lanes.length > 0 && (
        <div className="mx-3 mb-2">
          <LaneGuidanceBar lanes={lanes} />
        </div>
      )}
      
      {/* Roundabout Exit Badge */}
      {isRoundabout && roundaboutExit && (
        <div className="mx-3 mb-2">
          <RoundaboutExitBadge exitNumber={roundaboutExit} />
        </div>
      )}

      {/* Main navigation bar */}
      <div className="mx-3 mb-3 rounded-2xl bg-card/98 backdrop-blur-xl border shadow-2xl overflow-hidden">
        {/* Stats row - Yandex style */}
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Maneuver icon + Distance */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              {getManeuverIcon()}
            </div>
            <div>
              <p className="font-bold text-xl leading-tight">{remainingDistance.toFixed(1)} km</p>
              <p className="text-xs text-muted-foreground">pozostało</p>
            </div>
          </div>

          {/* ETA */}
          <div className="text-center px-3">
            <p className="font-bold text-xl leading-tight text-primary">
              {eta ? format(eta, 'HH:mm') : '—'}
            </p>
            <p className="text-xs text-muted-foreground">przyjazd</p>
          </div>

          {/* Duration */}
          <div className="text-center">
            <p className="font-bold text-xl leading-tight">{Math.round(remainingDuration)} min</p>
            <p className="text-xs text-muted-foreground">czas</p>
          </div>

          {/* Close button */}
          <Button 
            size="sm" 
            variant="destructive" 
            onClick={stopNavigation}
            className="h-10 w-10 p-0 rounded-xl shadow-lg"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min(progress * 10, 100)}%` }}
          />
        </div>

        {/* Speed + GPS info row */}
        <div className="px-4 py-2 flex items-center justify-between border-t">
          {/* Speed */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg">{speedKmh ?? '—'}</span>
            <span className="text-sm text-muted-foreground">km/h</span>
            
            {/* Speed limit badge */}
            {showSpeedLimit && speedLimit && (
              <div className="ml-2 h-7 w-7 rounded-full border-2 border-red-500 flex items-center justify-center">
                <span className="text-xs font-bold">{speedLimit}</span>
              </div>
            )}
          </div>

          {/* GPS accuracy */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
            isWeakSignal ? 'bg-amber-500/20 text-amber-600' : 'bg-muted text-muted-foreground'
          }`}>
            {isWeakSignal && <AlertTriangle className="h-3 w-3" />}
            <Signal className="h-3 w-3" />
            <span className="font-medium">±{accuracyM ?? '—'}m</span>
          </div>

          {/* Follow mode */}
          <button
            onClick={toggleFollowMode}
            className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
              followMode 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <Locate className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom tab bar */}
        <NavigationTabBar />
      </div>
    </div>
  );
};

export default MobileNavigationBar;
