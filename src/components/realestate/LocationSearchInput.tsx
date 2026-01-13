import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { 
  MapPin, Map, Search, Clock, Building2, ChevronRight, X, Loader2, Navigation, List
} from "lucide-react";

export interface LocationSelection {
  text: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  types?: string[];
}

export interface AreaSelection {
  type: "circle" | "polygon";
  circle?: {
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
  };
  polygon?: {
    points: Array<{ lat: number; lng: number }>;
    boundingBox: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
  };
}

interface LocationSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect?: (location: LocationSelection) => void;
  onOpenMapModal?: () => void;
  selectedArea?: AreaSelection | null;
  onClearArea?: () => void;
  placeholder?: string;
  className?: string;
}

const RECENT_LOCATIONS_KEY = "rido_recent_locations";
const MAX_RECENT = 5;

function getRecentLocations(): LocationSelection[] {
  try {
    const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentLocation(location: LocationSelection) {
  try {
    const recent = getRecentLocations().filter(l => l.placeId !== location.placeId);
    recent.unshift(location);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // Ignore storage errors
  }
}

export function LocationSearchInput({
  value,
  onChange,
  onLocationSelect,
  onOpenMapModal,
  selectedArea,
  onClearArea,
  placeholder = "Wpisz lokalizację",
  className,
}: LocationSearchInputProps) {
  const { isLoaded, google } = useGoogleMaps();
  const [isFocused, setIsFocused] = useState(false);
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [recentLocations, setRecentLocations] = useState<LocationSelection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Initialize services
  useEffect(() => {
    if (isLoaded && google) {
      autocompleteService.current = new google.maps.places.AutocompleteService();
      // Create a dummy div for PlacesService
      const dummyDiv = document.createElement("div");
      placesService.current = new google.maps.places.PlacesService(dummyDiv);
      sessionToken.current = new google.maps.places.AutocompleteSessionToken();
    }
  }, [isLoaded, google]);

  // Load recent locations
  useEffect(() => {
    setRecentLocations(getRecentLocations());
  }, []);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch predictions
  const fetchPredictions = useCallback(async (input: string) => {
    if (!autocompleteService.current || !input.trim()) {
      setPredictions([]);
      return;
    }

    setIsLoading(true);
    try {
      const request: google.maps.places.AutocompletionRequest = {
        input,
        componentRestrictions: { country: "pl" },
        types: ["geocode", "establishment"],
        sessionToken: sessionToken.current!,
      };

      autocompleteService.current.getPlacePredictions(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results);
        } else {
          setPredictions([]);
        }
        setIsLoading(false);
      });
    } catch {
      setPredictions([]);
      setIsLoading(false);
    }
  }, [google]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (value.trim() && isFocused) {
        fetchPredictions(value);
      } else {
        setPredictions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, isFocused, fetchPredictions]);

  // Handle selection
  const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesService.current || !google) return;

    setIsLoading(true);
    placesService.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["geometry", "name", "types", "formatted_address"],
        sessionToken: sessionToken.current!,
      },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          const location: LocationSelection = {
            text: prediction.description,
            placeId: prediction.place_id,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            types: place.types,
          };

          saveRecentLocation(location);
          setRecentLocations(getRecentLocations());
          onChange(prediction.description);
          onLocationSelect?.(location);
          setIsFocused(false);
          
          // Reset session token after selection
          sessionToken.current = new google.maps.places.AutocompleteSessionToken();
        }
        setIsLoading(false);
      }
    );
  };

  const handleRecentSelect = (location: LocationSelection) => {
    onChange(location.text);
    onLocationSelect?.(location);
    setIsFocused(false);
  };

  const getAreaLabel = () => {
    if (!selectedArea) return null;
    if (selectedArea.type === "circle" && selectedArea.circle) {
      const km = selectedArea.circle.radiusMeters >= 1000 
        ? `${(selectedArea.circle.radiusMeters / 1000).toFixed(1)} km`
        : `${selectedArea.circle.radiusMeters} m`;
      return `Okrąg ${km}`;
    }
    if (selectedArea.type === "polygon") {
      return "Własny obszar";
    }
    return null;
  };

  const getIconForType = (types?: string[]) => {
    if (!types) return <MapPin className="h-4 w-4" />;
    if (types.includes("locality") || types.includes("administrative_area_level_1")) {
      return <Building2 className="h-4 w-4" />;
    }
    return <MapPin className="h-4 w-4" />;
  };

  const showDropdown = isFocused && (recentLocations.length > 0 || predictions.length > 0 || !value);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Input with area badge */}
      <div className="relative flex items-center">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          className={cn(
            "pl-9",
            selectedArea && "pr-28"
          )}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {selectedArea && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <Badge variant="secondary" className="text-xs gap-1 pr-1">
              <Map className="h-3 w-3" />
              {getAreaLabel()}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1 hover:bg-destructive/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearArea?.();
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-xl z-50 overflow-hidden max-h-[400px] overflow-y-auto">
          {/* Recent Locations */}
          {!value && recentLocations.length > 0 && (
            <div className="p-2">
              <p className="text-xs font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wide">
                Ostatnio wybrane
              </p>
              {recentLocations.map((loc, idx) => (
                <button
                  key={loc.placeId || idx}
                  className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-muted rounded-md text-left transition-colors"
                  onClick={() => handleRecentSelect(loc)}
                >
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{loc.text.split(",")[0]}</p>
                    <p className="text-xs text-muted-foreground truncate">{loc.text.split(",").slice(1).join(",").trim()}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Predictions */}
          {predictions.length > 0 && (
            <div className="p-2">
              {value && <Separator className="mb-2" />}
              {predictions.map((prediction) => (
                <button
                  key={prediction.place_id}
                  className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-muted rounded-md text-left transition-colors"
                  onClick={() => handleSelect(prediction)}
                >
                  {getIconForType(prediction.types)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {prediction.structured_formatting.main_text}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {prediction.structured_formatting.secondary_text}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <Separator />

          {/* Action Buttons */}
          <div className="p-2 space-y-1">
            <button
              className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-muted rounded-md text-left transition-colors"
              onClick={() => {
                setIsFocused(false);
                onOpenMapModal?.();
              }}
            >
              <Map className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm font-medium">Szukaj na mapie</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            <button
              className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-muted rounded-md text-left transition-colors"
              onClick={() => {
                setIsFocused(false);
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      const location: LocationSelection = {
                        text: "Moja lokalizacja",
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                      };
                      onLocationSelect?.(location);
                      onChange("Moja lokalizacja");
                    },
                    () => {
                      console.error("Geolocation failed");
                    }
                  );
                }
              }}
            >
              <Navigation className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm font-medium">Szukaj w pobliżu adresu</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            <button
              className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-muted rounded-md text-left transition-colors"
              onClick={() => {
                // Could open a list of popular cities
                setIsFocused(false);
              }}
            >
              <List className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm font-medium">Wybierz lokalizację z listy</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {!isLoaded && (
            <div className="p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-2">Ładowanie Google Maps...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
