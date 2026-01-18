// GetRido Maps - Mobile Status Tab Content (Premium + Incidents)
import { Signal, Wifi, MapPin, Navigation2, Gauge, Clock, AlertTriangle, CheckCircle, RefreshCw, Construction } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GpsState } from './useUserLocation';
import { Incident, incidentsService } from './incidentsService';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface MobileStatusTabProps {
  gps: GpsState;
  incidents?: Incident[];
  incidentsLoading?: boolean;
  onRefreshIncidents?: () => void;
}

const MobileStatusTab = ({ 
  gps, 
  incidents = [],
  incidentsLoading = false,
  onRefreshIncidents,
}: MobileStatusTabProps) => {
  const { location, status, error, hasConsent, mode, isUnstable } = gps;
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Update cooldown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCooldownRemaining(incidentsService.getCooldownRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const speedKmh = location?.speed 
    ? Math.round(location.speed * 3.6) 
    : null;

  const accuracyM = location?.accuracy 
    ? Math.round(location.accuracy) 
    : null;

  const headingDeg = location?.heading 
    ? Math.round(location.heading) 
    : null;

  const getStatusColor = () => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'weak': return 'bg-amber-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-muted-foreground';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'active': return 'Aktywny';
      case 'weak': return 'Słaby sygnał';
      case 'error': return 'Błąd';
      default: return 'Nieaktywny';
    }
  };

  const lastFetchTime = incidentsService.getLastFetchTime();
  const canRefresh = incidentsService.canRefresh();

  return (
    <div className="space-y-5">
      {/* GPS Status Header - Premium */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
            status === 'active' ? 'bg-green-500/20' : status === 'weak' ? 'bg-amber-500/20' : 'bg-muted/50'
          }`}>
            <Signal className={`h-5 w-5 ${
              status === 'active' ? 'text-green-600' : status === 'weak' ? 'text-amber-600' : 'text-muted-foreground'
            }`} />
          </div>
          <div>
            <span className="font-bold text-lg">Status GPS</span>
            <p className="text-xs text-muted-foreground">Moduł lokalizacji</p>
          </div>
        </div>
        <Badge 
          variant="outline" 
          className={`gap-1.5 px-3 py-1 ${
            status === 'active' ? 'bg-green-500/10 text-green-600 border-green-500/30' :
            status === 'weak' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
            status === 'error' ? 'bg-red-500/10 text-red-600 border-red-500/30' :
            'bg-muted/50'
          }`}
        >
          <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
          {getStatusText()}
        </Badge>
      </div>

      {/* Consent Status */}
      {!hasConsent && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-700">Brak zgody na lokalizację. Włącz GPS w ustawieniach.</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <span className="text-sm font-medium text-red-700">{error}</span>
        </div>
      )}

      {/* GPS Unstable Warning */}
      {isUnstable && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-700">Wykryto niestabilny sygnał GPS (możliwe skoki pozycji)</span>
        </div>
      )}

      {/* Location Details - Premium Cards */}
      {location && (
        <div className="space-y-4">
          {/* Coordinates */}
          <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Współrzędne</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background/50 p-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Lat:</span>
                <span className="ml-2 font-mono font-medium">{location.latitude.toFixed(6)}</span>
              </div>
              <div className="bg-background/50 p-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Lng:</span>
                <span className="ml-2 font-mono font-medium">{location.longitude.toFixed(6)}</span>
              </div>
            </div>
          </div>

          {/* Stats Grid - Premium */}
          <div className="grid grid-cols-2 gap-3">
            {/* Accuracy */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Dokładność</span>
              </div>
              <p className={`font-bold text-2xl ${accuracyM && accuracyM > 50 ? 'text-amber-600' : ''}`}>
                ±{accuracyM ?? '—'}
                <span className="text-sm font-normal text-muted-foreground ml-1">m</span>
              </p>
            </div>

            {/* Speed */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Prędkość</span>
              </div>
              <p className="font-bold text-2xl">
                {speedKmh ?? '—'}
                <span className="text-sm font-normal text-muted-foreground ml-1">km/h</span>
              </p>
            </div>

            {/* Heading */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Navigation2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Kierunek</span>
              </div>
              <p className="font-bold text-2xl">
                {headingDeg ?? '—'}
                <span className="text-sm font-normal text-muted-foreground ml-1">°</span>
              </p>
            </div>

            {/* Last Update */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Aktualizacja</span>
              </div>
              <p className="font-bold text-lg">
                {location.timestamp ? new Date(location.timestamp).toLocaleTimeString('pl-PL') : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mode */}
      <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/30">
        <span className="text-sm font-medium text-muted-foreground">Tryb GPS:</span>
        <Badge variant="secondary" className="font-medium">
          {mode === 'navigation' ? 'Nawigacja (agresywny)' : 'Normalny'}
        </Badge>
      </div>

      {/* Incidents Section */}
      {(incidents.length > 0 || onRefreshIncidents) && (
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Construction className="h-5 w-5 text-amber-500" />
              <span className="font-bold text-sm">Zdarzenia na trasie</span>
              {incidents.length > 0 && (
                <Badge variant="secondary" className="text-xs">{incidents.length}</Badge>
              )}
            </div>
            {onRefreshIncidents && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onRefreshIncidents}
                disabled={!canRefresh || incidentsLoading}
                className="h-8 px-2 gap-1"
              >
                <RefreshCw className={`h-4 w-4 ${incidentsLoading ? 'animate-spin' : ''}`} />
                {!canRefresh && cooldownRemaining > 0 && (
                  <span className="text-xs">{cooldownRemaining}s</span>
                )}
              </Button>
            )}
          </div>
          
          {incidents.length > 0 ? (
            <div className="space-y-2">
              {incidents.slice(0, 5).map(incident => (
                <div key={incident.id} className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Construction className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{incident.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Źródło: OSM • {format(incident.fetchedAt, 'HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
              {incidents.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">
                  + {incidents.length - 5} więcej zdarzeń
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-3">
              Brak wykrytych zdarzeń drogowych
            </p>
          )}
          
          {lastFetchTime && (
            <p className="text-xs text-muted-foreground text-center">
              Ostatnia aktualizacja: {format(lastFetchTime, 'HH:mm:ss')}
            </p>
          )}
        </div>
      )}

      {/* Connected indicator */}
      {hasConsent && status === 'active' && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <span className="text-sm font-medium text-green-700">GPS połączony i działa prawidłowo</span>
        </div>
      )}
    </div>
  );
};

export default MobileStatusTab;
