// GetRido Maps - Fleet Live Toggle Component
import { useState, useEffect } from 'react';
import { Truck, Signal, WifiOff, CloudUpload, Smartphone } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { fleetLiveService } from './fleetLiveService';
import { GpsState } from './useUserLocation';

interface FleetLiveToggleProps {
  gps: GpsState;
}

const FleetLiveToggle = ({ gps }: FleetLiveToggleProps) => {
  const [isSharing, setIsSharing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueSize, setQueueSize] = useState(0);

  // Online/offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Połączenie przywrócone - wysyłanie pozycji');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Brak połączenia - zapisuję lokalnie');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update queue size periodically when sharing
  useEffect(() => {
    if (isSharing) {
      const interval = setInterval(() => {
        setQueueSize(fleetLiveService.getQueueSize());
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isSharing]);

  // Visibility change - flush on background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && fleetLiveService.isSharing()) {
        fleetLiveService.flushQueue().catch(console.error);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      // Check GPS availability
      if (!gps.hasConsent || !gps.location) {
        toast.error('Włącz GPS aby udostępniać lokalizację');
        return;
      }

      if (gps.isGpsBlocked) {
        toast.error('Lokalizacja jest zablokowana - sprawdź uprawnienia');
        return;
      }

      fleetLiveService.startSharing(() => 
        gps.location ? {
          lat: gps.location.latitude,
          lng: gps.location.longitude,
          speed: gps.location.speed,
          heading: gps.location.heading,
          accuracy: gps.location.accuracy,
        } : null
      );
      
      setIsSharing(true);
      setLastUpdate(new Date());
      toast.success('Tryb pracy włączony - lokalizacja udostępniana');
    } else {
      await fleetLiveService.stopSharing();
      setIsSharing(false);
      setLastUpdate(null);
      setQueueSize(0);
      toast.info('Tryb pracy wyłączony');
    }
  };

  // Update "last update" display
  useEffect(() => {
    if (isSharing) {
      const interval = setInterval(() => {
        setLastUpdate(new Date());
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isSharing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fleetLiveService.isSharing()) {
        fleetLiveService.stopSharing();
      }
    };
  }, []);

  const isBlocked = gps.isGpsBlocked || !gps.hasConsent;

  return (
    <div className="p-4 border-b">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isSharing ? 'bg-green-500/20' : 'bg-muted'}`}>
            <Truck className={`h-4 w-4 ${isSharing ? 'text-green-600' : 'text-muted-foreground'}`} />
          </div>
          <Label className="text-sm font-medium">Tryb pracy (Fleet Live)</Label>
        </div>
        <Switch
          checked={isSharing}
          onCheckedChange={handleToggle}
          disabled={isBlocked}
          title={isBlocked ? 'Wymagana zgoda na lokalizację' : undefined}
        />
      </div>
      
      <p className="text-xs text-muted-foreground mt-2 ml-9">
        Wysyła pozycję do panelu floty i do analizy ruchu
      </p>
      
      {isSharing && (
        <div className="mt-3 ml-9 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 gap-1">
              <Signal className="h-3 w-3 animate-pulse" />
              Aktywne
            </Badge>
            <span className="text-xs text-muted-foreground">
              wysyłanie co 5s
            </span>
          </div>

          {/* Offline status */}
          {!isOnline && (
            <div className="flex items-center gap-2 p-2 bg-amber-500/10 rounded-lg">
              <WifiOff className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-amber-700">
                Offline — zapisuję lokalnie ({queueSize} pkt)
              </span>
            </div>
          )}

          {/* Queue pending status */}
          {isOnline && queueSize > 0 && (
            <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded-lg">
              <CloudUpload className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-blue-700">
                Wysyłanie oczekujących: {queueSize}
              </span>
            </div>
          )}
        </div>
      )}
      
      {isBlocked && (
        <p className="text-xs text-amber-600 mt-2 ml-9">
          Włącz GPS aby korzystać z trybu pracy
        </p>
      )}

      {/* PWA limitation note */}
      {isSharing && (
        <div className="mt-3 ml-9 p-2 bg-muted/50 rounded-lg">
          <div className="flex items-start gap-2">
            <Smartphone className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Tryb pracy działa gdy aplikacja jest otwarta — jak nawigacja Google Maps.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetLiveToggle;
