// GetRido Maps - Lane Guidance Bar (Premium Display)
import { ArrowUp, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight, RotateCw } from 'lucide-react';
import { RIDO_THEME_COLORS } from './ridoMapTheme';

interface Lane {
  indications: string[]; // 'left', 'right', 'straight', 'slight_left', 'slight_right', 'uturn'
  valid: boolean;        // Is this lane valid for the maneuver
}

interface LaneGuidanceBarProps {
  lanes: Lane[];
  distanceToManeuver?: number; // meters
  className?: string;
}

// Map indication to icon
function getIndicationIcon(indication: string, size = 16) {
  switch (indication) {
    case 'left':
      return <ArrowLeft size={size} />;
    case 'right':
      return <ArrowRight size={size} />;
    case 'slight_left':
      return <ArrowUpLeft size={size} />;
    case 'slight_right':
      return <ArrowUpRight size={size} />;
    case 'uturn':
      return <RotateCw size={size} />;
    case 'straight':
    default:
      return <ArrowUp size={size} />;
  }
}

const LaneGuidanceBar = ({ lanes, distanceToManeuver, className = '' }: LaneGuidanceBarProps) => {
  // Don't show if no lanes or too many (likely error)
  if (!lanes || lanes.length === 0 || lanes.length > 8) {
    return null;
  }

  // Don't show if distance > 700m
  if (distanceToManeuver !== undefined && distanceToManeuver > 700) {
    return null;
  }

  return (
    <div 
      className={`
        flex items-center justify-center gap-0.5 p-2
        bg-card/95 backdrop-blur-md border-b shadow-sm
        ${className}
      `}
      role="img"
      aria-label="Podpowiedź pasów ruchu"
    >
      {lanes.map((lane, index) => {
        const isValid = lane.valid;
        
        return (
          <div
            key={index}
            className={`
              flex flex-col items-center justify-center gap-0.5
              px-2 py-1 min-w-[40px]
              rounded-md border
              transition-all duration-200
              ${isValid 
                ? 'border-primary/50 bg-primary/10' 
                : 'border-border/50 bg-muted/30 opacity-50'
              }
            `}
            style={isValid ? {
              borderColor: RIDO_THEME_COLORS.violetPrimary + '60',
              background: RIDO_THEME_COLORS.violetPrimary + '15',
            } : undefined}
          >
            {/* Multiple arrows for combined lanes */}
            <div className="flex items-center gap-0.5">
              {lane.indications.slice(0, 3).map((indication, i) => (
                <span 
                  key={i}
                  style={isValid ? { color: RIDO_THEME_COLORS.violetPrimary } : undefined}
                  className={isValid ? '' : 'text-muted-foreground'}
                >
                  {getIndicationIcon(indication, 14)}
                </span>
              ))}
            </div>
            
            {/* Lane separator line */}
            <div 
              className={`
                w-full h-0.5 rounded-full
                ${isValid ? '' : 'bg-border/50'}
              `}
              style={isValid ? { 
                background: `linear-gradient(90deg, ${RIDO_THEME_COLORS.goldAccent}, ${RIDO_THEME_COLORS.violetPrimary})`,
              } : undefined}
            />
          </div>
        );
      })}
    </div>
  );
};

// Roundabout exit badge component
export const RoundaboutExitBadge = ({ exitNumber, className = '' }: { exitNumber: number; className?: string }) => {
  if (!exitNumber || exitNumber < 1 || exitNumber > 10) {
    return null;
  }

  return (
    <div 
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5
        bg-card/95 backdrop-blur-md border rounded-full shadow-sm
        ${className}
      `}
      style={{
        borderColor: RIDO_THEME_COLORS.goldAccent + '50',
      }}
    >
      <RotateCw 
        size={16} 
        className="animate-spin-slow"
        style={{ color: RIDO_THEME_COLORS.goldAccent }}
      />
      <span className="text-sm font-medium">
        Rondo: zjazd <span 
          className="font-bold"
          style={{ color: RIDO_THEME_COLORS.violetPrimary }}
        >
          {exitNumber}
        </span>
      </span>
    </div>
  );
};

export default LaneGuidanceBar;
