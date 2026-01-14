import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, ChevronRight, Star, MapPin, Calendar, 
  Heart, Phone, Mail, User, Home, Building2, Layers, Maximize, GitCompare, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PropertyListingCardProps {
  listing: {
    id: string;
    title: string;
    price: number;
    priceType?: string; // 'sale' | 'rent_monthly'
    photos: string[];
    location?: string;
    district?: string;
    voivodeship?: string;
    buildYear?: number;
    areaM2?: number;
    rooms?: number;
    floor?: number;
    floorsTotal?: number;
    propertyType?: string;
    rating?: number;
    transactionType?: string;
    transactionColor?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    hasBalcony?: boolean;
    hasElevator?: boolean;
    hasParking?: boolean;
    hasGarden?: boolean;
    marketType?: string;
    description?: string;
    agencyName?: string;
    listingNumber?: string;
  };
  onView?: () => void;
  onFavorite?: () => void;
  onToggleCompare?: () => void;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
  isSelectedForCompare?: boolean;
  compact?: boolean;
}

const PRICE_TYPE_LABELS: Record<string, string> = {
  sale: "",
  rent_monthly: "/ miesiąc",
  rent_daily: "/ dzień",
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  mieszkanie: "Mieszkanie",
  kawalerka: "Kawalerka",
  dom: "Dom",
  dzialka: "Działka",
  lokal: "Lokal użytkowy",
  pokoj: "Pokój",
  inwestycja: "Inwestycja",
};

export function PropertyListingCard({ 
  listing, 
  onView, 
  onFavorite, 
  onToggleCompare,
  isLoggedIn = false,
  isFavorited = false,
  isSelectedForCompare = false,
  compact = false
}: PropertyListingCardProps) {
  const navigate = useNavigate();
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const photos = listing.photos?.length > 0 
    ? listing.photos 
    : ["/placeholder.svg"];

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev - 1 + photos.length) % photos.length);
  };

  // Calculate price per m2
  const pricePerM2 = listing.areaM2 && listing.price 
    ? Math.round(listing.price / listing.areaM2) 
    : null;

  const handleShowContact = async () => {
    if (!isLoggedIn) {
      setShowLoginDialog(true);
      return;
    }

    if (!showContact) {
      // Track contact reveal
      try {
        await supabase.functions.invoke("track-listing-interaction", {
          body: { listingId: listing.id, interactionType: "contact_reveal" }
        });
      } catch (err) {
        console.error("Failed to track contact reveal:", err);
      }
    }
    setShowContact(!showContact);
  };

  return (
    <>
      <Card className={cn(
        "overflow-hidden group hover:shadow-xl transition-all duration-300 border-0 shadow-md",
        isSelectedForCompare && "ring-2 ring-primary"
      )}>
        {/* Photo Gallery */}
        <div className={cn(
          "relative bg-muted overflow-hidden",
          compact ? "aspect-[3/2]" : "aspect-[4/3]"
        )}>
          <img
            src={photos[currentPhoto]}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {/* Compare Checkbox - top left corner */}
          {onToggleCompare && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCompare();
              }}
              className={cn(
                "absolute top-2 left-2 p-2 rounded-lg transition-all flex items-center gap-1.5 z-10",
                isSelectedForCompare 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-white/90 hover:bg-white text-muted-foreground shadow-md"
              )}
            >
              <GitCompare className="h-4 w-4" />
              <span className="text-xs font-medium hidden sm:inline">
                {isSelectedForCompare ? "Wybrano" : "Porównaj"}
              </span>
            </button>
          )}
          
          {/* Photo Navigation */}
          {photos.length > 1 && (
            <>
              <button
                onClick={prevPhoto}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={nextPhoto}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              
              {/* Photo Indicators */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {photos.slice(0, 5).map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all",
                      idx === currentPhoto ? "bg-white w-3" : "bg-white/50"
                    )}
                  />
                ))}
                {photos.length > 5 && (
                  <span className="text-white text-xs ml-1">+{photos.length - 5}</span>
                )}
              </div>
            </>
          )}

          {/* Rating Badge - top left */}
          {listing.rating && (
            <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded-lg flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{listing.rating.toFixed(1)}</span>
            </div>
          )}

          {/* Favorite Button - top right */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite?.();
            }}
            className="absolute top-2 right-2 p-2 rounded-full bg-white/90 hover:bg-white shadow-md transition-all"
          >
            <Heart 
              className={cn(
                "h-5 w-5 transition-colors",
                isFavorited ? "fill-red-500 text-red-500" : "text-gray-600"
              )} 
            />
          </button>

          {/* Transaction Type Badge - bottom right corner */}
          {listing.transactionType && (
            <Badge 
              style={{ backgroundColor: listing.transactionColor || '#10b981' }}
              className="absolute bottom-2 right-2 text-white"
            >
              {listing.transactionType}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className={cn("p-4", compact && "p-2")}>
          {/* Title */}
          <h3 className={cn(
            "font-semibold mb-2 line-clamp-1",
            compact ? "text-sm" : "text-lg"
          )}>{listing.title}</h3>

          {/* Property Type & Details */}
          <div className={cn(
            "flex flex-wrap items-center text-muted-foreground mb-1.5",
            compact ? "text-xs" : "text-sm"
          )}>
            {listing.propertyType && (
              <span className="flex items-center gap-1">
                <Home className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                {PROPERTY_TYPE_LABELS[listing.propertyType] || listing.propertyType}
              </span>
            )}
            {listing.areaM2 && (
              <>
                {listing.propertyType && <span className="mx-1">•</span>}
                <span className="flex items-center gap-1">
                  <Maximize className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                  {listing.areaM2} m²
                </span>
              </>
            )}
            {listing.rooms && !compact && (
              <>
                <span className="mx-1.5">•</span>
                <span>{listing.rooms} {listing.rooms === 1 ? 'pokój' : listing.rooms < 5 ? 'pokoje' : 'pokoi'}</span>
              </>
            )}
          </div>

          {/* Floor & Year - hidden in compact mode */}
          {!compact && (
            <div className="flex flex-wrap items-center text-sm text-muted-foreground mb-3">
              {listing.floor !== undefined && listing.floorsTotal && (
                <span className="flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  Piętro {listing.floor}/{listing.floorsTotal}
                </span>
              )}
              {listing.buildYear && (
                <>
                  {listing.floor !== undefined && <span className="mx-1.5">•</span>}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {listing.buildYear}
                  </span>
                </>
              )}
              {listing.location && (
                <>
                  {(listing.floor !== undefined || listing.buildYear) && <span className="mx-1.5">•</span>}
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {listing.district ? `${listing.district}, ${listing.location}` : listing.location}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Location in compact mode */}
          {compact && listing.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <MapPin className="h-3 w-3" />
              {listing.location}
            </div>
          )}

          {/* Amenities - hidden in compact mode */}
          {!compact && (
            <div className="flex flex-wrap gap-1 mb-3">
              {listing.hasBalcony && (
                <Badge variant="secondary" className="text-xs">Balkon</Badge>
              )}
              {listing.hasElevator && (
                <Badge variant="secondary" className="text-xs">Winda</Badge>
              )}
              {listing.hasParking && (
                <Badge variant="secondary" className="text-xs">Parking</Badge>
              )}
              {listing.hasGarden && (
                <Badge variant="secondary" className="text-xs">Ogród</Badge>
              )}
              {listing.marketType === 'pierwotny' && (
                <Badge variant="outline" className="text-xs">Rynek pierwotny</Badge>
              )}
            </div>
          )}

          {/* Price & Action */}
          <div className={cn(
            "flex items-center justify-between",
            compact && "flex-col items-start gap-2"
          )}>
            <div>
              <span className={cn(
                "font-bold text-primary",
                compact ? "text-base" : "text-2xl"
              )}>
                {listing.price.toLocaleString('pl-PL')} zł
              </span>
              {!compact && (
                <span className="text-sm text-muted-foreground ml-1">
                  {PRICE_TYPE_LABELS[listing.priceType || 'sale'] || ''}
                </span>
              )}
              {pricePerM2 && !compact && (
                <div className="text-xs text-muted-foreground">
                  {pricePerM2.toLocaleString('pl-PL')} zł/m²
                </div>
              )}
            </div>
            
            <Button 
              size="sm"
              onClick={onView}
              className={cn(compact && "w-full h-7 text-xs")}
            >
              {compact ? "Zobacz" : "Szczegóły"}
            </Button>
          </div>

          {/* Expandable Contact Section - hidden in compact mode */}
          {!compact && (
            <>
              <button
                onClick={handleShowContact}
                className="w-full mt-3 pt-3 border-t text-sm text-muted-foreground hover:text-foreground transition-colors text-left flex items-center gap-2"
              >
                {!isLoggedIn && <Lock className="h-3.5 w-3.5" />}
                {showContact ? "Ukryj kontakt ▲" : "Pokaż kontakt ▼"}
              </button>
              
              {showContact && isLoggedIn && (
                <div className="mt-2 space-y-1.5 text-sm">
                  {/* Agency Name */}
                  {listing.agencyName && (
                    <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                      {listing.agencyName}
                    </div>
                  )}
                  
                  {/* Contact Info */}
                  {listing.contactName && (
                    <div className="flex items-center gap-2 text-xs">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{listing.contactName}</span>
                    </div>
                  )}
                  {listing.contactPhone && (
                    <a 
                      href={`tel:${listing.contactPhone}`}
                      className="flex items-center gap-2 text-xs text-primary hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>{listing.contactPhone}</span>
                    </a>
                  )}
                  {listing.contactEmail && (
                    <a 
                      href={`mailto:${listing.contactEmail}`}
                      className="flex items-center gap-2 text-xs text-primary hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>{listing.contactEmail}</span>
                    </a>
                  )}
                  
                  {/* Listing Number - at the very bottom */}
                  {listing.listingNumber && (
                    <div className="pt-2 mt-1 border-t text-xs text-muted-foreground">
                      Nr oferty: <span className="font-mono">{listing.listingNumber}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Login Required Dialog */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Zaloguj się, aby zobaczyć kontakt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-muted-foreground text-sm">
              Aby zobaczyć dane kontaktowe do ogłoszeniodawcy, musisz być zalogowany. 
              Rejestracja jest darmowa i zajmuje tylko chwilę.
            </p>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowLoginDialog(false)}
              >
                Anuluj
              </Button>
              <Button 
                className="flex-1"
                onClick={() => {
                  setShowLoginDialog(false);
                  navigate(`/auth?redirect=/nieruchomosci/ogloszenie/${listing.id}`);
                }}
              >
                Zaloguj się
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
