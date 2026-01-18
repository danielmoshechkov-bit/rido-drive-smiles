// GetRido Maps - Live Search Overlay with Instant Preview Markers
import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, MapPin, Clock, Star, Navigation, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchAddressSuggestions, AddressSuggestion } from './autocompleteService';
import { addressHistoryService, HistoryEntry } from './addressHistoryService';

interface LiveSearchOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onSelectLocation: (location: AddressSuggestion) => void;
  onPreviewLocations?: (locations: AddressSuggestion[]) => void;
  inputPlaceholder?: string;
}

const LiveSearchOverlay = ({
  isVisible,
  onClose,
  onSelectLocation,
  onPreviewLocations,
  inputPlaceholder = "Gdzie chcesz jechać?",
}: LiveSearchOverlayProps) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Load history on mount
  useEffect(() => {
    if (isVisible) {
      setHistory(addressHistoryService.getEndHistory(5));
      inputRef.current?.focus();
    }
  }, [isVisible]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setSuggestions([]);
      onPreviewLocations?.([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await fetchAddressSuggestions(query);
        setSuggestions(results);
        // Send first 3 results for preview markers
        onPreviewLocations?.(results.slice(0, 3));
      } catch (error) {
        console.error('[LiveSearch] Error:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 150); // Fast debounce

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, onPreviewLocations]);

  const handleSelect = useCallback((item: AddressSuggestion) => {
    onSelectLocation(item);
    setQuery('');
    setSuggestions([]);
    onClose();
  }, [onSelectLocation, onClose]);

  const handleHistorySelect = useCallback((item: HistoryEntry) => {
    const suggestion: AddressSuggestion = {
      placeId: `history_${item.lat}_${item.lng}`,
      displayName: item.displayName,
      shortName: item.shortName,
      type: item.type === 'my_location' ? 'address' : 'address',
      lat: item.lat,
      lng: item.lng,
    };
    handleSelect(suggestion);
  }, [handleSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = query ? suggestions : history.map(h => ({
      displayName: h.displayName,
      shortName: h.shortName,
      lat: h.lat,
      lng: h.lng,
    }));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && items[selectedIndex]) {
      e.preventDefault();
      handleSelect(items[selectedIndex] as AddressSuggestion);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [query, suggestions, history, selectedIndex, handleSelect, onClose]);

  if (!isVisible) return null;

  const showHistory = !query.trim() && history.length > 0;
  const showSuggestions = query.trim() && suggestions.length > 0;
  const showEmpty = query.trim() && !isLoading && suggestions.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Header with search */}
      <div className="sticky top-0 bg-background border-b safe-area-top">
        <div className="flex items-center gap-2 p-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
          
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder}
              className="pl-10 pr-10 h-12 text-base rounded-full border-primary/30 
                         focus:border-primary bg-muted/50"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="h-[calc(100vh-80px)] safe-area-bottom">
        <div className="p-3 space-y-1">
          {/* History */}
          {showHistory && (
            <>
              <p className="text-xs text-muted-foreground px-2 py-1 font-medium">
                <Clock className="inline h-3 w-3 mr-1" />
                Ostatnio wyszukiwane
              </p>
              {history.map((item, idx) => (
                <button
                  key={item.displayName + idx}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl transition-colors text-left
                             ${selectedIndex === idx ? 'bg-primary/10' : 'hover:bg-muted/70 active:bg-muted'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleHistorySelect(item)}
                >
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.shortName}</p>
                    <p className="text-sm text-muted-foreground truncate">{item.displayName}</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Search suggestions */}
          {showSuggestions && (
            <>
              {suggestions.map((item, idx) => (
                <button
                  key={item.displayName + idx}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl transition-colors text-left
                             ${selectedIndex === idx ? 'bg-primary/10' : 'hover:bg-muted/70 active:bg-muted'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(item)}
                >
                  <div 
                    className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: idx === 0 
                        ? 'linear-gradient(135deg, hsl(259 65% 58%), hsl(259 65% 48%))'
                        : 'hsl(var(--muted))',
                    }}
                  >
                    <MapPin className={`h-4 w-4 ${idx === 0 ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.shortName}</p>
                    <p className="text-sm text-muted-foreground truncate">{item.displayName}</p>
                  </div>
                  {idx === 0 && (
                    <div className="shrink-0 flex items-center">
                      <Navigation className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Nie znaleziono wyników dla "{query}"</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Sprawdź pisownię lub wpisz inny adres</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LiveSearchOverlay;
