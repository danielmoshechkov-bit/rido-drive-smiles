// GetRido Maps - Location Detail Card (Google Maps Style)
import { useState } from 'react';
import { 
  Share2, 
  Star, 
  Heart, 
  X, 
  MapPin, 
  Clock,
  Route,
  Navigation,
  Car,
  Footprints,
  Bike
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AddressSuggestion } from './autocompleteService';

type TripMode = 'driving' | 'walking' | 'cycling';

interface LocationDetailCardProps {
  location: AddressSuggestion;
  distance?: number; // km from current position
  onClose: () => void;
  onNavigate: () => void;
  onStartNavigation: () => void;
  onSave?: () => void;
  onShare?: () => void;
  isRouteCalculated?: boolean;
  routeDuration?: number; // minutes
  routeDistance?: number; // km
  startAddress?: string;
  onStartAddressChange?: (value: string) => void;
}

const TRIP_MODES: { id: TripMode; icon: typeof Car; label: string }[] = [
  { id: 'driving', icon: Car, label: 'Samochodem' },
  { id: 'walking', icon: Footprints, label: 'Pieszo' },
  { id: 'cycling', icon: Bike, label: 'Rowerem' },
];

const LocationDetailCard = ({
  location,
  distance,
  onClose,
  onNavigate,
  onStartNavigation,
  onSave,
  onShare,
  isRouteCalculated = false,
  routeDuration,
  routeDistance,
  startAddress = '',
  onStartAddressChange,
}: LocationDetailCardProps) => {
  const [isSaved, setIsSaved] = useState(false);
  const [tripMode, setTripMode] = useState<TripMode>('driving');

  const handleSave = () => {
    setIsSaved(!isSaved);
    onSave?.();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: location.shortName,
          text: location.displayName,
          url: `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`,
        });
      } catch (e) {
        console.log('[LocationCard] Share cancelled');
      }
    }
    onShare?.();
  };

  return (
    <div className="bg-card border border-muted-foreground/10 rounded-2xl shadow-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">{location.shortName}</h3>
            <p className="text-sm text-muted-foreground truncate mt-0.5">{location.displayName}</p>
            
            {/* Distance badge */}
            {distance !== undefined && (
              <Badge variant="secondary" className="mt-2 font-normal">
                <MapPin className="h-3 w-3 mr-1" />
                {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} stąd
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 -mt-1 -mr-2 text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Trip Mode Selector - Clean horizontal buttons */}
      <div className="px-4 pb-3">
        <div className="flex gap-2">
          {TRIP_MODES.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTripMode(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl transition-all ${
                tripMode === id 
                  ? 'bg-primary text-primary-foreground shadow-sm' 
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Start location input - always visible */}
      <div className="mx-4 mb-3">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 rounded-xl border border-muted-foreground/10">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
          <Input 
            type="text"
            placeholder="Twoja lokalizacja"
            value={startAddress}
            onChange={(e) => onStartAddressChange?.(e.target.value)}
            className="flex-1 bg-transparent border-0 h-auto p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Route info (when calculated) */}
      {isRouteCalculated && routeDuration !== undefined && routeDistance !== undefined && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-muted/30 border border-muted-foreground/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Route className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-xl">{Math.round(routeDuration)} min</p>
                <p className="text-sm text-muted-foreground">{routeDistance.toFixed(1)} km</p>
              </div>
            </div>
            <Badge variant="secondary" className="font-normal">
              <Clock className="h-3 w-3 mr-1" />
              ETA {new Date(Date.now() + routeDuration * 60000).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </Badge>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 pt-2 space-y-3">
        {/* Primary action - RUSZAJ */}
        <Button 
          className="w-full h-14 rounded-xl gap-3 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
          onClick={isRouteCalculated ? onStartNavigation : onNavigate}
        >
          <Navigation className="h-5 w-5" />
          {isRouteCalculated ? 'Ruszaj' : 'Wyznacz trasę'}
        </Button>

        {/* Secondary actions */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className={`flex-1 h-11 rounded-xl gap-2 border-muted-foreground/20 ${isSaved ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30' : ''}`}
            onClick={handleSave}
          >
            {isSaved ? (
              <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
            ) : (
              <Heart className="h-4 w-4" />
            )}
            {isSaved ? 'Zapisano' : 'Zapisz'}
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 h-11 rounded-xl gap-2 border-muted-foreground/20"
            onClick={handleShare}
          >
            <Share2 className="h-4 w-4" />
            Udostępnij
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LocationDetailCard;
