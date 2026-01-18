// GetRido Maps - Turn Bubble on Map (Google Maps style)
// Alternative navigation style: bubble near the maneuver point

import { useMemo } from 'react';
import { 
  ArrowUp, 
  ArrowUpRight, 
  ArrowRight, 
  ArrowDownRight,
  ArrowLeft,
  ArrowUpLeft,
  ArrowDownLeft,
  RotateCw,
  Flag,
  Navigation,
} from 'lucide-react';
import { RouteStep } from './routingService';

interface TurnBubbleOnMapProps {
  currentStep: RouteStep | null;
  distanceToStep: number;
}

const getManeuverIcon = (type: string, modifier?: string) => {
  const iconClass = "h-6 w-6";
  
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
      return 'Cel podróży';
    default:
      return 'Prosto';
  }
};

const TurnBubbleOnMap = ({
  currentStep,
  distanceToStep,
}: TurnBubbleOnMapProps) => {
  const instruction = useMemo(() => currentStep ? getShortInstruction(currentStep) : '', [currentStep]);
  const icon = useMemo(() => currentStep ? getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier) : null, [currentStep]);
  const distance = useMemo(() => formatDistance(distanceToStep), [distanceToStep]);
  const streetName = currentStep?.name || '';

  if (!currentStep) return null;

  return (
    <div 
      className="absolute left-4 z-50 pointer-events-none"
      style={{ 
        bottom: '45%', // Position in lower-center of map
        maxWidth: 'calc(100% - 2rem)',
      }}
    >
      {/* Google-style blue bubble */}
      <div 
        className="rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-left-4"
        style={{
          background: 'linear-gradient(135deg, #4285F4, #1a73e8)',
          boxShadow: '0 8px 32px -4px rgba(66, 133, 244, 0.5)',
        }}
      >
        <div className="px-4 py-3 flex items-center gap-3 text-white">
          {/* Icon */}
          <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            {icon}
          </div>
          
          {/* Text */}
          <div className="min-w-0">
            {/* Distance - large */}
            <p className="text-2xl font-bold leading-none">{distance}</p>
            {/* Instruction */}
            <p className="text-sm opacity-95 font-medium mt-0.5">{instruction}</p>
            {/* Street name (if available) */}
            {streetName && (
              <p className="text-xs opacity-75 truncate mt-0.5 max-w-[180px]">{streetName}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurnBubbleOnMap;
