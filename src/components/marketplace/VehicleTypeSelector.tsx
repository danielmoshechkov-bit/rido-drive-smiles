import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Car, Bike, Zap, Truck } from "lucide-react";

interface ItemType {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

interface VehicleTypeSelectorProps {
  selectedType: string | null;
  onSelect: (typeId: string | null, slug: string | null) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Car: Car,
  Bike: Bike,
  Zap: Zap,
  Truck: Truck,
};

export function VehicleTypeSelector({ selectedType, onSelect }: VehicleTypeSelectorProps) {
  const [types, setTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTypes = async () => {
      try {
        // First get the "pojazdy" category
        const { data: category } = await supabase
          .from("marketplace_categories")
          .select("id")
          .eq("slug", "pojazdy")
          .single();

        if (category) {
          const { data } = await supabase
            .from("marketplace_item_types")
            .select("id, name, slug, icon")
            .eq("category_id", category.id)
            .eq("is_active", true)
            .order("sort_order");

          if (data) setTypes(data);
        }
      } catch (error) {
        console.error("Error loading vehicle types:", error);
      } finally {
        setLoading(false);
      }
    };
    loadTypes();
  }, []);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 w-28 bg-muted animate-pulse rounded-lg flex-shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {/* "All" option */}
      <button
        onClick={() => onSelect(null, null)}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all duration-200 flex-shrink-0 font-medium",
          selectedType === null
            ? "bg-primary text-primary-foreground border-primary shadow-lg"
            : "bg-card hover:bg-accent/10 border-border hover:border-primary/30"
        )}
      >
        <Car className="h-5 w-5" />
        <span>Wszystkie</span>
      </button>

      {types.map((type) => {
        const IconComponent = ICON_MAP[type.icon] || Car;
        const isSelected = selectedType === type.id;

        return (
          <button
            key={type.id}
            onClick={() => onSelect(type.id, type.slug)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all duration-200 flex-shrink-0 font-medium",
              isSelected
                ? "bg-primary text-primary-foreground border-primary shadow-lg"
                : "bg-card hover:bg-accent/10 border-border hover:border-primary/30"
            )}
          >
            <IconComponent className="h-5 w-5" />
            <span>{type.name}</span>
          </button>
        );
      })}
    </div>
  );
}
