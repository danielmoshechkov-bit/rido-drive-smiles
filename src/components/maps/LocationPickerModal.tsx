// GetRido Maps - Location Picker Modal (Google Maps style)
// Shows options: GPS, choose on map, recent history

import { useState } from 'react';
import { X, Navigation, MapPin, Clock, Trash2, ChevronRight, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { addressHistoryService, HistoryEntry } from './addressHistoryService';

interface LocationPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelectCurrentLocation: () => void;
  onSelectFromMap?: () => void;
  onSelectFromHistory: (entry: HistoryEntry) => void;
  onSelectFromSearch: (location: { lat: number; lng: number; displayName: string }) => void;
  fieldType: 'start' | 'end';
  title?: string;
}

export function LocationPickerModal({
  open,
  onClose,
  onSelectCurrentLocation,
  onSelectFromMap,
  onSelectFromHistory,
  onSelectFromSearch,
  fieldType,
  title = 'Wybierz punkt startowy',
}: LocationPickerModalProps) {
  const [searchValue, setSearchValue] = useState('');
  
  const history = fieldType === 'start' 
    ? addressHistoryService.getStartHistory() 
    : addressHistoryService.getEndHistory();

  const handleClearHistory = () => {
    if (fieldType === 'start') {
      addressHistoryService.clearStartHistory();
    } else {
      addressHistoryService.clearEndHistory();
    }
  };

  const handleLocationSelect = (location: { lat: number; lng: number; displayName: string }) => {
    onSelectFromSearch(location);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[85vh] rounded-t-3xl p-0 border-t-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full shrink-0"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
          <span className="font-semibold flex-1">{title}</span>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
            <Mic className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b">
          <AddressAutocompleteInput
            value={searchValue}
            onChange={setSearchValue}
            onLocationSelect={handleLocationSelect}
            placeholder="Wyszukaj adres..."
            markerColor={fieldType === 'start' ? 'green' : 'red'}
            fieldType={fieldType}
            className="h-12"
          />
        </div>

        {/* Quick Options */}
        <div className="divide-y divide-border">
          {/* Your Location */}
          <button
            className="w-full flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors text-left"
            onClick={() => {
              onSelectCurrentLocation();
              onClose();
            }}
          >
            <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Navigation className="h-5 w-5 text-blue-500" />
            </div>
            <span className="font-medium text-blue-600">Twoja lokalizacja</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto" />
          </button>

          {/* Choose on Map */}
          {onSelectFromMap && (
            <button
              className="w-full flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors text-left"
              onClick={() => {
                onSelectFromMap();
                onClose();
              }}
            >
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <MapPin className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="font-medium">Wybierz na mapie</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto" />
            </button>
          )}
        </div>

        {/* Recent Locations */}
        {history.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
              <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Ostatnie
              </span>
              <button 
                className="text-xs text-destructive hover:underline flex items-center gap-1"
                onClick={handleClearHistory}
              >
                <Trash2 className="h-3 w-3" />
                Wyczyść
              </button>
            </div>
            
            <div className="divide-y divide-border/50 max-h-[45vh] overflow-y-auto">
              {history.slice(0, 10).map((entry, idx) => (
                <button
                  key={`${entry.lat}-${entry.lng}-${idx}`}
                  className="w-full flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors text-left"
                  onClick={() => {
                    onSelectFromHistory(entry);
                    onClose();
                  }}
                >
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.shortName || entry.displayName}</p>
                    {entry.displayName !== entry.shortName && (
                      <p className="text-sm text-muted-foreground truncate">{entry.displayName}</p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
