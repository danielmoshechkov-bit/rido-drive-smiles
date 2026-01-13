import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { cn } from "@/lib/utils";
import { 
  MapPin, Wind, Car, Bus, ShoppingBag, GraduationCap, TreePine, AlertCircle, Loader2,
  Heart, Building2, Pill, ChevronDown, Check, RefreshCw
} from "lucide-react";
import { RadiusSelector } from "./RadiusSelector";

interface PropertyLocationMapProps {
  latitude?: number;
  longitude?: number;
  address?: string;
}

interface TransitStop {
  name: string;
  type: string;
  distance_m: number;
}

interface TransitData {
  nearest_stop: TransitStop | null;
  stops_within_radius: number;
  top_3_stops: TransitStop[];
  transport_types: string[];
  radius_m: number;
}

interface PoiItem {
  name: string;
  distance_m: number;
  lat: number;
  lng: number;
  place_id: string;
}

interface PoiCategory {
  count: number;
  nearest: PoiItem | null;
  items?: PoiItem[];
}

interface PoiData {
  radius_m: number;
  categories: {
    grocery: PoiCategory;
    school: PoiCategory;
    pharmacy: PoiCategory;
    restaurant: PoiCategory;
    health: PoiCategory;
    park: PoiCategory;
    gym: PoiCategory;
    bank: PoiCategory;
  };
  error?: string;
  details?: string;
}

interface TrafficData {
  destination: string;
  duration_minutes: number;
  duration_in_traffic_minutes: number;
  traffic_ratio: number;
  traffic_level: "low" | "medium" | "high";
  distance_km: number;
}

interface LocationApiData {
  transit?: TransitData;
  poi?: PoiData;
  traffic?: TrafficData;
  radius_m?: number;
  mock?: boolean;
}

type RatingLevel = 'excellent' | 'very_good' | 'good' | 'average' | 'poor';

const RADIUS_OPTIONS = [100, 200, 300, 500, 1000, 2000, 5000];

// Rating color gradient: green → lime → yellow → orange → amber
const RATING_COLORS: Record<RatingLevel, string> = {
  excellent: "bg-green-500",
  very_good: "bg-lime-500",
  good: "bg-yellow-500",
  average: "bg-orange-500",
  poor: "bg-amber-600"
};

const RATING_LABELS: Record<RatingLevel, string> = {
  excellent: "Doskonała",
  very_good: "Bardzo dobra",
  good: "Dobra",
  average: "Średnia",
  poor: "Słaba"
};

const TRANSIT_TYPE_LABELS: Record<string, string> = {
  transit_station: "Stacja",
  bus_station: "Autobus",
  bus_stop: "Autobus", // Map bus_stop to same label as bus_station
  train_station: "Pociąg",
  subway_station: "Metro",
  light_rail_station: "Tramwaj"
};

// Rating functions
const getTransitRating = (stopsCount: number): RatingLevel => {
  if (stopsCount >= 5) return 'excellent';
  if (stopsCount >= 4) return 'very_good';
  if (stopsCount >= 2) return 'good';
  if (stopsCount >= 1) return 'average';
  return 'poor';
};

const getTrafficRating = (trafficRatio: number): RatingLevel => {
  if (trafficRatio < 1.1) return 'excellent';
  if (trafficRatio < 1.25) return 'very_good';
  if (trafficRatio < 1.4) return 'good';
  if (trafficRatio < 1.6) return 'average';
  return 'poor';
};

const getAirQualityRating = (aqi: number): RatingLevel => {
  if (aqi <= 50) return 'excellent';
  if (aqi <= 75) return 'very_good';
  if (aqi <= 100) return 'good';
  if (aqi <= 150) return 'average';
  return 'poor';
};

const getPoiRating = (count: number, nearestDistance?: number): RatingLevel => {
  if (count >= 3 && nearestDistance && nearestDistance < 200) return 'excellent';
  if (count >= 2 && nearestDistance && nearestDistance < 300) return 'very_good';
  if (count >= 1 && nearestDistance && nearestDistance < 500) return 'good';
  if (count >= 1) return 'average';
  return 'poor';
};

type PoiCategoryKey = 'grocery' | 'school' | 'pharmacy' | 'restaurant' | 'health' | 'park';

const DEFAULT_CATEGORY_RADIUS = 300;

export function PropertyLocationMap({ latitude, longitude, address }: PropertyLocationMapProps) {
  const { isLoaded, error, isTimedOut, retryLoad, google } = useGoogleMaps();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const poiMarkersRef = useRef<google.maps.Marker[]>([]);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState(300);
  const [customRadius, setCustomRadius] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [locationData, setLocationData] = useState<LocationApiData | null>(null);
  const [isMock, setIsMock] = useState(true);
  const [showPoiMarkers, setShowPoiMarkers] = useState(false);
  
  // Independent radius for each POI category
  const [categoryRadii, setCategoryRadii] = useState<Record<PoiCategoryKey, number>>({
    grocery: DEFAULT_CATEGORY_RADIUS,
    school: DEFAULT_CATEGORY_RADIUS,
    pharmacy: DEFAULT_CATEGORY_RADIUS,
    restaurant: DEFAULT_CATEGORY_RADIUS,
    health: DEFAULT_CATEGORY_RADIUS,
    park: DEFAULT_CATEGORY_RADIUS,
  });
  
  // Separate POI data for each category (fetched with its own radius)
  const [categoryPoiData, setCategoryPoiData] = useState<Record<PoiCategoryKey, PoiCategory | null>>({
    grocery: null,
    school: null,
    pharmacy: null,
    restaurant: null,
    health: null,
    park: null,
  });
  
  const [categoryLoading, setCategoryLoading] = useState<Record<PoiCategoryKey, boolean>>({
    grocery: false,
    school: false,
    pharmacy: false,
    restaurant: false,
    health: false,
    park: false,
  });

  // Default to Kraków if no coordinates provided
  const lat = latitude || 50.0614;
  const lon = longitude || 19.9366;

  // Initialize Google Map
  useEffect(() => {
    if (!isLoaded || !google || !mapContainerRef.current) return;
    if (!latitude || !longitude) return;

    const position = { lat: latitude, lng: longitude };

    // Initialize map
    const map = new google.maps.Map(mapContainerRef.current, {
      center: position,
      zoom: 15,
      // No mapId - use classic markers for stability
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: true,
    });

    mapInstanceRef.current = map;

    // Add classic marker (no mapId required)
    const marker = new google.maps.Marker({
      map,
      position,
      title: address || "Lokalizacja nieruchomości",
    });

    markerRef.current = marker;
    setMapLoaded(true);

    return () => {
      markerRef.current = null;
      // Clear POI markers on unmount
      poiMarkersRef.current.forEach(m => m.setMap(null));
      poiMarkersRef.current = [];
    };
  }, [isLoaded, google, latitude, longitude, address]);

  // POI marker icons by category
  const getPoiMarkerIcon = (category: PoiCategoryKey): google.maps.Symbol | google.maps.Icon | undefined => {
    if (!google) return undefined;
    
    const colors: Record<PoiCategoryKey, string> = {
      grocery: "#ef4444", // red
      school: "#3b82f6", // blue
      pharmacy: "#10b981", // green
      restaurant: "#f59e0b", // amber
      health: "#ec4899", // pink
      park: "#22c55e", // green
    };
    
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: colors[category],
      fillOpacity: 0.9,
      strokeColor: "#fff",
      strokeWeight: 2,
      scale: 8,
    };
  };

  // Draw POI markers on map
  const drawPoiMarkers = () => {
    if (!mapInstanceRef.current || !google || !showPoiMarkers) return;
    
    // Clear existing POI markers
    poiMarkersRef.current.forEach(m => m.setMap(null));
    poiMarkersRef.current = [];
    
    const categories: PoiCategoryKey[] = ['grocery', 'school', 'pharmacy', 'restaurant', 'health', 'park'];
    
    categories.forEach(category => {
      const data = categoryPoiData[category];
      if (data?.items && data.items.length > 0) {
        data.items.forEach(item => {
          const marker = new google.maps.Marker({
            map: mapInstanceRef.current!,
            position: { lat: item.lat, lng: item.lng },
            title: `${item.name} (${item.distance_m}m)`,
            icon: getPoiMarkerIcon(category),
          });
          poiMarkersRef.current.push(marker);
        });
      }
    });
    
    console.log(`[LocationMap] Drew ${poiMarkersRef.current.length} POI markers`);
  };

  // Effect to redraw POI markers when data changes
  useEffect(() => {
    if (showPoiMarkers && mapLoaded) {
      drawPoiMarkers();
    } else if (!showPoiMarkers) {
      // Clear markers when toggled off
      poiMarkersRef.current.forEach(m => m.setMap(null));
      poiMarkersRef.current = [];
    }
  }, [categoryPoiData, showPoiMarkers, mapLoaded, google]);

  const fetchLocationData = async (radius: number) => {
    console.log('[LocationMap] fetchLocationData called:', { latitude, longitude, radius });
    
    if (!latitude || !longitude) {
      console.warn('[LocationMap] Missing coordinates, skipping fetch');
      return;
    }
    
    setLoading(true);
    try {
      console.log('[LocationMap] Invoking google-location-data with action: full');
      const { data, error } = await supabase.functions.invoke('google-location-data', {
        body: { 
          action: 'full',
          latitude, 
          longitude,
          radius
        }
      });

      if (error) {
        console.error('[LocationMap] Error fetching location data:', error);
        return;
      }

      console.log('[LocationMap] Received full data:', data);
      
      if (data) {
        setLocationData(data);
        setIsMock(data.mock === true);
        
        // Initialize category POI data from full fetch
        if (data.poi?.categories) {
          console.log('[LocationMap] Setting POI data from full fetch:', data.poi.categories);
          setCategoryPoiData({
            grocery: data.poi.categories.grocery || null,
            school: data.poi.categories.school || null,
            pharmacy: data.poi.categories.pharmacy || null,
            restaurant: data.poi.categories.restaurant || null,
            health: data.poi.categories.health || null,
            park: data.poi.categories.park || null,
          });
        }
      }
    } catch (error) {
      console.error('[LocationMap] Exception:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch POI data for a single category with specific radius
  const fetchCategoryPoi = async (category: PoiCategoryKey, radius: number) => {
    console.log(`[LocationMap] fetchCategoryPoi called:`, { category, radius, latitude, longitude });
    
    if (!latitude || !longitude) {
      console.warn(`[LocationMap] Missing coordinates for category ${category} fetch`);
      return;
    }
    
    setCategoryLoading(prev => ({ ...prev, [category]: true }));
    
    try {
      console.log(`[LocationMap] Invoking google-location-data for category: ${category}, radius: ${radius}`);
      const { data, error } = await supabase.functions.invoke('google-location-data', {
        body: { 
          action: 'poi',
          latitude, 
          longitude,
          radius,
          categories: [category]
        }
      });

      console.log(`[LocationMap] Response for ${category}:`, data);

      if (error) {
        console.error(`[LocationMap] Error fetching ${category}:`, error);
        return;
      }

      if (data?.categories?.[category]) {
        console.log(`[LocationMap] Setting ${category} data:`, data.categories[category]);
        setCategoryPoiData(prev => ({
          ...prev,
          [category]: data.categories[category]
        }));
      } else {
        console.warn(`[LocationMap] No data for category ${category} in response`);
        // Set empty data to show 0
        setCategoryPoiData(prev => ({
          ...prev,
          [category]: { count: 0, nearest: null }
        }));
      }
    } catch (error) {
      console.error(`[LocationMap] Exception for ${category}:`, error);
    } finally {
      setCategoryLoading(prev => ({ ...prev, [category]: false }));
    }
  };

  // Handle radius change for a specific category
  const handleCategoryRadiusChange = (category: PoiCategoryKey, radius: number) => {
    console.log(`[LocationMap] handleCategoryRadiusChange:`, { category, radius });
    setCategoryRadii(prev => ({ ...prev, [category]: radius }));
    fetchCategoryPoi(category, radius);
  };

  // Fetch location data when coordinates are available
  useEffect(() => {
    console.log('[LocationMap] Main useEffect triggered:', { latitude, longitude, selectedRadius });
    if (latitude && longitude) {
      fetchLocationData(selectedRadius);
    }
  }, [latitude, longitude]);

  // Fetch all POI categories on mount when coordinates are available
  useEffect(() => {
    if (!latitude || !longitude) {
      console.log('[LocationMap] POI useEffect: no coordinates yet');
      return;
    }
    
    console.log('[LocationMap] Fetching initial POI data for all categories');
    
    const categories: PoiCategoryKey[] = ['grocery', 'school', 'pharmacy', 'restaurant', 'health', 'park'];
    
    // Fetch each category with its default radius
    categories.forEach(category => {
      fetchCategoryPoi(category, categoryRadii[category]);
    });
  }, [latitude, longitude]);

  const handleRadiusSelect = (radius: number) => {
    setSelectedRadius(radius);
    setRadiusOpen(false);
    setShowCustomInput(false);
    fetchLocationData(radius);
  };

  const handleCustomRadiusSubmit = () => {
    const radius = parseInt(customRadius);
    if (radius >= 100 && radius <= 2000) {
      setSelectedRadius(radius);
      setShowCustomInput(false);
      setRadiusOpen(false);
      fetchLocationData(radius);
    }
  };

  const transit = locationData?.transit;
  const poi = locationData?.poi;
  const traffic = locationData?.traffic;

  // Calculate ratings
  const transitRating = transit ? getTransitRating(transit.stops_within_radius) : 'poor';
  const trafficRating = traffic ? getTrafficRating(traffic.traffic_ratio) : 'average';
  const airQualityRating = getAirQualityRating(42); // Mock AQI for now

  // Check if the error is a configuration error
  const isConfigError = error && (error as any).isConfigError;

  // Helper component for POI category rows
  const PoiCategoryRow = ({ 
    icon, 
    label, 
    radius, 
    onRadiusChange, 
    loading: isLoading, 
    data 
  }: { 
    icon: React.ReactNode;
    label: string;
    radius: number;
    onRadiusChange: (r: number) => void;
    loading: boolean;
    data: PoiCategory | null;
  }) => {
    const count = data?.count || 0;
    const nearest = data?.nearest;
    
    // Format distance for display
    const formatDistance = (meters: number): string => {
      if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)}km`;
      }
      return `${meters}m`;
    };
    
    return (
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            {icon}
          </div>
          <div>
            <p className="font-medium">{label}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>W promieniu</span>
              <RadiusSelector 
                value={radius} 
                onChange={onRadiusChange}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : count > 0 ? (
            // Show count when there are results
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{count}</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          ) : nearest ? (
            // Show distance to nearest when count is 0 but nearest exists
            <div className="flex flex-col items-end">
              <span className="text-lg font-semibold text-amber-600">0</span>
              <span className="text-xs text-muted-foreground">
                Najbliższy: {formatDistance(nearest.distance_m)}
              </span>
            </div>
          ) : (
            // No results and no nearest
            <span className="text-xl font-bold text-muted-foreground">0</span>
          )}
        </div>
      </div>
    );
  };

  // Render map content
  const renderMapContent = () => {
    if (!latitude || !longitude) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <AlertCircle className="h-10 w-10" />
          <p>Brak współrzędnych lokalizacji</p>
          {address && <p className="text-sm text-center px-4">{address}</p>}
        </div>
      );
    }

    if (!isLoaded && !error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 bg-muted">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Ładowanie Google Maps...</p>
        </div>
      );
    }

    if (isConfigError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-4 bg-muted">
          <AlertCircle className="h-10 w-10 text-amber-500" />
          <p className="text-lg font-medium text-center">Google Maps nie jest skonfigurowany</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Aby korzystać z mapy, dodaj klucz API w:
            <br />
            <strong>Admin → Ustawienia → Integracje lokalizacji</strong>
          </p>
        </div>
      );
    }

    if (isTimedOut) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-4 bg-muted">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-medium text-center">Nie udało się wczytać mapy</p>
          <Button onClick={retryLoad} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Ponów ładowanie
          </Button>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-4 bg-muted">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-medium text-center">Błąd ładowania mapy</p>
          <Button onClick={retryLoad} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Ponów ładowanie
          </Button>
        </div>
      );
    }

    return (
      <>
        <div ref={mapContainerRef} className="absolute inset-0" />
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="animate-pulse text-muted-foreground">Ładowanie mapy...</div>
          </div>
        )}
        {/* POI Toggle Button */}
        {mapLoaded && (
          <Button
            variant={showPoiMarkers ? "default" : "outline"}
            size="sm"
            className="absolute top-3 right-3 gap-1.5 shadow-md z-10"
            onClick={() => setShowPoiMarkers(!showPoiMarkers)}
          >
            <MapPin className="h-4 w-4" />
            {showPoiMarkers ? "Ukryj POI" : "Pokaż POI"}
          </Button>
        )}
      </>
    );
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        Lokalizacja i otoczenie
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Map */}
        <div className="relative rounded-xl overflow-hidden border bg-muted h-[300px] lg:h-[400px]">
          {renderMapContent()}
        </div>

        {/* Location Indicators */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              📊 Wskaźniki lokalizacji
            </h3>
          </div>

          {/* Radius Selector - Framed clickable button */}
          <div className="flex items-center justify-center p-3 mb-4 rounded-lg bg-primary/5 border border-primary/20">
            <MapPin className="h-4 w-4 text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Sprawdzam w promieniu</span>
            
            <Popover open={radiusOpen} onOpenChange={setRadiusOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 px-3 mx-2 font-medium border-primary/30 hover:border-primary hover:bg-primary/10 transition-colors"
                >
                  {selectedRadius}m
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="center">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                    Wybierz promień wyszukiwania
                  </p>
                  {RADIUS_OPTIONS.map(r => (
                    <Button
                      key={r}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between h-9"
                      onClick={() => handleRadiusSelect(r)}
                    >
                      {r}m
                      {selectedRadius === r && <Check className="h-4 w-4 text-primary" />}
                    </Button>
                  ))}
                  <div className="border-t my-2" />
                  {showCustomInput ? (
                    <div className="flex items-center gap-1 px-2">
                      <Input
                        type="number"
                        value={customRadius}
                        onChange={(e) => setCustomRadius(e.target.value)}
                        placeholder="100-2000"
                        className="h-8 text-sm"
                        min={100}
                        max={2000}
                        autoFocus
                      />
                      <span className="text-xs text-muted-foreground">m</span>
                      <Button size="sm" variant="default" className="h-8 px-2" onClick={handleCustomRadiusSubmit}>
                        OK
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start h-9 text-muted-foreground"
                      onClick={() => setShowCustomInput(true)}
                    >
                      Inny promień...
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <span className="text-sm text-muted-foreground">od lokalizacji</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Air Quality - Still mock */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Wind className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Jakość powietrza</p>
                    <p className="text-sm text-muted-foreground">AQI: 42</p>
                  </div>
                </div>
                <Badge className={`${RATING_COLORS[airQualityRating]} text-white`}>
                  {RATING_LABELS[airQualityRating]}
                </Badge>
              </div>

              {/* Traffic */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Car className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Natężenie ruchu</p>
                    <p className="text-sm text-muted-foreground">
                      {traffic ? (
                        <>Do {traffic.destination}: {traffic.duration_in_traffic_minutes} min</>
                      ) : (
                        "Ładowanie..."
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={`${RATING_COLORS[trafficRating]} text-white`}>
                    {traffic?.traffic_ratio 
                      ? `${(traffic.traffic_ratio * 100 - 100).toFixed(0)}% więcej`
                      : RATING_LABELS[trafficRating]
                    }
                  </Badge>
                  {traffic && traffic.duration_minutes > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({traffic.distance_km} km)
                    </span>
                  )}
                </div>
              </div>

              {/* Public Transport */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Bus className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Komunikacja miejska</p>
                    <p className="text-sm text-muted-foreground">
                      {transit?.nearest_stop ? (
                        <>Najbliższy: {transit.nearest_stop.distance_m}m</>
                      ) : (
                        "Brak przystanków w pobliżu"
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={`${RATING_COLORS[transitRating]} text-white`}>
                    {transit?.stops_within_radius || 0} przystanków
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {RATING_LABELS[transitRating]}
                  </span>
                </div>
              </div>

              {/* Transport types - deduplicated */}
              {transit?.transport_types && transit.transport_types.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-12">
                  {[...new Set(transit.transport_types.map(type => 
                    TRANSIT_TYPE_LABELS[type] || type
                  ))].map(label => (
                    <Badge key={label} variant="outline" className="text-xs">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* POI API Warning - Only show if all categories are 0 and not mock data */}
          {!loading && !isMock && 
           categoryPoiData.grocery?.count === 0 && categoryPoiData.school?.count === 0 && 
           categoryPoiData.pharmacy?.count === 0 && categoryPoiData.restaurant?.count === 0 &&
           categoryPoiData.health?.count === 0 && categoryPoiData.park?.count === 0 && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Nie można pobrać danych o okolicy</p>
                <p className="text-xs mt-1 opacity-80">
                  Klucz Google API ma ograniczenie "HTTP referrers" które blokuje zapytania z serwera.
                </p>
                <p className="text-xs mt-1 opacity-70">
                  Zmień w Google Cloud Console: Credentials → API Key → Application restrictions → "None" lub "IP addresses"
                </p>
              </div>
            </div>
          )}

          {/* POI Categories - Inside the same Card */}
          <div className="mt-6 pt-4 border-t space-y-3">
          {/* Grocery */}
            <PoiCategoryRow
              icon={<ShoppingBag className="h-5 w-5 text-primary" />}
              label="Sklepy spożywcze"
              radius={categoryRadii.grocery}
              onRadiusChange={(r) => handleCategoryRadiusChange('grocery', r)}
              loading={categoryLoading.grocery}
              data={categoryPoiData.grocery}
            />

            {/* Schools */}
            <PoiCategoryRow
              icon={<GraduationCap className="h-5 w-5 text-primary" />}
              label="Szkoły"
              radius={categoryRadii.school}
              onRadiusChange={(r) => handleCategoryRadiusChange('school', r)}
              loading={categoryLoading.school}
              data={categoryPoiData.school}
            />

            {/* Pharmacy */}
            <PoiCategoryRow
              icon={<Pill className="h-5 w-5 text-primary" />}
              label="Apteki"
              radius={categoryRadii.pharmacy}
              onRadiusChange={(r) => handleCategoryRadiusChange('pharmacy', r)}
              loading={categoryLoading.pharmacy}
              data={categoryPoiData.pharmacy}
            />

            {/* Restaurants */}
            <PoiCategoryRow
              icon={<Building2 className="h-5 w-5 text-primary" />}
              label="Restauracje i kawiarnie"
              radius={categoryRadii.restaurant}
              onRadiusChange={(r) => handleCategoryRadiusChange('restaurant', r)}
              loading={categoryLoading.restaurant}
              data={categoryPoiData.restaurant}
            />

            {/* Health */}
            <PoiCategoryRow
              icon={<Heart className="h-5 w-5 text-primary" />}
              label="Służba zdrowia"
              radius={categoryRadii.health}
              onRadiusChange={(r) => handleCategoryRadiusChange('health', r)}
              loading={categoryLoading.health}
              data={categoryPoiData.health}
            />

            {/* Parks */}
            <PoiCategoryRow
              icon={<TreePine className="h-5 w-5 text-primary" />}
              label="Parki i zieleń"
              radius={categoryRadii.park}
              onRadiusChange={(r) => handleCategoryRadiusChange('park', r)}
              loading={categoryLoading.park}
              data={categoryPoiData.park}
            />

          </div>
        </Card>
      </div>
    </div>
  );
}
