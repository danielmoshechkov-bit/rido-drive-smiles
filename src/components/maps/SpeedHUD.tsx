// GetRido Maps - Speed HUD (Premium Display)
import { useEffect, useState, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { RIDO_THEME_COLORS } from './ridoMapTheme';

interface SpeedHUDProps {
  currentSpeed: number | null; // km/h
  speedLimit: number | null;   // km/h
  isEstimatedLimit?: boolean;  // Show ~ for estimated limits
  yellowThreshold?: number;    // km/h over limit for yellow warning
  redThreshold?: number;       // km/h over limit for red warning
  className?: string;
}

type SpeedState = 'normal' | 'yellow' | 'red';

const SpeedHUD = ({
  currentSpeed,
  speedLimit,
  isEstimatedLimit = false,
  yellowThreshold = 9,
  redThreshold = 15,
  className = '',
}: SpeedHUDProps) => {
  const [speedState, setSpeedState] = useState<SpeedState>('normal');
  const lastToastRef = useRef<number>(0);

  // Calculate speed state
  useEffect(() => {
    if (currentSpeed === null || speedLimit === null) {
      setSpeedState('normal');
      return;
    }

    const over = currentSpeed - speedLimit;

    if (over >= redThreshold) {
      setSpeedState('red');
      
      // Show toast max once per 30 seconds
      const now = Date.now();
      if (now - lastToastRef.current > 30000) {
        toast.warning(`Zwolnij — przekroczenie +${Math.round(over)} km/h`, {
          icon: <AlertTriangle className="h-4 w-4" />,
          duration: 4000,
        });
        lastToastRef.current = now;
      }
    } else if (over >= yellowThreshold) {
      setSpeedState('yellow');
    } else {
      setSpeedState('normal');
    }
  }, [currentSpeed, speedLimit, yellowThreshold, redThreshold]);

  // No speed data - don't show
  if (currentSpeed === null) {
    return null;
  }

  const displaySpeed = Math.round(currentSpeed);
  
  // State-based colors
  const speedColor = speedState === 'red' 
    ? '#EF4444' 
    : speedState === 'yellow' 
      ? '#F59E0B' 
      : RIDO_THEME_COLORS.violetPrimary;
  
  const bgColor = speedState === 'red'
    ? 'bg-red-500/10'
    : speedState === 'yellow'
      ? 'bg-amber-500/10'
      : 'bg-card/95';

  const borderColor = speedState === 'red'
    ? 'border-red-500/50'
    : speedState === 'yellow'
      ? 'border-amber-500/50'
      : 'border-border';

  return (
    <div 
      className={`flex flex-col items-center gap-1.5 ${className}`}
      role="status"
      aria-label={`Prędkość ${displaySpeed} km/h${speedLimit ? `, limit ${speedLimit}` : ''}`}
    >
      {/* Speed Circle */}
      <div 
        className={`
          relative flex flex-col items-center justify-center
          w-16 h-16 rounded-full
          ${bgColor} ${borderColor}
          border-2 backdrop-blur-md shadow-lg
          transition-all duration-300
          ${speedState === 'red' ? 'animate-pulse' : ''}
        `}
      >
        {/* Speed number */}
        <span 
          className="text-2xl font-bold leading-none"
          style={{ color: speedColor }}
        >
          {displaySpeed}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          km/h
        </span>
        
        {/* Warning indicator */}
        {speedState !== 'normal' && (
          <div 
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center shadow"
            style={{ 
              background: speedState === 'red' ? '#EF4444' : '#F59E0B',
            }}
          >
            <AlertTriangle className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>

      {/* Speed Limit Badge */}
      {speedLimit !== null && (
        <div 
          className="
            flex items-center justify-center
            min-w-[36px] h-7 px-2
            bg-white dark:bg-gray-800
            border-2 border-red-500 rounded-md
            shadow-sm
          "
        >
          <span className="text-xs font-bold text-foreground leading-none">
            {isEstimatedLimit && '~'}{speedLimit}
          </span>
        </div>
      )}
    </div>
  );
};

export default SpeedHUD;
