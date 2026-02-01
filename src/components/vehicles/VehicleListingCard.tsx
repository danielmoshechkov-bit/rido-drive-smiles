import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, ChevronRight, Star, MapPin, Calendar, 
  Heart, Phone, Mail, User, Car, Fuel, Gauge, Settings, GitCompare, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

interface VehicleListingCardProps {
  listing: {
    id: string;
    title: string;
    price: number;
    priceType?: string;
    photos: string[];
    location?: string;
    brand?: string;
    model?: string;
    year?: number;
    fuelType?: string;
    odometer?: number;
    engineCapacity?: number;
    power?: number;
    bodyType?: string;
    color?: string;
    rating?: number;
    transactionType?: string;
    transactionColor?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
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
  weekly: "/ tydzień",
  monthly: "/ miesiąc",
  daily: "/ dzień",
};

const FUEL_TYPE_LABELS: Record<string, string> = {
  benzyna: "Benzyna",
  diesel: "Diesel",
  hybryda: "Hybryda",
  elektryczny: "Elektryczny",
  lpg: "LPG",
};

const BODY_TYPE_LABELS: Record<string, string> = {
  sedan: "Sedan",
  kombi: "Kombi",
  hatchback: "Hatchback",
  suv: "SUV",
  crossover: "Crossover",
  coupe: "Coupe",
  kabriolet: "Kabriolet",
  van: "Van",
  pickup: "Pickup",
};

export function VehicleListingCard({ 
  listing, 
  onView, 
  onFavorite, 
  onToggleCompare,
  isLoggedIn = false,
  isFavorited = false,
  isSelectedForCompare = false,
  compact = false
}: VehicleListingCardProps) {
  const navigate = useNavigate();
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  const photos = listing.photos?.length > 0 
    ? listing.photos 
    : ["/placeholder.svg"];

  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
  };

  const getPhotoSrc = (index: number) => {
    if (imageErrors.has(index)) return "/placeholder.svg";
    return photos[index];
  };

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleShowContact = async () => {
    if (!isLoggedIn) {
      setShowLoginDialog(true);
      return;
    }

    if (!showContact) {
      try {
        await supabase.functions.invoke("track-vehicle-interaction", {
          body: { listingId: listing.id, interactionType: "contact_reveal" }
        });
      } catch (err) {
        console.error("Failed to track contact reveal:", err);
      }
    }
    setShowContact(!showContact);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements or the photo area
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('[data-photo-area]') ||
      target.tagName === 'IMG'
    ) {
      return;
    }
    navigate(`/gielda/ogloszenie/${listing.id}`);
  };

  // Handle clicking on the photo area - open lightbox (stops propagation)
  const handlePhotoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowLightbox(true);
  };

  return (
    <>
      <Card 
        className={cn(
          "overflow-hidden group hover:shadow-xl transition-all duration-300 border-0 shadow-md cursor-pointer",
          isSelectedForCompare && "ring-2 ring-primary"
        )}
        onClick={handleCardClick}
      >
        {/* Photo Gallery - clicking opens lightbox */}
        <div 
          className={cn(
            "relative bg-muted overflow-hidden cursor-zoom-in",
            compact ? "aspect-[3/2]" : "aspect-[4/3]"
          )}
          onClick={handlePhotoClick}
          data-photo-area="true"
          aria-label="Powiększ zdjęcie"
        >
          <img
            src={getPhotoSrc(currentPhoto)}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => handleImageError(currentPhoto)}
          />

          {/* Compare Checkbox */}
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

          {/* Rating Badge */}
          {listing.rating && (
            <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded-lg flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{listing.rating.toFixed(1)}</span>
            </div>
          )}

          {/* Favorite Button */}
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

          {/* Transaction Type Badge */}
          {listing.transactionType && (
            <Badge 
              style={{ backgroundColor: listing.transactionColor || '#10b981' }}
              className="absolute bottom-2 right-2 text-white"
            >
              {listing.transactionType}
            </Badge>
          )}
        </div>

        {/* Content - Fixed height sections for consistent card alignment */}
        <div className={cn("p-4 flex flex-col", compact && "p-2")}>
          {/* Title - Fixed height */}
          <h3 className={cn(
            "font-semibold line-clamp-1 h-7 flex items-center",
            compact ? "text-sm h-5" : "text-lg"
          )}>{listing.title}</h3>

          {/* Vehicle Details - Fixed height row */}
          <div className={cn(
            "flex flex-wrap items-center text-muted-foreground h-5 mt-1",
            compact ? "text-xs" : "text-sm"
          )}>
            {listing.year && (
              <span className="flex items-center gap-1">
                <Calendar className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                {listing.year}
              </span>
            )}
            {listing.fuelType && (
              <>
                {listing.year && <span className="mx-1">•</span>}
                <span className="flex items-center gap-1">
                  <Fuel className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                  {FUEL_TYPE_LABELS[listing.fuelType] || listing.fuelType}
                </span>
              </>
            )}
            {listing.power && !compact && (
              <>
                <span className="mx-1.5">•</span>
                <span>{listing.power} KM</span>
              </>
            )}
          </div>

          {/* Additional Details - Fixed height row, hidden in compact mode */}
          {!compact && (
            <div className="flex flex-wrap items-center text-sm text-muted-foreground h-5 mt-1">
              {listing.odometer && (
                <span className="flex items-center gap-1">
                  <Gauge className="h-3.5 w-3.5" />
                  {(listing.odometer / 1000).toFixed(0)} tys. km
                </span>
              )}
              {listing.engineCapacity && listing.engineCapacity > 0 && (
                <>
                  {listing.odometer && <span className="mx-1.5">•</span>}
                  <span className="flex items-center gap-1">
                    <Settings className="h-3.5 w-3.5" />
                    {(listing.engineCapacity / 1000).toFixed(1)} L
                  </span>
                </>
              )}
              {listing.bodyType && (
                <>
                  {(listing.odometer || listing.engineCapacity) && <span className="mx-1.5">•</span>}
                  <span className="flex items-center gap-1">
                    <Car className="h-3.5 w-3.5" />
                    {BODY_TYPE_LABELS[listing.bodyType] || listing.bodyType}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Location - Fixed height */}
          <div className={cn(
            "flex items-center gap-1 text-muted-foreground h-5 mt-1",
            compact ? "text-xs" : "text-sm"
          )}>
            {listing.location ? (
              <>
                <MapPin className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                {listing.location}
              </>
            ) : (
              <span>&nbsp;</span>
            )}
          </div>

          {/* Spacer to push price to bottom */}
          <div className="flex-grow min-h-2" />

          {/* Price & Action - Always at the bottom */}
          <div className={cn(
            "flex items-center justify-between mt-auto pt-2",
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
                  navigate(`/gielda/logowanie?redirect=/gielda/ogloszenie/${listing.id}`);
                }}
              >
                Zaloguj się
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Lightbox */}
      <ImageLightbox
        images={photos}
        initialIndex={currentPhoto}
        open={showLightbox}
        onOpenChange={setShowLightbox}
        alt={listing.title}
      />
    </>
  );
}
