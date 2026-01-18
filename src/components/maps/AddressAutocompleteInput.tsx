// GetRido Maps - Address Autocomplete Input Component
import React, { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, Building2, Navigation, Loader2, Home } from 'lucide-react';
import { useAddressAutocomplete } from './useAddressAutocomplete';
import { AddressSuggestion } from './autocompleteService';

interface AddressAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect: (location: { lat: number; lng: number; displayName: string }) => void;
  placeholder: string;
  markerColor: 'green' | 'red';
  disabled?: boolean;
}

export function AddressAutocompleteInput({
  value,
  onChange,
  onLocationSelect,
  placeholder,
  markerColor,
  disabled = false,
}: AddressAutocompleteInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const autocomplete = useAddressAutocomplete(value, (suggestion: AddressSuggestion) => {
    onChange(suggestion.shortName);
    onLocationSelect({
      lat: suggestion.lat,
      lng: suggestion.lng,
      displayName: suggestion.displayName,
    });
  });

  const handleBlur = () => {
    // Delay aby kliknięcie na sugestię zadziałało
    setTimeout(() => {
      autocomplete.closeSuggestions();
    }, 200);
  };

  const getTypeIcon = (type: AddressSuggestion['type']) => {
    switch (type) {
      case 'city':
        return <Building2 className="h-3.5 w-3.5" />;
      case 'street':
        return <Navigation className="h-3.5 w-3.5" />;
      case 'poi':
        return <MapPin className="h-3.5 w-3.5" />;
      default:
        return <Home className="h-3.5 w-3.5" />;
    }
  };

  const getTypeLabel = (type: AddressSuggestion['type']) => {
    switch (type) {
      case 'city':
        return 'Miasto';
      case 'street':
        return 'Ulica';
      case 'poi':
        return 'POI';
      default:
        return 'Adres';
    }
  };

  const markerBgColor = markerColor === 'green' ? 'bg-green-500' : 'bg-red-500';

  return (
    <div ref={containerRef} className="relative">
      {/* Marker indicator */}
      <div
        className={`absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full ${markerBgColor} z-10`}
      />

      {/* Input */}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={autocomplete.handleKeyDown}
        onFocus={autocomplete.openIfHasSuggestions}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-9 bg-background/50 border-border/50 focus:border-primary"
      />

      {/* Loading indicator */}
      {autocomplete.isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Dropdown z sugestiami */}
      {autocomplete.isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {autocomplete.suggestions.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              Nie znaleziono dokładnego adresu
            </div>
          ) : (
            autocomplete.suggestions.map((suggestion, idx) => (
              <div
                key={suggestion.placeId}
                className={`p-3 cursor-pointer transition-colors border-b border-border/50 last:border-b-0 ${
                  idx === autocomplete.highlightedIndex
                    ? 'bg-accent'
                    : 'hover:bg-accent/50'
                }`}
                onClick={() => autocomplete.handleSelect(suggestion)}
                onMouseEnter={() => {
                  // Opcjonalnie: podświetl przy hover
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="text-muted-foreground mt-0.5">
                    {getTypeIcon(suggestion.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {suggestion.shortName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {suggestion.displayName}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                  >
                    {getTypeLabel(suggestion.type)}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
