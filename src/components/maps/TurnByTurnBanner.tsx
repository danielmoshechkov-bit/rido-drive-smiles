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
    <div className="absolute top-0 left-0 right-0 z-30 safe-area-top">
      {/* Main banner */}
      <div 
        className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, hsl(259 65% 58%), hsl(259 65% 48%))',
          boxShadow: '0 8px 32px -8px hsl(259 65% 58% / 0.5)',
        }}
      >
        <div className="p-4 text-white">
          <div className="flex items-center gap-4">
            {/* Direction icon */}
            <div className="h-14 w-14 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              {icon}
            </div>
            
            {/* Instruction */}
            <div className="flex-1 min-w-0">
              <p className="text-3xl font-bold">{distance}</p>
              <p className="text-sm opacity-90 truncate">{instruction}</p>
            </div>
            
            {/* Recenter button */}
            {onRecenter && isMapRotated && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="shrink-0 text-white hover:bg-white/20"
                onClick={onRecenter}
              >
                <Compass className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Next maneuver preview */}
        {nextInstruction && distanceToStep < 500 && (
          <div className="px-4 py-2 bg-black/20 flex items-center gap-2 text-white/90 text-sm">
            <span className="opacity-70">Potem</span>
            <div className="h-5 w-5 opacity-80">
              {nextIcon}
            </div>
            <span className="font-medium">{nextInstruction}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TurnByTurnBanner;
