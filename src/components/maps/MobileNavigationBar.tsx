// GetRido Maps - Mobile Navigation Bar (Premium, top during navigation)
import { X, Locate, AlertTriangle, Clock, Signal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { NavigationState } from './useNavigation';
import { GpsState } from './useUserLocation';
import LaneGuidanceBar, { RoundaboutExitBadge } from './LaneGuidanceBar';
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
  const distanceToManeuver = currentStep?.distance;
  
  // Check for roundabout
  const isRoundabout = currentStep?.maneuver?.type === 'roundabout' || 
                       currentStep?.maneuver?.type === 'rotary';
  const roundaboutExit = currentStep?.maneuver?.exit;

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Main navigation bar - now at bottom */}
      <div className="bg-card/98 backdrop-blur-md border-t shadow-lg rounded-t-2xl">
        {/* Main stats row - Premium sizing */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-5">
            {/* Distance */}
            <div className="text-center">
              <p className="font-bold text-2xl leading-tight">{remainingDistance.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">km</p>
            </div>
            
            {/* Separator */}
            <div className="w-px h-10 bg-border/50" />
            
            {/* Duration */}
            <div className="text-center">
              <p className="font-bold text-2xl leading-tight">{Math.round(remainingDuration)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">min</p>
            </div>
            
            {/* Separator */}
            <div className="w-px h-10 bg-border/50" />
            
            {/* Speed - now using SpeedHUD inline */}
            <div className="text-center">
              <p className="font-bold text-2xl leading-tight">{speedKmh ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">km/h</p>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* GPS warning */}
            {(gps.isUnstable || isWeakSignal) && (
              <div className="p-2 rounded-full bg-amber-500/20 animate-pulse">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
            )}
            
            {/* Follow mode toggle */}
            <button
              onClick={toggleFollowMode}
              className={`h-11 w-11 rounded-full flex items-center justify-center transition-all shadow-sm
                         ${followMode 
                           ? 'bg-primary text-primary-foreground shadow-primary/30' 
                           : 'bg-muted hover:bg-muted/80'}`}
              aria-label={followMode ? 'Wyłącz śledzenie' : 'Włącz śledzenie'}
            >
              <Locate className="h-5 w-5" />
            </button>
            
            {/* Stop navigation */}
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={stopNavigation}
              className="h-11 w-11 p-0 rounded-full shadow-lg"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* ETA row - Premium styling */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Przyjazd ok. <span className="font-bold text-foreground text-base">{eta ? format(eta, 'HH:mm') : '—'}</span>
            </span>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${
            isWeakSignal ? 'bg-amber-500/20 text-amber-600' : 'bg-muted/50 text-muted-foreground'
          }`}>
            <Signal className="h-4 w-4" />
            <span className="font-medium">±{accuracyM ?? '—'}m</span>
          </div>
        </div>
      </div>

      {/* Lane Guidance Bar (above stats bar) */}
      {showLaneGuidance && lanes && lanes.length > 0 && (
        <LaneGuidanceBar 
          lanes={lanes} 
          distanceToManeuver={distanceToManeuver}
        />
      )}
      
      {/* Roundabout Exit Badge */}
      {isRoundabout && roundaboutExit && (
        <div className="px-4 py-2 bg-card/95 backdrop-blur-md">
          <RoundaboutExitBadge exitNumber={roundaboutExit} />
        </div>
      )}
    </div>
  );
};

export default MobileNavigationBar;
