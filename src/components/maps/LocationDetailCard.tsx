// GetRido Maps - Location Detail Card (Google Maps Style)
import { useState } from 'react';
import { 
  Navigation, 
  Share2, 
  Star, 
  Heart, 
  X, 
  MapPin, 
  Clock,
  Route,
  Play,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AddressSuggestion } from './autocompleteService';

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
}

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
}: LocationDetailCardProps) => {
  const [isSaved, setIsSaved] = useState(false);

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
    <div className="bg-card border rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">{location.shortName}</h3>
            <p className="text-sm text-muted-foreground truncate mt-0.5">{location.displayName}</p>
            
            {/* Distance badge */}
            {distance !== undefined && (
              <Badge variant="secondary" className="mt-2">
                <MapPin className="h-3 w-3 mr-1" />
                {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} stąd
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 -mt-1 -mr-2" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Route info (when calculated) */}
      {isRouteCalculated && routeDuration !== undefined && routeDistance !== undefined && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
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
            <Badge className="rido-badge-nav">
              <Clock className="h-3 w-3 mr-1" />
              ETA {new Date(Date.now() + routeDuration * 60000).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </Badge>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 pt-2 space-y-3">
        {/* Primary actions */}
        <div className="flex gap-2">
          {!isRouteCalculated ? (
            <Button 
              className="flex-1 h-12 rounded-full gap-2 text-base font-medium"
              onClick={onNavigate}
            >
              <Route className="h-5 w-5" />
              Wyznacz trasę
            </Button>
          ) : (
            <Button 
              className="flex-1 h-12 rounded-full gap-2 text-base font-medium bg-gradient-to-r from-primary to-primary/80"
              onClick={onStartNavigation}
            >
              <Play className="h-5 w-5" />
              Start
            </Button>
          )}
        </div>

        {/* Secondary actions */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className={`flex-1 h-11 rounded-full gap-2 ${isSaved ? 'bg-amber-50 border-amber-300 text-amber-700' : ''}`}
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
            className="flex-1 h-11 rounded-full gap-2"
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
