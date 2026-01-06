import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { 
  Key, TrendingUp, DollarSign, FileText, ArrowLeftRight, 
  Car, Package, PiggyBank 
} from "lucide-react";

interface TransactionType {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string | null;
}

interface TransactionTypeChipsProps {
  selectedTypes: string[];
  onToggle: (typeId: string) => void;
  vehicleTypeSlug?: string | null;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Key: Key,
  TrendingUp: TrendingUp,
  DollarSign: DollarSign,
  FileText: FileText,
  ArrowLeftRight: ArrowLeftRight,
  Car: Car,
  Package: Package,
  PiggyBank: PiggyBank,
};

// Types allowed for motorcycles, scooters, and bikes (limited set)
const LIMITED_TYPE_SLUGS = ['sprzedaz', 'wynajem', 'rent-to-own', 'cesja-leasingu', 'zamiana'];

export function TransactionTypeChips({ selectedTypes, onToggle, vehicleTypeSlug }: TransactionTypeChipsProps) {
  const [types, setTypes] = useState<TransactionType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTypes = async () => {
      try {
        const { data } = await supabase
          .from("marketplace_transaction_types")
          .select("id, name, slug, icon, color, description")
          .eq("is_active", true)
          .order("sort_order");

        if (data) setTypes(data);
      } catch (error) {
        console.error("Error loading transaction types:", error);
      } finally {
        setLoading(false);
      }
    };
    loadTypes();
  }, []);

  // Filter types based on vehicle category
  const filteredTypes = useMemo(() => {
    // For motorcycles, scooters, and bikes - show limited set
    if (vehicleTypeSlug && ['motocykle', 'skutery', 'rowery'].includes(vehicleTypeSlug)) {
      return types.filter(t => LIMITED_TYPE_SLUGS.includes(t.slug));
    }
    // For cars and all - show full set
    return types;
  }, [types, vehicleTypeSlug]);

  if (loading) {
    return (
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-24 bg-muted animate-pulse rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {filteredTypes.map((type) => {
        const IconComponent = ICON_MAP[type.icon] || Key;
        const isSelected = selectedTypes.includes(type.id);

        return (
          <button
            key={type.id}
            onClick={() => onToggle(type.id)}
            title={type.description || type.name}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border",
              isSelected
                ? "text-white shadow-md scale-105"
                : "bg-card hover:bg-accent/10 text-foreground border-border hover:border-primary/30"
            )}
            style={isSelected ? { 
              backgroundColor: type.color,
              borderColor: type.color,
            } : undefined}
          >
            <IconComponent className="h-3.5 w-3.5" />
            <span>{type.name}</span>
          </button>
        );
      })}
    </div>
  );
}
