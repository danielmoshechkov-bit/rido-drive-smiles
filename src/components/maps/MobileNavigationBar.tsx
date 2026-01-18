// GetRido Maps - Mobile Navigation Bar (Yandex-style bottom stats bar)
import { useState, useEffect, useRef } from 'react';
import { X, Locate, AlertTriangle, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { NavigationState } from './useNavigation';
import { GpsState } from './useUserLocation';
import LaneGuidanceBar, { RoundaboutExitBadge } from './LaneGuidanceBar';
import NavigationTabBar from './NavigationTabBar';
import type { RouteStep, LaneInfo } from './routingService';

import { cn } from '@/lib/utils';

interface MobileNavigationBarProps {
  navigation: NavigationState & {
    stopNavigation: () => void;
    toggleFollowMode: () => void;
  };
  gps: GpsState;
  currentStep?: RouteStep | null;
  currentSpeed?: number | null;
  speedLimit?: number | null;
  isEstimatedLimit?: boolean;
  yellowThreshold?: number;
  redThreshold?: number;
  showSpeedLimit?: boolean;
  showLaneGuidance?: boolean;
  onStopNavigation?: () => void;
}

const MobileNavigationBar = ({ 
  navigation, 
  gps,
  currentStep,
  currentSpeed,
  speedLimit,
  isEstimatedLimit = false,
  yellowThreshold = 9,
  redThreshold = 15,
  showSpeedLimit = true,
  showLaneGuidance = true,
  onStopNavigation,
}: MobileNavigationBarProps) => {
  const { 
    remainingDistance, 
    remainingDuration, 
    eta, 
    followMode,
    stopNavigation, 
    toggleFollowMode 
  } = navigation;

  // Auto-collapse after 5 seconds of inactivity
  const [isCollapsed, setIsCollapsed] = useState(false);
  const lastInteractionRef = useRef<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastInteractionRef.current;
      if (elapsed > 5000 && !isCollapsed) {
        setIsCollapsed(true);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isCollapsed]);

  const handleTouch = () => {
    lastInteractionRef.current = Date.now();
    setIsCollapsed(false);
  };

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

  // Calculate if over speed
  const isOverSpeed = speedLimit && (currentSpeed ?? 0) > speedLimit;

  // Collapsed minimal view with speed
  if (isCollapsed) {
    return (
      <div 
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={handleTouch}
      >
        <div className="bg-card/98 backdrop-blur-xl border-t shadow-lg">
          <div className="h-14 flex items-center justify-between px-3">
            {/* Speed + Limit */}
            <div className="flex items-center gap-1.5 min-w-[80px]">
              <span className={cn(
                "text-lg font-bold tabular-nums",
                isOverSpeed ? "text-destructive" : "text-foreground"
              )}>
                {currentSpeed ?? 0}
              </span>
              {speedLimit && showSpeedLimit && (
                <div className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full border-2 text-xs font-bold",
                  isOverSpeed ? "border-destructive text-destructive bg-destructive/10" : "border-red-500 text-red-600"
                )}>
                  {speedLimit}
                </div>
              )}
            </div>
            
            {/* Stats */}
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold">{remainingDistance.toFixed(1)} km</span>
              <span className="text-primary font-bold">{eta ? format(eta, 'HH:mm') : '—'}</span>
              <span className="font-medium text-muted-foreground">{Math.round(remainingDuration)} min</span>
            </div>
            
            {/* Stop button */}
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={(e) => { e.stopPropagation(); stopNavigation(); onStopNavigation?.(); }}
              className="h-8 w-8 p-0 rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={handleTouch}
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
      <div className="rounded-t-2xl bg-card/98 backdrop-blur-xl border-t border-x shadow-2xl overflow-hidden">
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

          {/* GPS + Close buttons */}
          <div className="flex items-center gap-2">
            {isWeakSignal && (
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); toggleFollowMode(); }}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${
                followMode 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              <Locate className="h-4 w-4" />
            </button>
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={(e) => { e.stopPropagation(); stopNavigation(); }}
              className="h-10 w-10 p-0 rounded-xl shadow-lg"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min((1 - remainingDistance / (remainingDistance + 1)) * 1000, 100)}%` }}
          />
        </div>

        {/* Bottom tab bar */}
        <NavigationTabBar />
      </div>
    </div>
  );
};

export default MobileNavigationBar;
