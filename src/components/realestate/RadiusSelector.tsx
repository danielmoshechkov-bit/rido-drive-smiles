import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Check } from "lucide-react";

interface RadiusSelectorProps {
  value: number;
  onChange: (radius: number) => void;
  className?: string;
}

const RADIUS_OPTIONS = [200, 300, 500, 1000];

export function RadiusSelector({ value, onChange, className }: RadiusSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleRadiusSelect = (radius: number) => {
    onChange(radius);
    setOpen(false);
    setShowCustomInput(false);
  };

  const handleCustomRadiusSubmit = () => {
    const radius = parseInt(customInput);
    if (radius >= 100 && radius <= 2000) {
      onChange(radius);
      setShowCustomInput(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button 
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer ${className}`}
        >
          <span className="text-sm font-medium">{value}m</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="center">
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
              {r}m
              {value === r && <Check className="h-4 w-4 text-primary" />}
            </Button>
          ))}
          <div className="border-t my-2" />
          {showCustomInput ? (
            <div className="flex items-center gap-1 px-1">
              <Input
                type="number"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="100-2000"
                className="h-7 text-sm"
                min={100}
                max={2000}
                autoFocus
              />
              <span className="text-xs text-muted-foreground">m</span>
              <Button size="sm" variant="default" className="h-7 px-2" onClick={handleCustomRadiusSubmit}>
                OK
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-8 text-muted-foreground"
              onClick={() => setShowCustomInput(true)}
            >
              Inny promień...
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
