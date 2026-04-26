import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placement: 'above' | 'below' }>({
    top: 0, left: 0, width: 0, placement: 'below',
  });
  const lockedRef = useRef(false);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: suggestions = [] } = useServiceAutocomplete(providerId, query);

  useEffect(() => {
    setQuery(value);
    if (lockedRef.current) {
      setOpen(false);
      return;
    }
    setOpen(value.length >= 2);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputWrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Recompute position when open
  const updatePosition = () => {
    if (!inputWrapRef.current) return;
    const rect = inputWrapRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(suggestions.length * 44 + 8, 240);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement: 'above' | 'below' =
      spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'above' : 'below';
    setCoords({
      top: placement === 'below' ? rect.bottom + 4 : rect.top - 4 - dropdownHeight,
      left: rect.left,
      width: rect.width,
      placement,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestions.length]);

  const handleSelect = (s: any) => {
    lockedRef.current = true;
    setOpen(false);
    onSelectSuggestion(
      s.service_name,
      s.last_price_net || s.price_net || 0,
      s.last_price_gross || s.price_gross || 0,
    );
  };

  const handleChange = (newValue: string) => {
    lockedRef.current = false;
    onChange(newValue);
  };

  const fmt = (v: number) =>
    v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div className="relative" ref={inputWrapRef}>
      <Input
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
            lockedRef.current = true;
            setOpen(false);
          }
          onKeyDown?.(e);
        }}
        onFocus={() => !lockedRef.current && value.length >= 2 && setOpen(true)}
      />
      {open && suggestions.length > 0 && createPortal(
        <div
          ref={dropdownRef}
          data-autocomplete-dropdown="true"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: coords.width,
            zIndex: 9999,
          }}
          className="bg-popover border border-border rounded-md shadow-lg overflow-hidden"
        >
          {suggestions.map((s: any, i: number) => {
            const price = s.last_price_gross || s.price_gross || 0;
            return (
              <button
                key={i}
                type="button"
                data-autocomplete-suggestion="true"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                onMouseDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(s);
                }}
              >
                <span className="font-medium truncate">
                  {s.service_name || s.service_name_normalized}
                </span>
                {price > 0 && (
                  <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                    ostatnia cena: {fmt(price)} zł
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
