// GetRido Maps - Location Detail Sheet (Yandex-style bottom card)
import { X, Navigation, Share2, Bookmark, Clock, MapPin, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AddressSuggestion } from './autocompleteService';
import { GpsState } from './useUserLocation';

interface LocationDetailSheetProps {
  location: AddressSuggestion;
  onClose: () => void;
  onNavigate: () => void;
  gps: GpsState;
  travelTime?: number; // minutes
  travelDistance?: number; // km
}

const LocationDetailSheet = ({ 
  location, 
  onClose, 
  onNavigate,
  gps,
  travelTime,
  travelDistance,
}: LocationDetailSheetProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCoords = async () => {
    const coords = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
    await navigator.clipboard.writeText(coords);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: location.shortName,
          text: location.displayName,
          url: `https://maps.google.com/?q=${location.lat},${location.lng}`,
        });
      } catch (err) {
        // User cancelled or error
      }
    }
  };

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-50 animate-slide-up"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-3 mb-3 rounded-2xl bg-card/98 backdrop-blur-xl border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg truncate">{location.shortName}</h3>
              <p className="text-sm text-muted-foreground truncate">{location.displayName}</p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 hover:bg-muted/80 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Coordinates */}
          <button
            onClick={handleCopyCoords}
            className="mt-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span className="font-mono">
              {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </span>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Travel info */}
          {(travelTime || travelDistance) && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-semibold">{travelTime} min</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{travelDistance?.toFixed(1)} km</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 flex items-center gap-3">
          {/* Navigate button - Primary CTA */}
          <Button
            onClick={onNavigate}
            className="flex-1 h-12 gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg"
          >
            <Navigation className="h-5 w-5" />
            Trasa
          </Button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <Share2 className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Bookmark */}
          <button className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <Bookmark className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationDetailSheet;
