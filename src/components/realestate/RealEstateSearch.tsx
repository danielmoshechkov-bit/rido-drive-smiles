import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, SlidersHorizontal, X, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocationSearchInput, LocationSelection, AreaSelection } from "./LocationSearchInput";
import { LocationMapModal } from "./LocationMapModal";

interface RealEstateSearchProps {
  onSearch: (filters: RealEstateFilters) => void;
  onShowMapResults?: () => void;
  className?: string;
}

export interface RealEstateFilters {
  propertyType?: string;
  transactionType?: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  radius?: number;
  area?: AreaSelection | null;
  priceFrom?: number;
  priceTo?: number;
  areaFrom?: number;
  areaTo?: number;
  roomsFrom?: number;
  roomsTo?: number;
  yearFrom?: number;
  floorFrom?: number;
  floorTo?: number;
  hasBalcony?: boolean;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasGarden?: boolean;
  marketType?: string;
}

const PROPERTY_TYPES = [
  { value: "mieszkanie", label: "Mieszkanie" },
  { value: "kawalerka", label: "Kawalerka" },
  { value: "dom", label: "Dom" },
  { value: "dzialka", label: "Działka" },
  { value: "lokal", label: "Lokal użytkowy" },
  { value: "pokoj", label: "Pokój" },
  { value: "inwestycja", label: "Inwestycja" },
];

const TRANSACTION_TYPES = [
  { value: "sprzedaz", label: "Na sprzedaż" },
  { value: "wynajem", label: "Wynajem" },
  { value: "wynajem-krotkoterminowy", label: "Wynajem krótkoterminowy" },
];

const ROOMS_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5+" },
];

// Parse area from URL params
function parseAreaFromParams(searchParams: URLSearchParams): AreaSelection | null {
  const areaType = searchParams.get("areaType");
  
  if (areaType === "circle") {
    const centerLat = parseFloat(searchParams.get("areaLat") || "");
    const centerLng = parseFloat(searchParams.get("areaLng") || "");
    const radiusMeters = parseInt(searchParams.get("areaRadius") || "");
    
    if (!isNaN(centerLat) && !isNaN(centerLng) && !isNaN(radiusMeters)) {
      return {
        type: "circle",
        circle: { centerLat, centerLng, radiusMeters }
      };
    }
  } else if (areaType === "polygon") {
    const pointsStr = searchParams.get("areaPoints");
    if (pointsStr) {
      try {
        const points = JSON.parse(decodeURIComponent(pointsStr));
        if (Array.isArray(points) && points.length >= 3) {
          const lats = points.map((p: { lat: number }) => p.lat);
          const lngs = points.map((p: { lng: number }) => p.lng);
          return {
            type: "polygon",
            polygon: {
              points,
              boundingBox: {
                north: Math.max(...lats),
                south: Math.min(...lats),
                east: Math.max(...lngs),
                west: Math.min(...lngs),
              }
            }
          };
        }
      } catch {
        // Invalid JSON
      }
    }
  }
  
  return null;
}

// Serialize area to URL params
function serializeAreaToParams(area: AreaSelection | null, params: URLSearchParams) {
  // Remove existing area params
  params.delete("areaType");
  params.delete("areaLat");
  params.delete("areaLng");
  params.delete("areaRadius");
  params.delete("areaPoints");
  
  if (!area) return;
  
  if (area.type === "circle" && area.circle) {
    params.set("areaType", "circle");
    params.set("areaLat", area.circle.centerLat.toString());
    params.set("areaLng", area.circle.centerLng.toString());
    params.set("areaRadius", area.circle.radiusMeters.toString());
  } else if (area.type === "polygon" && area.polygon) {
    params.set("areaType", "polygon");
    params.set("areaPoints", encodeURIComponent(JSON.stringify(area.polygon.points)));
  }
}

export function RealEstateSearch({ onSearch, onShowMapResults, className }: RealEstateSearchProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize filters from URL params
  const [filters, setFilters] = useState<RealEstateFilters>(() => {
    const initial: RealEstateFilters = {};
    
    const propertyType = searchParams.get("propertyType");
    if (propertyType) initial.propertyType = propertyType;
    
    const transactionType = searchParams.get("transactionType");
    if (transactionType) initial.transactionType = transactionType;
    
    const priceFrom = searchParams.get("priceFrom");
    if (priceFrom) initial.priceFrom = parseInt(priceFrom);
    
    const priceTo = searchParams.get("priceTo");
    if (priceTo) initial.priceTo = parseInt(priceTo);
    
    const areaFromParam = searchParams.get("areaFrom");
    if (areaFromParam) initial.areaFrom = parseInt(areaFromParam);
    
    const areaToParam = searchParams.get("areaTo");
    if (areaToParam) initial.areaTo = parseInt(areaToParam);
    
    initial.area = parseAreaFromParams(searchParams);
    
    return initial;
  });
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [locationText, setLocationText] = useState(() => searchParams.get("location") || "");
  const [selectedLocation, setSelectedLocation] = useState<LocationSelection | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaSelection | null>(() => parseAreaFromParams(searchParams));
  const [showMapModal, setShowMapModal] = useState(false);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    
    if (filters.propertyType) params.set("propertyType", filters.propertyType);
    if (filters.transactionType) params.set("transactionType", filters.transactionType);
    if (locationText) params.set("location", locationText);
    if (filters.priceFrom) params.set("priceFrom", filters.priceFrom.toString());
    if (filters.priceTo) params.set("priceTo", filters.priceTo.toString());
    if (filters.areaFrom) params.set("areaFrom", filters.areaFrom.toString());
    if (filters.areaTo) params.set("areaTo", filters.areaTo.toString());
    if (filters.roomsFrom) params.set("roomsFrom", filters.roomsFrom.toString());
    if (filters.roomsTo) params.set("roomsTo", filters.roomsTo.toString());
    if (filters.yearFrom) params.set("yearFrom", filters.yearFrom.toString());
    if (filters.marketType) params.set("marketType", filters.marketType);
    if (filters.hasBalcony) params.set("hasBalcony", "true");
    if (filters.hasElevator) params.set("hasElevator", "true");
    if (filters.hasParking) params.set("hasParking", "true");
    if (filters.hasGarden) params.set("hasGarden", "true");
    
    serializeAreaToParams(selectedArea, params);
    
    setSearchParams(params, { replace: true });
  }, [filters, locationText, selectedArea, setSearchParams]);

  const updateFilter = (key: keyof RealEstateFilters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
    setLocationText("");
    setSelectedLocation(null);
    setSelectedArea(null);
  };

  const handleSearch = () => {
    onSearch({ 
      ...filters, 
      location: locationText || undefined,
      locationLat: selectedLocation?.lat,
      locationLng: selectedLocation?.lng,
      area: selectedArea,
    });
  };

  const handleLocationSelect = (location: LocationSelection) => {
    setSelectedLocation(location);
    setLocationText(location.text);
  };

  const handleAreaConfirm = (area: AreaSelection | null) => {
    setSelectedArea(area);
    setFilters(prev => ({ ...prev, area }));
    
    // Automatyczne wyszukiwanie po zatwierdzeniu obszaru
    if (area) {
      onSearch({ 
        ...filters, 
        location: locationText || undefined,
        locationLat: selectedLocation?.lat,
        locationLng: selectedLocation?.lng,
        area,
      });
    }
  };

  const handleClearArea = () => {
    setSelectedArea(null);
    setFilters(prev => ({ ...prev, area: null }));
  };

  const activeFiltersCount = Object.values(filters).filter(Boolean).length + (locationText ? 1 : 0) + (selectedArea ? 1 : 0);

  return (
    <>
      <div className={cn("bg-background rounded-xl border shadow-lg p-4", className)}>
        {/* Main Search Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Property Type */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Typ nieruchomości</Label>
            <Select
              value={filters.propertyType}
              onValueChange={(v) => updateFilter("propertyType", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wszystkie" />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transaction Type */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Rodzaj transakcji</Label>
            <Select
              value={filters.transactionType}
              onValueChange={(v) => updateFilter("transactionType", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wszystkie" />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location - New Integrated Input */}
          <div className="md:col-span-2 lg:col-span-2">
            <Label className="text-xs text-muted-foreground mb-1 block">Lokalizacja</Label>
            <div className="flex gap-2">
              <LocationSearchInput
                value={locationText}
                onChange={setLocationText}
                onLocationSelect={handleLocationSelect}
                onOpenMapModal={() => setShowMapModal(true)}
                selectedArea={selectedArea}
                onClearArea={handleClearArea}
                placeholder="Wpisz lokalizację"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowMapModal(true)}
                title="Wybierz obszar na mapie"
              >
                <Map className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search Button - Desktop */}
          <div className="hidden lg:flex items-end">
            <Button onClick={handleSearch} className="w-full">
              <Search className="h-4 w-4 mr-2" />
              Szukaj
            </Button>
          </div>
        </div>

        {/* Area Badge */}
        {selectedArea && (
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Map className="h-3 w-3" />
              {selectedArea.type === "circle" && selectedArea.circle ? (
                <>Obszar: Okrąg {selectedArea.circle.radiusMeters >= 1000 
                  ? `${(selectedArea.circle.radiusMeters / 1000).toFixed(1)} km`
                  : `${selectedArea.circle.radiusMeters} m`
                }</>
              ) : (
                <>Obszar: Własny</>
              )}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowMapModal(true)}
            >
              Edytuj
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              onClick={handleClearArea}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Price & Area Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Cena od</Label>
            <Input
              type="number"
              placeholder="zł"
              value={filters.priceFrom || ""}
              onChange={(e) => updateFilter("priceFrom", parseInt(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Cena do</Label>
            <Input
              type="number"
              placeholder="zł"
              value={filters.priceTo || ""}
              onChange={(e) => updateFilter("priceTo", parseInt(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Powierzchnia od</Label>
            <Input
              type="number"
              placeholder="m²"
              value={filters.areaFrom || ""}
              onChange={(e) => updateFilter("areaFrom", parseInt(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Powierzchnia do</Label>
            <Input
              type="number"
              placeholder="m²"
              value={filters.areaTo || ""}
              onChange={(e) => updateFilter("areaTo", parseInt(e.target.value))}
            />
          </div>
        </div>

        {/* Advanced Filters */}
        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 mt-3">
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced} className="flex-shrink-0">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Więcej filtrów
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {activeFiltersCount}
                  </Badge>
                )}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showAdvanced && "rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          {onShowMapResults && (
            <Button
              variant="outline"
              size="sm"
              onClick={onShowMapResults}
              className="gap-2"
            >
              <Map className="h-4 w-4" />
              Pokaż na mapie
            </Button>
          )}
        </div>

        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleContent className="pt-3 space-y-3">
            {/* Rooms & Year */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Pokoje od</Label>
                <Select
                  value={filters.roomsFrom?.toString()}
                  onValueChange={(v) => updateFilter("roomsFrom", parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Min" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOMS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Pokoje do</Label>
                <Select
                  value={filters.roomsTo?.toString()}
                  onValueChange={(v) => updateFilter("roomsTo", parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Max" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOMS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Rok budowy od</Label>
                <Input
                  type="number"
                  placeholder="np. 2010"
                  value={filters.yearFrom || ""}
                  onChange={(e) => updateFilter("yearFrom", parseInt(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Rynek</Label>
                <Select
                  value={filters.marketType}
                  onValueChange={(v) => updateFilter("marketType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wszystkie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pierwotny">Pierwotny</SelectItem>
                    <SelectItem value="wtorny">Wtórny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Amenities */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Udogodnienia</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "hasBalcony", label: "Balkon" },
                  { key: "hasElevator", label: "Winda" },
                  { key: "hasParking", label: "Parking" },
                  { key: "hasGarden", label: "Ogród" },
                ].map((amenity) => (
                  <Badge
                    key={amenity.key}
                    variant={filters[amenity.key as keyof RealEstateFilters] ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() =>
                      updateFilter(
                        amenity.key as keyof RealEstateFilters,
                        !filters[amenity.key as keyof RealEstateFilters]
                      )
                    }
                  >
                    {amenity.label}
                  </Badge>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Search Button - Mobile & Clear */}
        <div className="flex gap-2 mt-4 lg:hidden">
          {activeFiltersCount > 0 && (
            <Button variant="outline" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Wyczyść
            </Button>
          )}
          <Button onClick={handleSearch} className="flex-1">
            <Search className="h-4 w-4 mr-2" />
            Szukaj
          </Button>
        </div>

        {/* Desktop Clear Button */}
        {activeFiltersCount > 0 && (
          <div className="hidden lg:flex justify-end mt-2">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" />
              Wyczyść filtry ({activeFiltersCount})
            </Button>
          </div>
        )}
      </div>

      {/* Map Modal */}
      <LocationMapModal
        open={showMapModal}
        onOpenChange={setShowMapModal}
        initialCenter={selectedLocation?.lat && selectedLocation?.lng 
          ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
          : undefined
        }
        initialArea={selectedArea}
        onConfirm={handleAreaConfirm}
      />
    </>
  );
}
