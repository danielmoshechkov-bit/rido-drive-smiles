// GetRido Maps - Parking Timer Widget
import { useState, useEffect } from 'react';
import { ParkingCircle, Timer, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ParkingSession, getTimeRemaining, formatTimeRemaining } from './parkingService';
import { RIDO_THEME_COLORS } from './ridoMapTheme';
import { toast } from 'sonner';

interface ParkingTimerWidgetProps {
  session: ParkingSession;
  onExtend: () => void;
  onEnd: () => void;
  compact?: boolean;
}

const ParkingTimerWidget = ({ session, onExtend, onEnd, compact = false }: ParkingTimerWidgetProps) => {
  const [timeLeft, setTimeLeft] = useState(() => getTimeRemaining(session.end_at));
  const [warned2Min, setWarned2Min] = useState(false);
  const [warnedExpired, setWarnedExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTime = getTimeRemaining(session.end_at);
      setTimeLeft(newTime);
      
      // 2 minute warning
      if (!warned2Min && newTime.minutes <= 2 && !newTime.expired) {
        setWarned2Min(true);
        toast.warning('Parking kończy się za 2 minuty!', {
          description: 'Przedłuż bilet, aby uniknąć mandatu.',
          action: {
            label: 'Przedłuż',
            onClick: onExtend,
          },
          duration: 10000,
        });
      }
      
      // Expired warning
      if (!warnedExpired && newTime.expired) {
        setWarnedExpired(true);
        toast.error('Parking zakończony!', {
          description: 'Dokup bilet lub opuść strefę.',
          action: {
            label: 'Przedłuż',
            onClick: onExtend,
          },
          duration: 15000,
        });
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [session.end_at, warned2Min, warnedExpired, onExtend]);

  const isWarning = timeLeft.minutes <= 5 && !timeLeft.expired;
  const isExpired = timeLeft.expired;

  if (compact) {
    return (
      <div 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          isExpired ? 'bg-red-500/10 border border-red-500/30' :
          isWarning ? 'bg-amber-500/10 border border-amber-500/30' :
          'bg-primary/10 border border-primary/20'
        }`}
      >
        <ParkingCircle className={`h-4 w-4 ${
          isExpired ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-primary'
        }`} />
        <span className={`font-bold text-sm ${
          isExpired ? 'text-red-600' : isWarning ? 'text-amber-600' : ''
        }`}>
          {formatTimeRemaining(session.end_at)}
        </span>
        <span className="text-xs text-muted-foreground">{session.vehicle_plate}</span>
      </div>
    );
  }

  return (
    <div 
      className={`rounded-2xl border-2 overflow-hidden ${
        isExpired ? 'border-red-500' : isWarning ? 'border-amber-500' : 'border-primary/30'
      }`}
    >
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-center justify-between"
        style={{ 
          background: isExpired 
            ? 'linear-gradient(135deg, #ef444420, #f9731610)' 
            : isWarning 
              ? 'linear-gradient(135deg, #f59e0b20, #eab30810)' 
              : `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldAccent}15, ${RIDO_THEME_COLORS.goldMuted}10)` 
        }}
      >
        <div className="flex items-center gap-2">
          <ParkingCircle className={`h-5 w-5 ${
            isExpired ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-amber-600'
          }`} />
          <span className="font-bold text-sm">Aktywny parking</span>
        </div>
        {isWarning && !isExpired && (
          <AlertTriangle className="h-5 w-5 text-amber-600 animate-pulse" />
        )}
      </div>
      
      {/* Timer */}
      <div className="p-4 text-center">
        <div className="flex items-center justify-center gap-3">
          <Timer className={`h-8 w-8 ${
            isExpired ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-primary'
          }`} />
          <span className={`text-4xl font-bold tabular-nums ${
            isExpired ? 'text-red-600' : isWarning ? 'text-amber-600' : ''
          }`}>
            {isExpired ? 'ZAKOŃCZONY' : `${timeLeft.minutes}:${timeLeft.seconds.toString().padStart(2, '0')}`}
          </span>
        </div>
        
        <p className="text-sm text-muted-foreground mt-2">
          {session.zone?.name || 'Strefa SPP'} • {session.vehicle_plate}
        </p>
        
        {!isExpired && (
          <p className="text-xs text-muted-foreground mt-1">
            Do: {new Date(session.end_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
      
      {/* Actions */}
      <div className="p-4 pt-0 flex gap-2">
        <Button 
          variant="outline" 
          className="flex-1 gap-2"
          onClick={onEnd}
        >
          Zakończ
        </Button>
        <Button 
          className="flex-1 gap-2"
          style={{ 
            background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldAccent}, ${RIDO_THEME_COLORS.goldDark})`,
            color: 'white'
          }}
          onClick={onExtend}
        >
          <Plus className="h-4 w-4" />
          Przedłuż
        </Button>
      </div>
    </div>
  );
};

export default ParkingTimerWidget;
