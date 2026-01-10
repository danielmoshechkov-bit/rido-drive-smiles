import { cn } from "@/lib/utils";
import { Home, Building, Map, Building2, BedDouble, Landmark } from "lucide-react";

interface PropertyTypeSelectorProps {
  selectedType: string | null;
  onTypeChange: (type: string | null) => void;
  className?: string;
}

const PROPERTY_TYPES = [
  { value: "mieszkania", label: "Mieszkania", icon: Home },
  { value: "domy", label: "Domy", icon: Building },
  { value: "dzialki", label: "Działki", icon: Map },
  { value: "lokale", label: "Lokale", icon: Building2 },
  { value: "pokoje", label: "Pokoje", icon: BedDouble },
  { value: "inwestycje", label: "Inwestycje", icon: Landmark },
];

export function PropertyTypeSelector({
  selectedType,
  onTypeChange,
  className,
}: PropertyTypeSelectorProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {PROPERTY_TYPES.map((type) => {
        const Icon = type.icon;
        const isSelected = selectedType === type.value;

        return (
          <button
            key={type.value}
            onClick={() => onTypeChange(isSelected ? null : type.value)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border transition-all",
              "text-sm font-medium",
              isSelected
                ? "bg-primary text-primary-foreground border-primary shadow-md"
                : "bg-background hover:bg-muted border-border hover:border-primary/50"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{type.label}</span>
          </button>
        );
      })}
    </div>
  );
}