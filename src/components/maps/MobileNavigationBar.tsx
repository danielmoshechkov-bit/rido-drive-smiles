// GetRido Maps - Mobile Navigation Bar (top, during navigation)
import { X, Locate, AlertTriangle, Clock, Signal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { NavigationState } from './useNavigation';
import { GpsState } from './useUserLocation';

interface MobileNavigationBarProps {
  navigation: NavigationState & {
    stopNavigation: () => void;
    toggleFollowMode: () => void;
  };
  gps: GpsState;
}

const MobileNavigationBar = ({ navigation, gps }: MobileNavigationBarProps) => {
  const { 
    remainingDistance, 
    remainingDuration, 
    eta, 
    followMode,
    stopNavigation, 
    toggleFollowMode 
  } = navigation;

  const speedKmh = gps.location?.speed 
    ? Math.round(gps.location.speed * 3.6) 
    : null;

  const accuracyM = gps.location?.accuracy 
    ? Math.round(gps.location.accuracy) 
    : null;

  const isWeakSignal = accuracyM !== null && accuracyM > 50;

  return (
    <div 
      className="absolute top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b shadow-lg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Main stats row */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-4">
          {/* Distance */}
          <div className="text-center">
            <p className="font-bold text-lg leading-tight">{remainingDistance.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground uppercase">km</p>
          </div>
          
          {/* Separator */}
          <div className="w-px h-8 bg-border" />
          
          {/* Duration */}
          <div className="text-center">
            <p className="font-bold text-lg leading-tight">{Math.round(remainingDuration)}</p>
            <p className="text-[10px] text-muted-foreground uppercase">min</p>
          </div>
          
          {/* Separator */}
          <div className="w-px h-8 bg-border" />
          
          {/* Speed */}
          <div className="text-center">
            <p className="font-bold text-lg leading-tight">{speedKmh ?? '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">km/h</p>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* GPS warning */}
          {(gps.isUnstable || isWeakSignal) && (
            <div className="p-1.5 rounded-full bg-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
          )}
          
          {/* Follow mode toggle */}
          <button
            onClick={toggleFollowMode}
            className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors
                       ${followMode ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            aria-label={followMode ? 'Wyłącz śledzenie' : 'Włącz śledzenie'}
          >
            <Locate className="h-4 w-4" />
          </button>
          
          {/* Stop navigation */}
          <Button 
            size="sm" 
            variant="destructive" 
            onClick={stopNavigation}
            className="h-9 w-9 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* ETA row */}
      <div className="px-3 pb-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>
            Przyjazd ok. <span className="font-semibold text-foreground">{eta ? format(eta, 'HH:mm') : '—'}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Signal className="h-3 w-3" />
          <span className={isWeakSignal ? 'text-amber-500' : ''}>±{accuracyM ?? '—'}m</span>
        </div>
      </div>
    </div>
  );
};

export default MobileNavigationBar;
