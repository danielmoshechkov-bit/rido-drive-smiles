import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { 
  MapPin, Wind, Car, Bus, ShoppingBag, GraduationCap, TreePine, AlertCircle, Loader2,
  Heart, Building2, Pill, Settings2
} from "lucide-react";

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

const RADIUS_OPTIONS = [200, 300, 500, 1000];

const TRAFFIC_COLORS: Record<string, string> = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-red-500"
};

const TRAFFIC_LABELS: Record<string, string> = {
  low: "Niskie",
  medium: "Średnie", 
  high: "Wysokie"
};

const TRANSIT_TYPE_LABELS: Record<string, string> = {
  transit_station: "Stacja",
  bus_station: "Autobus",
  train_station: "Pociąg",
  subway_station: "Metro",
  light_rail_station: "Tramwaj"
};

export function PropertyLocationMap({ latitude, longitude, address }: PropertyLocationMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState(300);
  const [customRadius, setCustomRadius] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [locationData, setLocationData] = useState<LocationApiData | null>(null);
  const [isMock, setIsMock] = useState(true);

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
      }
    } catch (error) {
      console.error('Error fetching location data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocationData(selectedRadius);
  }, [latitude, longitude]);

  const handleRadiusChange = (value: string) => {
    if (value === "custom") {
      setShowCustomInput(true);
      return;
    }
    setShowCustomInput(false);
    const radius = parseInt(value);
    setSelectedRadius(radius);
    fetchLocationData(radius);
  };

  const handleCustomRadiusSubmit = () => {
    const radius = parseInt(customRadius);
    if (radius >= 100 && radius <= 2000) {
      setSelectedRadius(radius);
      setShowCustomInput(false);
      fetchLocationData(radius);
    }
  };

  const transit = locationData?.transit;
  const poi = locationData?.poi;
  const traffic = locationData?.traffic;

  const trafficColor = traffic ? TRAFFIC_COLORS[traffic.traffic_level] : "bg-gray-500";
  const trafficLabel = traffic ? TRAFFIC_LABELS[traffic.traffic_level] : "Brak danych";

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
            
            {/* Radius Selector */}
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              {showCustomInput ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={customRadius}
                    onChange={(e) => setCustomRadius(e.target.value)}
                    placeholder="100-2000"
                    className="w-20 h-8 text-sm"
                    min={100}
                    max={2000}
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleCustomRadiusSubmit}>
                    OK
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setShowCustomInput(false)}>
                    ✕
                  </Button>
                </div>
              ) : (
                <Select value={selectedRadius.toString()} onValueChange={handleRadiusChange}>
                  <SelectTrigger className="w-[100px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RADIUS_OPTIONS.map(r => (
                      <SelectItem key={r} value={r.toString()}>{r}m</SelectItem>
                    ))}
                    <SelectItem value="custom">Inny...</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
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
                <Badge className="bg-green-500 text-white">Dobra</Badge>
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
                  <Badge className={`${trafficColor} text-white`}>{trafficLabel}</Badge>
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
                  <Badge className={transit && transit.stops_within_radius > 3 ? "bg-green-500 text-white" : transit && transit.stops_within_radius > 0 ? "bg-yellow-500 text-white" : "bg-red-500 text-white"}>
                    {transit?.stops_within_radius || 0} przystanków
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    w promieniu {selectedRadius}m
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
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <ShoppingBag className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Sklepy spożywcze</p>
                    <p className="text-sm text-muted-foreground">
                      {poi?.categories.grocery.nearest ? (
                        <>Najbliższy: {poi.categories.grocery.nearest.distance_m}m</>
                      ) : (
                        `W promieniu ${selectedRadius}m`
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">
                  {poi?.categories.grocery.count || 0}
                </span>
              </div>

              {/* POI: Schools */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <GraduationCap className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Szkoły</p>
                    <p className="text-sm text-muted-foreground">
                      {poi?.categories.school.nearest ? (
                        <>Najbliższa: {poi.categories.school.nearest.distance_m}m</>
                      ) : (
                        `W promieniu ${selectedRadius}m`
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">
                  {poi?.categories.school.count || 0}
                </span>
              </div>

              {/* POI: Pharmacy */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Pill className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Apteki</p>
                    <p className="text-sm text-muted-foreground">
                      {poi?.categories.pharmacy.nearest ? (
                        <>Najbliższa: {poi.categories.pharmacy.nearest.distance_m}m</>
                      ) : (
                        `W promieniu ${selectedRadius}m`
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">
                  {poi?.categories.pharmacy.count || 0}
                </span>
              </div>

              {/* POI: Restaurants */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Restauracje i kawiarnie</p>
                    <p className="text-sm text-muted-foreground">
                      {poi?.categories.restaurant.nearest ? (
                        <>Najbliższa: {poi.categories.restaurant.nearest.distance_m}m</>
                      ) : (
                        `W promieniu ${selectedRadius}m`
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">
                  {poi?.categories.restaurant.count || 0}
                </span>
              </div>

              {/* POI: Health */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Heart className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Służba zdrowia</p>
                    <p className="text-sm text-muted-foreground">
                      {poi?.categories.health.nearest ? (
                        <>Najbliższa: {poi.categories.health.nearest.distance_m}m</>
                      ) : (
                        `W promieniu ${selectedRadius}m`
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">
                  {poi?.categories.health.count || 0}
                </span>
              </div>

              {/* POI: Parks */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <TreePine className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Parki i zieleń</p>
                    <p className="text-sm text-muted-foreground">
                      {poi?.categories.park.nearest ? (
                        <>Najbliższy: {poi.categories.park.nearest.distance_m}m</>
                      ) : (
                        `W promieniu ${selectedRadius}m`
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">
                  {poi?.categories.park.count || 0}
                </span>
              </div>
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
