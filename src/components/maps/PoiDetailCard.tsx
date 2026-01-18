/**
 * GetRido Maps - POI Detail Card
 * Shows details of a selected POI
 */
import { 
  MapPin, 
  Phone, 
  Globe, 
  Navigation, 
  Heart, 
  Clock, 
  CreditCard, 
  Fuel, 
  ParkingCircle, 
  Zap,
  ShoppingBag,
  UtensilsCrossed,
  Bed,
  Wrench,
  X,
  Star
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { POI, getCategoryLabel } from './poiService';

interface PoiDetailCardProps {
  poi: POI | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (poi: POI) => void;
  userLocation?: { lat: number; lng: number } | null;
}

const getCategoryIcon = (category: POI['category']) => {
  switch (category) {
    case 'fuel': return <Fuel className="h-5 w-5" />;
    case 'parking': return <ParkingCircle className="h-5 w-5" />;
    case 'ev_charger': return <Zap className="h-5 w-5" />;
    case 'shop': return <ShoppingBag className="h-5 w-5" />;
    case 'restaurant': return <UtensilsCrossed className="h-5 w-5" />;
    case 'hotel': return <Bed className="h-5 w-5" />;
    case 'service': return <Wrench className="h-5 w-5" />;
    default: return <MapPin className="h-5 w-5" />;
  }
};

const getCategoryColor = (category: POI['category']) => {
  switch (category) {
    case 'fuel': return 'bg-orange-500';
    case 'parking': return 'bg-blue-500';
    case 'ev_charger': return 'bg-green-500';
    case 'shop': return 'bg-pink-500';
    case 'restaurant': return 'bg-red-500';
    case 'hotel': return 'bg-purple-500';
    case 'service': return 'bg-slate-500';
    default: return 'bg-gray-500';
  }
};

const PoiDetailCard = ({ poi, open, onOpenChange, onNavigate, userLocation }: PoiDetailCardProps) => {
  if (!poi) return null;

  const handleCall = () => {
    if (poi.phone) {
      window.open(`tel:${poi.phone}`, '_self');
    }
  };

  const handleWebsite = () => {
    if (poi.website) {
      window.open(poi.website, '_blank', 'noopener,noreferrer');
    }
  };

  const handleNavigate = () => {
    if (onNavigate) {
      onNavigate(poi);
      onOpenChange(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-start gap-3">
            {/* Category icon */}
            <div className={`h-12 w-12 rounded-xl ${getCategoryColor(poi.category)} flex items-center justify-center text-white flex-shrink-0`}>
              {getCategoryIcon(poi.category)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <DrawerTitle className="text-lg text-left">{poi.name}</DrawerTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {getCategoryLabel(poi.category)}
                    </Badge>
                    {poi.isPartner && (
                      <Badge className="bg-amber-500 text-white text-xs gap-1">
                        <Star className="h-3 w-3" />
                        Partner
                      </Badge>
                    )}
                  </div>
                </div>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Address */}
          {(poi.address || poi.city) && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                {poi.address && <p className="text-sm font-medium">{poi.address}</p>}
                {poi.city && <p className="text-sm text-muted-foreground">{poi.city}</p>}
              </div>
            </div>
          )}

          {/* Distance */}
          {poi.distance !== undefined && (
            <div className="flex items-center gap-3">
              <Navigation className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-bold">{poi.distance.toFixed(1)}</span>
                <span className="text-muted-foreground"> km od Ciebie</span>
              </span>
            </div>
          )}

          {/* Opening hours */}
          {poi.openingHours && (
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm">{poi.openingHours}</p>
            </div>
          )}

          {/* Description */}
          {poi.description && (
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              {poi.description}
            </p>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button 
              className="gap-2 h-12" 
              onClick={handleNavigate}
            >
              <Navigation className="h-5 w-5" />
              Nawiguj
            </Button>
            
            <Button 
              variant="outline" 
              className="gap-2 h-12"
              disabled
            >
              <Heart className="h-5 w-5" />
              Ulubione
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {poi.phone && (
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={handleCall}
              >
                <Phone className="h-4 w-4" />
                Zadzwoń
              </Button>
            )}
            
            {poi.website && (
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={handleWebsite}
              >
                <Globe className="h-4 w-4" />
                WWW
              </Button>
            )}
          </div>

          {/* Payment button (if supported) */}
          {poi.paymentSupported && (
            <Button 
              variant="secondary" 
              className="w-full gap-2 h-12 mt-2"
              disabled
            >
              <CreditCard className="h-5 w-5" />
              Zapłać
              <Badge variant="outline" className="ml-2 text-xs">
                Wkrótce
              </Badge>
            </Button>
          )}

          {/* Source info */}
          <p className="text-[10px] text-muted-foreground text-center pt-2">
            Źródło: {poi.source === 'partner' ? 'Partner GetRido' : 'OpenStreetMap'}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default PoiDetailCard;
