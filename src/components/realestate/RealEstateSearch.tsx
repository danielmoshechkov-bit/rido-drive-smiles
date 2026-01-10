import { useState } from "react";
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
import { Search, MapPin, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface RealEstateSearchProps {
  onSearch: (filters: RealEstateFilters) => void;
  onLocationClick?: () => void;
  className?: string;
}

export interface RealEstateFilters {
  propertyType?: string;
  transactionType?: string;
  location?: string;
  radius?: number;
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

const RADIUS_OPTIONS = [
  { value: "0", label: "Tylko to miasto" },
  { value: "10", label: "+10 km" },
  { value: "25", label: "+25 km" },
  { value: "50", label: "+50 km" },
  { value: "100", label: "+100 km" },
];

const ROOMS_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5+" },
];

export function RealEstateSearch({ onSearch, onLocationClick, className }: RealEstateSearchProps) {
  const [filters, setFilters] = useState<RealEstateFilters>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [locationText, setLocationText] = useState("");

  const updateFilter = (key: keyof RealEstateFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
    setLocationText("");
  };

  const handleSearch = () => {
    onSearch({ ...filters, location: locationText || undefined });
  };

  const activeFiltersCount = Object.values(filters).filter(Boolean).length + (locationText ? 1 : 0);

  return (
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

        {/* Location */}
        <div className="md:col-span-2 lg:col-span-2">
          <Label className="text-xs text-muted-foreground mb-1 block">Lokalizacja</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Miasto, dzielnica..."
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={filters.radius?.toString()}
              onValueChange={(v) => updateFilter("radius", parseInt(v))}
            >
              <SelectTrigger className="w-28">
                <SelectValue placeholder="+0 km" />
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onLocationClick && (
              <Button
                variant="outline"
                size="icon"
                onClick={onLocationClick}
                title="Wybierz na mapie"
              >
                <MapPin className="h-4 w-4" />
              </Button>
            )}
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
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced} className="mt-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Więcej filtrów
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFiltersCount}
                </Badge>
              )}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                showAdvanced && "rotate-180"
              )}
            />
          </Button>
        </CollapsibleTrigger>
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
  );
}