// GetRido Maps - Search Results List (Yandex-style with distances)
import { Building2, Navigation, MapPin, Home, Loader2, Plus, Clock } from 'lucide-react';
import { AddressSuggestion } from './autocompleteService';

interface SearchResultsListProps {
  results: AddressSuggestion[];
  isLoading: boolean;
  onSelect: (result: AddressSuggestion) => void;
  gpsLocation?: { latitude: number; longitude: number } | null;
  showAddObject?: boolean;
}

const SearchResultsList = ({ 
  results, 
  isLoading, 
  onSelect,
  gpsLocation,
  showAddObject = true,
}: SearchResultsListProps) => {
  // Calculate distance from GPS
  const getDistance = (lat: number, lng: number): string | null => {
    if (!gpsLocation) return null;
    
    const R = 6371; // Earth radius in km
    const dLat = (lat - gpsLocation.latitude) * Math.PI / 180;
    const dLng = (lng - gpsLocation.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(gpsLocation.latitude * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    }
    return `${distance.toFixed(1)} km`;
  };

  const getTypeIcon = (type: AddressSuggestion['type']) => {
    const iconClass = "h-5 w-5";
    switch (type) {
      case 'city':
        return <Building2 className={iconClass} />;
      case 'street':
        return <Navigation className={iconClass} />;
      case 'poi':
        return <MapPin className={iconClass} />;
      default:
        return <Home className={iconClass} />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Szukam...</span>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nie znaleziono wyników</p>
        <p className="text-xs mt-1">Spróbuj zmienić zapytanie</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {results.map((result, idx) => {
        const distance = getDistance(result.lat, result.lng);
        
        return (
          <button
            key={result.placeId || `${result.lat}-${result.lng}-${idx}`}
            onClick={() => onSelect(result)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 active:bg-accent transition-colors text-left group"
          >
            {/* Icon */}
            <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
              <span className="text-muted-foreground group-hover:text-primary transition-colors">
                {getTypeIcon(result.type)}
              </span>
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate text-foreground">
                {result.shortName}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {result.displayName}
              </p>
            </div>
            
            {/* Distance */}
            {distance && (
              <span className="text-sm font-medium text-muted-foreground shrink-0">
                {distance}
              </span>
            )}
          </button>
        );
      })}

      {/* Add object option */}
      {showAddObject && (
        <button className="w-full flex items-center gap-3 p-3 mt-2 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors text-left">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-primary">Dodaj miejsce lub adres</p>
            <p className="text-xs text-muted-foreground">Zgłoś brakujący obiekt</p>
          </div>
        </button>
      )}
    </div>
  );
};

export default SearchResultsList;
