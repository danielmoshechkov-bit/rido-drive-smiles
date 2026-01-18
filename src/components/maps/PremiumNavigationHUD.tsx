// ═══════════════════════════════════════════════════════════════
// GetRido Maps - Premium Navigation HUD (Cyberpunk Style)
// Tesla/Yandex-inspired futuristic heads-up display
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { X, Locate, AlertTriangle, ArrowUp, ArrowLeft, ArrowRight, CornerUpRight, CornerUpLeft, Navigation2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { NavigationState } from './useNavigation';
import { GpsState } from './useUserLocation';
import type { RouteStep } from './routingService';
import { CYBERPUNK_HUD } from './ridoCyberpunkStyle';
import { cn } from '@/lib/utils';

interface PremiumNavigationHUDProps {
  navigation: NavigationState & {
    stopNavigation: () => void;
    toggleFollowMode: () => void;
  };
  gps: GpsState;
  currentStep?: RouteStep | null;
  currentSpeed?: number | null;
  speedLimit?: number | null;
  onStopNavigation?: () => void;
}

const PremiumNavigationHUD = ({ 
  navigation, 
  gps,
  currentStep,
  currentSpeed,
  speedLimit,
  onStopNavigation,
}: PremiumNavigationHUDProps) => {
  const { 
    remainingDistance, 
    remainingDuration, 
    eta, 
    followMode,
    stopNavigation, 
    toggleFollowMode 
  } = navigation;

  // Auto-collapse after 5 seconds
  const [isExpanded, setIsExpanded] = useState(true);
  const lastInteractionRef = useRef<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastInteractionRef.current;
      if (elapsed > 5000 && isExpanded) {
        setIsExpanded(false);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isExpanded]);

  const handleTouch = () => {
    lastInteractionRef.current = Date.now();
    setIsExpanded(true);
  };

  // Speed warning colors
  const getSpeedColor = () => {
    if (!speedLimit || !currentSpeed) return 'text-cyan-400';
    const over = currentSpeed - speedLimit;
    if (over > 15) return 'text-red-500';
    if (over > 9) return 'text-amber-400';
    return 'text-cyan-400';
  };

  const isOverSpeed = speedLimit && (currentSpeed ?? 0) > speedLimit;

  // Get maneuver icon with neon styling
  const getManeuverIcon = () => {
    if (!currentStep) return <Navigation2 className="h-8 w-8" />;
    
    const modifier = currentStep.maneuver?.modifier;
    const iconClass = "h-8 w-8 drop-shadow-[0_0_8px_rgba(0,229,255,0.6)]";
    
    switch (modifier) {
      case 'left':
      case 'sharp left':
        return <CornerUpLeft className={iconClass} />;
      case 'slight left':
        return <ArrowLeft className={iconClass} style={{ transform: 'rotate(-30deg)' }} />;
      case 'right':
      case 'sharp right':
        return <CornerUpRight className={iconClass} />;
      case 'slight right':
        return <ArrowRight className={iconClass} style={{ transform: 'rotate(30deg)' }} />;
      default:
        return <ArrowUp className={iconClass} />;
    }
  };

  // Collapsed minimal view
  if (!isExpanded) {
    return (
      <div 
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={handleTouch}
      >
        <div 
          className="mx-3 mb-3 rounded-2xl backdrop-blur-xl border shadow-2xl overflow-hidden"
          style={{
            background: CYBERPUNK_HUD.panelBg,
            borderColor: CYBERPUNK_HUD.panelBorder,
            boxShadow: CYBERPUNK_HUD.panelGlow,
          }}
        >
          <div className="h-14 flex items-center justify-between px-4">
            {/* Speed */}
            <div className="flex items-center gap-2">
              <span className={cn("text-2xl font-bold tabular-nums", getSpeedColor())}>
                {currentSpeed ?? 0}
              </span>
              <span className="text-xs text-gray-500">km/h</span>
              {speedLimit && (
                <div className={cn(
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ml-1",
                  isOverSpeed ? "border-red-500 text-red-500 bg-red-500/10" : "border-gray-500 text-gray-400"
                )}>
                  {speedLimit}
                </div>
              )}
            </div>
            
            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
              <span className="font-semibold text-white">{remainingDistance.toFixed(1)} km</span>
              <span className="font-bold text-cyan-400">{eta ? format(eta, 'HH:mm') : '—'}</span>
            </div>
            
            {/* Stop */}
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
      <div 
        className="mx-3 mb-3 rounded-2xl backdrop-blur-xl border shadow-2xl overflow-hidden"
        style={{
          background: CYBERPUNK_HUD.panelBg,
          borderColor: CYBERPUNK_HUD.panelBorder,
          boxShadow: CYBERPUNK_HUD.panelGlow,
        }}
      >
        {/* Main HUD Row */}
        <div className="px-5 py-4 flex items-center justify-between">
          {/* Left: ETA Block */}
          <div className="text-center">
            <p className="text-3xl font-bold text-cyan-400 tabular-nums drop-shadow-[0_0_10px_rgba(0,229,255,0.5)]">
              {eta ? format(eta, 'HH:mm') : '—'}
            </p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">przyjazd</p>
          </div>

          {/* Center: Maneuver Icon */}
          <div 
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-cyan-400"
            style={{
              background: 'rgba(0, 229, 255, 0.1)',
              boxShadow: 'inset 0 0 20px rgba(0, 229, 255, 0.1)',
            }}
          >
            {getManeuverIcon()}
          </div>

          {/* Right: Speed Block */}
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-1">
              <p className={cn("text-3xl font-bold tabular-nums", getSpeedColor())}>
                {currentSpeed ?? 0}
              </p>
              {speedLimit && (
                <div className={cn(
                  "w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ml-1",
                  isOverSpeed ? "border-red-500 text-red-500" : "border-gray-500 text-gray-500"
                )}>
                  {speedLimit}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">km/h</p>
          </div>
        </div>

        {/* Instruction Row */}
        <div 
          className="px-5 py-3 border-t"
          style={{ borderColor: 'rgba(0, 229, 255, 0.15)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-lg font-semibold text-white">
                {currentStep?.name || 'Jedź prosto'}
              </p>
              <p className="text-sm text-gray-400">
                za {remainingDistance < 1 ? `${Math.round(remainingDistance * 1000)} m` : `${remainingDistance.toFixed(1)} km`} • {Math.round(remainingDuration)} min
              </p>
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); toggleFollowMode(); }}
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  followMode 
                    ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.3)]" 
                    : "bg-gray-800/50 text-gray-400"
                )}
              >
                <Locate className="h-5 w-5" />
              </button>
              <Button 
                size="sm" 
                variant="destructive" 
                onClick={(e) => { e.stopPropagation(); stopNavigation(); onStopNavigation?.(); }}
                className="h-10 w-10 p-0 rounded-xl shadow-lg"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div 
            className="h-full transition-all duration-500"
            style={{ 
              width: `${Math.min(50, 100)}%`,
              background: 'linear-gradient(90deg, #00e5ff, #00b4ff)',
              boxShadow: '0 0 10px rgba(0, 229, 255, 0.5)',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default PremiumNavigationHUD;
