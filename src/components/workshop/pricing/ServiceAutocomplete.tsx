import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { useServiceAutocomplete } from '@/hooks/useServicePriceHistory';

interface Props {
  value: string;
  onChange: (name: string) => void;
  onSelectSuggestion: (name: string, priceNet: number, priceGross: number) => void;
  providerId: string;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function ServiceAutocomplete({
  value,
  onChange,
  onSelectSuggestion,
  providerId,
  placeholder = 'Wpisz nazwę usługi...',
  className = '',
  onKeyDown,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const { data: suggestions = [] } = useServiceAutocomplete(providerId, query);

  useEffect(() => {
    setQuery(value);
    setOpen(value.length >= 2);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (s: any) => {
    onSelectSuggestion(
      s.service_name,
      s.last_price_net || s.price_net || 0,
      s.last_price_gross || s.price_gross || 0,
    );
    setOpen(false);
  };

  const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div className="relative" ref={ref}>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        onKeyDown={onKeyDown}
        onFocus={() => value.length >= 2 && setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          {suggestions.map((s: any, i: number) => {
            const price = s.last_price_gross || s.price_gross || 0;
            return (
              <button
                key={i}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                onMouseDown={e => { e.preventDefault(); handleSelect(s); }}
              >
                <span className="font-medium truncate">{s.service_name || s.service_name_normalized}</span>
                {price > 0 && (
                  <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                    ostatnia cena: {fmt(price)} zł
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
