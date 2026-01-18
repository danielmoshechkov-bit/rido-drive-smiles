// GetRido Maps - Speed Indicator (Bottom Left Corner)
import { useMemo } from 'react';

interface SpeedIndicatorProps {
  currentSpeed: number; // km/h
  speedLimit?: number | null; // km/h
  warningThreshold?: number; // km/h over limit for warning
  dangerThreshold?: number; // km/h over limit for danger
}

const SpeedIndicator = ({
  currentSpeed,
  speedLimit,
  warningThreshold = 9,
  dangerThreshold = 15,
}: SpeedIndicatorProps) => {
  const speed = Math.round(currentSpeed);

  const status = useMemo(() => {
    if (!speedLimit) return 'normal';
    const over = currentSpeed - speedLimit;
    if (over >= dangerThreshold) return 'danger';
    if (over >= warningThreshold) return 'warning';
    return 'normal';
  }, [currentSpeed, speedLimit, warningThreshold, dangerThreshold]);

  const getBackgroundStyle = () => {
    switch (status) {
      case 'danger':
        return {
          background: 'linear-gradient(135deg, #EF4444, #DC2626)',
          boxShadow: '0 4px 20px -4px rgba(239, 68, 68, 0.5)',
        };
      case 'warning':
        return {
          background: 'linear-gradient(135deg, #F59E0B, #D97706)',
          boxShadow: '0 4px 20px -4px rgba(245, 158, 11, 0.5)',
        };
      default:
        return {
          background: 'hsl(var(--card))',
          boxShadow: '0 4px 16px -4px rgb(0 0 0 / 0.15)',
        };
    }
  };

  const getTextColor = () => {
    return status === 'normal' ? 'text-foreground' : 'text-white';
  };

  return (
    <div 
      className="absolute left-3 z-20"
      style={{ bottom: '180px' }}
    >
      <div 
        className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl border ${getTextColor()}`}
        style={getBackgroundStyle()}
      >
        <span className="text-2xl font-bold leading-none">{speed}</span>
        <span className="text-[10px] opacity-75">km/h</span>
      </div>
      
      {/* Speed limit badge */}
      {speedLimit && (
        <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white border-2 border-red-500 flex items-center justify-center">
          <span className="text-xs font-bold text-red-600">{speedLimit}</span>
        </div>
      )}
      
      {/* Branding */}
      <div className="mt-1 flex items-center justify-center gap-1 opacity-60">
        <span className="text-[10px] font-medium">Maps</span>
      </div>
    </div>
  );
};

export default SpeedIndicator;
