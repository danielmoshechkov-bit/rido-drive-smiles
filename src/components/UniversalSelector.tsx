import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Search, X } from 'lucide-react';
import { useDropdownState } from '@/hooks/useGlobalDropdown';

interface UniversalSelectorItem {
  id: string;
  name: string;
  value?: string;
}

interface UniversalSelectorProps {
  id: string;
  items: UniversalSelectorItem[];
  currentValue?: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  addPlaceholder?: string;
  addButtonText?: string;
  noResultsText?: string;
  showSearch?: boolean;
  showAdd?: boolean;
  allowClear?: boolean;
  onSelect: (item: UniversalSelectorItem | null) => void;
  onAdd?: (name: string) => void;
  className?: string;
  disabled?: boolean;
}

export function UniversalSelector({
  id,
  items,
  currentValue,
  placeholder = "Wybierz opcję",
  searchPlaceholder = "Szukaj...",
  addPlaceholder = "Dodaj nowy",
  addButtonText = "Dodaj",
  noResultsText = "Brak wyników",
  showSearch = true,
  showAdd = false,
  allowClear = false,
  onSelect,
  onAdd,
  className = "",
  disabled = false
}: UniversalSelectorProps) {
  const { isOpen, toggle, close } = useDropdownState(id);
  const [searchTerm, setSearchTerm] = useState("");
  const [newItemName, setNewItemName] = useState("");

  const currentItem = items.find(item => item.id === currentValue);
  const displayValue = currentItem?.name || placeholder;

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (item: UniversalSelectorItem | null) => {
    onSelect(item);
    setSearchTerm("");
    close();
  };

  const handleAdd = () => {
    if (newItemName.trim() && onAdd) {
      onAdd(newItemName.trim());
      setNewItemName("");
      setSearchTerm("");
      close();
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleSelect(null);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest(`[data-selector-id="${id}"]`)) {
        close();
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen, close, id]);

  return (
    <div className={`relative ${className}`} data-selector-id={id}>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          onClick={toggle}
          disabled={disabled}
          className="h-8 px-3 border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary rounded-lg text-sm flex items-center gap-2 min-w-[120px] justify-between"
        >
          <span className="truncate">{displayValue}</span>
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        </Button>
        
        {allowClear && currentValue && (
          <button
            onClick={handleClear}
            className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:bg-destructive/80 transition-colors"
            title="Wyczyść wybór"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-80 bg-popover border border-border rounded-xl shadow-lg p-4">
          {/* Search Bar */}
          {showSearch && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9 rounded-lg"
                autoFocus
              />
            </div>
          )}

          {/* Items List */}
          <div className="space-y-1 mb-3 max-h-64 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {noResultsText}
              </div>
            ) : (
              filteredItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="px-3 py-2 rounded-lg hover:bg-primary/10 cursor-pointer transition-colors text-sm"
                >
                  {item.name}
                </div>
              ))
            )}
          </div>

          {/* Add New Section */}
          {showAdd && onAdd && (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2">{addPlaceholder}:</div>
              <div className="flex gap-2">
                <Input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder={addPlaceholder}
                  className="text-sm h-8 rounded-lg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAdd();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newItemName.trim()}
                  className="h-8 text-xs"
                >
                  {addButtonText}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}