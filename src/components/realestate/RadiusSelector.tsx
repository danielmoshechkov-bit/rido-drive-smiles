import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Check } from "lucide-react";

interface RadiusSelectorProps {
  value: number;
  onChange: (radius: number) => void;
  className?: string;
}

// Simplified radius options: 300m, 500m, 1km, 2km
const RADIUS_OPTIONS = [300, 500, 1000, 2000];

export function RadiusSelector({ value, onChange, className }: RadiusSelectorProps) {
  const [open, setOpen] = useState(false);

  const handleRadiusSelect = (radius: number) => {
    onChange(radius);
    setOpen(false);
  };

  // Format value display - show km for large values
  const formatRadius = (r: number): string => {
    if (r >= 1000) {
      return `${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)}km`;
    }
    return `${r}m`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button 
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer ${className}`}
        >
          <span className="text-sm font-medium">{formatRadius(value)}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-2" align="center">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">
            Zmień promień
          </p>
          {RADIUS_OPTIONS.map(r => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              className="w-full justify-between h-8"
              onClick={() => handleRadiusSelect(r)}
            >
              {formatRadius(r)}
              {value === r && <Check className="h-4 w-4 text-primary" />}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
