import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, ChevronRight, Star, MapPin, Calendar, Fuel, 
  Gauge, Heart, Phone, Mail, User, Zap, GitCompare, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { useContentTranslation } from "@/hooks/useContentTranslation";

interface ListingCardProps {
  listing: {
    id: string;
    title: string;
    price: number;
    priceType?: string;
    photos: string[];
    location?: string;
    year?: number;
    fuelType?: string;
    mileage?: number;
    rating?: number;
    transactionType?: string;
    transactionColor?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    isFeatured?: boolean;
    listingNumber?: string;
    description?: string;
    engineCapacity?: number;
    power?: number;
    bodyType?: string;
    sellerRating?: number;
  };
  onView?: () => void;
  onReserve?: () => void;
  onFavorite?: () => void;
  onToggleCompare?: () => void;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
  isSelectedForCompare?: boolean;
  compact?: boolean;
  variant?: 'grid' | 'compact' | 'list';
}

const FUEL_LABELS: Record<string, string> = {
  benzyna: "Benzyna",
  diesel: "Diesel",
  hybryda: "Hybryda",
  lpg: "LPG",
  elektryczny: "Elektryk",
};

const PRICE_TYPE_LABELS: Record<string, string> = {
  weekly: "/ tydzień",
  monthly: "/ miesiąc",
  daily: "/ dzień",
  one_time: "",
  per_hour: "/ godz",
  sale: "",
};

const BODY_TYPE_LABELS: Record<string, string> = {
  sedan: "Sedan",
  kombi: "Kombi",
  hatchback: "Hatchback",
  suv: "SUV",
  coupe: "Coupe",
  cabrio: "Cabrio",
  minivan: "Minivan",
  pickup: "Pickup",
};

export function ListingCard({ 
  listing, 
  onView,
  onReserve, 
  onFavorite, 
  onToggleCompare,
  isLoggedIn = false,
  isFavorited = false,
  isSelectedForCompare = false,
  compact = false,
  variant = 'grid'
}: ListingCardProps) {
  const navigate = useNavigate();
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [showLightbox, setShowLightbox] = useState(false);
  
  const isCompact = compact || variant === 'compact';
  const isList = variant === 'list';

  const maskPhone = (phone: string) => {
    if (!phone) return '';
    return phone.substring(0, 7) + ' ***';
  };

  const maskEmail = (email: string) => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (local && domain) {
      return local[0] + '***@***.' + domain.split('.').pop();
    }
    return email[0] + '***@***.com';
  };

  // Handle photo click - opens lightbox
  const handlePhotoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowLightbox(true);
  };

  // Handle card click - navigates to listing details
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Skip if clicking on buttons, photo area, or interactive elements
    if (
      target.closest('button') || 
      target.closest('[data-photo-area]') ||
      target.closest('a')
    ) {
      return;
    }
    navigate(`/gielda/ogloszenie/${listing.id}`);
  };

  const photos = listing.photos?.length > 0 ? listing.photos : ["/placeholder.svg"];

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

  const renderStars = (rating: number) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-3 w-3",
            star <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "fill-muted text-muted"
          )}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">({rating.toFixed(1)})</span>
    </div>
  );

  const handleShowContact = () => {
    setShowContact(!showContact);
  };

  // List variant
  if (isList) {
    return (
      <>
        <Card className={cn(
          "overflow-hidden group hover:shadow-xl transition-all duration-300 border-0 shadow-md",
          isSelectedForCompare && "ring-2 ring-primary"
        )}>
          <div className="flex flex-col sm:flex-row">
            <div className="relative bg-muted overflow-hidden sm:w-64 md:w-72 flex-shrink-0 aspect-[4/3] sm:aspect-auto sm:h-48">
              <img
                src={getPhotoSrc(currentPhoto)}
                alt={listing.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={() => handleImageError(currentPhoto)}
              />
              {onToggleCompare && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleCompare(); }}
                  className={cn(
                    "absolute top-2 left-2 p-2 rounded-lg transition-all z-10",
                    isSelectedForCompare ? "bg-primary text-primary-foreground" : "bg-white/90 hover:bg-white text-muted-foreground shadow-md"
                  )}
                >
                  <GitCompare className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onFavorite?.(); }}
                className="absolute top-2 right-2 p-2 rounded-full bg-white/90 hover:bg-white shadow-md transition-all"
              >
                <Heart className={cn("h-5 w-5 transition-colors", isFavorited ? "fill-red-500 text-red-500" : "text-gray-600")} />
              </button>
              {listing.transactionType && (
                <Badge style={{ backgroundColor: listing.transactionColor || '#10b981' }} className="absolute bottom-2 left-2 text-white">
                  {listing.transactionType}
                </Badge>
              )}
            </div>
            <div className="flex-1 p-4 flex flex-col">
              <h3 className="font-bold text-lg line-clamp-2 min-h-[3rem]">{listing.title}</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-2">
                {listing.year && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{listing.year}</span>}
                {listing.fuelType && <span className="flex items-center gap-1"><Fuel className="h-3.5 w-3.5" />{FUEL_LABELS[listing.fuelType.toLowerCase()] || listing.fuelType}</span>}
                {listing.mileage && <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />{(listing.mileage / 1000).toFixed(0)} tys. km</span>}
                {listing.power && <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" />{listing.power} KM</span>}
              </div>
              {listing.location && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3.5 w-3.5" />{listing.location}
                </div>
              )}
              <div className="flex items-center justify-between mt-auto pt-3 border-t">
                <div>
                  <span className="font-bold text-2xl text-primary">{listing.price.toLocaleString('pl-PL')} zł</span>
                  <span className="text-sm text-muted-foreground ml-1">{PRICE_TYPE_LABELS[listing.priceType || 'weekly'] || ''}</span>
                </div>
                <Button size="sm" onClick={onView}>Szczegóły</Button>
              </div>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <Card 
        className={cn(
          "overflow-hidden group hover:shadow-xl transition-all duration-300 border-0 shadow-md cursor-pointer",
          isSelectedForCompare && "ring-2 ring-primary"
        )}
        onClick={handleCardClick}
      >
        {/* Photo area - clicking opens lightbox */}
        <div 
          className={cn("relative bg-muted overflow-hidden", isCompact ? "aspect-[3/2]" : "aspect-[4/3]")}
          data-photo-area="true"
          onClick={handlePhotoClick}
        >
          <img
            src={getPhotoSrc(currentPhoto)}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => handleImageError(currentPhoto)}
          />
          {onToggleCompare && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCompare(); }}
              className={cn(
                "absolute top-2 left-2 p-2 rounded-lg transition-all flex items-center gap-1.5 z-10",
                isSelectedForCompare ? "bg-primary text-primary-foreground" : "bg-white/90 hover:bg-white text-muted-foreground shadow-md"
              )}
            >
              <GitCompare className="h-4 w-4" />
              <span className="text-xs font-medium hidden sm:inline">{isSelectedForCompare ? "Wybrano" : "Porównaj"}</span>
            </button>
          )}
          {photos.length > 1 && (
            <>
              <button onClick={prevPhoto} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={nextPhoto} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {photos.slice(0, 5).map((_, idx) => (
                  <div key={idx} className={cn("w-1.5 h-1.5 rounded-full transition-all", idx === currentPhoto ? "bg-white w-3" : "bg-white/50")} />
                ))}
              </div>
            </>
          )}
          {listing.rating && !onToggleCompare && (
            <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded-lg flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{listing.rating.toFixed(1)}</span>
            </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); onFavorite?.(); }} className="absolute top-2 right-2 p-2 rounded-full bg-white/90 hover:bg-white shadow-md transition-all">
            <Heart className={cn("h-5 w-5 transition-colors", isFavorited ? "fill-red-500 text-red-500" : "text-gray-600")} />
          </button>
          {listing.transactionType && (
            <Badge style={{ backgroundColor: listing.transactionColor || '#10b981' }} className="absolute bottom-2 right-2 text-white">
              {listing.transactionType}
            </Badge>
          )}
        </div>

        <div className={cn("p-4 flex flex-col", isCompact && "p-2")}>
          <h3 className={cn("font-bold leading-tight", isCompact ? "text-sm line-clamp-1" : "text-lg line-clamp-2 min-h-[3.5rem]")}>{listing.title}</h3>
          <div className={cn("flex flex-wrap items-center text-muted-foreground", isCompact ? "text-xs mt-1" : "text-sm mb-1.5")}>
            {listing.year && <span className="flex items-center gap-1"><Calendar className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5")} />{listing.year}</span>}
            {listing.fuelType && <><span className="mx-1">•</span><span className="flex items-center gap-1"><Fuel className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5")} />{FUEL_LABELS[listing.fuelType.toLowerCase()] || listing.fuelType}</span></>}
            {listing.power && !isCompact && <><span className="mx-1">•</span><span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" />{listing.power} KM</span></>}
          </div>
          {!isCompact && (
            <div className="flex flex-wrap items-center text-sm text-muted-foreground mb-3">
              {listing.mileage && <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />{(listing.mileage / 1000).toFixed(0)} tys. km</span>}
              {listing.location && <><span className="mx-1.5">•</span><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{listing.location}</span></>}
            </div>
          )}
          {isCompact && listing.location && <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1"><MapPin className="h-3 w-3" />{listing.location}</div>}
          <div className="flex-grow min-h-2" />
          <div className={cn("flex items-center justify-between mt-auto pt-2", isCompact && "flex-col items-start gap-2")}>
            <div>
              <span className={cn("font-bold text-primary", isCompact ? "text-base" : "text-2xl")}>{listing.price.toLocaleString('pl-PL')} zł</span>
              {!isCompact && <span className="text-sm text-muted-foreground ml-1">{PRICE_TYPE_LABELS[listing.priceType || 'weekly'] || ''}</span>}
            </div>
            <Button size="sm" onClick={onView} className={cn(isCompact && "w-full h-7 text-xs")}>{isCompact ? "Zobacz" : "Szczegóły"}</Button>
          </div>
          {!isCompact && (
            <>
              <button onClick={handleShowContact} className="w-full mt-3 pt-3 border-t text-sm text-muted-foreground hover:text-foreground transition-colors text-left flex items-center gap-2">
                {!isLoggedIn && <Lock className="h-3.5 w-3.5" />}
                {showContact ? "Ukryj kontakt ▲" : "Pokaż kontakt ▼"}
              </button>
              {showContact && (
                <div className="mt-2 space-y-1.5 text-sm">
                  {listing.contactName && <div className="flex items-center gap-2 text-xs"><User className="h-3.5 w-3.5 text-muted-foreground" /><span>{listing.contactName}</span></div>}
                  {listing.contactPhone && <div className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span className={isLoggedIn ? "text-primary" : "text-muted-foreground"}>{isLoggedIn ? listing.contactPhone : maskPhone(listing.contactPhone)}</span></div>}
                  {listing.contactEmail && <div className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className={isLoggedIn ? "text-primary" : "text-muted-foreground"}>{isLoggedIn ? listing.contactEmail : maskEmail(listing.contactEmail)}</span></div>}
                  {!isLoggedIn && (
                    <div className="pt-2 mt-1 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Zaloguj się, aby zobaczyć pełne dane kontaktowe</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => navigate(`/gielda/logowanie`)}>Zaloguj się</Button>
                        <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/gielda/logowanie?register=true`)}>Zarejestruj się</Button>
                      </div>
                    </div>
                  )}
                  {isLoggedIn && listing.listingNumber && <div className="pt-2 mt-1 border-t text-xs text-muted-foreground">Nr oferty: <span className="font-mono">{listing.listingNumber}</span></div>}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

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