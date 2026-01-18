// GetRido Maps - Full Search Sheet (Yandex-style expanded search)
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Search, X, Clock, Trash2 } from 'lucide-react';
import CategoryGrid, { POICategory } from './CategoryGrid';
import { AddressSuggestion } from './autocompleteService';
import { addressHistoryService, HistoryEntry } from './addressHistoryService';
import SearchResultsList from './SearchResultsList';
import { useAddressAutocomplete } from './useAddressAutocomplete';
import { GpsState } from './useUserLocation';

interface SearchSheetProps {
  open: boolean;
  onClose: () => void;
  onLocationSelect: (location: AddressSuggestion) => void;
  onCategorySelect: (category: POICategory) => void;
  gps: GpsState;
}

const SearchSheet = ({ 
  open, 
  onClose, 
  onLocationSelect,
  onCategorySelect,
  gps,
}: SearchSheetProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'categories' | 'history'>('categories');
  const [history, setHistory] = useState<HistoryEntry[]>(() => 
    addressHistoryService.getEndHistory()
  );

  // Autocomplete hook
  const autocomplete = useAddressAutocomplete(searchQuery, (suggestion) => {
    onLocationSelect(suggestion);
    setSearchQuery('');
    onClose();
  });

  const handleClearHistory = () => {
    addressHistoryService.clearEndHistory();
    setHistory([]);
  };

  const handleHistorySelect = (entry: HistoryEntry) => {
    onLocationSelect({
      displayName: entry.displayName,
      shortName: entry.shortName || entry.displayName,
      lat: entry.lat,
      lng: entry.lng,
      type: 'address',
      placeId: `history-${entry.lat}-${entry.lng}`,
    });
    onClose();
  };

  const handleCategoryClick = (category: POICategory) => {
    onCategorySelect(category);
    onClose();
  };

  // Calculate distance from GPS to history entries
  const getDistanceToEntry = (entry: HistoryEntry): string | null => {
    if (!gps.location) return null;
    
    const R = 6371; // Earth radius in km
    const dLat = (entry.lat - gps.location.latitude) * Math.PI / 180;
    const dLng = (entry.lng - gps.location.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(gps.location.latitude * Math.PI / 180) * Math.cos(entry.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    }
    return `${distance.toFixed(1)} km`;
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[85vh] rounded-t-3xl p-0 overflow-hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {/* Handle */}
        <div className="flex items-center justify-center py-3 border-b bg-background">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Search Header */}
        <div className="p-4 border-b bg-background">
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Wyszukaj miejsce..."
                className="h-12 pl-10 pr-10 text-base bg-muted/50 border-0 rounded-xl focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted flex items-center justify-center"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Premium AI Button */}
            <button className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-xl shadow-violet-500/25 shrink-0 hover:scale-105 active:scale-95 transition-all duration-200 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <svg viewBox="0 0 24 24" width={20} height={20} className="drop-shadow-sm relative z-10">
                <path d="M12 3L14.5 8.5L20 9L16 13.5L17.5 19L12 16L6.5 19L8 13.5L4 9L9.5 8.5L12 3Z" fill="white"/>
                <path d="M7 2L8 4L10 5L8 6L7 8L6 6L4 5L6 4L7 2Z" fill="white" opacity="0.8"/>
                <path d="M19 14L20 16L22 17L20 18L19 20L18 18L16 17L18 16L19 14Z" fill="white" opacity="0.8"/>
              </svg>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center shrink-0"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {/* Show search results when typing */}
          {searchQuery.length > 0 ? (
            <div className="p-4">
              <SearchResultsList
                results={autocomplete.suggestions}
                isLoading={autocomplete.isLoading}
                onSelect={autocomplete.handleSelect}
                gpsLocation={gps.location}
              />
            </div>
          ) : (
            /* Categories and History tabs */
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'categories' | 'history')} className="flex flex-col h-full">
              <TabsList className="w-full grid grid-cols-2 rounded-none border-b bg-transparent h-12 px-4">
                <TabsTrigger 
                  value="categories"
                  className="gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg border-0 h-10 font-medium"
                >
                  Kategorie
                </TabsTrigger>
                <TabsTrigger 
                  value="history"
                  className="gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg border-0 h-10 font-medium"
                >
                  <Clock className="h-4 w-4" />
                  Historia
                </TabsTrigger>
              </TabsList>

              <TabsContent value="categories" className="p-4 mt-0">
                <CategoryGrid onCategorySelect={handleCategoryClick} />
              </TabsContent>

              <TabsContent value="history" className="p-4 mt-0">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Brak historii wyszukiwań</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {history.map((entry, idx) => (
                      <button
                        key={`${entry.lat}-${entry.lng}-${idx}`}
                        onClick={() => handleHistorySelect(entry)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 active:bg-accent transition-colors text-left"
                      >
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{entry.shortName || entry.displayName}</p>
                          {entry.displayName !== entry.shortName && (
                            <p className="text-xs text-muted-foreground truncate">{entry.displayName}</p>
                          )}
                        </div>
                        {getDistanceToEntry(entry) && (
                          <span className="text-sm text-muted-foreground shrink-0">
                            {getDistanceToEntry(entry)}
                          </span>
                        )}
                      </button>
                    ))}

                    {/* Clear history button */}
                    <button
                      onClick={handleClearHistory}
                      className="w-full flex items-center justify-center gap-2 p-3 mt-4 text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Wyczyść historię</span>
                    </button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SearchSheet;
