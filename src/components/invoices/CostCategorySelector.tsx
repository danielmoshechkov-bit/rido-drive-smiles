import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Search, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_CATEGORIES = [
  { value: 'fuel', label: 'Paliwo' },
  { value: 'materials', label: 'Materiały' },
  { value: 'services', label: 'Usługi obce' },
  { value: 'rent', label: 'Czynsz / Najem' },
  { value: 'utilities', label: 'Media' },
  { value: 'insurance', label: 'Ubezpieczenia' },
  { value: 'wages', label: 'Wynagrodzenia' },
  { value: 'marketing', label: 'Marketing / Reklama' },
  { value: 'office', label: 'Biuro / Administracja' },
  { value: 'transport', label: 'Transport' },
  { value: 'equipment', label: 'Sprzęt / Narzędzia' },
  { value: 'repairs', label: 'Naprawy / Serwis' },
  { value: 'taxes', label: 'Podatki / Opłaty' },
  { value: 'subscriptions', label: 'Abonamenty' },
  { value: 'training', label: 'Szkolenia' },
  { value: 'other', label: 'Inne' },
];

interface CostCategorySelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CostCategorySelector({ value, onChange, className }: CostCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [customCategories, setCustomCategories] = useState<{ value: string; label: string }[]>([]);

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories];
  
  const filteredCategories = allCategories.filter(cat =>
    cat.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCategory = allCategories.find(cat => cat.value === value);

  const handleAddCategory = () => {
    if (newCategory.trim()) {
      const newValue = newCategory.toLowerCase().replace(/\s+/g, '_');
      const newCat = { value: newValue, label: newCategory.trim() };
      setCustomCategories(prev => [...prev, newCat]);
      onChange(newValue);
      setNewCategory('');
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-56 justify-between", className)}
        >
          <span className="truncate">{selectedCategory?.label || 'Wybierz kategorię'}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj kategorii..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        
        <div className="max-h-64 overflow-y-auto p-1">
          {filteredCategories.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Brak kategorii
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => {
                  onChange(cat.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors text-left",
                  value === cat.value && "bg-accent"
                )}
              >
                <Check className={cn("h-4 w-4", value === cat.value ? "opacity-100" : "opacity-0")} />
                {cat.label}
              </button>
            ))
          )}
        </div>
        
        <div className="p-2 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Nowa kategoria..."
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleAddCategory}
              disabled={!newCategory.trim()}
              className="h-8 px-3"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
