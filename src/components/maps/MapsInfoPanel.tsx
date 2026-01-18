import { Activity, AlertTriangle, Shield, Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import GpsStatusPanel from './GpsStatusPanel';
import { GpsState } from './useUserLocation';

interface MapsInfoPanelProps {
  gps: GpsState;
}

const MapsInfoPanel = ({ gps }: MapsInfoPanelProps) => {
  return (
    <div className="w-72 flex-shrink-0 bg-card border-l flex flex-col h-full">
      <ScrollArea className="flex-1">
        {/* GPS Status - at top */}
        <GpsStatusPanel gps={gps} />

        {/* Traffic Status */}
        <div className="p-4 border-b">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Status ruchu
          </h3>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium">Płynnie</span>
              <span className="text-xs text-muted-foreground ml-auto">ul. Marszałkowska</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="text-sm font-medium">Spowolnienie</span>
              <span className="text-xs text-muted-foreground ml-auto">Most Poniatowskiego</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-sm font-medium">Korek</span>
              <span className="text-xs text-muted-foreground ml-auto">Rondo Wiatraczna</span>
            </div>
          </div>
        </div>

        {/* Road Events */}
        <div className="p-4 border-b">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Zdarzenia drogowe
          </h3>
          
          <div className="space-y-2">
            <div className="p-3 rounded-lg border bg-background">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  Wypadek
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  5 min temu
                </span>
              </div>
              <p className="text-sm flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                ul. Puławska / Domaniewska
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-background">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  Roboty
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  od 6:00
                </span>
              </div>
              <p className="text-sm flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                ul. Konstruktorska
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-background">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  Kontrola
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  15 min temu
                </span>
              </div>
              <p className="text-sm flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                okolice Ronda Daszyńskiego
              </p>
            </div>
          </div>
        </div>

        {/* Weather (bonus mock) */}
        <div className="p-4 border-b">
          <h3 className="font-semibold mb-3 text-sm text-muted-foreground">
            Pogoda na trasie
          </h3>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="text-2xl">☀️</span>
              <div>
                <p className="text-sm font-medium">12°C</p>
                <p className="text-xs text-muted-foreground">Słonecznie</p>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Wiatr: 8 km/h</p>
              <p>Widoczność: dobra</p>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* User Mode - Fixed at bottom */}
      <div className="p-4 bg-primary/5 border-t">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Dostęp: TEST / ADMIN</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Widok widoczny tylko dla wybranych kont
        </p>
      </div>
    </div>
  );
};

export default MapsInfoPanel;
