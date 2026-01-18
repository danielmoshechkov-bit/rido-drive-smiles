// GetRido Maps - Fleet Live Map for Admin/Fleet Manager
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Map, { Marker, Popup, NavigationControl, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Car, Truck, RefreshCw, Signal, Clock, Gauge, Target, AlertTriangle, Crosshair } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useMapsConfig } from '@/hooks/useMapsConfig';
import { fleetLiveService, DriverLocationData } from './fleetLiveService';

const STORAGE_KEY = 'fleet_live_view';

interface SavedViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

const FleetLiveMap = () => {
  const { config } = useMapsConfig();
  const mapRef = useRef<MapRef>(null);
  const [drivers, setDrivers] = useState<DriverLocationData[]>([]);
  const [allDrivers, setAllDrivers] = useState<DriverLocationData[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverLocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [showOnlyDriving, setShowOnlyDriving] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasPermission, setHasPermission] = useState(true);
  const [hasPermission, setHasPermission] = useState(true);

  // Load saved view state from localStorage
  const [savedViewState] = useState<SavedViewState | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Save view state to localStorage when map moves
  const handleMoveEnd = useCallback((evt: { viewState: { longitude: number; latitude: number; zoom: number } }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        longitude: evt.viewState.longitude,
        latitude: evt.viewState.latitude,
        zoom: evt.viewState.zoom,
      }));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Fetch drivers on mount and every 5 seconds
  useEffect(() => {
    const fetchDrivers = async () => {
      setIsLoading(true);
      try {
        const data = await fleetLiveService.getActiveDrivers();
        setAllDrivers(data);
        setTotalCount(data.length);
        
        // Filter by active status (updated within last 30s)
        const thirtySecondsAgo = Date.now() - 30000;
        const activeDrivers = data.filter(d => d.updatedAt.getTime() > thirtySecondsAgo);
        setDrivers(activeDrivers);
        setLastRefresh(new Date());
        setHasPermission(true);
      } catch (error: any) {
        if (error?.code === 'PGRST301' || error?.code === '42501') {
          setHasPermission(false);
        }
        console.error('Failed to fetch drivers:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDrivers();
    const interval = setInterval(fetchDrivers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const data = await fleetLiveService.getActiveDrivers();
      setAllDrivers(data);
      setTotalCount(data.length);
      
      const thirtySecondsAgo = Date.now() - 30000;
      const activeDrivers = data.filter(d => d.updatedAt.getTime() > thirtySecondsAgo);
      setDrivers(activeDrivers);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to refresh drivers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCenterOnDriver = (driver: DriverLocationData) => {
    mapRef.current?.flyTo({
      center: [driver.lng, driver.lat],
      zoom: 15,
      duration: 1000,
    });
  };

  // Filter displayed drivers based on toggles
  const displayedDrivers = useMemo(() => {
    let filtered = showOnlyActive ? drivers : allDrivers;
    
    // Filter by driving status (speed >= 8 km/h)
    if (showOnlyDriving) {
      filtered = filtered.filter(d => d.speed && d.speed * 3.6 >= 8);
    }
    
    return filtered;
  }, [showOnlyActive, showOnlyDriving, drivers, allDrivers]);

  // Calculate center based on drivers or use saved/default
  const center = savedViewState 
    ? { lng: savedViewState.longitude, lat: savedViewState.latitude }
    : displayedDrivers.length > 0
      ? {
          lng: displayedDrivers.reduce((sum, d) => sum + d.lng, 0) / displayedDrivers.length,
          lat: displayedDrivers.reduce((sum, d) => sum + d.lat, 0) / displayedDrivers.length,
        }
      : { lng: config.defaultCenterLng, lat: config.defaultCenterLat };

  const initialZoom = savedViewState?.zoom ?? 11;

  // Permission denied state
  if (!hasPermission) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
          <p className="font-semibold text-lg">Brak uprawnień do Fleet Live</p>
          <p className="text-sm text-muted-foreground mt-2">
            Skontaktuj się z administratorem, aby uzyskać dostęp do widoku lokalizacji kierowców.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Fleet Live
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Active filter toggle */}
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox 
                checked={showOnlyActive}
                onCheckedChange={(checked) => setShowOnlyActive(!!checked)}
              />
              <span>Tylko aktywni (≤30s)</span>
            </label>

            {/* Driving filter toggle */}
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox 
                checked={showOnlyDriving}
                onCheckedChange={(checked) => setShowOnlyDriving(!!checked)}
              />
              <span>Tylko jadący (≥8 km/h)</span>
            </label>
            
            {/* Counter badge */}
            <Badge variant="secondary" className="gap-1">
              <Signal className="h-3 w-3" />
              Aktywni: {drivers.length} / Łącznie: {totalCount}
            </Badge>
            
            {/* Refresh button */}
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
        <div className="h-[calc(100vh-350px)] min-h-[500px] relative rounded-b-lg overflow-hidden">
          <Map
            ref={mapRef}
            initialViewState={{
              longitude: center.lng,
              latitude: center.lat,
              zoom: initialZoom,
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle={config.styleUrl}
            attributionControl={false}
            onMoveEnd={handleMoveEnd}
          >
            <NavigationControl position="top-right" showCompass={false} />

            {displayedDrivers.map(driver => {
              const isActive = driver.updatedAt.getTime() > Date.now() - 30000;
              return (
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
                    <div className={`h-10 w-10 rounded-full border-3 border-white shadow-lg flex items-center justify-center transition-transform group-hover:scale-110 ${
                      isActive ? 'bg-primary' : 'bg-muted-foreground/60'
                    }`}>
                      <Car className="h-5 w-5 text-white" />
                    </div>
                    
                    {/* Heading arrow */}
                    {driver.heading !== null && (
                      <div 
                        className={`absolute -top-2 left-1/2 w-0 h-0 
                                   border-l-[6px] border-l-transparent 
                                   border-r-[6px] border-r-transparent 
                                   border-b-[10px] ${isActive ? 'border-b-primary' : 'border-b-muted-foreground/60'}`}
                        style={{ 
                          transform: `translateX(-50%) rotate(${driver.heading}deg)`,
                          transformOrigin: 'bottom center',
                        }}
                      />
                    )}
                    
                    {/* Active pulse */}
                    {isActive && (
                      <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping" />
                    )}
                  </div>
                </Marker>
              );
            })}

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
                <div className="p-3 min-w-52">
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
                  
                  {/* Center button */}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full mt-3 gap-1"
                    onClick={() => handleCenterOnDriver(selectedDriver)}
                  >
                    <Crosshair className="h-3 w-3" />
                    Centruj
                  </Button>
                </div>
              </Popup>
            )}
          </Map>

          {/* Empty state */}
          {displayedDrivers.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center p-6">
                <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Brak aktywnych kierowców</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Kierowcy pojawią się gdy włączą „Tryb pracy" w GetRido Maps
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4 gap-1"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-3 w-3" />
                  Sprawdź ponownie
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FleetLiveMap;
