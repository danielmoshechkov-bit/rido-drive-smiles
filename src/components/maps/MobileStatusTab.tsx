// GetRido Maps - Mobile Status Tab Content
import { Signal, Wifi, MapPin, Navigation2, Gauge, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GpsState } from './useUserLocation';

interface MobileStatusTabProps {
  gps: GpsState;
}

const MobileStatusTab = ({ gps }: MobileStatusTabProps) => {
  const { location, status, error, hasConsent, mode, isUnstable } = gps;

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

  return (
    <div className="space-y-4">
      {/* GPS Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Signal className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg">Status GPS</span>
        </div>
        <Badge 
          variant="outline" 
          className={`gap-1.5 ${
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
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-600 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Brak zgody na lokalizację. Włącz GPS w ustawieniach.</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-600 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* GPS Unstable Warning */}
      {isUnstable && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-600 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Wykryto niestabilny sygnał GPS (możliwe skoki pozycji)</span>
        </div>
      )}

      {/* Location Details */}
      {location && (
        <div className="space-y-3">
          {/* Coordinates */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Współrzędne</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Lat:</span>
                <span className="ml-1 font-mono">{location.latitude.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Lng:</span>
                <span className="ml-1 font-mono">{location.longitude.toFixed(6)}</span>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Accuracy */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Wifi className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Dokładność</span>
              </div>
              <p className={`font-semibold text-lg ${accuracyM && accuracyM > 50 ? 'text-amber-600' : ''}`}>
                ±{accuracyM ?? '—'} m
              </p>
            </div>

            {/* Speed */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Prędkość</span>
              </div>
              <p className="font-semibold text-lg">{speedKmh ?? '—'} km/h</p>
            </div>

            {/* Heading */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Navigation2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Kierunek</span>
              </div>
              <p className="font-semibold text-lg">{headingDeg ?? '—'}°</p>
            </div>

            {/* Last Update */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Ostatnia aktualizacja</span>
              </div>
              <p className="font-semibold text-sm">
                {location.timestamp ? new Date(location.timestamp).toLocaleTimeString('pl-PL') : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mode */}
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
        <span className="text-sm text-muted-foreground">Tryb GPS:</span>
        <Badge variant="secondary">
          {mode === 'navigation' ? 'Nawigacja (agresywny)' : 'Normalny'}
        </Badge>
      </div>

      {/* Connected indicator */}
      {hasConsent && status === 'active' && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-600 text-sm">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>GPS połączony i działa prawidłowo</span>
        </div>
      )}
    </div>
  );
};

export default MobileStatusTab;
