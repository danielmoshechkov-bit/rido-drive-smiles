import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

interface CarBrandModelSelectorProps {
  brand: string;
  model: string;
  onBrandChange: (brand: string) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

export function CarBrandModelSelector({
  brand,
  model,
  onBrandChange,
  onModelChange,
  disabled = false,
}: CarBrandModelSelectorProps) {
  const [brands, setBrands] = useState<CarBrand[]>([]);
  const [models, setModels] = useState<CarModel[]>([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  
  const brandRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  // Load brands
  useEffect(() => {
    const loadBrands = async () => {
      const { data } = await supabase
        .from("car_brands")
        .select("*")
        .order("name");
      if (data) setBrands(data);
    };
    loadBrands();
  }, []);

  // Load models when brand changes
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

  // Find brand ID when brand name is set externally
  useEffect(() => {
    if (brand && brands.length > 0) {
      const found = brands.find(
        (b) => b.name.toLowerCase() === brand.toLowerCase()
      );
      if (found) {
        setSelectedBrandId(found.id);
      }
    }
  }, [brand, brands]);

  // Close dropdowns on outside click
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
    onBrandChange(b.name);
    setSelectedBrandId(b.id);
    setBrandSearch("");
    setShowBrandDropdown(false);
    // Reset model when brand changes
    onModelChange("");
    setModelSearch("");
  };

  const handleSelectModel = (m: CarModel) => {
    onModelChange(m.name);
    setModelSearch("");
    setShowModelDropdown(false);
  };

  const clearBrand = () => {
    onBrandChange("");
    onModelChange("");
    setSelectedBrandId(null);
    setBrandSearch("");
    setModelSearch("");
  };

  const clearModel = () => {
    onModelChange("");
    setModelSearch("");
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Brand Selector */}
      <div ref={brandRef} className="relative">
        <label className="text-sm font-medium mb-1 block">Marka</label>
        <div className="relative">
          <Input
            value={showBrandDropdown ? brandSearch : brand}
            onChange={(e) => {
              setBrandSearch(e.target.value);
              if (!showBrandDropdown) setShowBrandDropdown(true);
            }}
            onFocus={() => setShowBrandDropdown(true)}
            placeholder="Wybierz markę..."
            disabled={disabled}
            className="pr-16"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {brand && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={clearBrand}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {showBrandDropdown && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredBrands.length > 0 ? (
              filteredBrands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-accent transition-colors text-sm",
                    brand === b.name && "bg-accent font-medium"
                  )}
                  onClick={() => handleSelectBrand(b)}
                >
                  {b.name}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Nie znaleziono marki
              </div>
            )}
          </div>
        )}
      </div>

      {/* Model Selector */}
      <div ref={modelRef} className="relative">
        <label className="text-sm font-medium mb-1 block">Model</label>
        <div className="relative">
          <Input
            value={showModelDropdown ? modelSearch : model}
            onChange={(e) => {
              setModelSearch(e.target.value);
              if (!showModelDropdown) setShowModelDropdown(true);
            }}
            onFocus={() => {
              if (selectedBrandId) setShowModelDropdown(true);
            }}
            placeholder={selectedBrandId ? "Wybierz model..." : "Najpierw wybierz markę"}
            disabled={disabled || !selectedBrandId}
            className="pr-16"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {model && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={clearModel}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {showModelDropdown && selectedBrandId && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredModels.length > 0 ? (
              filteredModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-accent transition-colors text-sm",
                    model === m.name && "bg-accent font-medium"
                  )}
                  onClick={() => handleSelectModel(m)}
                >
                  {m.name}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Nie znaleziono modelu
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
