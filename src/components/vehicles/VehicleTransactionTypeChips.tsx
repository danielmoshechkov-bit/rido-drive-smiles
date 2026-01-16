import { cn } from "@/lib/utils";

interface VehicleTransactionTypeChipsProps {
  selectedType: string | null;
  onTypeChange: (type: string | null) => void;
  className?: string;
}

const TRANSACTION_TYPES = [
  { value: "sprzedaz", label: "Na sprzedaż", color: "#10b981" },
  { value: "wynajem", label: "Wynajem długoterminowy", color: "#3b82f6" },
  { value: "wynajem-krotkoterminowy", label: "Krótkoterminowy", color: "#8b5cf6" },
];

export function VehicleTransactionTypeChips({
  selectedType,
  onTypeChange,
  className,
}: VehicleTransactionTypeChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {TRANSACTION_TYPES.map((type) => {
        const isSelected = selectedType === type.value;

        return (
          <button
            key={type.value}
            onClick={() => onTypeChange(isSelected ? null : type.value)}
            style={{
              backgroundColor: isSelected ? type.color : undefined,
              borderColor: type.color,
            }}
            className={cn(
              "px-4 py-1.5 rounded-full border-2 transition-all",
              "text-sm font-medium",
              isSelected
                ? "text-white shadow-md"
                : "bg-background hover:opacity-80"
            )}
          >
            {type.label}
          </button>
        );
      })}
    </div>
  );
}
