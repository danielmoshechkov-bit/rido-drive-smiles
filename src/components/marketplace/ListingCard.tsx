import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ChevronLeft, ChevronRight, Star, MapPin, Calendar, Fuel, 
  Gauge, Heart, Phone, Mail, User, Zap, GitCompare
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  onReserve?: () => void;
  onFavorite?: () => void;
  onToggleCompare?: () => void;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
  isSelectedForCompare?: boolean;
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
  onReserve, 
  onFavorite, 
  onToggleCompare,
  isLoggedIn = false,
  isFavorited = false,
  isSelectedForCompare = false 
}: ListingCardProps) {
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [showContact, setShowContact] = useState(false);

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

  // Helper to render rating stars
  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-3 w-3",
              star <= Math.round(rating) 
                ? "fill-yellow-400 text-yellow-400" 
                : "fill-muted text-muted"
            )}
          />
        ))}
        <span className="text-xs text-muted-foreground ml-1">({rating.toFixed(1)})</span>
      </div>
    );
  };

  return (
    <Card className={cn(
      "overflow-hidden group hover:shadow-xl transition-all duration-300 border-0 shadow-md",
      isSelectedForCompare && "ring-2 ring-primary"
    )}>
      {/* Photo Gallery */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
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
              "absolute top-2 left-2 p-2 rounded-lg transition-all flex items-center gap-1.5",
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
            style={{ backgroundColor: listing.transactionColor || '#6366f1' }}
            className="absolute bottom-2 right-2 text-white"
          >
            {listing.transactionType}
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-lg mb-2 line-clamp-1">{listing.title}</h3>

        {/* Line 1: Year • Fuel • Mileage • Power (with icons) */}
        <div className="flex flex-wrap items-center text-sm text-muted-foreground mb-1.5">
          {listing.year && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {listing.year}
            </span>
          )}
          {listing.fuelType && (
            <>
              {listing.year && <span className="mx-1.5">•</span>}
              <span className="flex items-center gap-1">
                <Fuel className="h-3.5 w-3.5" />
                {FUEL_LABELS[listing.fuelType.toLowerCase()] || listing.fuelType}
              </span>
            </>
          )}
          {listing.mileage && (
            <>
              {(listing.year || listing.fuelType) && <span className="mx-1.5">•</span>}
              <span className="flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" />
                {listing.mileage.toLocaleString()} km
              </span>
            </>
          )}
          {listing.power && (
            <>
              {(listing.year || listing.fuelType || listing.mileage) && <span className="mx-1.5">•</span>}
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" />
                {listing.power} KM
              </span>
            </>
          )}
        </div>

        {/* Line 2: Engine capacity • Body type • City (no icons except location) */}
        <div className="flex flex-wrap items-center text-sm text-muted-foreground mb-3">
          {listing.engineCapacity && (
            <span>{(listing.engineCapacity / 1000).toFixed(1)}L</span>
          )}
          {listing.bodyType && (
            <>
              {listing.engineCapacity && <span className="mx-1.5">•</span>}
              <span>{BODY_TYPE_LABELS[listing.bodyType.toLowerCase()] || listing.bodyType}</span>
            </>
          )}
          {listing.location && (
            <>
              {(listing.engineCapacity || listing.bodyType) && <span className="mx-1.5">•</span>}
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {listing.location}
              </span>
            </>
          )}
        </div>

        {/* Short Description */}
        {listing.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {listing.description}
          </p>
        )}

        {/* Price & Action */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold text-primary">
              {listing.price.toLocaleString()} zł
            </span>
            <span className="text-sm text-muted-foreground ml-1">
              {PRICE_TYPE_LABELS[listing.priceType || 'weekly'] || '/ tydzień'}
            </span>
          </div>
          
          <Button 
            size="sm"
            onClick={onReserve}
            disabled={!isLoggedIn}
          >
            {isLoggedIn ? "Rezerwuj" : "Zaloguj się"}
          </Button>
        </div>

        {/* Expandable Contact Section */}
        <button
          onClick={() => setShowContact(!showContact)}
          className="w-full mt-3 pt-3 border-t text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
        >
          {showContact ? "Ukryj kontakt ▲" : "Pokaż kontakt ▼"}
        </button>
        
        {showContact && (
          <div className="mt-3 space-y-3 text-sm">
            {/* Full Description */}
            {listing.description && (
              <p className="text-muted-foreground leading-relaxed">
                {listing.description}
              </p>
            )}
            
            {/* Contact Info */}
            <div className="pt-2 border-t space-y-2">
              {listing.contactName && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{listing.contactName}</span>
                  </div>
                  {listing.sellerRating && renderStars(listing.sellerRating)}
                </div>
              )}
              {listing.contactPhone && (
                <a 
                  href={`tel:${listing.contactPhone}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  <span>{listing.contactPhone}</span>
                </a>
              )}
              {listing.contactEmail && (
                <a 
                  href={`mailto:${listing.contactEmail}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Mail className="h-4 w-4" />
                  <span>{listing.contactEmail}</span>
                </a>
              )}
              
              {/* Listing Number */}
              {listing.listingNumber && (
                <div className="pt-2 text-xs text-muted-foreground">
                  Nr oferty: <span className="font-mono">{listing.listingNumber}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
