// GetRido Maps - Mobile Navigation Tab Content
import { Navigation, Clock, Gauge, Target, Signal, AlertTriangle, X, Locate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { NavigationState } from './useNavigation';
import { GpsState } from './useUserLocation';

interface MobileNavigationTabProps {
  navigation: NavigationState & {
    stopNavigation: () => void;
    toggleFollowMode: () => void;
  };
  gps: GpsState;
}

const MobileNavigationTab = ({ navigation, gps }: MobileNavigationTabProps) => {
  const { 
    isNavigating,
    remainingDistance, 
    remainingDuration, 
    eta, 
    followMode,
    wakeLockActive,
    stopNavigation, 
    toggleFollowMode 
  } = navigation;

  const speedKmh = gps.location?.speed 
    ? Math.round(gps.location.speed * 3.6) 
    : null;

  const accuracyM = gps.location?.accuracy 
    ? Math.round(gps.location.accuracy) 
    : null;

  if (!isNavigating) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Navigation className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <p className="font-medium text-muted-foreground">Brak aktywnej nawigacji</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Wyszukaj trasę i kliknij „Prowadź do celu"
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-500/20 rounded-lg">
            <Navigation className="h-5 w-5 text-green-600 animate-pulse" />
          </div>
          <span className="font-bold text-lg">Nawigacja aktywna</span>
        </div>
        {wakeLockActive && (
          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
            Ekran aktywny
          </Badge>
        )}
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-4 bg-muted/50 rounded-xl">
          <Target className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Dystans</p>
          <p className="font-bold text-2xl">{remainingDistance.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">km</p>
        </div>
        <div className="text-center p-4 bg-muted/50 rounded-xl">
          <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Czas</p>
          <p className="font-bold text-2xl">{Math.round(remainingDuration)}</p>
          <p className="text-xs text-muted-foreground">min</p>
        </div>
        <div className="text-center p-4 bg-muted/50 rounded-xl">
          <Gauge className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Prędkość</p>
          <p className="font-bold text-2xl">{speedKmh ?? '—'}</p>
          <p className="text-xs text-muted-foreground">km/h</p>
        </div>
      </div>

      {/* ETA and accuracy */}
      <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-sm">
            Przyjazd ok. <span className="font-semibold">{eta ? format(eta, 'HH:mm') : '—'}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Signal className="h-3 w-3" />
          <span>±{accuracyM ?? '—'}m</span>
        </div>
      </div>

      {/* GPS warning */}
      {gps.isUnstable && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-600 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Niestabilny sygnał GPS - pozycja może być niedokładna</span>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tryb śledzenia:</span>
          <Button 
            variant={followMode ? "default" : "outline"} 
            size="sm" 
            onClick={toggleFollowMode}
            className="gap-2"
          >
            <Locate className="h-4 w-4" />
            {followMode ? 'Włączony' : 'Wyłączony'}
          </Button>
        </div>
        
        <Button 
          variant="destructive" 
          className="w-full gap-2" 
          onClick={stopNavigation}
        >
          <X className="h-4 w-4" />
          Zakończ nawigację
        </Button>
      </div>
    </div>
  );
};

export default MobileNavigationTab;
