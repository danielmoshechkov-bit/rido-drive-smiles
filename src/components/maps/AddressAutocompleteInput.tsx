// GetRido Maps - Address Autocomplete Input Component with History
import React, { useRef, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, Building2, Navigation, Loader2, Home, Clock, Locate, ChevronDown } from 'lucide-react';
import { useAddressAutocomplete } from './useAddressAutocomplete';
import { AddressSuggestion } from './autocompleteService';
import { addressHistoryService, HistoryEntry } from './addressHistoryService';

interface AddressAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect: (location: { lat: number; lng: number; displayName: string }) => void;
  placeholder: string;
  markerColor: 'green' | 'red';
  disabled?: boolean;
  // GPS support (only for start field)
  gpsLocation?: { latitude: number; longitude: number } | null;
  onUseMyLocation?: () => void;
}

export function AddressAutocompleteInput({
  value,
  onChange,
  onLocationSelect,
  placeholder,
  markerColor,
  disabled = false,
  gpsLocation,
  onUseMyLocation,
}: AddressAutocompleteInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const autocomplete = useAddressAutocomplete(value, (suggestion: AddressSuggestion) => {
    onChange(suggestion.shortName);
    onLocationSelect({
      lat: suggestion.lat,
      lng: suggestion.lng,
      displayName: suggestion.displayName,
    });
    
    // Save to history
    addressHistoryService.addEntry({
      displayName: suggestion.displayName,
      shortName: suggestion.shortName,
      lat: suggestion.lat,
      lng: suggestion.lng,
      type: 'address',
    });
    
    setShowHistory(false);
  });

  // Load history on focus when input is empty
  const handleFocus = () => {
    if (!value.trim()) {
      const hist = addressHistoryService.getHistory();
      // Filter "my_location" for destination field (markerColor === 'red')
      const filtered = markerColor === 'red' 
        ? hist.filter(h => h.type !== 'my_location')
        : hist;
      setHistory(filtered);
      setShowHistory(filtered.length > 0);
      setHistoryExpanded(false);
    } else {
      autocomplete.openIfHasSuggestions();
      setShowHistory(false);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion/history
    setTimeout(() => {
      autocomplete.closeSuggestions();
      setShowHistory(false);
    }, 200);
  };

  const handleHistorySelect = (entry: HistoryEntry) => {
    onChange(entry.shortName || entry.displayName);
    onLocationSelect({
      lat: entry.lat,
      lng: entry.lng,
      displayName: entry.displayName,
    });
    setShowHistory(false);
    
    // Move to top of history
    addressHistoryService.addEntry({
      displayName: entry.displayName,
      shortName: entry.shortName,
      lat: entry.lat,
      lng: entry.lng,
      type: entry.type,
    });
  };

  const handleUseMyLocation = () => {
    if (onUseMyLocation && gpsLocation) {
      onUseMyLocation();
      setShowHistory(false);
      
      // Save to history
      addressHistoryService.addEntry({
        displayName: 'Twoja lokalizacja',
        shortName: 'Twoja lokalizacja',
        lat: gpsLocation.latitude,
        lng: gpsLocation.longitude,
        type: 'my_location',
      });
    }
  };

  // Close history when user starts typing
  useEffect(() => {
    if (value.trim().length > 0) {
      setShowHistory(false);
    }
  }, [value]);

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
  const displayedHistory = historyExpanded ? history.slice(0, 15) : history.slice(0, 5);

  return (
    <div ref={containerRef} className="relative">
      {/* GPS button for start field */}
      {markerColor === 'green' && gpsLocation && onUseMyLocation && (
        <button
          type="button"
          onClick={handleUseMyLocation}
          className="flex items-center gap-1.5 px-2 py-1 text-xs bg-blue-500/10 
                     text-blue-600 rounded-full border border-blue-500/20 
                     hover:bg-blue-500/20 transition-colors mb-2"
        >
          <Locate className="h-3 w-3" />
          Twoja lokalizacja
        </button>
      )}
      
      {/* Marker indicator */}
      <div
        className={`absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full ${markerBgColor} z-10`}
        style={{ top: markerColor === 'green' && gpsLocation && onUseMyLocation ? 'calc(50% + 14px)' : '50%' }}
      />

      {/* Input */}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={autocomplete.handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-9 bg-background/50 border-border/50 focus:border-primary"
      />

      {/* Loading indicator */}
      {autocomplete.isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2"
             style={{ top: markerColor === 'green' && gpsLocation && onUseMyLocation ? 'calc(50% + 14px)' : '50%' }}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* History dropdown (shown when input is empty and focused) */}
      {showHistory && !autocomplete.isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
          <div className="p-2 border-b border-border/50 bg-muted/30">
            <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Ostatnie miejsca
            </span>
          </div>
          
          {displayedHistory.map((entry, idx) => (
            <div
              key={`${entry.lat}-${entry.lng}-${idx}`}
              className="p-3 cursor-pointer transition-colors hover:bg-accent/50 border-b border-border/30 last:border-b-0"
              onClick={() => handleHistorySelect(entry)}
            >
              <div className="flex items-center gap-2">
                {entry.type === 'my_location' ? (
                  <Locate className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-sm truncate">{entry.shortName || entry.displayName}</span>
              </div>
              {entry.displayName !== entry.shortName && entry.type !== 'my_location' && (
                <p className="text-xs text-muted-foreground truncate mt-0.5 ml-5">
                  {entry.displayName}
                </p>
              )}
            </div>
          ))}
          
          {/* Show more button */}
          {history.length > 5 && !historyExpanded && (
            <button
              type="button"
              className="w-full p-2 text-xs text-primary hover:bg-accent/50 border-t border-border/50 flex items-center justify-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                setHistoryExpanded(true);
              }}
            >
              <ChevronDown className="h-3 w-3" />
              Pokaż więcej ({history.length - 5})
            </button>
          )}
        </div>
      )}

      {/* Dropdown z sugestiami autocomplete */}
      {autocomplete.isOpen && !showHistory && (
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
