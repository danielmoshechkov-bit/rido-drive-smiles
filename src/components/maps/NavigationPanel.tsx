// GetRido Maps - Navigation Panel Component
import { Navigation, X, Clock, Gauge, AlertTriangle, Target, Signal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { NavigationState } from './useNavigation';
import { GpsState } from './useUserLocation';

interface NavigationPanelProps {
  navigation: NavigationState & {
    stopNavigation: () => void;
    toggleFollowMode: () => void;
  };
  gps: GpsState;
}

const NavigationPanel = ({ navigation, gps }: NavigationPanelProps) => {
  const { 
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

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 rido-nav-panel p-4 min-w-80 max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-500/15 rounded-xl">
            <Navigation className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <span className="font-bold text-lg">Nawigacja</span>
            {wakeLockActive && (
              <Badge variant="outline" className="ml-2 text-xs bg-green-500/10 text-green-600 border-green-500/30">
                Ekran aktywny
              </Badge>
            )}
          </div>
        </div>
        <Button size="sm" variant="destructive" onClick={stopNavigation} className="gap-1">
          <X className="h-4 w-4" />
          Zakończ
        </Button>
      </div>

      {/* Main stats - Premium cards */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center p-3 rido-stat-card">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className="h-3 w-3 text-primary/60" />
          </div>
          <p className="text-xs text-muted-foreground">Dystans</p>
          <p className="font-bold text-2xl text-foreground">{remainingDistance.toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground">km</p>
        </div>
        <div className="text-center p-3 rido-stat-card">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className="h-3 w-3 text-primary/60" />
          </div>
          <p className="text-xs text-muted-foreground">Czas</p>
          <p className="font-bold text-2xl text-foreground">{Math.round(remainingDuration)}</p>
          <p className="text-[10px] text-muted-foreground">min</p>
        </div>
        <div className="text-center p-3 rido-stat-card bg-primary/5 border-primary/20">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Gauge className="h-3 w-3 text-primary" />
          </div>
          <p className="text-xs text-muted-foreground">Prędkość</p>
          <p className="font-bold text-2xl text-primary">{speedKmh ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground">km/h</p>
        </div>
      </div>

      {/* ETA and accuracy row */}
      <div className="flex items-center justify-between p-2 bg-primary/5 rounded-lg mb-3">
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

      {/* GPS unstable warning */}
      {gps.isUnstable && (
        <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-600 text-xs mb-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Niestabilny sygnał GPS - pozycja może być niedokładna</span>
        </div>
      )}

      {/* Follow mode toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Tryb śledzenia:</span>
        <Button 
          variant={followMode ? "default" : "outline"} 
          size="sm" 
          onClick={toggleFollowMode}
          className="text-xs"
        >
          {followMode ? 'Włączony' : 'Wyłączony'}
        </Button>
      </div>
    </div>
  );
};

export default NavigationPanel;
