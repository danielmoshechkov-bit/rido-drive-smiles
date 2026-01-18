// GetRido Maps - Address Autocomplete Input Component with History
import React, { useRef, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, Building2, Navigation, Loader2, Home, Clock, Locate, ChevronDown, Trash2 } from 'lucide-react';
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
  // Field type for separate history
  fieldType?: 'start' | 'end';
}

export function AddressAutocompleteInput({
  value,
  onChange,
  onLocationSelect,
  placeholder,
  markerColor,
  disabled = false,
  fieldType,
}: AddressAutocompleteInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Determine field type from markerColor if not provided
  const effectiveFieldType = fieldType || (markerColor === 'green' ? 'start' : 'end');
  
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
    
    // Save to appropriate history
    const entry = {
      displayName: suggestion.displayName,
      shortName: suggestion.shortName,
      lat: suggestion.lat,
      lng: suggestion.lng,
      type: 'address' as const,
    };
    
    if (effectiveFieldType === 'start') {
      addressHistoryService.addStartEntry(entry);
    } else {
      addressHistoryService.addEndEntry(entry);
    }
    
    setShowHistory(false);
  });

  // Load history on focus when input is empty
  const handleFocus = () => {
    if (!value.trim()) {
      const hist = effectiveFieldType === 'start' 
        ? addressHistoryService.getStartHistory()
        : addressHistoryService.getEndHistory();
      setHistory(hist);
      setShowHistory(hist.length > 0);
      setHistoryExpanded(false);
    } else {
      autocomplete.openIfHasSuggestions();
      setShowHistory(false);
    }
  };

  const handleBlur = () => {
    // Delay only as fallback - main close happens via onMouseDown
    setTimeout(() => {
      autocomplete.closeSuggestions();
      setShowHistory(false);
    }, 150);
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
    const historyEntry = {
      displayName: entry.displayName,
      shortName: entry.shortName,
      lat: entry.lat,
      lng: entry.lng,
      type: entry.type,
    };
    
    if (effectiveFieldType === 'start') {
      addressHistoryService.addStartEntry(historyEntry);
    } else {
      addressHistoryService.addEndEntry(historyEntry);
    }
  };


  const handleClearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (effectiveFieldType === 'start') {
      addressHistoryService.clearStartHistory();
    } else {
      addressHistoryService.clearEndHistory();
    }
    setHistory([]);
    setShowHistory(false);
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
      {/* Marker indicator */}
      <div
        className={`absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full ${markerBgColor} z-10`}
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
        className="pl-9 h-12 text-base bg-background/50 border-border/50 focus:border-primary"
      />

      {/* Loading indicator */}
      {autocomplete.isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* History dropdown (shown when input is empty and focused) */}
      {showHistory && !autocomplete.isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-xl max-h-80 overflow-y-auto">
          <div className="p-2.5 border-b border-border/50 bg-muted/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Ostatnie miejsca
            </span>
          </div>
          
          {displayedHistory.map((entry, idx) => (
            <div
              key={`${entry.lat}-${entry.lng}-${idx}`}
              className="p-3 cursor-pointer transition-colors hover:bg-accent/50 border-b border-border/30 last:border-b-0"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur before click
                handleHistorySelect(entry);
              }}
            >
              <div className="flex items-center gap-2">
                {entry.type === 'my_location' ? (
                  <Locate className="h-4 w-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-sm font-medium truncate">{entry.shortName || entry.displayName}</span>
              </div>
              {entry.displayName !== entry.shortName && entry.type !== 'my_location' && (
                <p className="text-xs text-muted-foreground truncate mt-0.5 ml-6">
                  {entry.displayName}
                </p>
              )}
            </div>
          ))}
          
          {/* Show more button */}
          {history.length > 5 && !historyExpanded && (
            <button
              type="button"
              className="w-full p-2.5 text-xs text-primary hover:bg-accent/50 border-t border-border/50 flex items-center justify-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                setHistoryExpanded(true);
              }}
            >
              <ChevronDown className="h-3 w-3" />
              Pokaż więcej ({history.length - 5})
            </button>
          )}
          
          {/* Clear history button */}
          {history.length > 0 && (
            <button
              type="button"
              className="w-full p-2.5 text-xs text-destructive hover:bg-destructive/10 border-t border-border/50 flex items-center justify-center gap-1.5"
              onClick={handleClearHistory}
            >
              <Trash2 className="h-3 w-3" />
              Wyczyść historię
            </button>
          )}
        </div>
      )}

      {/* Dropdown z sugestiami autocomplete */}
      {autocomplete.isOpen && !showHistory && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
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
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur before selection
                  autocomplete.handleSelect(suggestion);
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
