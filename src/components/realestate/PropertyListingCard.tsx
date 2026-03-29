// PropertyListingCard v2 - CRM photos fix deployed
// Fix Polish diacritics capitalization (OŻarÓw → Ożarów)
function fixPolishCase(text: string | undefined | null): string {
  if (!text) return '';
  // If text has wrong capitalization pattern (uppercase diacritics mid-word), fix it
  return text.replace(/\b\S+/g, word => {
    // If word has uppercase letters after first char (e.g. OŻarÓw), fix it
    if (/[A-ZĄĆĘŁŃÓŚŹŻ]/.test(word.slice(1))) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return word;
  });
}
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, ChevronRight, Star, MapPin, Calendar, 
  Heart, Phone, Mail, User, Home, Building2, Layers, Maximize, GitCompare, Lock, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { AuthModal } from "@/components/auth/AuthModal";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

interface PropertyListingCardProps {
  listing: {
    id: string;
    title: string;
    price: number;
    priceType?: string;
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
  onToggleViewing?: () => void;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
  isSelectedForCompare?: boolean;
  isSelectedForViewing?: boolean;
  compact?: boolean;
  variant?: 'grid' | 'compact' | 'list';
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
  onToggleViewing,
  isLoggedIn = false,
  isFavorited = false,
  isSelectedForCompare = false,
  isSelectedForViewing = false,
  compact = false,
  variant = 'grid'
}: PropertyListingCardProps) {
  const navigate = useNavigate();
  const isCompact = compact || variant === 'compact';
  const isList = variant === 'list';
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Area is already corrected in the mapping layer (ai_area_total > area_total > area)
  const displayArea = listing.areaM2 || 0;

  const rawPhotos = typeof listing.photos === 'string'
    ? (() => {
        try {
          return JSON.parse(listing.photos);
        } catch {
          return [];
        }
      })()
    : listing.photos;
  const photos = Array.isArray(rawPhotos) && rawPhotos.length > 0
    ? rawPhotos.filter((photo): photo is string => typeof photo === 'string' && photo.trim().length > 0)
    : [];
  const mainPhotoUrl = photos[0] ?? '/placeholder.svg';

  // Debug: log photos for CRM listings
  if (photos.length > 0 && photos[0]?.includes('foto-proxy')) {
    console.log('[PropertyCard] CRM photos:', listing.id, photos[0]);
  }

  const handleImageError = (index: number) => {
    console.warn('[PropertyCard] Image load error:', photos[index]);
    setImageErrors(prev => new Set(prev).add(index));
  };

  const getPhotoSrc = (index: number) => {
    if (imageErrors.has(index)) return '/placeholder.svg';
    return photos[index] ?? mainPhotoUrl;
  };

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev - 1 + photos.length) % photos.length);
  };

  // Calculate price per m2
  const pricePerM2 = displayArea && listing.price 
    ? Math.round(listing.price / displayArea) 
    : null;

  const formatCurrency = (amount: number) => `${amount.toLocaleString('pl-PL').replace(/\s/g, '\u00A0')} zł`;

  useEffect(() => {
    if (!showContact) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setShowContact(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowContact(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showContact]);

  const handleShowContact = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
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

  const handleCardClick = () => {
    navigate(`/nieruchomosci/ogloszenie/${listing.id}`);
  };

  // Handle clicking on the photo area - open lightbox
  const handlePhotoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowLightbox(true);
  };

  const contactPanel = !compact && showContact && isLoggedIn ? (
    <div
      className="absolute inset-x-4 bottom-14 z-30 rounded-2xl border bg-background p-3 shadow-2xl"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="space-y-1.5 text-sm">
        {listing.agencyName && (
          <div className="flex items-center gap-2 text-foreground font-medium text-sm">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="line-clamp-1">{listing.agencyName}</span>
          </div>
        )}

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
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="h-3.5 w-3.5" />
            <span>{listing.contactPhone}</span>
          </a>
        )}

        {listing.contactEmail && (
          <a
            href={`mailto:${listing.contactEmail}`}
            className="flex items-center gap-2 text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate">{listing.contactEmail}</span>
          </a>
        )}

        {listing.listingNumber && (
          <div className="pt-2 mt-1 border-t text-xs text-muted-foreground">
            Nr oferty: <span className="font-mono">{listing.listingNumber}</span>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // List variant layout
  if (isList) {
    return (
      <>
        <Card 
          ref={cardRef}
          className={cn(
            "relative overflow-visible group hover:shadow-xl transition-all duration-300 border-0 shadow-md cursor-pointer",
            showContact && "z-20",
            isSelectedForCompare && "ring-2 ring-primary"
          )}
          onClick={handleCardClick}
        >
          <div className="flex flex-col sm:flex-row">
            {/* Photo - Left side - clicking opens lightbox */}
            <div 
              className="relative bg-muted overflow-hidden sm:w-64 md:w-72 flex-shrink-0 aspect-[4/3] sm:aspect-auto sm:h-48"
              onClick={handlePhotoClick}
            >
              <img
                src={getPhotoSrc(currentPhoto)}
                alt={listing.title}
                className="block h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  handleImageError(currentPhoto);
                  e.currentTarget.src = '/placeholder.svg';
                }}
              />

              {/* Compare Button */}
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
                </button>
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

              {/* Transaction Badge - bottom right */}
              {listing.transactionType && (
                <Badge 
                  style={{ backgroundColor: listing.transactionColor || '#10b981' }}
                  className="absolute bottom-2 right-2 text-white"
                >
                  {listing.transactionType}
                </Badge>
              )}

              {/* Schedule Viewing Badge - bottom left */}
              {onToggleViewing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleViewing();
                  }}
                  className={cn(
                    "absolute bottom-2 left-2 px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 z-10",
                    isSelectedForViewing
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "bg-white/90 hover:bg-white text-foreground shadow-md backdrop-blur-sm"
                  )}
                >
                  <Eye className="h-3 w-3" />
                  {isSelectedForViewing ? "Wybrano" : "Oglądanie"}
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
                </>
              )}
            </div>

            {/* Content - Right side */}
            <div className="flex-1 p-4 flex flex-col">
              {/* Title - 2 linijki, większa czcionka */}
              <h3 className="font-bold text-lg line-clamp-2 min-h-[3rem]">{listing.title}</h3>

              {/* Property specs row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-2">
                {listing.propertyType && (
                  <span className="flex items-center gap-1">
                    <Home className="h-3.5 w-3.5" />
                    {PROPERTY_TYPE_LABELS[listing.propertyType] || listing.propertyType}
                  </span>
                )}
            {displayArea && (
                  <span className="flex items-center gap-1">
                    <Maximize className="h-3.5 w-3.5" />
                    {displayArea} m²
                  </span>
                )}
                {listing.rooms > 0 && (
                  <span>{listing.rooms} {listing.rooms === 1 ? 'pokój' : listing.rooms < 5 ? 'pokoje' : 'pokoi'}</span>
                )}
                {listing.floor !== undefined && listing.floorsTotal && (
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    {listing.floor}/{listing.floorsTotal} p.
                  </span>
                )}
                {listing.buildYear && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {listing.buildYear}
                  </span>
                )}
              </div>

              {/* Location */}
              {listing.location && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {listing.district ? `${fixPolishCase(listing.district)}, ${fixPolishCase(listing.location)}` : fixPolishCase(listing.location)}
                  </span>
                </div>
              )}

              {/* Amenities */}
              {(listing.hasBalcony || listing.hasElevator || listing.hasParking || listing.hasGarden) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {listing.hasBalcony && (
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">Balkon</Badge>
                  )}
                  {listing.hasElevator && (
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">Winda</Badge>
                  )}
                  {listing.hasParking && (
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">Parking</Badge>
                  )}
                  {listing.hasGarden && (
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">Ogród</Badge>
                  )}
                </div>
              )}

              {/* Spacer */}
              <div className="flex-grow min-h-2" />

              {/* Price & Action */}
              <div className="flex items-center justify-between mt-auto pt-2">
                <div>
                  <span className="font-bold text-xl text-primary">
                    {formatCurrency(listing.price)}
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">
                    {PRICE_TYPE_LABELS[listing.priceType || 'sale'] || ''}
                  </span>
                  {pricePerM2 && (
                    <div className="text-xs text-muted-foreground">
                        {formatCurrency(pricePerM2).replace(' zł', '')} zł/m²
                    </div>
                  )}
                </div>
                <Button size="sm" onClick={onView}>
                  Szczegóły
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <AuthModal
          open={showLoginDialog}
          onOpenChange={setShowLoginDialog}
          initialMode="login"
          customDescription="Zaloguj się, aby zobaczyć kontakt do ogłoszeniodawcy bez opuszczania listy ofert."
          onSuccess={() => {
            setShowLoginDialog(false);
            setShowContact(true);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Card 
        ref={cardRef}
        className={cn(
          "relative overflow-visible group hover:shadow-xl transition-all duration-300 border-0 shadow-md cursor-pointer h-full flex flex-col",
          showContact && "z-20",
          isSelectedForCompare && "ring-2 ring-primary"
        )}
        onClick={handleCardClick}
      >
        {/* Photo Gallery - clicking opens lightbox */}
        <div 
          className={cn(
            "relative bg-muted overflow-hidden",
            compact ? "aspect-[3/2]" : "aspect-[4/3]"
          )}
          onClick={handlePhotoClick}
        >
          <img
            src={getPhotoSrc(currentPhoto)}
            alt={listing.title}
            className="block h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              handleImageError(currentPhoto);
              e.currentTarget.src = '/placeholder.svg';
            }}
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

          {/* Schedule Viewing Badge - bottom left corner */}
          {onToggleViewing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleViewing();
              }}
              className={cn(
                "absolute bottom-2 left-2 px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 z-10",
                isSelectedForViewing
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "bg-white/90 hover:bg-white text-foreground shadow-md backdrop-blur-sm"
              )}
            >
              <Eye className="h-3 w-3" />
              {isSelectedForViewing ? "Wybrano" : "Oglądanie"}
            </button>
          )}
        </div>

        {/* Content */}
        <div className={cn("p-4 flex flex-col flex-1", compact && "p-2")}>
          {/* Title - 2 linijki, większa czcionka */}
          <h3 className={cn(
            "font-bold leading-tight",
            compact ? "text-sm line-clamp-1" : "text-lg line-clamp-2 min-h-[3rem]"
          )}>{listing.title}</h3>

          {/* Property Type & Area & Rooms - Single row */}
          <div className={cn(
            "flex flex-wrap items-center gap-x-2 text-muted-foreground mt-2",
            compact ? "text-xs" : "text-sm"
          )}>
            {listing.propertyType && (
              <span className="flex items-center gap-1">
                <Home className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                {PROPERTY_TYPE_LABELS[listing.propertyType] || listing.propertyType}
              </span>
            )}
            {displayArea && (
              <span className="flex items-center gap-1">
                <Maximize className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                {displayArea} m²
              </span>
            )}
            {listing.rooms > 0 && (
              <span>{listing.rooms} {listing.rooms === 1 ? 'pokój' : listing.rooms < 5 ? 'pokoje' : 'pokoi'}</span>
            )}
            {listing.buildYear && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {listing.buildYear}
              </span>
            )}
            {!compact && listing.floor !== undefined && listing.floorsTotal && (
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" />
                Piętro {listing.floor}/{listing.floorsTotal}
              </span>
            )}
          </div>

          {/* Location - Separate clear row */}
          {listing.location && (
            <div className={cn(
              "flex items-center gap-1 text-muted-foreground mt-1",
              compact ? "text-xs" : "text-sm"
            )}>
              <MapPin className={cn(compact ? "h-3 w-3 flex-shrink-0" : "h-3.5 w-3.5 flex-shrink-0")} />
              <span className="truncate">
                {listing.district ? `${fixPolishCase(listing.district)}, ${fixPolishCase(listing.location)}` : fixPolishCase(listing.location)}
              </span>
            </div>
          )}

          {/* Amenities - Wrap naturally, no fixed height */}
          {!compact && (listing.hasBalcony || listing.hasElevator || listing.hasParking || listing.hasGarden || listing.marketType === 'pierwotny') && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {listing.hasBalcony && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">Balkon</Badge>
              )}
              {listing.hasElevator && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">Winda</Badge>
              )}
              {listing.hasParking && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">Parking</Badge>
              )}
              {listing.hasGarden && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">Ogród</Badge>
              )}
              {listing.marketType === 'pierwotny' && (
                <Badge variant="outline" className="text-xs px-2 py-0.5">Rynek pierwotny</Badge>
              )}
            </div>
          )}

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
                {formatCurrency(listing.price)}
              </span>
              {!compact && (
                <span className="text-sm text-muted-foreground ml-1">
                  {PRICE_TYPE_LABELS[listing.priceType || 'sale'] || ''}
                </span>
              )}
              {pricePerM2 && !compact && (
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(pricePerM2).replace(' zł', '')} zł/m²
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
                onClick={(e) => handleShowContact(e)}
                className="w-full mt-3 pt-3 border-t text-sm text-muted-foreground hover:text-foreground transition-colors text-left flex items-center gap-2"
              >
                {!isLoggedIn && <Lock className="h-3.5 w-3.5" />}
                {showContact ? "Ukryj kontakt ▲" : "Pokaż kontakt ▼"}
              </button>
            </>
          )}
        </div>

        {contactPanel}
      </Card>

      <AuthModal
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        initialMode="login"
        customDescription="Zaloguj się, aby zobaczyć kontakt do ogłoszeniodawcy bez opuszczania listy ofert."
        onSuccess={() => {
          setShowLoginDialog(false);
          setShowContact(true);
        }}
      />

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
