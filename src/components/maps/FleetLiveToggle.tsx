// GetRido Maps - Fleet Live Toggle Component
import { useState, useEffect } from 'react';
import { Truck, Signal } from 'lucide-react';
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

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      // Check GPS availability
      if (!gps.hasConsent || !gps.location) {
        toast.error('Włącz GPS aby udostępniać lokalizację');
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
      toast.success('Fleet Live włączony - lokalizacja udostępniana');
    } else {
      await fleetLiveService.stopSharing();
      setIsSharing(false);
      setLastUpdate(null);
      toast.info('Fleet Live wyłączony');
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
          disabled={!gps.hasConsent}
        />
      </div>
      
      <p className="text-xs text-muted-foreground mt-2 ml-9">
        W trakcie pracy aplikacja wysyła Twoją pozycję do panelu floty
      </p>
      
      {isSharing && (
        <div className="mt-3 ml-9 flex items-center gap-2">
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 gap-1">
            <Signal className="h-3 w-3 animate-pulse" />
            Aktywne
          </Badge>
          <span className="text-xs text-muted-foreground">
            wysyłanie co 5s
          </span>
        </div>
      )}
      
      {!gps.hasConsent && (
        <p className="text-xs text-amber-600 mt-2 ml-9">
          Włącz GPS aby korzystać z Fleet Live
        </p>
      )}
    </div>
  );
};

export default FleetLiveToggle;
