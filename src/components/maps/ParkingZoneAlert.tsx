// GetRido Maps - Parking Zone Alert Component
import { AlertTriangle, ParkingCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ParkingZone } from './parkingService';
import { RIDO_THEME_COLORS } from './ridoMapTheme';

interface ParkingZoneAlertProps {
  zone: ParkingZone;
  type: 'entered' | 'destination';
  onPayParking: () => void;
  onDismiss: () => void;
}

const ParkingZoneAlert = ({ zone, type, onPayParking, onDismiss }: ParkingZoneAlertProps) => {
  const isDestination = type === 'destination';
  
  return (
    <div 
      className="fixed top-14 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-in slide-in-from-top duration-300"
    >
      <div 
        className="bg-card/95 backdrop-blur-lg rounded-2xl shadow-xl border-2 overflow-hidden"
        style={{ borderColor: RIDO_THEME_COLORS.goldAccent }}
      >
        {/* Header */}
        <div 
          className="px-4 py-3 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldAccent}15, ${RIDO_THEME_COLORS.goldMuted}10)` }}
        >
          <div className="flex items-center gap-2">
            <div 
              className="h-8 w-8 rounded-full flex items-center justify-center"
              style={{ background: RIDO_THEME_COLORS.goldAccent }}
            >
              <ParkingCircle className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-sm" style={{ color: RIDO_THEME_COLORS.goldDark }}>
              Strefa SPP
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Content */}
        <div className="px-4 py-3 space-y-3">
          <p className="text-sm">
            {isDestination ? (
              <>Cel znajduje się w strefie <strong>{zone.name}</strong>. Chcesz przygotować bilet parkingowy?</>
            ) : (
              <>Jesteś w strefie płatnego parkowania <strong>{zone.name}</strong>.</>
            )}
          </p>
          
          {/* Quick info about zone */}
          {zone.rules.ratePerHour && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              <span>Stawka: {zone.rules.ratePerHour} PLN/h</span>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-2">
            <Button 
              className="flex-1 h-10 font-semibold"
              style={{ 
                background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldAccent}, ${RIDO_THEME_COLORS.goldDark})`,
                color: 'white'
              }}
              onClick={onPayParking}
            >
              <ParkingCircle className="h-4 w-4 mr-2" />
              {isDestination ? 'Tak, opłać po przyjeździe' : 'Opłać parking'}
            </Button>
          </div>
          
          {isDestination && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs text-muted-foreground"
              onClick={onDismiss}
            >
              Nie teraz
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParkingZoneAlert;
