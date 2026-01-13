import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  MapPin, Wind, Car, Bus, ShoppingBag, GraduationCap, TreePine, AlertCircle, Loader2
} from "lucide-react";

interface PropertyLocationMapProps {
  latitude?: number;
  longitude?: number;
  address?: string;
}

interface TransitData {
  stops_within_500m: number;
  stops_within_1000m: number;
  transport_types: string[];
  line_count: number;
  avg_frequency_minutes: number | null;
  has_night_service: boolean;
  nearest_stop: {
    name: string;
    distance_m: number;
  };
  transport_score: number;
  transport_rating: 'excellent' | 'good' | 'moderate' | 'limited' | 'poor';
  ai_summary: string;
}

interface LocationData {
  airQuality: {
    status: string;
    aqi: number;
    color: string;
  };
  traffic: {
    status: string;
    color: string;
  };
  publicTransport: {
    lines: number;
    nearestStop: string;
    transportTypes: string[];
    score: number;
    rating: string;
    aiSummary: string;
    hasNightService: boolean;
  };
  shops: {
    count: number;
    radius: string;
  };
  schools: {
    count: number;
    nearestDistance: string;
  };
  parks: {
    count: number;
    nearestDistance: string;
  };
}

// Default mock data for non-transit indicators (to be replaced with real API calls later)
const DEFAULT_LOCATION_DATA: LocationData = {
  airQuality: {
    status: "Dobra",
    aqi: 42,
    color: "bg-green-500",
  },
  traffic: {
    status: "Niskie",
    color: "bg-green-500",
  },
  publicTransport: {
    lines: 0,
    nearestStop: "-",
    transportTypes: [],
    score: 0,
    rating: 'poor',
    aiSummary: 'Ładowanie danych...',
    hasNightService: false,
  },
  shops: {
    count: 8,
    radius: "500m",
  },
  schools: {
    count: 3,
    nearestDistance: "300m",
  },
  parks: {
    count: 2,
    nearestDistance: "200m",
  },
};

const RATING_COLORS: Record<string, string> = {
  excellent: 'bg-green-500',
  good: 'bg-green-400',
  moderate: 'bg-yellow-500',
  limited: 'bg-orange-500',
  poor: 'bg-red-500',
};

const RATING_LABELS: Record<string, string> = {
  excellent: 'Doskonała',
  good: 'Dobra',
  moderate: 'Średnia',
  limited: 'Ograniczona',
  poor: 'Słaba',
};

export function PropertyLocationMap({ latitude, longitude, address }: PropertyLocationMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locationData, setLocationData] = useState<LocationData>(DEFAULT_LOCATION_DATA);
  const [loadingTransit, setLoadingTransit] = useState(false);

  // Default to Kraków if no coordinates provided
  const lat = latitude || 50.0614;
  const lon = longitude || 19.9366;

  // Generate OpenStreetMap embed URL
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lon}`;
  
  // Generate link to full OpenStreetMap
  const fullMapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

  useEffect(() => {
    const fetchTransitData = async () => {
      if (!latitude || !longitude) return;
      
      setLoadingTransit(true);
      try {
        const { data, error } = await supabase.functions.invoke('transit-data', {
          body: { latitude, longitude }
        });

        if (error) {
          console.error('Error fetching transit data:', error);
          return;
        }

        if (data) {
          const transitData = data as TransitData;
          setLocationData(prev => ({
            ...prev,
            publicTransport: {
              lines: transitData.line_count,
              nearestStop: `${transitData.nearest_stop.distance_m}m`,
              transportTypes: transitData.transport_types,
              score: transitData.transport_score,
              rating: transitData.transport_rating,
              aiSummary: transitData.ai_summary,
              hasNightService: transitData.has_night_service,
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching transit data:', error);
      } finally {
        setLoadingTransit(false);
      }
    };

    fetchTransitData();
  }, [latitude, longitude]);

  const transportRatingColor = RATING_COLORS[locationData.publicTransport.rating] || 'bg-gray-500';
  const transportRatingLabel = RATING_LABELS[locationData.publicTransport.rating] || 'Brak danych';

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        Lokalizacja i otoczenie
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Map */}
        <div className="relative rounded-xl overflow-hidden border bg-muted h-[300px] lg:h-[350px]">
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
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            📊 Wskaźniki lokalizacji
          </h3>
          
          <div className="space-y-4">
            {/* Air Quality */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Wind className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Jakość powietrza</p>
                  <p className="text-sm text-muted-foreground">AQI: {locationData.airQuality.aqi}</p>
                </div>
              </div>
              <Badge className={`${locationData.airQuality.color} text-white`}>
                {locationData.airQuality.status}
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
                  <p className="text-sm text-muted-foreground">W godzinach szczytu</p>
                </div>
              </div>
              <Badge className={`${locationData.traffic.color} text-white`}>
                {locationData.traffic.status}
              </Badge>
            </div>

            {/* Public Transport - Enhanced with real data */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Bus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Komunikacja miejska</p>
                  <p className="text-sm text-muted-foreground">
                    {loadingTransit ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Ładowanie...
                      </span>
                    ) : (
                      `Najbliższy przystanek: ${locationData.publicTransport.nearestStop}`
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={`${transportRatingColor} text-white`}>
                  {transportRatingLabel}
                </Badge>
                <span className="text-sm font-bold text-primary">
                  {locationData.publicTransport.lines} linii
                </span>
              </div>
            </div>

            {/* Transport AI Summary */}
            {locationData.publicTransport.aiSummary && !loadingTransit && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  🤖 {locationData.publicTransport.aiSummary}
                </p>
              </div>
            )}

            {/* Shops */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Sklepy</p>
                  <p className="text-sm text-muted-foreground">
                    W promieniu {locationData.shops.radius}
                  </p>
                </div>
              </div>
              <span className="text-lg font-bold text-primary">
                {locationData.shops.count}
              </span>
            </div>

            {/* Schools */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Szkoły</p>
                  <p className="text-sm text-muted-foreground">
                    Najbliższa: {locationData.schools.nearestDistance}
                  </p>
                </div>
              </div>
              <span className="text-lg font-bold text-primary">
                {locationData.schools.count}
              </span>
            </div>

            {/* Parks */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TreePine className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Parki i zieleń</p>
                  <p className="text-sm text-muted-foreground">
                    Najbliższy: {locationData.parks.nearestDistance}
                  </p>
                </div>
              </div>
              <span className="text-lg font-bold text-primary">
                {locationData.parks.count}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            Dane komunikacyjne z systemu GTFS • Inne wskaźniki zostaną uzupełnione
          </p>
        </Card>
      </div>
    </div>
  );
}
