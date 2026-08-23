import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';

/**
 * Pole z wyszukiwarka: lista klientow albo pojazdow potrafi miec setki pozycji
 * i przewijanie ich mija sie z celem.
 *
 * Wlasny plik, a nie wnetrze panelu przechowalni — okno szczegolow tez go
 * uzywa, a wzajemny import dwoch plikow potrafi dac `undefined` w przegladarce
 * mimo poprawnej kompilacji.
 */
export function SearchableCombobox({ items, value, onSelect, onCreateNew, onAddNew, placeholder, renderItem, getLabel }: {
  items: any[];
  value: string;
  onSelect: (val: string) => void;
  onCreateNew?: (query: string) => void;
  onAddNew?: (query: string) => void;
  placeholder: string;
  renderItem: (item: any) => React.ReactNode;
  getLabel: (item: any) => string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item => getLabel(item).toLowerCase().includes(q));
  }, [items, query, getLabel]);

  const selectedLabel = items.find(i => i.id === value) ? getLabel(items.find(i => i.id === value)!) : '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim() && filtered.length === 0 && onCreateNew) {
      e.preventDefault();
      onCreateNew(query.trim());
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal">
            {selectedLabel || <span className="text-muted-foreground">{placeholder}</span>}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          {/* Lista jest juz przefiltrowana wyzej. Bez `shouldFilter={false}`
              komponent filtruje ja po raz drugi po wlasnym `value` i podswietla
              przypadkowe pozycje na zolto. */}
          <Command shouldFilter={false}>
            <div onKeyDown={handleKeyDown}>
              <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
            </div>
            <CommandList className="max-h-[260px] overflow-y-auto">
              <CommandEmpty>
                <div className="space-y-1">
                  {onCreateNew && query.trim() && (
                    <button
                      className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                      onClick={() => { onCreateNew(query.trim()); setOpen(false); setQuery(''); }}
                    >
                      <Plus className="h-4 w-4" /> {t('workshop.tireStorage.addQuery', { query: query.trim() })}
                    </button>
                  )}
                  {!query.trim() && t('workshop.tireStorage.notFound')}
                </div>
              </CommandEmpty>
              <CommandGroup>
                {filtered.map(item => (
                  <CommandItem key={item.id} value={item.id} onSelect={() => { onSelect(item.id); setOpen(false); setQuery(''); }}>
                    <Check className={`mr-2 h-4 w-4 ${value === item.id ? 'opacity-100' : 'opacity-0'}`} />
                    {renderItem(item)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {onAddNew && (
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onAddNew(query.trim())}>
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ---- Dialog ----