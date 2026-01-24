import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, User, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone?: string | null;
  email?: string | null;
}

interface DriverSearchableSelectProps {
  drivers: Driver[];
  value: string;
  onChange: (driverId: string) => void;
  onAddNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DriverSearchableSelect({
  drivers,
  value,
  onChange,
  onAddNew,
  placeholder = 'Wyszukaj kierowcę...',
  disabled = false,
}: DriverSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedDriver = drivers.find(d => d.id === value);

  // Filter drivers based on search query
  const filteredDrivers = drivers.filter(driver => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${driver.first_name || ''} ${driver.last_name || ''}`.toLowerCase();
    const reverseName = `${driver.last_name || ''} ${driver.first_name || ''}`.toLowerCase();
    return fullName.includes(query) || reverseName.includes(query);
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (driverId: string) => {
    onChange(driverId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const displayValue = selectedDriver
    ? `${selectedDriver.first_name || ''} ${selectedDriver.last_name || ''}`.trim()
    : '';

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={isOpen ? searchQuery : displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-10"
        />
        {value && !isOpen && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            ×
          </Button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg">
          {/* Add new driver button */}
          {onAddNew && (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start gap-2 rounded-none border-b h-10 text-primary hover:text-primary"
              onClick={() => {
                onAddNew();
                setIsOpen(false);
              }}
            >
              <Plus className="h-4 w-4" />
              Dodaj nowego kierowcę
            </Button>
          )}

          <ScrollArea className="max-h-[200px]">
            {filteredDrivers.length === 0 ? (
              <div className="p-3 text-center text-sm text-muted-foreground">
                {searchQuery ? 'Nie znaleziono kierowców' : 'Brak kierowców'}
              </div>
            ) : (
              <div className="py-1">
                {filteredDrivers.map(driver => {
                  const isSelected = driver.id === value;
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => handleSelect(driver.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors',
                        isSelected && 'bg-accent'
                      )}
                    >
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {driver.first_name} {driver.last_name}
                        </div>
                        {driver.phone && (
                          <div className="text-xs text-muted-foreground truncate">
                            {driver.phone}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
