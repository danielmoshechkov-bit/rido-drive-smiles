import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  brand: string;
  model: string;
  yearFrom: string;
  priceMax: string;
  fuelType: string;
  city: string;
}

const FUEL_TYPES = [
  { value: "", label: "Wszystkie" },
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "lpg", label: "LPG" },
  { value: "elektryczny", label: "Elektryczny" },
];

const YEARS = Array.from({ length: 30 }, (_, i) => (new Date().getFullYear() - i).toString());

export function MarketplaceFilters({ onFilterChange }: MarketplaceFiltersProps) {
  const [brands, setBrands] = useState<CarBrand[]>([]);
  const [models, setModels] = useState<CarModel[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  
  const [filters, setFilters] = useState<FilterValues>({
    brand: "",
    model: "",
    yearFrom: "",
    priceMax: "",
    fuelType: "",
    city: "",
  });
  
  const [brandSearch, setBrandSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  
  const brandRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      const [brandsRes, citiesRes] = await Promise.all([
        supabase.from("car_brands").select("*").order("name"),
        supabase.from("cities").select("*").order("name"),
      ]);
      if (brandsRes.data) setBrands(brandsRes.data);
      if (citiesRes.data) setCities(citiesRes.data);
    };
    loadData();
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      if (!selectedBrandId) {
        setModels([]);
        return;
      }
      const { data } = await supabase
        .from("car_models")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .order("name");
      if (data) setModels(data);
    };
    loadModels();
  }, [selectedBrandId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (brandRef.current && !brandRef.current.contains(event.target as Node)) {
        setShowBrandDropdown(false);
      }
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredBrands = brands.filter((b) =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleSelectBrand = (b: CarBrand) => {
    setFilters((prev) => ({ ...prev, brand: b.name, model: "" }));
    setSelectedBrandId(b.id);
    setBrandSearch("");
    setShowBrandDropdown(false);
  };

  const handleSelectModel = (m: CarModel) => {
    setFilters((prev) => ({ ...prev, model: m.name }));
    setModelSearch("");
    setShowModelDropdown(false);
  };

  const clearBrand = () => {
    setFilters((prev) => ({ ...prev, brand: "", model: "" }));
    setSelectedBrandId(null);
    setBrandSearch("");
  };

  const clearModel = () => {
    setFilters((prev) => ({ ...prev, model: "" }));
    setModelSearch("");
  };

  const handleSearch = () => {
    onFilterChange(filters);
  };

  const clearFilters = () => {
    const emptyFilters = {
      brand: "",
      model: "",
      yearFrom: "",
      priceMax: "",
      fuelType: "",
      city: "",
    };
    setFilters(emptyFilters);
    setSelectedBrandId(null);
    setBrandSearch("");
    setModelSearch("");
    onFilterChange(emptyFilters);
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Brand Selector */}
        <div ref={brandRef} className="relative">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Marka</label>
          <div className="relative">
            <Input
              value={showBrandDropdown ? brandSearch : filters.brand}
              onChange={(e) => {
                setBrandSearch(e.target.value);
                if (!showBrandDropdown) setShowBrandDropdown(true);
              }}
              onFocus={() => setShowBrandDropdown(true)}
              placeholder="Wszystkie marki"
              className="pr-8"
            />
            {filters.brand ? (
              <button
                onClick={clearBrand}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {showBrandDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
              <button
                className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                onClick={() => {
                  clearBrand();
                  setShowBrandDropdown(false);
                }}
              >
                Wszystkie marki
              </button>
              {filteredBrands.map((b) => (
                <button
                  key={b.id}
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-accent text-sm",
                    filters.brand === b.name && "bg-accent font-medium"
                  )}
                  onClick={() => handleSelectBrand(b)}
                >
                  {b.name}
                </button>
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
              onFocus={() => selectedBrandId && setShowModelDropdown(true)}
              placeholder={selectedBrandId ? "Wszystkie modele" : "Najpierw marka"}
              disabled={!selectedBrandId}
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
          {showModelDropdown && selectedBrandId && (
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
              <SelectItem value="">Dowolny</SelectItem>
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

        {/* Fuel Type */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rodzaj paliwa</label>
          <Select
            value={filters.fuelType}
            onValueChange={(v) => setFilters((prev) => ({ ...prev, fuelType: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Wszystkie" />
            </SelectTrigger>
            <SelectContent>
              {FUEL_TYPES.map((ft) => (
                <SelectItem key={ft.value} value={ft.value}>
                  {ft.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <SelectItem value="">Wszystkie miasta</SelectItem>
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
