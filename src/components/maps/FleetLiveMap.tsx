// GetRido Maps - Fleet Live Map for Admin/Fleet Manager
import { useState, useEffect } from 'react';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Car, Truck, RefreshCw, Signal, Clock, Gauge, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMapsConfig } from '@/hooks/useMapsConfig';
import { fleetLiveService, DriverLocationData } from './fleetLiveService';

const FleetLiveMap = () => {
  const { config } = useMapsConfig();
  const [drivers, setDrivers] = useState<DriverLocationData[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverLocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch drivers on mount and every 5 seconds
  useEffect(() => {
    const fetchDrivers = async () => {
      setIsLoading(true);
      const data = await fleetLiveService.getActiveDrivers();
      setDrivers(data);
      setLastRefresh(new Date());
      setIsLoading(false);
    };

    fetchDrivers();
    const interval = setInterval(fetchDrivers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    const data = await fleetLiveService.getActiveDrivers();
    setDrivers(data);
    setLastRefresh(new Date());
    setIsLoading(false);
  };

  // Calculate center based on drivers or use default
  const center = drivers.length > 0
    ? {
        lng: drivers.reduce((sum, d) => sum + d.lng, 0) / drivers.length,
        lat: drivers.reduce((sum, d) => sum + d.lat, 0) / drivers.length,
      }
    : { lng: config.defaultCenterLng, lat: config.defaultCenterLat };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Fleet Live
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1">
              <Signal className="h-3 w-3" />
              {drivers.length} aktywnych
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isLoading}
              className="gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              Odśwież
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Ostatnia aktualizacja: {lastRefresh.toLocaleTimeString('pl-PL')}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[500px] relative rounded-b-lg overflow-hidden">
          <Map
            initialViewState={{
              longitude: center.lng,
              latitude: center.lat,
              zoom: 11,
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle={config.styleUrl}
            attributionControl={false}
          >
            <NavigationControl position="top-right" showCompass={false} />

            {drivers.map(driver => (
              <Marker
                key={driver.userId}
                longitude={driver.lng}
                latitude={driver.lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedDriver(driver);
                }}
              >
                <div className="relative cursor-pointer group">
                  {/* Driver marker */}
                  <div className="h-10 w-10 bg-primary rounded-full border-3 border-white shadow-lg flex items-center justify-center transition-transform group-hover:scale-110">
                    <Car className="h-5 w-5 text-white" />
                  </div>
                  
                  {/* Heading arrow */}
                  {driver.heading !== null && (
                    <div 
                      className="absolute -top-2 left-1/2 w-0 h-0 
                                 border-l-[6px] border-l-transparent 
                                 border-r-[6px] border-r-transparent 
                                 border-b-[10px] border-b-primary"
                      style={{ 
                        transform: `translateX(-50%) rotate(${driver.heading}deg)`,
                        transformOrigin: 'bottom center',
                      }}
                    />
                  )}
                  
                  {/* Active pulse */}
                  <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping" />
                </div>
              </Marker>
            ))}

            {/* Selected driver popup */}
            {selectedDriver && (
              <Popup
                longitude={selectedDriver.lng}
                latitude={selectedDriver.lat}
                anchor="top"
                onClose={() => setSelectedDriver(null)}
                closeButton={true}
                closeOnClick={false}
                className="fleet-popup"
              >
                <div className="p-3 min-w-48">
                  <p className="font-semibold text-base mb-2">{selectedDriver.driverName}</p>
                  
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Gauge className="h-3 w-3" />
                        Prędkość:
                      </span>
                      <span className="font-medium">
                        {selectedDriver.speed ? Math.round(selectedDriver.speed * 3.6) : 0} km/h
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Target className="h-3 w-3" />
                        Dokładność:
                      </span>
                      <span className="font-medium">±{Math.round(selectedDriver.accuracy)}m</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Aktualizacja:
                      </span>
                      <span className="font-medium">
                        {Math.round((Date.now() - selectedDriver.updatedAt.getTime()) / 1000)}s temu
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            )}
          </Map>

          {/* Empty state */}
          {drivers.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center p-6">
                <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Brak aktywnych kierowców</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Kierowcy pojawią się gdy włączą tryb pracy
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FleetLiveMap;
