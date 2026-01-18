// GetRido Maps - Turn-by-Turn Navigation Banner (Google Maps Style)
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
  CircleDot,
  Flag,
  Navigation,
  Compass
} from 'lucide-react';
import { RouteStep } from './routingService';
import { Button } from '@/components/ui/button';

interface TurnByTurnBannerProps {
  currentStep: RouteStep | null;
  nextStep?: RouteStep | null;
  distanceToStep: number; // meters
  onRecenter?: () => void;
  isMapRotated?: boolean;
}

// Get icon for maneuver type
const getManeuverIcon = (type: string, modifier?: string) => {
  const iconClass = "h-8 w-8";
  
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

// Get instruction text
const getInstructionText = (step: RouteStep): string => {
  const { maneuver, name } = step;
  const streetName = name || 'drogę';
  
  switch (maneuver.type) {
    case 'depart':
      return `Jedź na ${streetName}`;
    case 'straight':
    case 'continue':
      return `Jedź prosto na ${streetName}`;
    case 'turn':
      switch (maneuver.modifier) {
        case 'left':
          return `Skręć w lewo w ${streetName}`;
        case 'right':
          return `Skręć w prawo w ${streetName}`;
        case 'slight left':
          return `Trzymaj się lewej na ${streetName}`;
        case 'slight right':
          return `Trzymaj się prawej na ${streetName}`;
        case 'sharp left':
          return `Skręć ostro w lewo`;
        case 'sharp right':
          return `Skręć ostro w prawo`;
        case 'uturn':
          return `Zawróć`;
        default:
          return `Skręć na ${streetName}`;
      }
    case 'merge':
      return `Włącz się na ${streetName}`;
    case 'on ramp':
      return `Wjedź na ${streetName}`;
    case 'off ramp':
      return `Zjedź na ${streetName}`;
    case 'roundabout':
    case 'rotary':
      return maneuver.exit ? `${maneuver.exit}. zjazd z ronda` : `Jedź przez rondo`;
    case 'arrive':
      return `Dojeżdżasz do celu`;
    case 'fork':
      return maneuver.modifier?.includes('left') ? `Trzymaj się lewej` : `Trzymaj się prawej`;
    default:
      return `Kontynuuj na ${streetName}`;
  }
};

// Format distance
const formatDistance = (meters: number): string => {
  if (meters < 100) {
    return `${Math.round(meters / 10) * 10} m`;
  } else if (meters < 1000) {
    return `${Math.round(meters / 50) * 50} m`;
  } else {
    return `${(meters / 1000).toFixed(1)} km`;
  }
};

// Get short instruction for "then" preview
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
  // All hooks must be called before conditional returns
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
      {/* Main banner - Google Maps Green style */}
      <div 
        className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-2xl animate-slide-down"
        style={{
          background: 'linear-gradient(135deg, #0f9d58, #0d8043)',
          boxShadow: '0 8px 32px -8px rgba(15, 157, 88, 0.6)',
        }}
      >
        <div className="p-4 text-white">
          <div className="flex items-center gap-4">
            {/* Direction icon - larger for visibility */}
            <div className="h-16 w-16 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <div className="scale-125">
                {icon}
              </div>
            </div>
            
            {/* Instruction */}
            <div className="flex-1 min-w-0">
              <p className="text-4xl font-bold tracking-tight">{distance}</p>
              <p className="text-base opacity-95 truncate mt-0.5">{instruction}</p>
            </div>
            
            {/* Recenter button */}
            {onRecenter && isMapRotated && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="shrink-0 text-white hover:bg-white/20 h-12 w-12"
                onClick={onRecenter}
              >
                <Compass className="h-6 w-6" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Next maneuver preview - always show when available */}
        {nextInstruction && (
          <div className="px-4 py-3 bg-black/15 flex items-center gap-3 text-white/95 border-t border-white/10">
            <span className="text-sm opacity-80">Potem</span>
            <div className="h-6 w-6 opacity-90">
              {nextIcon}
            </div>
            <span className="font-semibold">{nextInstruction}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TurnByTurnBanner;
