import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, Wind, Car, Bus, ShoppingBag, GraduationCap, TreePine, AlertCircle
} from "lucide-react";

interface PropertyLocationMapProps {
  latitude?: number;
  longitude?: number;
  address?: string;
}

// Mock data for location indicators (to be replaced with real API calls later)
const MOCK_LOCATION_DATA = {
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
    lines: 5,
    nearestStop: "150m",
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

export function PropertyLocationMap({ latitude, longitude, address }: PropertyLocationMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locationData, setLocationData] = useState(MOCK_LOCATION_DATA);

  // Default to Kraków if no coordinates provided
  const lat = latitude || 50.0614;
  const lon = longitude || 19.9366;

  // Generate OpenStreetMap embed URL
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lon}`;
  
  // Generate link to full OpenStreetMap
  const fullMapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

  useEffect(() => {
    // TODO: Fetch real location data from APIs
    // This will integrate with the Location Integrations panel (Airly, HERE, etc.)
    setLocationData(MOCK_LOCATION_DATA);
  }, [latitude, longitude]);

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

            {/* Public Transport */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Bus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Komunikacja miejska</p>
                  <p className="text-sm text-muted-foreground">
                    Najbliższy przystanek: {locationData.publicTransport.nearestStop}
                  </p>
                </div>
              </div>
              <span className="text-lg font-bold text-primary">
                {locationData.publicTransport.lines} linii
              </span>
            </div>

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
            Dane lokalizacyjne zostaną uzupełnione po integracji z API
          </p>
        </Card>
      </div>
    </div>
  );
}
