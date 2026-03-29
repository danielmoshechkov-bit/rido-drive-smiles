import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { 
  MapPin, Map, Search, Clock, Building2, ChevronRight, X, Loader2, Navigation, List, RefreshCw, AlertCircle
} from "lucide-react";

// Warsaw districts data
const WARSAW_DISTRICTS = [
  "Bemowo", "Białołęka", "Bielany", "Mokotów", "Ochota",
  "Praga-Południe", "Praga-Północ", "Rembertów", "Śródmieście",
  "Targówek", "Ursus", "Ursynów", "Wawer", "Wesoła",
  "Wilanów", "Włochy", "Wola", "Żoliborz",
];

const CITY_DISTRICTS: Record<string, string[]> = {
  "Warszawa": WARSAW_DISTRICTS,
  "Kraków": ["Stare Miasto", "Grzegórzki", "Prądnik Czerwony", "Prądnik Biały", "Krowodrza", "Bronowice", "Dębniki", "Łagiewniki", "Podgórze", "Nowa Huta", "Bieżanów", "Czyżyny"],
  "Wrocław": ["Stare Miasto", "Śródmieście", "Krzyki", "Fabryczna", "Psie Pole"],
  "Poznań": ["Stare Miasto", "Nowe Miasto", "Wilda", "Grunwald", "Jeżyce"],
  "Gdańsk": ["Śródmieście", "Wrzeszcz", "Oliwa", "Morena", "Przymorze", "Zaspa", "Osowa", "Łostowice"],
};

const FALLBACK_LOCATIONS: LocationSelection[] = [
  { text: "Warszawa", lat: 52.2297, lng: 21.0122, types: ["locality"] },
  { text: "Warszawa, Mokotów", lat: 52.1935, lng: 21.0448, types: ["sublocality_level_1"] },
  { text: "Warszawa, Śródmieście", lat: 52.2319, lng: 21.006, types: ["sublocality_level_1"] },
  { text: "Warszawa, Wilanów", lat: 52.1645, lng: 21.0932, types: ["sublocality_level_1"] },
  { text: "Warszawa, Wola", lat: 52.2365, lng: 20.9632, types: ["sublocality_level_1"] },
  { text: "Warszawa, Ursynów", lat: 52.1545, lng: 21.0432, types: ["sublocality_level_1"] },
  { text: "Kraków", lat: 50.0647, lng: 19.945, types: ["locality"] },
  { text: "Wrocław", lat: 51.1079, lng: 17.0385, types: ["locality"] },
  { text: "Gdańsk", lat: 54.352, lng: 18.6466, types: ["locality"] },
  { text: "Poznań", lat: 52.4064, lng: 16.9252, types: ["locality"] },
];

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
    bufferMeters?: number; // Buffer around the drawn polygon
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
const SEARCH_TIMEOUT = 6000; // 6 seconds

// Types for new Places API (with fallbacks for different API versions)
interface PlacePrediction {
  placeId: string;
  text?: {
    text: string;
    matches?: Array<{ startOffset: number; endOffset: number }>;
  };
  description?: string; // Legacy API fallback
  structuredFormat?: {
    mainText?: { text: string };
    secondaryText?: { text: string };
  };
  structured_formatting?: { // REST API format
    main_text?: string;
    secondary_text?: string;
  };
  types?: string[];
  toPlace?: () => google.maps.places.Place;
}

// Safe helper functions to extract text from predictions
function getPredictionMainText(prediction: PlacePrediction): string {
  return (
    prediction.structuredFormat?.mainText?.text ||
    prediction.structured_formatting?.main_text ||
    prediction.text?.text?.split(",")[0] ||
    prediction.description?.split(",")[0] ||
    "Nieznana lokalizacja"
  );
}

function getPredictionSecondaryText(prediction: PlacePrediction): string {
  return (
    prediction.structuredFormat?.secondaryText?.text ||
    prediction.structured_formatting?.secondary_text ||
    prediction.text?.text?.split(",").slice(1).join(",").trim() ||
    prediction.description?.split(",").slice(1).join(",").trim() ||
    ""
  );
}

function getPredictionFullText(prediction: PlacePrediction): string {
  const main = getPredictionMainText(prediction);
  const secondary = getPredictionSecondaryText(prediction);
  return (
    prediction.text?.text ||
    prediction.description ||
    (secondary ? `${main}, ${secondary}` : main)
  );
}

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
  const { isLoaded, error: mapsError, isTimedOut, retryLoad, google } = useGoogleMaps();
  const [isFocused, setIsFocused] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [recentLocations, setRecentLocations] = useState<LocationSelection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Check if the error is a configuration error
  const isConfigError = mapsError && (mapsError as any).isConfigError;
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Fetch predictions using new Places API
  const fetchPredictions = useCallback(async (input: string) => {
    if (!isLoaded || !google || !input.trim()) {
      setPredictions([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setSearchError(null);

    try {
      // Create session token if not exists
      if (!sessionTokenRef.current) {
        const { AutocompleteSessionToken } = google.maps.places;
        sessionTokenRef.current = new AutocompleteSessionToken();
      }

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("SEARCH_TIMEOUT"));
        }, SEARCH_TIMEOUT);
      });

      // Use new Places API - AutocompleteSuggestion
      const { AutocompleteSuggestion } = google.maps.places;
      
      console.log("[Google Maps] Fetching autocomplete suggestions for:", input);
      
      const searchPromise = AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedRegionCodes: ["pl"],
        language: "pl",
        sessionToken: sessionTokenRef.current,
      });

      const response = await Promise.race([searchPromise, timeoutPromise]);
      
      if (response.suggestions) {
        const placePredictions = response.suggestions
          .filter((s: any) => s.placePrediction)
          .map((s: any) => s.placePrediction as PlacePrediction);
        
        console.log("[Google Maps] Got", placePredictions.length, "predictions");
        setPredictions(placePredictions);
      } else {
        setPredictions([]);
      }
    } catch (error: any) {
      console.error("[Google Maps] Autocomplete failed:", error);
      
      if (error.name === "AbortError") {
        // Request was cancelled, ignore
        return;
      }
      
      if (error.message === "SEARCH_TIMEOUT") {
        console.warn("[Google Maps] Search timed out after", SEARCH_TIMEOUT / 1000, "seconds");
        setSearchError("Przekroczono czas oczekiwania. Spróbuj ponownie.");
      } else {
        setSearchError("Nie udało się wczytać wyników.");
      }
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, google]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (value.trim() && isFocused) {
        fetchPredictions(value);
      } else {
        setPredictions([]);
        setSearchError(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, isFocused, fetchPredictions]);

  // Handle selection using new Places API
  const handleSelect = async (prediction: PlacePrediction) => {
    if (!google) return;

    setIsLoading(true);
    setSearchError(null);

    try {
      console.log("[Google Maps] Fetching place details for:", prediction.placeId);
      
      let location: LocationSelection;

      // Try new API if toPlace exists
      if (prediction.toPlace) {
        const place = prediction.toPlace();
        await place.fetchFields({ 
          fields: ["displayName", "formattedAddress", "location", "types"] 
        });

        location = {
          text: place.formattedAddress || getPredictionFullText(prediction),
          placeId: prediction.placeId,
          lat: place.location?.lat(),
          lng: place.location?.lng(),
          types: place.types || prediction.types,
        };
      } else {
        // Fallback for legacy predictions without toPlace
        location = {
          text: getPredictionFullText(prediction),
          placeId: prediction.placeId,
          types: prediction.types,
        };
      }

      console.log("[Google Maps] Place details fetched:", location);

      saveRecentLocation(location);
      setRecentLocations(getRecentLocations());
      onChange(getPredictionFullText(prediction));
      onLocationSelect?.(location);
      setIsFocused(false);

      // Reset session token after selection
      sessionTokenRef.current = null;
    } catch (error) {
      console.error("[Google Maps] Place details failed:", error);
      setSearchError("Nie udało się pobrać szczegółów miejsca.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecentSelect = (location: LocationSelection) => {
    onChange(location.text);
    onLocationSelect?.(location);
    setIsFocused(false);
  };

  const handleRetrySearch = () => {
    setSearchError(null);
    if (value.trim()) {
      fetchPredictions(value);
    }
  };

  const getAreaLabel = () => {
    if (!selectedArea) return null;
    if (selectedArea.type === "circle" && selectedArea.circle) {
      const km = selectedArea.circle.radiusMeters >= 1000 
        ? `${(selectedArea.circle.radiusMeters / 1000).toFixed(1)} km`
        : `${selectedArea.circle.radiusMeters} m`;
      return `Okrąg ${km}`;
    }
    if (selectedArea.type === "polygon" && selectedArea.polygon) {
      const buffer = selectedArea.polygon.bufferMeters;
      if (buffer && buffer > 0) {
        return `Własny +${buffer}m`;
      }
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

  const showDropdown = isFocused && (recentLocations.length > 0 || predictions.length > 0 || searchError || !value);
  const fallbackPredictions = value.trim().length >= 2
    ? FALLBACK_LOCATIONS.filter((location) => location.text.toLowerCase().includes(value.trim().toLowerCase()))
    : [];
  const shouldShowFallbackLocations = Boolean(searchError) || !isLoaded;

  // Show config error message
  if (isConfigError) {
    return (
      <div ref={containerRef} className={cn("relative", className)}>
        <div className="relative flex items-center">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500 z-10" />
          <Input
            type="text"
            disabled
            placeholder="Skonfiguruj Google Maps API w panelu admina"
            className="pl-9 text-muted-foreground bg-amber-50 border-amber-200"
          />
        </div>
        <p className="text-xs text-amber-600 mt-1">
          ⚠️ Aby włączyć wyszukiwarkę, dodaj klucz API w: Admin → Ustawienia → Integracje lokalizacji
        </p>
      </div>
    );
  }

  // Show timeout error with retry
  if (isTimedOut) {
    return (
      <div ref={containerRef} className={cn("relative", className)}>
        <div className="relative flex items-center">
          <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive z-10" />
          <Input
            type="text"
            disabled
            placeholder="Nie udało się wczytać Google Maps"
            className="pl-9 text-muted-foreground bg-destructive/5 border-destructive/20"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={retryLoad}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Ponów
          </Button>
        </div>
        <p className="text-xs text-destructive mt-1">
          ⚠️ Przekroczono czas oczekiwania. Sprawdź połączenie internetowe i spróbuj ponownie.
        </p>
      </div>
    );
  }

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
          placeholder={!isLoaded ? "Ładowanie Google Maps..." : placeholder}
          disabled={!isLoaded}
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
          {/* Search Error with Retry */}
          {searchError && (
            <div className="p-4 text-center">
              <AlertCircle className="h-5 w-5 text-destructive mx-auto mb-2" />
              <p className="text-sm text-destructive mb-2">{searchError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetrySearch}
                className="gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Ponów wyszukiwanie
              </Button>
            </div>
          )}

          {/* District Picker - Otodom style */}
          {!searchError && (() => {
            // Check if the current value matches a city with known districts
            const trimmedValue = value.trim().toLowerCase();
            const matchedCity = Object.keys(CITY_DISTRICTS).find(
              city => city.toLowerCase() === trimmedValue || 
                      city.toLowerCase().startsWith(trimmedValue) && trimmedValue.length >= 3
            );
            const districts = matchedCity ? CITY_DISTRICTS[matchedCity] : null;
            
            if (!districts || districts.length === 0) return null;
            
            return (
              <div className="p-2 border-b">
                <div className="flex items-center justify-between px-2 py-1 mb-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Dzielnice — {matchedCity}
                  </p>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      onChange(`${matchedCity}, całe miasto`);
                      onLocationSelect?.({
                        text: matchedCity!,
                        types: ["locality"],
                      });
                      setIsFocused(false);
                    }}
                  >
                    Całe miasto
                  </button>
                </div>
                <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                  {districts.map((district) => (
                    <button
                      key={district}
                      className="w-full flex items-center gap-3 px-2 py-2 hover:bg-muted rounded-md text-left transition-colors"
                      onClick={() => {
                        onChange(`${matchedCity}, ${district}`);
                        onLocationSelect?.({
                          text: `${matchedCity}, ${district}`,
                          types: ["sublocality_level_1"],
                        });
                        setIsFocused(false);
                      }}
                    >
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{district}</p>
                        <p className="text-xs text-muted-foreground">dzielnica</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Recent Locations */}
          {!searchError && !value && recentLocations.length > 0 && (
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
          {!searchError && predictions.length > 0 && (
            <div className="p-2">
              {value && <Separator className="mb-2" />}
              {predictions
                .filter((prediction) => getPredictionMainText(prediction) !== "Nieznana lokalizacja")
                .map((prediction) => (
                  <button
                    key={prediction.placeId}
                    className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-muted rounded-md text-left transition-colors"
                    onClick={() => handleSelect(prediction)}
                  >
                    {getIconForType(prediction.types)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getPredictionMainText(prediction)}
                      </p>
                      {getPredictionSecondaryText(prediction) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {getPredictionSecondaryText(prediction)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
            </div>
          )}

          {shouldShowFallbackLocations && fallbackPredictions.length > 0 && (
            <div className="p-2">
              <p className="text-xs font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wide">
                Podpowiedzi lokalizacji
              </p>
              {fallbackPredictions.map((location, idx) => (
                <button
                  key={`${location.text}-${idx}`}
                  className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-muted rounded-md text-left transition-colors"
                  onClick={() => handleRecentSelect(location)}
                >
                  {getIconForType(location.types)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{location.text.split(',')[0]}</p>
                    <p className="text-xs text-muted-foreground truncate">{location.text.split(',').slice(1).join(',').trim() || 'miasto / dzielnica'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No results state */}
          {!searchError && value && predictions.length === 0 && fallbackPredictions.length === 0 && !isLoading && (
            <div className="p-4 text-center">
              <MapPin className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Brak wyników dla "{value}"</p>
              <p className="text-xs text-muted-foreground mt-1">Spróbuj wpisać inną lokalizację</p>
            </div>
          )}

          {!searchError && <Separator />}

          {/* Action Buttons */}
          {!searchError && (
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
          )}

          {!isLoaded && !searchError && (
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
