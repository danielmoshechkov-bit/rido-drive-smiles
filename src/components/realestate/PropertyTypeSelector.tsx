import { cn } from "@/lib/utils";
import { Home, Building, Map, Building2, BedDouble, Landmark } from "lucide-react";

interface PropertyTypeSelectorProps {
  selectedType: string | null;
  onTypeChange: (type: string | null) => void;
  className?: string;
}

// Values match database property_type column (singular form)
const PROPERTY_TYPES_ROW1 = [
  { value: "mieszkanie", label: "Mieszkania", icon: Home },
  { value: "dom", label: "Domy", icon: Building },
  { value: "dzialka", label: "Działki", icon: Map },
  { value: "pokoj", label: "Pokoje", icon: BedDouble },
  { value: "kawalerka", label: "Kawalerki", icon: Home },
];

const PROPERTY_TYPES_ROW2 = [
  { value: "rynek-pierwotny", label: "Rynek pierwotny", icon: Landmark },
  { value: "lokal", label: "Lokale użytkowe", icon: Building2 },
  { value: "hala-magazyn", label: "Hale i magazyny", icon: Building2 },
];

export function PropertyTypeSelector({
  selectedType,
  onTypeChange,
  className,
}: PropertyTypeSelectorProps) {
  const renderButton = (type: typeof PROPERTY_TYPES_ROW1[0]) => {
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
  };

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="flex flex-wrap justify-center gap-2">
        {PROPERTY_TYPES_ROW1.map(renderButton)}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {PROPERTY_TYPES_ROW2.map(renderButton)}
      </div>
    </div>
  );
}