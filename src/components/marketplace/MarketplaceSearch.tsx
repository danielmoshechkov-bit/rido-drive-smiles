import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface CarBrand {
  id: string;
  name: string;
}

interface CarModel {
  id: string;
  brand_id: string;
  name: string;
}

interface City {
  id: string;
  name: string;
}

export interface SearchFilters {
  brands: string[];
  model: string;
  yearFrom: string;
  yearTo: string;
  priceMin: string;
  priceMax: string;
  fuelTypes: string[];
  city: string;
  mileageMax: string;
}

interface MarketplaceSearchProps {
  onSearch: (filters: SearchFilters) => void;
  resultCount?: number;
}

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "lpg", label: "LPG" },
  { value: "elektryczny", label: "Elektryczny" },
];

const YEARS = Array.from({ length: 30 }, (_, i) => (new Date().getFullYear() - i).toString());

export function MarketplaceSearch({ onSearch, resultCount }: MarketplaceSearchProps) {
  const [allBrands, setAllBrands] = useState<CarBrand[]>([]);
  const [models, setModels] = useState<CarModel[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [filters, setFilters] = useState<SearchFilters>({
    brands: [],
    model: "",
    yearFrom: "",
    yearTo: "",
    priceMin: "",
    priceMax: "",
    fuelTypes: [],
    city: "",
    mileageMax: "",
  });
  
  const [brandSearch, setBrandSearch] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showFuelDropdown, setShowFuelDropdown] = useState(false);
  
  const brandRef = useRef<HTMLDivElement>(null);
  const fuelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      const [brandsRes, citiesRes] = await Promise.all([
        supabase.from("car_brands").select("*").order("name"),
        supabase.from("cities").select("*").order("name"),
      ]);
      if (brandsRes.data) setAllBrands(brandsRes.data);
      if (citiesRes.data) setCities(citiesRes.data);
    };
    loadData();
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      if (filters.brands.length !== 1) {
        setModels([]);
        return;
      }
      const brand = allBrands.find(b => b.name === filters.brands[0]);
      if (!brand) return;
      
      const { data } = await supabase
        .from("car_models")
        .select("*")
        .eq("brand_id", brand.id)
        .order("name");
      if (data) setModels(data);
    };
    loadModels();
  }, [filters.brands, allBrands]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (brandRef.current && !brandRef.current.contains(event.target as Node)) {
        setShowBrandDropdown(false);
      }
      if (fuelRef.current && !fuelRef.current.contains(event.target as Node)) {
        setShowFuelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredBrands = allBrands.filter((b) =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const toggleBrand = (brandName: string) => {
    setFilters((prev) => {
      const newBrands = prev.brands.includes(brandName)
        ? prev.brands.filter(b => b !== brandName)
        : [...prev.brands, brandName];
      return { ...prev, brands: newBrands, model: "" };
    });
  };

  const removeBrand = (brandName: string) => {
    setFilters((prev) => ({
      ...prev,
      brands: prev.brands.filter(b => b !== brandName),
      model: prev.brands.length === 1 ? "" : prev.model
    }));
  };

  const toggleFuelType = (fuelValue: string) => {
    setFilters((prev) => {
      const newFuels = prev.fuelTypes.includes(fuelValue)
        ? prev.fuelTypes.filter(f => f !== fuelValue)
        : [...prev.fuelTypes, fuelValue];
      return { ...prev, fuelTypes: newFuels };
    });
  };

  const removeFuelType = (fuelValue: string) => {
    setFilters((prev) => ({
      ...prev,
      fuelTypes: prev.fuelTypes.filter(f => f !== fuelValue)
    }));
  };

  const handleSearch = () => {
    onSearch(filters);
  };

  const clearFilters = () => {
    const emptyFilters: SearchFilters = {
      brands: [],
      model: "",
      yearFrom: "",
      yearTo: "",
      priceMin: "",
      priceMax: "",
      fuelTypes: [],
      city: "",
      mileageMax: "",
    };
    setFilters(emptyFilters);
    setBrandSearch("");
    onSearch(emptyFilters);
  };

  const activeFilterCount = 
    filters.brands.length + 
    (filters.model ? 1 : 0) +
    (filters.yearFrom && filters.yearFrom !== "all" ? 1 : 0) +
    (filters.yearTo && filters.yearTo !== "all" ? 1 : 0) +
    (filters.priceMin ? 1 : 0) +
    (filters.priceMax ? 1 : 0) +
    filters.fuelTypes.length +
    (filters.city && filters.city !== "all" ? 1 : 0) +
    (filters.mileageMax ? 1 : 0);

  return (
    <div className="bg-card border rounded-2xl shadow-lg overflow-hidden">
      {/* Main Search Row */}
      <div className="p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Brand Multi-Select */}
          <div ref={brandRef} className="relative md:col-span-1">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Marka</label>
            <div
              onClick={() => setShowBrandDropdown(!showBrandDropdown)}
              className="flex items-center justify-between w-full px-3 py-2.5 border rounded-lg bg-background cursor-pointer hover:border-primary/50 transition-colors"
            >
              <span className={cn("text-sm truncate", filters.brands.length === 0 && "text-muted-foreground")}>
                {filters.brands.length === 0 ? "Wszystkie marki" : `${filters.brands.length} wybrano`}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
            
            {showBrandDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-xl max-h-64 overflow-auto">
                <div className="p-2 border-b sticky top-0 bg-background">
                  <Input
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                    placeholder="Szukaj marki..."
                    className="h-9"
                  />
                </div>
                {filteredBrands.map((b) => (
                  <label
                    key={b.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={filters.brands.includes(b.name)}
                      onCheckedChange={() => toggleBrand(b.name)}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Model</label>
            <Select
              value={filters.model || "all"}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, model: v === "all" ? "" : v }))}
              disabled={filters.brands.length !== 1}
            >
              <SelectTrigger>
                <SelectValue placeholder={filters.brands.length === 1 ? "Wszystkie" : "Najpierw wybierz 1 markę"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie modele</SelectItem>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.name}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* City */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Lokalizacja</label>
            <Select
              value={filters.city || "all"}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, city: v === "all" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Cała Polska" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cała Polska</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Button */}
          <div className="flex items-end">
            <Button onClick={handleSearch} className="w-full h-10" size="lg">
              <Search className="h-4 w-4 mr-2" />
              Pokaż {resultCount !== undefined ? resultCount.toLocaleString() : ""} ogłoszeń
            </Button>
          </div>
        </div>

        {/* Selected Brands Chips */}
        {filters.brands.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {filters.brands.map((brand) => (
              <Badge key={brand} variant="secondary" className="text-xs px-2 py-1 gap-1">
                {brand}
                <button onClick={() => removeBrand(brand)} className="hover:text-destructive ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Advanced Filters Toggle */}
      <div className="border-t">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-6 py-3 flex items-center justify-between hover:bg-accent/5 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="h-4 w-4" />
            <span>Więcej filtrów</span>
            {activeFilterCount > 0 && (
              <Badge variant="default" className="text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
        </button>

        {/* Advanced Filters Panel */}
        {showAdvanced && (
          <div className="px-4 md:px-6 pb-6 border-t pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {/* Year From */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rok od</label>
                <Select
                  value={filters.yearFrom || "all"}
                  onValueChange={(v) => setFilters((prev) => ({ ...prev, yearFrom: v === "all" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Od" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Dowolny</SelectItem>
                    {YEARS.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Year To */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rok do</label>
                <Select
                  value={filters.yearTo || "all"}
                  onValueChange={(v) => setFilters((prev) => ({ ...prev, yearTo: v === "all" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Do" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Dowolny</SelectItem>
                    {YEARS.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Price Min */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cena od (zł/tydz)</label>
                <Input
                  type="number"
                  placeholder="Od"
                  value={filters.priceMin}
                  onChange={(e) => setFilters((prev) => ({ ...prev, priceMin: e.target.value }))}
                />
              </div>

              {/* Price Max */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cena do (zł/tydz)</label>
                <Input
                  type="number"
                  placeholder="Do"
                  value={filters.priceMax}
                  onChange={(e) => setFilters((prev) => ({ ...prev, priceMax: e.target.value }))}
                />
              </div>

              {/* Mileage Max */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Przebieg do (km)</label>
                <Input
                  type="number"
                  placeholder="Max km"
                  value={filters.mileageMax}
                  onChange={(e) => setFilters((prev) => ({ ...prev, mileageMax: e.target.value }))}
                />
              </div>

              {/* Fuel Type */}
              <div ref={fuelRef} className="relative">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Paliwo</label>
                <div
                  onClick={() => setShowFuelDropdown(!showFuelDropdown)}
                  className="flex items-center justify-between w-full px-3 py-2 border rounded-md bg-background cursor-pointer hover:border-primary/50 transition-colors h-10"
                >
                  <span className={cn("text-sm truncate", filters.fuelTypes.length === 0 && "text-muted-foreground")}>
                    {filters.fuelTypes.length === 0 ? "Wszystkie" : `${filters.fuelTypes.length} wybrano`}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
                
                {showFuelDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg">
                    {FUEL_TYPES.map((ft) => (
                      <label
                        key={ft.value}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={filters.fuelTypes.includes(ft.value)}
                          onCheckedChange={() => toggleFuelType(ft.value)}
                        />
                        {ft.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Selected Fuel Types */}
            {filters.fuelTypes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {filters.fuelTypes.map((fuelValue) => {
                  const fuelLabel = FUEL_TYPES.find(f => f.value === fuelValue)?.label || fuelValue;
                  return (
                    <Badge key={fuelValue} variant="outline" className="text-xs px-2 py-1 gap-1">
                      {fuelLabel}
                      <button onClick={() => removeFuelType(fuelValue)} className="hover:text-destructive ml-1">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Clear Filters */}
            {activeFilterCount > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Wyczyść wszystkie filtry ({activeFilterCount})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
