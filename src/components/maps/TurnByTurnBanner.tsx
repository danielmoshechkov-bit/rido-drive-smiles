// GetRido Maps - Turn-by-Turn Navigation Banner (Premium Yandex-style)
import { useMemo } from 'react';
import { 
  ArrowUp, 
  ArrowUpRight, 
  ArrowRight, 
  ArrowDownRight,
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpLeft,
  RotateCw,
  Flag,
  Navigation,
  Compass
} from 'lucide-react';
import { RouteStep } from './routingService';
import { Button } from '@/components/ui/button';

interface TurnByTurnBannerProps {
  currentStep: RouteStep | null;
  nextStep?: RouteStep | null;
  distanceToStep: number;
  onRecenter?: () => void;
  isMapRotated?: boolean;
}

const getManeuverIcon = (type: string, modifier?: string) => {
  const iconClass = "h-9 w-9";
  
  switch (type) {
    case 'depart':
    case 'straight':
    case 'continue':
      return <ArrowUp className={iconClass} />;
    case 'turn':
      switch (modifier) {
        case 'left':
          return <ArrowLeft className={iconClass} />;
        case 'right':
          return <ArrowRight className={iconClass} />;
        case 'slight left':
          return <ArrowUpLeft className={iconClass} />;
        case 'slight right':
          return <ArrowUpRight className={iconClass} />;
        case 'sharp left':
          return <ArrowDownLeft className={iconClass} />;
        case 'sharp right':
          return <ArrowDownRight className={iconClass} />;
        case 'uturn':
          return <RotateCw className={iconClass} />;
        default:
          return <ArrowUp className={iconClass} />;
      }
    case 'merge':
    case 'on ramp':
    case 'off ramp':
      return modifier?.includes('left') ? <ArrowUpLeft className={iconClass} /> : <ArrowUpRight className={iconClass} />;
    case 'roundabout':
    case 'rotary':
      return <RotateCw className={iconClass} />;
    case 'arrive':
      return <Flag className={iconClass} />;
    case 'fork':
      return modifier?.includes('left') ? <ArrowUpLeft className={iconClass} /> : <ArrowUpRight className={iconClass} />;
    default:
      return <Navigation className={iconClass} />;
  }
};

const getInstructionText = (step: RouteStep): string => {
  const { maneuver, name } = step;
  const streetName = name || 'drogę';
  
  switch (maneuver.type) {
    case 'depart':
      return streetName;
    case 'straight':
    case 'continue':
      return streetName;
    case 'turn':
      switch (maneuver.modifier) {
        case 'left':
          return streetName;
        case 'right':
          return streetName;
        case 'slight left':
        case 'slight right':
          return streetName;
        case 'sharp left':
        case 'sharp right':
          return streetName;
        case 'uturn':
          return 'Zawróć';
        default:
          return streetName;
      }
    case 'merge':
    case 'on ramp':
    case 'off ramp':
      return streetName;
    case 'roundabout':
    case 'rotary':
      return maneuver.exit ? `${maneuver.exit}. zjazd z ronda` : 'Rondo';
    case 'arrive':
      return 'Cel podróży';
    case 'fork':
      return streetName;
    default:
      return streetName;
  }
};

const formatDistance = (meters: number): string => {
  if (meters < 100) {
    return `${Math.round(meters / 10) * 10} m`;
  } else if (meters < 1000) {
    return `${Math.round(meters / 50) * 50} m`;
  } else {
    return `${(meters / 1000).toFixed(1)} km`;
  }
};

const getShortInstruction = (step: RouteStep): string => {
  const { maneuver } = step;
  
  switch (maneuver.type) {
    case 'turn':
      switch (maneuver.modifier) {
        case 'left': return 'W lewo';
        case 'right': return 'W prawo';
        case 'slight left': return 'Łagodnie w lewo';
        case 'slight right': return 'Łagodnie w prawo';
        case 'uturn': return 'Zawróć';
        default: return 'Skręć';
      }
    case 'roundabout':
    case 'rotary':
      return maneuver.exit ? `${maneuver.exit}. zjazd` : 'Rondo';
    case 'arrive':
      return 'Cel';
    default:
      return 'Prosto';
  }
};

const TurnByTurnBanner = ({
  currentStep,
  nextStep,
  distanceToStep,
  onRecenter,
  isMapRotated = false,
}: TurnByTurnBannerProps) => {
  const instruction = useMemo(() => currentStep ? getInstructionText(currentStep) : '', [currentStep]);
  const icon = useMemo(() => currentStep ? getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier) : null, [currentStep]);
  const distance = useMemo(() => formatDistance(distanceToStep), [distanceToStep]);
  const nextInstruction = useMemo(() => nextStep ? getShortInstruction(nextStep) : null, [nextStep]);
  const nextIcon = useMemo(() => nextStep ? getManeuverIcon(nextStep.maneuver.type, nextStep.maneuver.modifier) : null, [nextStep]);

  if (!currentStep) return null;

  return (
    <div 
      className="absolute top-0 left-0 right-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Main banner - Yandex-style blue/RIDO violet */}
      <div 
        className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, hsl(259 65% 58%), hsl(259 65% 42%))',
          boxShadow: '0 8px 40px -8px hsl(259 65% 58% / 0.6)',
        }}
      >
        <div className="p-4 text-white">
          <div className="flex items-center gap-4">
            {/* Direction icon - large prominent */}
            <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
              {icon}
            </div>
            
            {/* Distance + Street */}
            <div className="flex-1 min-w-0">
              {/* Distance - HUGE */}
              <p className="text-4xl font-bold tracking-tight leading-none">{distance}</p>
              {/* Street name */}
              <p className="text-base opacity-90 truncate mt-1 font-medium">{instruction}</p>
            </div>
            
            {/* Recenter button */}
            {onRecenter && isMapRotated && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="shrink-0 text-white hover:bg-white/20 h-12 w-12 rounded-xl"
                onClick={onRecenter}
              >
                <Compass className="h-6 w-6" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Next maneuver preview */}
        {nextInstruction && (
          <div className="px-4 py-2.5 bg-black/20 flex items-center gap-3 text-white/90 border-t border-white/10">
            <span className="text-sm opacity-70">Potem</span>
            <div className="h-5 w-5 opacity-80">
              {nextIcon}
            </div>
            <span className="font-semibold text-sm">{nextInstruction}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TurnByTurnBanner;
