import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { 
  MapPin, Wind, Car, Bus, ShoppingBag, GraduationCap, TreePine, AlertCircle, Loader2,
  Heart, Building2, Pill, ChevronDown, Check
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

interface PoiCategory {
  count: number;
  nearest: { name: string; distance_m: number } | null;
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

const RADIUS_OPTIONS = [200, 300, 500, 1000];

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
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState(300);
  const [customRadius, setCustomRadius] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [locationData, setLocationData] = useState<LocationApiData | null>(null);
  const [isMock, setIsMock] = useState(true);
  
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

  // Generate OpenStreetMap embed URL
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lon}`;
  
  // Generate link to full OpenStreetMap
  const fullMapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

  const fetchLocationData = async (radius: number) => {
    if (!latitude || !longitude) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-location-data', {
        body: { 
          action: 'full',
          latitude, 
          longitude,
          radius
        }
      });

      if (error) {
        console.error('Error fetching location data:', error);
        return;
      }

      if (data) {
        setLocationData(data);
        setIsMock(data.mock === true);
        
        // Initialize category POI data from full fetch
        if (data.poi?.categories) {
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
      console.error('Error fetching location data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch POI data for a single category with specific radius
  const fetchCategoryPoi = async (category: PoiCategoryKey, radius: number) => {
    if (!latitude || !longitude) return;
    
    setCategoryLoading(prev => ({ ...prev, [category]: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('google-location-data', {
        body: { 
          action: 'poi',
          latitude, 
          longitude,
          radius,
          categories: [category]
        }
      });

      if (error) {
        console.error(`Error fetching ${category} data:`, error);
        return;
      }

      if (data?.categories?.[category]) {
        setCategoryPoiData(prev => ({
          ...prev,
          [category]: data.categories[category]
        }));
      }
    } catch (error) {
      console.error(`Error fetching ${category} data:`, error);
    } finally {
      setCategoryLoading(prev => ({ ...prev, [category]: false }));
    }
  };

  // Handle radius change for a specific category
  const handleCategoryRadiusChange = (category: PoiCategoryKey, radius: number) => {
    setCategoryRadii(prev => ({ ...prev, [category]: radius }));
    fetchCategoryPoi(category, radius);
  };

  useEffect(() => {
    fetchLocationData(selectedRadius);
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

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        Lokalizacja i otoczenie
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Map */}
        <div className="relative rounded-xl overflow-hidden border bg-muted h-[300px] lg:h-[400px]">
          {latitude && longitude ? (
            <>
              <iframe
                src={mapUrl}
                className="w-full h-full border-0"
                title="Lokalizacja nieruchomości"
                onLoad={() => setMapLoaded(true)}
              />
              {!mapLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <div className="animate-pulse text-muted-foreground">Ładowanie mapy...</div>
                </div>
              )}
              <a 
                href={fullMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 right-3 bg-background/90 backdrop-blur px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-background transition-colors shadow-lg"
              >
                Otwórz większą mapę →
              </a>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <AlertCircle className="h-10 w-10" />
              <p>Brak współrzędnych lokalizacji</p>
              {address && <p className="text-sm text-center px-4">{address}</p>}
            </div>
          )}
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

              {/* Transit Details */}
              {transit?.top_3_stops && transit.top_3_stops.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-2">Najbliższe przystanki:</p>
                  <div className="space-y-1">
                    {transit.top_3_stops.map((stop, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-blue-700 dark:text-blue-300 truncate max-w-[180px]">{stop.name}</span>
                        <span className="text-blue-600 dark:text-blue-400">{stop.distance_m}m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* POI: Grocery */}
              {(() => {
                const catData = categoryPoiData.grocery;
                const rating = getPoiRating(catData?.count || 0, catData?.nearest?.distance_m);
                return (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Sklepy spożywcze</p>
                        <p className="text-sm text-muted-foreground">
                          W promieniu{" "}
                          <RadiusSelector 
                            value={categoryRadii.grocery} 
                            onChange={(r) => handleCategoryRadiusChange('grocery', r)} 
                          />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {categoryLoading.grocery ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <span className="text-lg font-bold text-primary">
                            {catData?.count || 0}
                          </span>
                          <div className={`w-3 h-3 rounded-full ${RATING_COLORS[rating]}`} title={RATING_LABELS[rating]} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* POI: Schools */}
              {(() => {
                const catData = categoryPoiData.school;
                const rating = getPoiRating(catData?.count || 0, catData?.nearest?.distance_m);
                return (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <GraduationCap className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Szkoły</p>
                        <p className="text-sm text-muted-foreground">
                          W promieniu{" "}
                          <RadiusSelector 
                            value={categoryRadii.school} 
                            onChange={(r) => handleCategoryRadiusChange('school', r)} 
                          />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {categoryLoading.school ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <span className="text-lg font-bold text-primary">
                            {catData?.count || 0}
                          </span>
                          <div className={`w-3 h-3 rounded-full ${RATING_COLORS[rating]}`} title={RATING_LABELS[rating]} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* POI: Pharmacy */}
              {(() => {
                const catData = categoryPoiData.pharmacy;
                const rating = getPoiRating(catData?.count || 0, catData?.nearest?.distance_m);
                return (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Pill className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Apteki</p>
                        <p className="text-sm text-muted-foreground">
                          W promieniu{" "}
                          <RadiusSelector 
                            value={categoryRadii.pharmacy} 
                            onChange={(r) => handleCategoryRadiusChange('pharmacy', r)} 
                          />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {categoryLoading.pharmacy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <span className="text-lg font-bold text-primary">
                            {catData?.count || 0}
                          </span>
                          <div className={`w-3 h-3 rounded-full ${RATING_COLORS[rating]}`} title={RATING_LABELS[rating]} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* POI: Restaurants */}
              {(() => {
                const catData = categoryPoiData.restaurant;
                const rating = getPoiRating(catData?.count || 0, catData?.nearest?.distance_m);
                return (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Restauracje i kawiarnie</p>
                        <p className="text-sm text-muted-foreground">
                          W promieniu{" "}
                          <RadiusSelector 
                            value={categoryRadii.restaurant} 
                            onChange={(r) => handleCategoryRadiusChange('restaurant', r)} 
                          />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {categoryLoading.restaurant ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <span className="text-lg font-bold text-primary">
                            {catData?.count || 0}
                          </span>
                          <div className={`w-3 h-3 rounded-full ${RATING_COLORS[rating]}`} title={RATING_LABELS[rating]} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* POI: Health */}
              {(() => {
                const catData = categoryPoiData.health;
                const rating = getPoiRating(catData?.count || 0, catData?.nearest?.distance_m);
                return (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Heart className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Służba zdrowia</p>
                        <p className="text-sm text-muted-foreground">
                          W promieniu{" "}
                          <RadiusSelector 
                            value={categoryRadii.health} 
                            onChange={(r) => handleCategoryRadiusChange('health', r)} 
                          />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {categoryLoading.health ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <span className="text-lg font-bold text-primary">
                            {catData?.count || 0}
                          </span>
                          <div className={`w-3 h-3 rounded-full ${RATING_COLORS[rating]}`} title={RATING_LABELS[rating]} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* POI: Parks */}
              {(() => {
                const catData = categoryPoiData.park;
                const rating = getPoiRating(catData?.count || 0, catData?.nearest?.distance_m);
                return (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <TreePine className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Parki i zieleń</p>
                        <p className="text-sm text-muted-foreground">
                          W promieniu{" "}
                          <RadiusSelector 
                            value={categoryRadii.park} 
                            onChange={(r) => handleCategoryRadiusChange('park', r)} 
                          />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {categoryLoading.park ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <span className="text-lg font-bold text-primary">
                            {catData?.count || 0}
                          </span>
                          <div className={`w-3 h-3 rounded-full ${RATING_COLORS[rating]}`} title={RATING_LABELS[rating]} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4 text-center">
            {isMock ? (
              "⚠️ Dane przykładowe • Skonfiguruj klucz Google API w panelu admina"
            ) : (
              "✓ Dane z Google Places API i Distance Matrix API"
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}
