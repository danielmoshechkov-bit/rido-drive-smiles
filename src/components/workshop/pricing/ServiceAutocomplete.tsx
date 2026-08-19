import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { MinusCircle } from 'lucide-react';
import { useServiceAutocomplete, useForgetServicePrice } from '@/hooks/useServicePriceHistory';

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
  placeholder,
  className = '',
  onKeyDown,
}: Props) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('workshop.pricing.autocomplete.placeholder');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placement: 'above' | 'below' }>({
    top: 0, left: 0, width: 0, placement: 'below',
  });
  const lockedRef = useRef(false);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: suggestions = [] } = useServiceAutocomplete(providerId, query);
  const zapomnij = useForgetServicePrice(providerId);

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
        placeholder={resolvedPlaceholder}
        className={className}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
            lockedRef.current = true;
            setOpen(false);
          }
          onKeyDown?.(e);
        }}
        onFocus={(e) => {
          // Klikniecie zaznacza cala nazwe — poprawiasz wpisujac od nowa,
          // bez kasowania. Lista podpowiedzi otwiera sie jak dotad.
          e.currentTarget.select();
          if (!lockedRef.current && value.length >= 2) setOpen(true);
        }}
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
            const nazwa = s.service_name || s.service_name_normalized;
            return (
              <div key={i} className="flex items-center hover:bg-accent transition-colors">
                <button
                  type="button"
                  data-autocomplete-suggestion="true"
                  className="flex-1 min-w-0 text-left px-3 py-2 text-sm flex items-center justify-between"
                  onMouseDown={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(s);
                  }}
                >
                  <span className="font-medium truncate">{nazwa}</span>
                  {price > 0 && (
                    <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                      {t('workshop.pricing.autocomplete.lastPrice', { price: fmt(price) })}
                    </span>
                  )}
                </button>

                {/*
                  ZAPOMNIJ TĘ POZYCJĘ.

                  Literówka albo cena wbita przez pomyłkę zostawała w podpowiedziach
                  na zawsze i podstawiała się przy każdym kolejnym kosztorysie —
                  nie było jak ją stamtąd wyjąć.

                  Minus pojawia się TYLKO przy własnej pamięci warsztatu. Podpowiedzi
                  ze wspólnej bazy cen są zbiorcze i anonimowe; pojedynczy warsztat
                  nie kasuje z nich cudzych wpisów.
                */}
                {s.wlasna && (
                  <button
                    type="button"
                    title={t('workshop.pricing.autocomplete.forget', 'Usuń z pamięci podpowiedzi')}
                    aria-label={t('workshop.pricing.autocomplete.forget', 'Usuń z pamięci podpowiedzi')}
                    className="shrink-0 px-2 py-2 text-destructive hover:text-destructive/80"
                    onMouseDown={e => {
                      // `preventDefault` trzyma kursor w polu, `stopPropagation`
                      // pilnuje, żeby kliknięcie w minus nie wybrało tej pozycji.
                      e.preventDefault();
                      e.stopPropagation();
                      zapomnij.mutate(nazwa);
                    }}
                  >
                    <MinusCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
