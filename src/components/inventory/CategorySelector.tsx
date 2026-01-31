import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInventoryCategories } from '@/hooks/useInventoryCategories';

interface Props {
  value: string;
  onChange: (value: string) => void;
  entityId?: string;
  label?: string;
  placeholder?: string;
}

export function CategorySelector({ 
  value, 
  onChange, 
  entityId, 
  label = "Kategoria",
  placeholder = "Wybierz lub dodaj kategorię"
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const { categories, loading, createCategory } = useInventoryCategories(entityId);

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (categoryName: string) => {
    onChange(categoryName);
    setOpen(false);
    setSearch('');
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    
    const result = await createCategory(newCategoryName.trim());
    if (result) {
      onChange(result.name);
      setNewCategoryName('');
      setIsAdding(false);
      setOpen(false);
    }
  };

  const handleAddFromSearch = async () => {
    if (!search.trim()) return;
    
    const result = await createCategory(search.trim());
    if (result) {
      onChange(result.name);
      setSearch('');
      setOpen(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {value || placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Szukaj kategorii..." 
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Ładowanie...
                </div>
              ) : (
                <>
                  {filteredCategories.length === 0 && search && (
                    <CommandEmpty className="py-2">
                      <Button
                        variant="ghost"
                        className="w-full justify-start px-4"
                        onClick={handleAddFromSearch}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Dodaj "{search}"
                      </Button>
                    </CommandEmpty>
                  )}
                  {filteredCategories.length === 0 && !search && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Brak kategorii. Dodaj pierwszą poniżej.
                    </div>
                  )}
                  <CommandGroup>
                    {filteredCategories.map((category) => (
                      <CommandItem
                        key={category.id}
                        value={category.name}
                        onSelect={() => handleSelect(category.name)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === category.name ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {category.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            
            {/* Add new category section */}
            <div className="border-t p-2">
              {isAdding ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Nazwa kategorii"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCategory();
                      if (e.key === 'Escape') setIsAdding(false);
                    }}
                    autoFocus
                    className="h-8"
                  />
                  <Button size="sm" onClick={handleAddCategory} className="h-8">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)} className="h-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => setIsAdding(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Dodaj nową kategorię
                </Button>
              )}
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      
      {/* Clear button if value is set */}
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => onChange('')}
        >
          <X className="h-3 w-3 mr-1" />
          Wyczyść
        </Button>
      )}
    </div>
  );
}
