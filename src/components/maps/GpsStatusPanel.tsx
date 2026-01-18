import { Locate, Navigation, Settings, SignalHigh, SignalLow, SignalZero, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { GpsState, GpsStatus } from './useUserLocation';

interface GpsStatusPanelProps {
  gps: GpsState;
}

const statusConfig: Record<GpsStatus, { color: string; bg: string; border: string; text: string; icon: React.ReactNode }> = {
  active: {
    color: 'bg-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    text: 'Aktywny',
    icon: <SignalHigh className="h-4 w-4 text-green-500" />,
  },
  weak: {
    color: 'bg-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    text: 'Słaby sygnał',
    icon: <SignalLow className="h-4 w-4 text-yellow-500" />,
  },
  error: {
    color: 'bg-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'Błąd',
    icon: <SignalZero className="h-4 w-4 text-red-500" />,
  },
  inactive: {
    color: 'bg-gray-500',
    bg: 'bg-muted/50',
    border: 'border-muted-foreground/20',
    text: 'Wyłączony',
    icon: <SignalZero className="h-4 w-4 text-muted-foreground" />,
  },
};

const GpsStatusPanel = ({ gps }: GpsStatusPanelProps) => {
  const { location, status, error, hasConsent, centerOnUser, revokeConsent } = gps;
  const config = statusConfig[status];

  // Convert speed from m/s to km/h
  const speedKmh = location?.speed ? Math.round(location.speed * 3.6) : null;
  // Round accuracy to nearest meter
  const accuracyM = location?.accuracy ? Math.round(location.accuracy) : null;

  return (
    <div className="p-4 border-b">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Locate className="h-4 w-4 text-primary" />
        GPS
      </h3>

      <div className="space-y-3">
        {/* Status indicator */}
        <div className={`flex items-center gap-2 p-2.5 rounded-lg ${config.bg} border ${config.border}`}>
          <div className={`h-3 w-3 rounded-full ${config.color} ${status === 'active' ? 'animate-pulse' : ''}`} />
          <div className="flex items-center gap-1.5">
            {config.icon}
            <span className="text-sm font-medium">{config.text}</span>
          </div>
        </div>

        {/* Error message */}
        {error && status === 'error' && (
          <p className="text-xs text-red-500 px-1">{error}</p>
        )}

        {/* Location details */}
        {location && hasConsent && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/50">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-xs">
                <span className="text-muted-foreground">Prędkość</span>
                <p className="font-medium">{speedKmh !== null ? `${speedKmh} km/h` : '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/50">
              <SignalHigh className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-xs">
                <span className="text-muted-foreground">Dokładność</span>
                <p className="font-medium">{accuracyM !== null ? `±${accuracyM} m` : '—'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Center on me button */}
        {hasConsent && location && (
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full gap-2" 
            onClick={centerOnUser}
          >
            <Navigation className="h-4 w-4" />
            Centruj na mnie
          </Button>
        )}

        {/* Settings section */}
        {hasConsent && (
          <div className="pt-2 border-t mt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                <Label htmlFor="gps-consent" className="text-xs text-muted-foreground cursor-pointer">
                  Udostępnianie lokalizacji
                </Label>
              </div>
              <Switch
                id="gps-consent"
                checked={hasConsent}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    revokeConsent();
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GpsStatusPanel;
