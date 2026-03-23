import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { cn } from "@/lib/utils";
import { 
  MapPin, Wind, Car, Bus, ShoppingBag, GraduationCap, TreePine, AlertCircle, Loader2,
  Heart, Building2, Pill, RefreshCw
} from "lucide-react";
import { RadiusSelector } from "./RadiusSelector";

interface PropertyLocationMapProps {
  latitude?: number;
  longitude?: number;
  address?: string;
  listingId?: string;
  hasStreetAddress?: boolean;
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

// Simplified radius options: 300m, 500m, 1km, 2km
const RADIUS_OPTIONS = [300, 500, 1000, 2000];

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
  bus_stop: "Autobus",
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

type PoiCategoryKey = 'grocery' | 'school' | 'pharmacy' | 'restaurant' | 'health' | 'park';

// Default radii per category
const DEFAULT_CATEGORY_RADII: Record<PoiCategoryKey, number> = {
  grocery: 300,
  pharmacy: 300,
  school: 300,
  restaurant: 300,
  health: 500,
  park: 500,
};

// Local cache for POI data (in-memory)
const poiCache = new Map<string, { data: PoiCategory; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(lat: number, lng: number, category: string, radius: number): string {
  return `${lat.toFixed(5)}_${lng.toFixed(5)}_${category}_${radius}`;
}

export function PropertyLocationMap({ latitude, longitude, address, listingId, hasStreetAddress = true }: PropertyLocationMapProps) {
  const { isLoaded, error, isTimedOut, retryLoad, google } = useGoogleMaps();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const poiMarkersRef = useRef<google.maps.Marker[]>([]);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locationData, setLocationData] = useState<LocationApiData | null>(null);
  const [isMock, setIsMock] = useState(true);
  const [showPoiMarkers, setShowPoiMarkers] = useState(false);
  
  // Independent radius for each POI category - with new defaults
  const [categoryRadii, setCategoryRadii] = useState<Record<PoiCategoryKey, number>>(DEFAULT_CATEGORY_RADII);
  
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
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: true,
    });

    mapInstanceRef.current = map;

    // Add classic marker
    const marker = new google.maps.Marker({
      map,
      position,
      title: address || "Lokalizacja nieruchomości",
    });

    markerRef.current = marker;
    setMapLoaded(true);

    return () => {
      markerRef.current = null;
      poiMarkersRef.current.forEach(m => m.setMap(null));
      poiMarkersRef.current = [];
    };
  }, [isLoaded, google, latitude, longitude, address]);

  // POI marker icons by category
  const getPoiMarkerIcon = (category: PoiCategoryKey): google.maps.Symbol | google.maps.Icon | undefined => {
    if (!google) return undefined;
    
    const colors: Record<PoiCategoryKey, string> = {
      grocery: "#ef4444",
      school: "#3b82f6",
      pharmacy: "#10b981",
      restaurant: "#f59e0b",
      health: "#ec4899",
      park: "#22c55e",
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
      }
    } catch (error) {
      console.error('[LocationMap] Exception:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch POI data for a single category with specific radius - with caching
  const fetchCategoryPoi = async (category: PoiCategoryKey, radius: number) => {
    console.log(`[LocationMap] fetchCategoryPoi called:`, { category, radius, latitude, longitude });
    
    if (!latitude || !longitude) {
      console.warn(`[LocationMap] Missing coordinates for category ${category} fetch`);
      return;
    }
    
    // Check in-memory cache first
    const cacheKey = getCacheKey(latitude, longitude, category, radius);
    const cached = poiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[LocationMap] Using cached data for ${category} at ${radius}m`);
      setCategoryPoiData(prev => ({
        ...prev,
        [category]: cached.data
      }));
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
        const categoryData = data.categories[category];
        
        // Store in cache
        poiCache.set(cacheKey, { data: categoryData, timestamp: Date.now() });
        
        setCategoryPoiData(prev => ({
          ...prev,
          [category]: categoryData
        }));
      } else {
        console.warn(`[LocationMap] No data for category ${category} in response`);
        const emptyData = { count: 0, nearest: null };
        
        // Cache empty results too
        poiCache.set(cacheKey, { data: emptyData, timestamp: Date.now() });
        
        setCategoryPoiData(prev => ({
          ...prev,
          [category]: emptyData
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
    
    // Check cache before making new request
    if (latitude && longitude) {
      const cacheKey = getCacheKey(latitude, longitude, category, radius);
      const cached = poiCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`[LocationMap] Using cached data for ${category} at ${radius}m (from radius change)`);
        setCategoryPoiData(prev => ({
          ...prev,
          [category]: cached.data
        }));
        return;
      }
    }
    
    fetchCategoryPoi(category, radius);
  };

  // Fetch location data when coordinates are available
  useEffect(() => {
    console.log('[LocationMap] Main useEffect triggered:', { latitude, longitude });
    if (latitude && longitude) {
      fetchLocationData(300); // Default radius for transit/traffic
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

  const transit = locationData?.transit;
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
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{count}</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          ) : nearest ? (
            <div className="flex flex-col items-end">
              <span className="text-lg font-semibold text-amber-600">0</span>
              <span className="text-xs text-muted-foreground">
                Najbliższy: {formatDistance(nearest.distance_m)}
              </span>
            </div>
          ) : (
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
