import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_UNITS = ['szt.', 'usł.', 'godz.', 'km', 'kg', 'm²', 'm³', 'kpl.', 'l', 'mb', 'opak.', 'para', 'rbg', 'zest.'];

interface UnitSelectorProps {
  value: string;
  onChange: (unit: string) => void;
}

export function UnitSelector({ value, onChange }: UnitSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const filteredUnits = useMemo(() => {
    if (!customInput) return DEFAULT_UNITS;
    const searchLower = customInput.toLowerCase();
    return DEFAULT_UNITS.filter(u => u.toLowerCase().includes(searchLower));
  }, [customInput]);

  const handleSelect = (unit: string) => {
    onChange(unit);
    setOpen(false);
    setCustomInput('');
  };

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onChange(customInput.trim());
      setOpen(false);
      setCustomInput('');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between h-10">
          <span className="truncate">{value}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Wpisz własną..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <ScrollArea className="h-48">
          <div className="p-1">
            {customInput && !filteredUnits.includes(customInput) && (
              <button
                onClick={handleCustomSubmit}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left text-primary font-medium"
              >
                Użyj: "{customInput}"
              </button>
            )}
            {filteredUnits.map((unit) => (
              <button
                key={unit}
                onClick={() => handleSelect(unit)}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-accent text-left",
                  value === unit && "bg-accent"
                )}
              >
                <span>{unit}</span>
                {value === unit && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
