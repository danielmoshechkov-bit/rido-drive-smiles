import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { 
  Key, TrendingUp, DollarSign, FileText, ArrowLeftRight, 
  Car, Package, PiggyBank, ChevronDown, ChevronUp
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

// Real estate transaction types that should NOT appear in vehicle marketplace
const REAL_ESTATE_TYPE_SLUGS = ['sprzedaz-nieruchomosci', 'wynajem-nieruchomosci', 'wynajem-krotkoterminowy'];

// Primary types always shown (Sprzedaż, Wynajem)
const PRIMARY_TYPE_SLUGS = ['sprzedaz', 'wynajem'];

export function TransactionTypeChips({ selectedTypes, onToggle, vehicleTypeSlug }: TransactionTypeChipsProps) {
  const [types, setTypes] = useState<TransactionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

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

  // Filter types based on vehicle category and exclude real estate types
  const filteredTypes = useMemo(() => {
    // First filter out real estate types
    const vehicleTypes = types.filter(t => !REAL_ESTATE_TYPE_SLUGS.includes(t.slug));
    
    // For motorcycles, scooters, and bikes - show limited set
    if (vehicleTypeSlug && ['motocykle', 'skutery', 'rowery'].includes(vehicleTypeSlug)) {
      return vehicleTypes.filter(t => LIMITED_TYPE_SLUGS.includes(t.slug));
    }
    // For cars and all - show full set of vehicle-only types
    return vehicleTypes;
  }, [types, vehicleTypeSlug]);

  // Split into primary (always visible) and secondary (collapsible on mobile)
  const primaryTypes = useMemo(() => 
    filteredTypes.filter(t => PRIMARY_TYPE_SLUGS.includes(t.slug)), 
    [filteredTypes]
  );
  
  const secondaryTypes = useMemo(() => 
    filteredTypes.filter(t => !PRIMARY_TYPE_SLUGS.includes(t.slug)), 
    [filteredTypes]
  );

  if (loading) {
    return (
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 bg-muted animate-pulse rounded-full" />
        ))}
      </div>
    );
  }

  const renderChip = (type: TransactionType) => {
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
  };

  return (
    <div className="space-y-2">
      {/* Primary types always visible */}
      <div className="flex gap-2 flex-wrap items-center">
        {primaryTypes.map(renderChip)}
        
        {/* Show more button on mobile when there are secondary types */}
        {secondaryTypes.length > 0 && (
          <>
            {/* Mobile: Collapsible trigger */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="md:hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border border-border bg-card hover:bg-accent/10 text-muted-foreground transition-all"
            >
              <span>Więcej</span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            
            {/* Desktop: Show all types inline */}
            <div className="hidden md:contents">
              {secondaryTypes.map(renderChip)}
            </div>
          </>
        )}
      </div>
      
      {/* Mobile: Collapsible secondary types */}
      {secondaryTypes.length > 0 && isExpanded && (
        <div className="flex gap-2 flex-wrap md:hidden animate-in slide-in-from-top-2 duration-200">
          {secondaryTypes.map(renderChip)}
        </div>
      )}
    </div>
  );
}
