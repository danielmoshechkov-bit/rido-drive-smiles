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
import { VehicleLocationInput, LocationSelection, AreaSelection } from "./VehicleLocationInput";
import { LocationMapModal } from "@/components/realestate/LocationMapModal";
import { supabase } from "@/integrations/supabase/client";

interface VehicleSearchWithMapProps {
  onSearch: (filters: VehicleSearchFilters) => void;
  onShowMapResults?: () => void;
  className?: string;
  resultCount?: number;
}

export interface VehicleSearchFilters {
  brands: string[];
  model?: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  radius?: number;
  area?: AreaSelection | null;
  yearFrom?: number;
  yearTo?: number;
  priceMin?: number;
  priceMax?: number;
  fuelTypes: string[];
  mileageMax?: number;
  engineCapacityMin?: number;
  engineCapacityMax?: number;
  powerMin?: number;
  powerMax?: number;
  bodyType?: string;
  transactionType?: string;
}

interface CarBrand {
  id: string;
  name: string;
}

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "elektryczny", label: "Elektryczny" },
  { value: "lpg", label: "LPG" },
];

const BODY_TYPES = [
  { value: "sedan", label: "Sedan" },
  { value: "suv", label: "SUV" },
  { value: "hatchback", label: "Hatchback" },
  { value: "kombi", label: "Kombi" },
  { value: "van", label: "Van" },
  { value: "coupe", label: "Coupe" },
];

const TRANSACTION_TYPES = [
  { value: "sprzedaz", label: "Na sprzedaż" },
  { value: "wynajem", label: "Wynajem" },
  { value: "wynajem-krotkoterminowy", label: "Wynajem krótkoterminowy" },
];

const YEARS = Array.from({ length: 30 }, (_, i) => (new Date().getFullYear() - i).toString());

export function VehicleSearchWithMap({ 
  onSearch, 
  onShowMapResults, 
  className,
  resultCount 
}: VehicleSearchWithMapProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [filters, setFilters] = useState<VehicleSearchFilters>(() => {
    const initial: VehicleSearchFilters = { brands: [], fuelTypes: [] };
    
    const priceMin = searchParams.get("priceMin");
    if (priceMin) initial.priceMin = parseInt(priceMin);
    
    const priceMax = searchParams.get("priceMax");
    if (priceMax) initial.priceMax = parseInt(priceMax);
    
    const yearFrom = searchParams.get("yearFrom");
    if (yearFrom) initial.yearFrom = parseInt(yearFrom);
    
    return initial;
  });
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [locationText, setLocationText] = useState(() => searchParams.get("location") || "");
  const [selectedLocation, setSelectedLocation] = useState<LocationSelection | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaSelection | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [allBrands, setAllBrands] = useState<CarBrand[]>([]);

  // Load brands
  useEffect(() => {
    const loadBrands = async () => {
      const { data } = await supabase
        .from('car_brands')
        .select('id, name')
        .order('name');
      if (data) setAllBrands(data);
    };
    loadBrands();
  }, []);

  const updateFilter = (key: keyof VehicleSearchFilters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({ brands: [], fuelTypes: [] });
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
  };

  const toggleBrand = (brandName: string) => {
    setFilters(prev => ({
      ...prev,
      brands: prev.brands.includes(brandName)
        ? prev.brands.filter(b => b !== brandName)
        : [...prev.brands, brandName]
    }));
  };

  const toggleFuelType = (fuelType: string) => {
    setFilters(prev => ({
      ...prev,
      fuelTypes: prev.fuelTypes.includes(fuelType)
        ? prev.fuelTypes.filter(f => f !== fuelType)
        : [...prev.fuelTypes, fuelType]
    }));
  };

  const activeFiltersCount = 
    filters.brands.length + 
    filters.fuelTypes.length + 
    (filters.yearFrom ? 1 : 0) + 
    (filters.priceMin || filters.priceMax ? 1 : 0) + 
    (locationText ? 1 : 0) + 
    (selectedArea ? 1 : 0);

  return (
    <>
      <div className={cn("bg-background rounded-xl border shadow-lg p-4", className)}>
        {/* Main Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {/* Brand Select */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Marka</Label>
            <Select
              value={filters.brands[0] || ""}
              onValueChange={(v) => setFilters(prev => ({ ...prev, brands: v ? [v] : [] }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wszystkie" />
              </SelectTrigger>
              <SelectContent>
                {allBrands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.name}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transaction Type */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Rodzaj</Label>
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

          {/* Location */}
          <div className="sm:col-span-2 lg:col-span-2">
            <Label className="text-xs text-muted-foreground mb-1 block">Lokalizacja</Label>
            <div className="flex gap-2">
              <VehicleLocationInput
                value={locationText}
                onChange={setLocationText}
                onLocationSelect={handleLocationSelect}
                onOpenMapModal={() => setShowMapModal(true)}
                selectedArea={selectedArea}
                onClearArea={handleClearArea}
                placeholder="Wpisz miasto lub region"
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

          {/* Search Button */}
          <div className="hidden xl:flex items-end">
            <Button onClick={handleSearch} className="w-full">
              <Search className="h-4 w-4 mr-2" />
              Szukaj {resultCount !== undefined && `(${resultCount})`}
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

        {/* Price Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Cena od</Label>
            <Input
              type="number"
              placeholder="zł"
              value={filters.priceMin || ""}
              onChange={(e) => updateFilter("priceMin", parseInt(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Cena do</Label>
            <Input
              type="number"
              placeholder="zł"
              value={filters.priceMax || ""}
              onChange={(e) => updateFilter("priceMax", parseInt(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Rocznik od</Label>
            <Select
              value={filters.yearFrom?.toString()}
              onValueChange={(v) => updateFilter("yearFrom", parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Od" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Rocznik do</Label>
            <Select
              value={filters.yearTo?.toString()}
              onValueChange={(v) => updateFilter("yearTo", parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Do" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Buttons */}
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

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="gap-1 text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4" />
              Wyczyść
            </Button>
          )}

          {/* Mobile Search Button */}
          <div className="lg:hidden ml-auto">
            <Button onClick={handleSearch} size="sm">
              <Search className="h-4 w-4 mr-1" />
              Szukaj
            </Button>
          </div>
        </div>

        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleContent className="pt-3 space-y-3">
            {/* Fuel & Body Type */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Paliwo</Label>
                <Select
                  value={filters.fuelTypes[0] || ""}
                  onValueChange={(v) => setFilters(prev => ({ ...prev, fuelTypes: v ? [v] : [] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wszystkie" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Nadwozie</Label>
                <Select
                  value={filters.bodyType}
                  onValueChange={(v) => updateFilter("bodyType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wszystkie" />
                  </SelectTrigger>
                  <SelectContent>
                    {BODY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Przebieg do</Label>
                <Input
                  type="number"
                  placeholder="km"
                  value={filters.mileageMax || ""}
                  onChange={(e) => updateFilter("mileageMax", parseInt(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Moc od (KM)</Label>
                <Input
                  type="number"
                  placeholder="KM"
                  value={filters.powerMin || ""}
                  onChange={(e) => updateFilter("powerMin", parseInt(e.target.value))}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Map Modal - Reuse from RealEstate */}
      <LocationMapModal
        open={showMapModal}
        onOpenChange={setShowMapModal}
        initialArea={selectedArea}
        onConfirm={handleAreaConfirm}
      />
    </>
  );
}
