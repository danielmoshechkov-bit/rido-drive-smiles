import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, X } from "lucide-react";
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

interface MarketplaceFiltersProps {
  onFilterChange: (filters: FilterValues) => void;
}

export interface FilterValues {
  brands: string[];
  model: string;
  yearFrom: string;
  priceMax: string;
  fuelTypes: string[];
  city: string;
}

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "hybryda_gaz", label: "Hybryda + Gaz" },
  { value: "lpg", label: "LPG" },
  { value: "elektryczny", label: "Elektryczny" },
];

const YEARS = Array.from({ length: 30 }, (_, i) => (new Date().getFullYear() - i).toString());

export function MarketplaceFilters({ onFilterChange }: MarketplaceFiltersProps) {
  const [allBrands, setAllBrands] = useState<CarBrand[]>([]);
  const [models, setModels] = useState<CarModel[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  
  const [filters, setFilters] = useState<FilterValues>({
    brands: [],
    model: "",
    yearFrom: "",
    priceMax: "",
    fuelTypes: [],
    city: "",
  });
  
  const [brandSearch, setBrandSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showFuelDropdown, setShowFuelDropdown] = useState(false);
  
  const brandRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
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
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
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

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
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

  const handleSelectModel = (m: CarModel) => {
    setFilters((prev) => ({ ...prev, model: m.name }));
    setModelSearch("");
    setShowModelDropdown(false);
  };

  const clearModel = () => {
    setFilters((prev) => ({ ...prev, model: "" }));
    setModelSearch("");
  };

  const handleSearch = () => {
    onFilterChange(filters);
  };

  const clearFilters = () => {
    const emptyFilters: FilterValues = {
      brands: [],
      model: "",
      yearFrom: "",
      priceMax: "",
      fuelTypes: [],
      city: "",
    };
    setFilters(emptyFilters);
    setBrandSearch("");
    setModelSearch("");
    onFilterChange(emptyFilters);
  };

  const hasActiveFilters = 
    filters.brands.length > 0 ||
    filters.model !== "" ||
    (filters.yearFrom !== "" && filters.yearFrom !== "all") ||
    filters.priceMax !== "" ||
    filters.fuelTypes.length > 0 ||
    (filters.city !== "" && filters.city !== "all");

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Brand Multi-Select */}
        <div ref={brandRef} className="relative">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Marka</label>
          <div className="relative">
            <div
              onClick={() => setShowBrandDropdown(!showBrandDropdown)}
              className="flex items-center justify-between w-full px-3 py-2 border rounded-md bg-background cursor-pointer hover:border-primary/50 transition-colors min-h-[40px]"
            >
              <span className={cn("text-sm truncate", filters.brands.length === 0 && "text-muted-foreground")}>
                {filters.brands.length === 0 ? "Wszystkie marki" : `${filters.brands.length} wybrano`}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
          </div>
          
          {/* Selected brands as chips */}
          {filters.brands.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.brands.map((brand) => (
                <Badge key={brand} variant="secondary" className="text-xs px-2 py-0.5 gap-1">
                  {brand}
                  <button onClick={() => removeBrand(brand)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          
          {showBrandDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
              <div className="p-2 border-b">
                <Input
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder="Szukaj marki..."
                  className="h-8"
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

        {/* Model Selector */}
        <div ref={modelRef} className="relative">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Model</label>
          <div className="relative">
            <Input
              value={showModelDropdown ? modelSearch : filters.model}
              onChange={(e) => {
                setModelSearch(e.target.value);
                if (!showModelDropdown) setShowModelDropdown(true);
              }}
              onFocus={() => filters.brands.length === 1 && setShowModelDropdown(true)}
              placeholder={filters.brands.length === 1 ? "Wszystkie modele" : "Najpierw 1 marka"}
              disabled={filters.brands.length !== 1}
              className="pr-8"
            />
            {filters.model ? (
              <button
                onClick={clearModel}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {showModelDropdown && filters.brands.length === 1 && (
            <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
              <button
                className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                onClick={() => {
                  clearModel();
                  setShowModelDropdown(false);
                }}
              >
                Wszystkie modele
              </button>
              {filteredModels.map((m) => (
                <button
                  key={m.id}
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-accent text-sm",
                    filters.model === m.name && "bg-accent font-medium"
                  )}
                  onClick={() => handleSelectModel(m)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Year From */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rok od</label>
          <Select
            value={filters.yearFrom}
            onValueChange={(v) => setFilters((prev) => ({ ...prev, yearFrom: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Dowolny" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Dowolny</SelectItem>
              {YEARS.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Price Max */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cena do (zł/tydz)</label>
          <Input
            type="number"
            placeholder="Bez limitu"
            value={filters.priceMax}
            onChange={(e) => setFilters((prev) => ({ ...prev, priceMax: e.target.value }))}
          />
        </div>

        {/* Fuel Type Multi-Select */}
        <div ref={fuelRef} className="relative">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rodzaj paliwa</label>
          <div className="relative">
            <div
              onClick={() => setShowFuelDropdown(!showFuelDropdown)}
              className="flex items-center justify-between w-full px-3 py-2 border rounded-md bg-background cursor-pointer hover:border-primary/50 transition-colors min-h-[40px]"
            >
              <span className={cn("text-sm truncate", filters.fuelTypes.length === 0 && "text-muted-foreground")}>
                {filters.fuelTypes.length === 0 ? "Wszystkie" : `${filters.fuelTypes.length} wybrano`}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
          </div>
          
          {/* Selected fuel types as chips */}
          {filters.fuelTypes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.fuelTypes.map((fuelValue) => {
                const fuelLabel = FUEL_TYPES.find(f => f.value === fuelValue)?.label || fuelValue;
                return (
                  <Badge key={fuelValue} variant="secondary" className="text-xs px-2 py-0.5 gap-1">
                    {fuelLabel}
                    <button onClick={() => removeFuelType(fuelValue)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          
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

        {/* City */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Miasto</label>
          <Select
            value={filters.city}
            onValueChange={(v) => setFilters((prev) => ({ ...prev, city: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Wszystkie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie miasta</SelectItem>
              {cities.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search Button */}
      <div className="flex items-center justify-between mt-6">
        <div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" /> Wyczyść filtry
            </Button>
          )}
        </div>
        <Button onClick={handleSearch} size="lg" className="px-8">
          <Search className="h-4 w-4 mr-2" />
          Szukaj
        </Button>
      </div>
    </div>
  );
}
