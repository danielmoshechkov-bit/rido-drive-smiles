// GetRido Maps - Speed + Limit Overlay (Yandex-style top-right)
// Shows current speed and speed limit in prominent circles

import { AlertTriangle } from 'lucide-react';

interface SpeedLimitOverlayProps {
  currentSpeed: number | null;
  speedLimit: number | null;
  isEstimatedLimit?: boolean;
  yellowThreshold?: number;
  redThreshold?: number;
}

const SpeedLimitOverlay = ({
  currentSpeed,
  speedLimit,
  isEstimatedLimit = false,
  yellowThreshold = 9,
  redThreshold = 15,
}: SpeedLimitOverlayProps) => {
  // Calculate warning state
  const overSpeed = currentSpeed !== null && speedLimit !== null 
    ? currentSpeed - speedLimit 
    : 0;
  
  const isYellow = overSpeed > yellowThreshold && overSpeed <= redThreshold;
  const isRed = overSpeed > redThreshold;
  
  // Speed circle background based on warning
  const speedBg = isRed 
    ? 'bg-red-500 text-white' 
    : isYellow 
      ? 'bg-amber-400 text-white' 
      : 'bg-white/95 text-gray-900';
  
  const speedBorder = isRed 
    ? 'border-red-600' 
    : isYellow 
      ? 'border-amber-500' 
      : 'border-gray-200';

  return (
    <div 
      className="absolute top-4 right-4 z-50 flex items-center gap-2"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Current Speed - Large circle */}
      <div 
        className={`
          h-16 w-16 rounded-full backdrop-blur-lg shadow-xl border-2
          flex flex-col items-center justify-center
          transition-all duration-300
          ${speedBg} ${speedBorder}
        `}
      >
        <span className="text-2xl font-bold leading-none">
          {currentSpeed ?? 0}
        </span>
        <span className="text-[10px] opacity-70 font-medium">km/h</span>
      </div>
      
      {/* Speed Limit - Red-bordered circle (Yandex style) */}
      {speedLimit && (
        <div 
          className={`
            h-14 w-14 rounded-full bg-white shadow-lg
            border-[4px] border-red-500
            flex flex-col items-center justify-center
            transition-all duration-300
            ${isRed ? 'animate-pulse' : ''}
          `}
        >
          <span className="text-lg font-bold text-gray-900 leading-none">
            {isEstimatedLimit && '~'}{speedLimit}
          </span>
          {isEstimatedLimit && (
            <span className="text-[8px] text-muted-foreground">szac.</span>
          )}
        </div>
      )}
      
      {/* Speed warning icon (when exceeding) */}
      {isRed && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="h-6 w-6 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
            <AlertTriangle className="h-3.5 w-3.5 text-white" />
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeedLimitOverlay;
